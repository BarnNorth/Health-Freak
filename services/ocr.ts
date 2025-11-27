import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { config } from '@/lib/config';
import { logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';
import { withRateLimit, validateImageData, validateExtractedText } from './security';
import { AI_VISION_MODEL } from './aiAnalysis';
import { supabase } from '../lib/supabase';

/**
 * OCR and Ingredient Parsing Service
 * 
 * Uses GPT-5 mini for image-to-text extraction from food labels, followed by sophisticated
 * parsing to identify individual ingredients with their modifiers, certifications, and
 * minor ingredient markers.
 * 
 * Key Features:
 * - GPT-5 mini OCR for high accuracy
 * - Footnote detection (*, †, numbered, lettered)
 * - Minor ingredient detection ("contains 2% or less")
 * - Compound ingredient handling (brand products with sub-ingredients)
 * - OCR artifact cleaning
 * - Allergen/company info filtering
 */

// Get Supabase URL for Edge Function
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * Redact API keys from logs for security
 */
function redactApiKey(value?: string): string {
  if (!value) return 'NOT SET';
  if (value.length < 8) return '***REDACTED***';
  return `${value.substring(0, 4)}...***REDACTED***`;
}

export interface OCRResult {
  text: string;
  confidence: number;
  error?: string;
}

/**
 * Quick image quality check to avoid expensive OCR on bad images
 */
async function quickImageQualityCheck(imageUri: string): Promise<{ shouldProcess: boolean; confidence: number; error?: string }> {
  try {
    const thumb = await ImageManipulator.manipulateAsync(imageUri, [{ resize: { width: 100 } }], { compress: 0.1, format: ImageManipulator.SaveFormat.JPEG });
    if (!thumb?.uri) return { shouldProcess: false, confidence: 0, error: 'Unable to load image. Try again.' };
    if (thumb.width < 50 || thumb.height < 50) return { shouldProcess: false, confidence: 0.2, error: 'Image too small. Get closer.' };
    return { shouldProcess: true, confidence: 0.8 };
  } catch (e) {
    return { shouldProcess: true, confidence: 0.5 }; // fail open
  }
}

/**
 * Compress image for OCR processing with conservative settings
 */
async function compressImageForOCR(base64Image: string): Promise<{
  compressed: string;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
}> {
  const originalSize = base64Image.length;
  
  // Skip compression for small images (< 500KB) to avoid overhead
  if (originalSize < 500 * 1024) {
    return {
      compressed: base64Image,
      originalSize,
      compressedSize: originalSize,
      reductionPercent: 0
    };
  }
  
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  
  const uri = `data:image/jpeg;base64,${base64Image}`;
  
  // Conservative compression for OCR (maintains high quality)
  const compressed = await manipulateAsync(
    uri,
    [{ resize: { width: 1500 } }], // Conservative width for safety
    { compress: 0.7, format: SaveFormat.JPEG } // 70% quality (high quality)
  );
  
  const response = await fetch(compressed.uri);
  const blob = await response.blob();
  const compressedBase64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
  
  const compressedSize = compressedBase64.length;
  const reductionPercent = Math.round((1 - compressedSize / originalSize) * 100);
  
  
  return {
    compressed: compressedBase64,
    originalSize,
    compressedSize,
    reductionPercent
  };
}

/**
 * Extract with compression and fallback to original if confidence is low
 */
async function extractWithCompression(base64Image: string): Promise<OCRResult> {
  const { compressed } = await compressImageForOCR(base64Image);
  return await extractIngredientsWithGPT5Nano(compressed);
}

/**
 * Extract with original image (no compression)
 */
async function extractWithOriginal(base64Image: string): Promise<OCRResult> {
  return await extractIngredientsWithGPT5Nano(base64Image);
}

/**
 * Main extraction function with automatic fallback
 */
export async function extractTextWithFallback(base64Image: string): Promise<OCRResult> {
  // Try compressed first
  const compressedResult = await extractWithCompression(base64Image);
  
  // If confidence is low, retry with original
  if (compressedResult.confidence < 0.7) {
    return await extractWithOriginal(base64Image);
  }
  
  return compressedResult;
}

/**
 * Extract ingredients from food label using GPT-5 mini
 * This is simpler and more accurate than Google Vision + complex parsing
 */
async function extractIngredientsWithGPT5Nano(base64Image: string): Promise<OCRResult> {
  try {
    const startTime = Date.now();
    
    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return {
        text: '',
        confidence: 0,
        error: 'User not authenticated',
      };
    }

    const apiStartTime = Date.now();

    const response = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'extract_text',
        base64Image: base64Image
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Edge Function error: ${response.status} - ${errorText}`);
    }

    const parseStartTime = Date.now();

    const result = await response.json() as OCRResult;
    const extractedText = result.text?.trim() || '';
    
    if (!extractedText || extractedText.length < 5) {
      return {
        text: '',
        confidence: 0,
        error: 'No ingredients found in image. Please ensure the image shows a clear ingredient list.',
      };
    }


    return {
      text: extractedText,
      confidence: result.confidence || 0.95, // Use confidence from Edge Function
    };

  } catch (error) {
    logDetailedError('GPT4V_EXTRACTION', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('Unauthorized')) {
        return {
          text: '',
          confidence: 0,
          error: 'Authentication error. Please check your session.',
        };
      }
      
      if (error.message.includes('quota') || error.message.includes('429')) {
        return {
          text: '',
          confidence: 0,
          error: 'OpenAI API quota exceeded. Please try again later.',
        };
      }
      
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return {
          text: '',
          confidence: 0,
          error: 'Network error. Please check your internet connection.',
        };
      }
    }

    return {
      text: '',
      confidence: 0,
      error: `Failed to extract ingredients: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export interface ImagePreprocessingOptions {
  resize?: {
    width?: number;
    height?: number;
  };
}

/**
 * Preprocess image to improve OCR accuracy with enhanced features
 */
export async function preprocessImage(
  imageUri: string,
  options: ImagePreprocessingOptions = {}
): Promise<string> {
  try {
    const { resize = { width: 800, height: 800 } } = options;

    if (resize.width || resize.height) {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            resize: {
              width: resize.width,
              height: resize.height,
            },
          },
        ],
        {
          compress: 0.6, // Optimized for speed - ingredient text is still readable
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      return result.uri;
    }

    return imageUri;
  } catch (error) {
    return imageUri;
  }
}

/**
 * Extract ingredients from food label image using GPT-5 mini
 * Includes rate limiting and input validation for security
 */
export async function extractTextFromImage(
  imageUri: string,
  userId?: string,
  preprocessingOptions?: ImagePreprocessingOptions
): Promise<OCRResult> {
  const userIdForRateLimit = userId || 'anonymous';
  
  // Apply rate limiting for OCR operations
  return await withRateLimit(userIdForRateLimit, 'ocr', async () => {
    try {
      // Quick quality check to avoid expensive OCR on bad images
      const qualityCheck = await quickImageQualityCheck(imageUri);
      if (!qualityCheck.shouldProcess) {
        return { text: '', confidence: qualityCheck.confidence, error: qualityCheck.error };
      }
    
    // Preprocess image for better OCR results
      const processedImageUri = await preprocessImage(imageUri, {
        ...preprocessingOptions,
        resize: { width: 800, height: 800 },
      });
    
    // Read image file as base64
    const base64Image = await FileSystem.readAsStringAsync(processedImageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

      // Validate image data size and format
      const imageValidation = validateImageData(base64Image);
      if (!imageValidation.valid) {
      return {
        text: '',
        confidence: 0,
          error: imageValidation.error 
        };
      }

      // Use GPT-5 mini for ingredient extraction with compression fallback
      return await extractTextWithFallback(base64Image);
  } catch (error) {
      // If it's a rate limit error, re-throw it
      if (error instanceof Error && error.message.includes('Rate limit')) {
        throw error;
      }
      
      // Handle other errors normally
    logDetailedError('OCR_EXTRACTION', error, {
      imageUri,
      hasPreprocessingOptions: !!preprocessingOptions
    });
    
      // Handle GPT-5 mini specific errors
      if (error instanceof Error) {
        // OpenAI API key errors
        if (error.message.includes('API key') || error.message.includes('unauthorized') || error.message.includes('401')) {
      return {
        text: '',
        confidence: 0,
            error: 'OpenAI API key error. Please check configuration.',
      };
    }
    
        // OpenAI quota/rate limit errors
        if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
      return {
        text: '',
        confidence: 0,
            error: 'OpenAI API quota exceeded. Please try again later.',
          };
        }
        
        // Network errors
        if (error.message.includes('network') || error.message.includes('fetch')) {
        return {
          text: '',
          confidence: 0,
            error: 'Network error. Please check your internet connection.',
        };
      }
      
      // Invalid image errors
      if (error.message.includes('invalid') || error.message.includes('image') || error.message.includes('400')) {
        return {
          text: '',
          confidence: 0,
          error: 'Invalid image format. Please try taking a new photo.',
        };
      }
      
      // File system errors
      if (error.message.includes('file') || error.message.includes('read')) {
        return {
          text: '',
          confidence: 0,
          error: 'Unable to read image file. Please try taking a new photo.',
        };
      }
    }

    // Generic fallback error
    const friendlyMessage = getUserFriendlyErrorMessage(error);
    return {
      text: '',
      confidence: 0,
        error: `Failed to extract ingredients: ${friendlyMessage}. Please try again with a clearer photo.`,
      };
    }
  });
}

/**
 * Complex parsing functions removed - replaced by GPT-5 mini
 * GPT-5 mini handles all text extraction and cleaning automatically
 */

export interface ParsedIngredient {
  name: string;
  modifiers: string[];
  confidence: number;
  originalText: string;
  isMinorIngredient?: boolean; // true if ingredient appears after "contains X% or less" marker
  minorThreshold?: number; // Actual percentage threshold (e.g., 1.5, 2)
  isSubIngredient?: boolean; // true if this ingredient is a sub-ingredient within parentheses
  parentIngredient?: string; // name of the parent ingredient if this is a sub-ingredient
}

/**
 * Check if text contains certification keywords
 */
function hasCertificationKeyword(text: string): boolean {
  const certificationKeywords = [
    'organic', 'fair trade', 'fairtrade', 'non-gmo', 'non gmo',
    'gluten free', 'gluten-free', 'certified', 'verified',
    'kosher', 'halal', 'trivial', 'cholesterol', 'source',
    'usda', 'rainforest alliance'
  ];
  
  const lowerText = text.toLowerCase();
  return certificationKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Count commas outside of parentheses with proper nesting depth tracking
 * Handles arbitrary nesting levels (e.g., "A (B (C, D), E), F")
 */
function countCommasWithProperNesting(text: string): number {
  let commaCount = 0;
  let depth = 0;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      // Only count commas outside all parentheses
      commaCount++;
    }
  }
  
  return commaCount;
}

/**
 * Extract and remove footnote definitions from ingredient text (Industry Best Practice: Two-Pass Parsing)
 * Example input: "Flour, Sugar, Butter*. * Organic" 
 * Returns: { cleanedText: "Flour, Sugar, Butter*", footnotes: { '*': 'Organic' } }
 */
function extractAndCleanFootnotes(text: string): { cleanedText: string; footnotes: Record<string, string> } {
  const footnotes: Record<string, string> = {};
  let cleanedText = text;
  
  // Pattern 1: Standalone symbol footnotes (". * Organic" or ". † Fair Trade")
  // Updated to capture full text until next marker or period
  const standalonePattern = /\.\s*([*†‡§¶#]+)\s+([A-Z][^.]+?)(?=\s*\.\s*[*†‡§¶#()\[]|$)/g;
  
  let match;
  const footnotesToRemove: string[] = [];
  
  while ((match = standalonePattern.exec(text)) !== null) {
    const symbol = match[1].trim();
    const meaning = match[2].trim();
    
    // Only store meaningful footnotes using expanded keyword list
    if (meaning.length > 3 && hasCertificationKeyword(meaning)) {
      footnotes[symbol] = meaning; // Store complete text
      footnotesToRemove.push(match[0]);
    }
  }
  
  // Remove footnote definitions from text
  for (const footnoteText of footnotesToRemove) {
    cleanedText = cleanedText.replace(footnoteText, '.');
  }
  
  // Pattern 2: Numbered footnotes - ". (1) Organic Certified"
  const numberedPattern = /\.\s*\((\d+)\)\s+([A-Z][^.()]+?)(?=\s*\.\s*\(|$)/g;
  
  while ((match = numberedPattern.exec(cleanedText)) !== null) {
    const number = match[1].trim();
    const meaning = match[2].trim();
    
    if (meaning.length > 3 && hasCertificationKeyword(meaning)) {
      footnotes[`(${number})`] = meaning;
      footnotesToRemove.push(match[0]);
    }
  }
  
  // Remove numbered footnote definitions
  for (const footnoteText of footnotesToRemove) {
    cleanedText = cleanedText.replace(footnoteText, '.');
  }
  footnotesToRemove.length = 0; // Clear for next pattern
  
  // Pattern 3: Lettered footnotes - ". [a] Organic"
  const letteredPattern = /\.\s*\[([a-z])\]\s+([A-Z][^.[\]]+?)(?=\s*\.\s*\[|$)/gi;
  
  while ((match = letteredPattern.exec(cleanedText)) !== null) {
    const letter = match[1].toLowerCase();
    const meaning = match[2].trim();
    
    if (meaning.length > 3 && hasCertificationKeyword(meaning)) {
      footnotes[`[${letter}]`] = meaning;
      footnotesToRemove.push(match[0]);
    }
  }
  
  // Remove lettered footnote definitions
  for (const footnoteText of footnotesToRemove) {
    cleanedText = cleanedText.replace(footnoteText, '.');
  }
  
  // Pattern 5: Note/Footnote sections - Preserve complete text
  // Pattern: "* Certified Organic by USDA" or "† Fair Trade Certified"
  const symbolNotePattern = /([*†‡§¶#]+)\s+([^.*†‡§¶#]+?)\.?$/g;
  
  while ((match = symbolNotePattern.exec(cleanedText)) !== null) {
    const symbol = match[1].trim();
    const fullMeaning = match[2].trim();
    
    if (fullMeaning.length > 3 && hasCertificationKeyword(fullMeaning)) {
      footnotes[symbol] = fullMeaning; // Store complete text
      cleanedText = cleanedText.replace(match[0], '');
    }
  }
  
  return { cleanedText: cleanedText.trim(), footnotes };
}

/**
 * Clean common OCR artifacts and formatting issues
 */
function cleanOCRArtifacts(text: string): string {
  let cleaned = text;
  
  // Character misreads
  cleaned = cleaned.replace(/\brn\b/g, 'm');      // "rn" → "m" (cornstarch → comstarch)
  cleaned = cleaned.replace(/\bcl\b/g, 'd');      // "cl" → "d" 
  cleaned = cleaned.replace(/\bvv\b/g, 'w');      // "vv" → "w"
  cleaned = cleaned.replace(/\b0([a-z])/gi, 'o$1'); // "0" → "o" in words
  cleaned = cleaned.replace(/\bl([A-Z])/g, 'I$1'); // "l" → "I" before caps
  cleaned = cleaned.replace(/\b1([A-Z])/g, 'I$1'); // "1" → "I" before caps
  
  // Remove stray periods in middle of words (but keep at end)
  cleaned = cleaned.replace(/([a-z])\.([a-z])/gi, '$1$2');
  
  // Fix ALL CAPS words to Title Case (unless acronym)
  cleaned = cleaned.replace(/\b([A-Z]{4,})\b/g, (match) => {
    // Check if it's a known acronym
    const acronyms = ['USDA', 'FDA', 'GMO', 'BHA', 'BHT', 'TBHQ', 'EDTA'];
    if (acronyms.includes(match)) return match;
    
    // Convert to title case
    return match.charAt(0) + match.slice(1).toLowerCase();
  });
  
  return cleaned;
}

/**
 * Remove allergen warnings and company info sections from ingredient text
 * These sections appear after ingredients and should not be parsed
 */
function removeAllergenAndCompanyInfo(text: string): string {
  // Stop patterns - anything after these is not ingredients
  const stopPatterns = [
    /\b(?:CONTAINS|ALLERGEN(?:S)?)\s*:/i,
    /\bALLERGEN WARNING\s*:/i,
    /\bALLERGY INFORMATION\s*:/i,
    /\bMAY CONTAIN\s*:/i,
    /\bPROCESSED IN A FACILITY\s*that\s*/i,
    /\bMADE IN A FACILITY\s*that\s*/i,
    /\bDISTRIBUTED BY\s*:/i,
    /\bMANUFACTURED BY\s*:/i,
    /\bPRODUCED BY\s*:/i,
    /\bQUESTIONS\?/i,
    /\bVISIT US\s+(?:AT|@)/i,
    /\bPHONE\s*:/i,
    /\bEMAIL\s*:/i,
    /\b(?:www\.|\w+\.com|\w+\.org|\w+\.net)/i,
    /\b@\w+/i,  // Social media handles
    /\b1-800-/i,
    /\b\(800\)/i,
    /\btel:/i,
    /\bCALL\s+(?:US|NOW)/i,
    /\bWRITE TO\s+US/i,
    /\bCONTACT US/i,
  ];
  
  let cutoffIndex = text.length;
  
  for (const pattern of stopPatterns) {
    const match = pattern.exec(text);
    if (match && match.index < cutoffIndex) {
      cutoffIndex = match.index;
    }
  }
  
  return text.substring(0, cutoffIndex).trim();
}

/**
 * Extract all parenthetical content with proper nesting support
 * Handles arbitrary nesting levels like "A (B (C) D)"
 * Returns array of modifier strings
 */
function extractNestedParentheses(text: string): string[] {
  const modifiers: string[] = [];
  let depth = 0;
  let currentModifier = '';
  let startIndex = -1;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '(') {
      if (depth === 0) {
        startIndex = i;
      }
      depth++;
      if (depth > 1) {
        // Include nested parentheses in the modifier
        currentModifier += char;
      }
    } else if (char === ')') {
      depth--;
      if (depth > 0) {
        currentModifier += char;
      } else if (depth === 0) {
        // End of top-level parenthesis
        if (currentModifier.trim()) {
          modifiers.push(currentModifier.trim());
        }
        currentModifier = '';
        startIndex = -1;
      }
    } else if (depth > 0) {
      currentModifier += char;
    }
  }
  
  return modifiers;
}

/**
 * Parse extracted text to identify individual ingredients with enhanced edge case handling
 */
export function parseIngredientsFromText(text: string): ParsedIngredient[] {
  if (!text) return [];

  // Validate and sanitize input text
  try {
    text = validateExtractedText(text);
  } catch (error) {
    console.error('Invalid extracted text:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }

  // PREPROCESSING: Clean OCR artifacts
  text = cleanOCRArtifacts(text);
  
  // PREPROCESSING: Remove allergen warnings and company info
  text = removeAllergenAndCompanyInfo(text);

  // PASS 1: Extract and remove footnote definitions from text
  const { cleanedText, footnotes } = extractAndCleanFootnotes(text);
  text = cleanedText;

  // Common ingredient words to help identify valid ingredients
  const commonIngredients = [
    'organic', 'natural', 'sugar', 'salt', 'oil', 'water', 'flour', 'milk', 'egg',
    'wheat', 'corn', 'rice', 'soy', 'coconut', 'olive', 'sunflower', 'canola',
    'vanilla', 'cocoa', 'chocolate', 'butter', 'cream', 'cheese', 'yogurt',
    'lemon', 'lime', 'orange', 'apple', 'banana', 'strawberry', 'blueberry',
    'cinnamon', 'ginger', 'garlic', 'onion', 'tomato', 'carrot', 'celery',
    'baking', 'soda', 'powder', 'yeast', 'starch', 'syrup', 'honey', 'molasses',
    'vinegar', 'citric', 'acid', 'lecithin', 'gum', 'xanthan', 'guar', 'carrageenan',
    'preservative', 'color', 'flavor', 'extract', 'essence', 'spice', 'herb'
  ];

  // Expand "and/or" to separate ingredients before parsing
  text = text.replace(/\s+and\/or\s+/gi, ', ');

  // Save original text structure before any modifications for parsing
  const originalTextForParsing = text;

  // PASS 2: Detect section headers (e.g., "Organic Filling:", "Organic Tortilla:")
  // Section headers are capitalized words followed by colon, but NOT minor ingredient patterns
  interface SectionHeader {
    name: string;
    index: number;
  }
  
  const sectionHeaders: SectionHeader[] = [];
  // Pattern to detect section headers: start with capital letter, word characters, ends with colon
  // But exclude patterns that look like minor ingredient markers
  const sectionHeaderPattern = /\b([A-Z][A-Za-z\s]+?):(?![^\n]*contains?\s+(?:less\s+than\s+\d+\s*%|\d+\s*%\s+(?:or\s+)?less))/g;
  
  let match;
  let workingText = text;
  const sectionsToRemove: Array<{index: number; length: number; name: string}> = [];
  
  // Find all section headers from original text
  while ((match = sectionHeaderPattern.exec(originalTextForParsing)) !== null) {
    const sectionName = match[1].trim();
    // Only consider it a section header if it's not a minor ingredient pattern
    const textAfterColon = text.substring(match.index + match[0].length, match.index + match[0].length + 50).trim();
    const isMinorPattern = /contains?\s+(?:less\s+than\s+\d+\s*%|\d+\s*%\s+(?:or\s+)?less)/i.test(textAfterColon);
    
    if (!isMinorPattern) {
      sectionHeaders.push({
        name: sectionName,
        index: match.index
      });
      sectionsToRemove.push({
        index: match.index,
        length: match[0].length,
        name: sectionName
      });
      console.log(`📂 Section header detected: "${sectionName}"`);
    }
  }
  
  // Remove section headers from text (in reverse order to preserve indices)
  for (let i = sectionsToRemove.length - 1; i >= 0; i--) {
    const section = sectionsToRemove[i];
    let textBefore = workingText.substring(0, section.index).trimEnd();
    let textAfter = workingText.substring(section.index + section.length).trim();
    
    // Remove trailing punctuation before section header
    textBefore = textBefore.replace(/[.,;:]+\s*$/, '').trimEnd();
    
    // Ensure proper comma placement
    if (textBefore && !textBefore.endsWith(',') && textAfter) {
      textBefore += ',';
    }
    
    workingText = textBefore + (textBefore ? ' ' : '') + textAfter;
  }
  
  text = workingText;

  // PASS 3: Detect minor ingredient names (name-based matching, not position-based)
  interface MinorIngredientInfo {
    name: string;
    threshold: number;
  }
  
  const minorIngredientNames = new Map<string, number>(); // normalized name -> threshold
  
  // Pattern to detect minor sections with percentage extraction
  const minorPattern = /(?:contains?\s+)?(?:less\s+than\s+(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s+(?:or\s+)?less)\s*(?:of\s+)?(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi;
  
  const markersToRemove: Array<{index: number; length: number}> = [];
  let searchText = text;
  
  // Find ALL minor sections and extract ingredient names
  while ((match = minorPattern.exec(searchText)) !== null) {
    const threshold = parseFloat(match[1] || match[2] || '2');
    const textAfterMatch = searchText.substring(match.index + match[0].length).trim();
    const hasColon = textAfterMatch.startsWith(':');
    const hasFollowing = /^the\s+following:/i.test(textAfterMatch);
    const isMultiple = hasColon || hasFollowing;
    
    if (isMultiple) {
      // Multiple ingredients: extract everything after colon/Following until next section or end
      let ingredientsText = textAfterMatch.replace(/^:?\s*(the\s+following:)?\s*/i, '');
      // Find the end of this section (next section header or end of text)
      const nextSectionIndex = sectionHeaders.findIndex(sh => sh.index > match.index);
      if (nextSectionIndex >= 0) {
        const nextSection = sectionHeaders[nextSectionIndex];
        // Find where this section starts in the original text
        const sectionEndInText = searchText.substring(0, nextSection.index).length;
        ingredientsText = searchText.substring(match.index + match[0].length, sectionEndInText).trim();
        ingredientsText = ingredientsText.replace(/^:?\s*(the\s+following:)?\s*/i, '');
      }
      
      // Split by commas and add each ingredient name
      const ingredientSplitRegex = /,(?![^()]*\))/g;
      const ingredients = ingredientsText.split(ingredientSplitRegex).map(ing => ing.trim()).filter(ing => ing.length > 0);
      
      for (const ing of ingredients) {
        // Parse to get clean ingredient name
        const parsed = parseIndividualIngredient(ing, commonIngredients);
        if (parsed && parsed.name) {
          // Use same normalization as lookup to ensure matching
          const normalizedName = parsed.name
            .toLowerCase()
            .replace(/:/g, ' ')
            .replace(/\s*[.!?;:]+\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
          minorIngredientNames.set(normalizedName, threshold);
          console.log(`🎯 Minor ingredient (multiple): "${parsed.name}" -> stored as: "${normalizedName}" (threshold: ${threshold}%)`);
        }
      }
    } else {
      // Single ingredient: extract the ingredient name immediately after
      const restOfLine = textAfterMatch.split(/[,.]/)[0].trim(); // Everything up to next comma or period
      if (restOfLine) {
        const parsed = parseIndividualIngredient(restOfLine, commonIngredients);
        if (parsed && parsed.name) {
          // Use same normalization as lookup to ensure matching
          const normalizedName = parsed.name
            .toLowerCase()
            .replace(/:/g, ' ')
            .replace(/\s*[.!?;:]+\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
          minorIngredientNames.set(normalizedName, threshold);
          console.log(`🎯 Minor ingredient (single): "${parsed.name}" -> stored as: "${normalizedName}" (threshold: ${threshold}%)`);
        }
      }
    }
    
    // Track marker for removal
    markersToRemove.push({
      index: match.index,
      length: match[0].length
    });
  }
  
  // Remove minor markers from text
  console.log(`🔧 Removing ${markersToRemove.length} minor marker(s) from text`);
  for (let i = markersToRemove.length - 1; i >= 0; i--) {
    const marker = markersToRemove[i];
    const markerText = searchText.substring(marker.index, marker.index + marker.length);
    let textBeforeMarker = searchText.substring(0, marker.index).trimEnd();
    let textAfterMarker = searchText.substring(marker.index + marker.length).trim();
    
    console.log(`   Marker: "${markerText}"`);
    console.log(`   Text after marker (before cleanup): "${textAfterMarker.substring(0, 50)}..."`);
    
    // Remove trailing "and" or ", and" before marker
    textBeforeMarker = textBeforeMarker.replace(/,?\s*and\s*$/i, '').trimEnd();
    
    // Remove leading "of:" or "of" from text after marker
    textAfterMarker = textAfterMarker.replace(/^of:?\s*/i, '').trim();
    
    // Ensure proper comma placement
    // If textAfterMarker starts with an ingredient name (not a comma), ensure comma before it
    const hasCommaBefore = textBeforeMarker.endsWith(',');
    const textAfterStartsWithComma = textAfterMarker.startsWith(',');
    
    if (!hasCommaBefore && !textAfterStartsWithComma && textBeforeMarker && textAfterMarker) {
      // Need to add comma between
      searchText = textBeforeMarker + ', ' + textAfterMarker;
    } else if (hasCommaBefore && textAfterStartsWithComma) {
      // Both have comma, remove one
      searchText = textBeforeMarker + ' ' + textAfterMarker.substring(1);
    } else {
      // Normal case - one comma exists
      searchText = textBeforeMarker + (hasCommaBefore ? ' ' : '') + textAfterMarker;
    }
    
    console.log(`   Text after removal: "...${textBeforeMarker.substring(Math.max(0, textBeforeMarker.length - 30))}${hasCommaBefore ? ',' : ''} ${textAfterMarker.substring(0, 50)}..."`);
  }
  
  text = searchText;
  console.log(`✅ Text after marker removal: ${text.length} chars`);
  
  // Debug: Show sample of text before parsing
  console.log(`📄 Sample of cleaned text (first 300 chars): "${text.substring(0, 300)}..."`);

  // PASS 4: Parse ingredients with section tracking
  // Parse from original text before marker removal to ensure we catch all ingredients
  // Handle minor markers and section headers inline during parsing
  
  const ingredientSplitRegex = /,(?![^()]*\))/g;
  
  // Parse from original text (before section header and minor marker removal) to catch everything
  // This ensures ingredients aren't lost during marker removal
  const rawIngredientsOriginal = originalTextForParsing.split(ingredientSplitRegex);
  
  // Also parse from cleaned text to cross-reference
  const rawIngredients = text.split(ingredientSplitRegex);
  
  // Use original text for parsing to ensure no ingredients are lost
  // But we'll skip markers and section headers during parsing
  const rawIngredientsToParse = rawIngredientsOriginal;
  
  // Debug: Log all raw ingredients after splitting
  console.log(`🔍 Raw ingredients from ORIGINAL text (${rawIngredientsOriginal.length} total):`);
  rawIngredientsOriginal.forEach((ing, idx) => {
    console.log(`   [${idx}] "${ing.trim()}"`);
  });
  console.log(`🔍 Raw ingredients from CLEANED text (${rawIngredients.length} total):`);
  rawIngredients.forEach((ing, idx) => {
    console.log(`   [${idx}] "${ing.trim()}"`);
  });
  
  // Track current section as we parse
  let currentSection: string | null = null;
  const parsedIngredients: ParsedIngredient[] = [];
  
  // Parse from original text to ensure no ingredients are lost
  for (let i = 0; i < rawIngredientsToParse.length; i++) {
    let trimmed = rawIngredientsToParse[i].trim();
    if (!trimmed) continue;
    
    // Check if this contains a minor marker phrase (shouldn't happen after removal, but handle gracefully)
    const minorMarkerMatch = trimmed.match(/contains?\s+(?:less\s+than\s+\d+\s*%|\d+\s*%\s+(?:or\s+)?less)\s*(?:of\s+)?(?:each\s+of\s+)?(?:the\s+following:\s*)?/i);
    if (minorMarkerMatch) {
      // Extract ingredient name after the marker
      const afterMarker = trimmed.substring(minorMarkerMatch.index! + minorMarkerMatch[0].length).trim();
      // Remove leading "of:" or "of" if present
      const cleanedAfterMarker = afterMarker.replace(/^of:?\s*/i, '').trim();
      const ingredientName = cleanedAfterMarker.split(/[,.]/)[0].trim(); // Get first ingredient name up to comma/period
      
      if (ingredientName && ingredientName.length > 1) {
        console.log(`⚠️  Found minor marker in ingredient text: "${trimmed}"`);
        console.log(`   Extracting ingredient: "${ingredientName}"`);
        trimmed = ingredientName; // Use the extracted ingredient name
      } else {
        console.log(`⚠️  Skipping minor marker with no valid ingredient: "${trimmed}"`);
        continue; // Skip if no valid ingredient name found
      }
    }
    
    // Inline section header detection: check if ingredient starts with section header pattern
    // Pattern: Capital words followed by colon, then content
    // Example: "Organic Filling: Organic Grilled Chicken (...)"
    const sectionHeaderInlineMatch = trimmed.match(/^([A-Z][A-Za-z\s]+?):\s*(.+)$/);
    if (sectionHeaderInlineMatch) {
      const sectionName = sectionHeaderInlineMatch[1].trim();
      const ingredientContent = sectionHeaderInlineMatch[2].trim();
      
      // Verify it's not a minor ingredient pattern
      const isMinorPattern = /contains?\s+(?:less\s+than\s+\d+\s*%|\d+\s*%\s+(?:or\s+)?less)/i.test(ingredientContent);
      
      if (!isMinorPattern) {
        // Set as current section
        currentSection = sectionName;
        console.log(`📂 Detected section header inline: "${sectionName}"`);
        
        // Parse the ingredient content (everything after the colon)
        if (ingredientContent) {
          const parsed = parseIndividualIngredient(ingredientContent, commonIngredients);
          if (parsed) {
            // This is the first ingredient of this section
            if (currentSection) {
              parsed.parentIngredient = currentSection;
              parsed.isSubIngredient = true;
            }
            
            // Check if this ingredient is minor by name matching
            const normalizedName = parsed.name
              .toLowerCase()
              .replace(/:/g, ' ')
              .replace(/\s*[.!?;:]+\s*$/, '')
              .replace(/\s+/g, ' ')
              .trim();
            console.log(`🔍 Checking minor status for "${parsed.name}" -> normalized: "${normalizedName}"`);
            const minorThreshold = minorIngredientNames.get(normalizedName);
            if (minorThreshold !== undefined) {
              parsed.isMinorIngredient = true;
              parsed.minorThreshold = minorThreshold;
              console.log(`📌 Minor ingredient detected by name: "${parsed.name}" (threshold: ${minorThreshold}%)`);
            } else {
              if (minorIngredientNames.size > 0) {
                const availableNames = Array.from(minorIngredientNames.keys()).slice(0, 5).join(', ');
                console.log(`   No match found. Available minor names (first 5): ${availableNames}`);
              }
            }
            
            parsedIngredients.push(parsed);
          }
        }
        continue; // Don't process the section header part again
      }
    }
    
    // Check if this is a standalone section header (pattern: starts with capital, ends with colon, nothing after)
    const sectionHeaderMatch = trimmed.match(/^([A-Z][A-Za-z\s]+?):\s*$/);
    if (sectionHeaderMatch) {
      currentSection = sectionHeaderMatch[1].trim();
      console.log(`📂 Setting current section: "${currentSection}"`);
      continue; // Don't add section headers as ingredients
    }
    
    // Parse the ingredient
    const parsed = parseIndividualIngredient(trimmed, commonIngredients);
    
    if (parsed) {
      // Check if parsed name matches a known section header name
      const matchesKnownSection = sectionHeaders.some(sh => {
        const parsedNameLower = parsed.name.toLowerCase().trim();
        const sectionNameLower = sh.name.toLowerCase().trim();
        return parsedNameLower === sectionNameLower;
      });
      
      if (matchesKnownSection) {
        // This is actually a section header that got parsed as ingredient
        const matchingSection = sectionHeaders.find(sh => 
          parsed.name.toLowerCase().trim() === sh.name.toLowerCase().trim()
        );
        if (matchingSection) {
          currentSection = matchingSection.name;
          console.log(`📂 Setting current section from parsed: "${currentSection}"`);
          continue; // Don't add section headers as ingredients
        }
      }
      
      // Assign section-based parent if we're in a section
      // But don't override if it already has a parent (from parenthetical sub-ingredients)
      if (currentSection && !parsed.isSubIngredient) {
        parsed.parentIngredient = currentSection;
        parsed.isSubIngredient = true;
        console.log(`📎 Assigned section parent "${currentSection}" to ingredient "${parsed.name}"`);
      }
      
      // Check if this ingredient is minor by name matching
      const normalizedName = parsed.name
        .toLowerCase()
        .replace(/:/g, ' ')
        .replace(/\s*[.!?;:]+\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      console.log(`🔍 Checking minor status for "${parsed.name}" -> normalized: "${normalizedName}"`);
      const minorThreshold = minorIngredientNames.get(normalizedName);
      if (minorThreshold !== undefined) {
        parsed.isMinorIngredient = true;
        parsed.minorThreshold = minorThreshold;
        console.log(`📌 Minor ingredient detected by name: "${parsed.name}" (threshold: ${minorThreshold}%)`);
      } else {
        // Debug: show what minor names are available if lookup fails
        if (minorIngredientNames.size > 0) {
          const availableNames = Array.from(minorIngredientNames.keys()).slice(0, 5).join(', ');
          console.log(`   No match found. Available minor names (first 5): ${availableNames}`);
        }
      }
      
      parsedIngredients.push(parsed);
    }
  }

  // Extract sub-ingredients from parenthetical content
  const ingredientsWithSubs: ParsedIngredient[] = [];
  for (const ingredient of parsedIngredients) {
    // Check original text for parenthetical content with commas (indicating sub-ingredients)
    const parentheticalMatch = ingredient.originalText.match(/\(([^)]+)\)/);
    
    if (parentheticalMatch) {
      const parentheticalContent = parentheticalMatch[1].trim();
      
      // Check if parenthetical content contains commas (likely a sub-ingredient list)
      if (parentheticalContent.includes(',')) {
        // This ingredient has comma-separated parenthetical content - extract as sub-ingredients
        const parentName = ingredient.name;
        // Preserve section parent if the ingredient is in a section
        const sectionParent = ingredient.parentIngredient;
        
        // Add the parent ingredient (remove the parenthetical modifier if it exists)
        // Parent keeps its section parent (if any) - this is correct hierarchy
        const parentIngredient: ParsedIngredient = {
          ...ingredient,
          modifiers: ingredient.modifiers.filter(mod => !mod.includes(',') || mod !== parentheticalContent)
        };
        ingredientsWithSubs.push(parentIngredient);
        
        // Parse the sub-ingredient list from the parenthetical content
        // Split by comma, but be careful about commas within nested structures
        // For simple comma-separated lists, we can split directly
        const subIngredientsList = parentheticalContent
          .split(',')
          .map(sub => sub.trim())
          .filter(sub => sub.length > 0);
        
        for (const subIngredientText of subIngredientsList) {
          if (!subIngredientText || subIngredientText.length < 2) continue;
          
          // Clean the sub-ingredient text (remove any remaining parentheses or brackets)
          let cleanedSubText = subIngredientText.trim();
          
          // Parse the sub-ingredient as a regular ingredient
          const parsedSub = parseIndividualIngredient(cleanedSubText, commonIngredients);
          
          if (parsedSub && parsedSub.name) {
            // Check if this sub-ingredient is minor by name matching
            const normalizedSubName = parsedSub.name
              .toLowerCase()
              .replace(/:/g, ' ')
              .replace(/\s*[.!?;:]+\s*$/, '')
              .replace(/\s+/g, ' ')
              .trim();
            const subMinorThreshold = minorIngredientNames.get(normalizedSubName);
            
            // Use minor status from name matching, or inherit from parent
            const isMinor = subMinorThreshold !== undefined || ingredient.isMinorIngredient;
            const minorThreshold = subMinorThreshold !== undefined ? subMinorThreshold : ingredient.minorThreshold;
            
            // Mark as sub-ingredient with immediate parent (not section parent)
            // Sub-ingredients have their immediate parent, not the section
            // The parent ingredient already has the section parent set correctly
            const subIngredient: ParsedIngredient = {
              ...parsedSub,
              isSubIngredient: true,
              parentIngredient: parentName, // Immediate parent, not section
              isMinorIngredient: isMinor,
              minorThreshold: minorThreshold,
              originalText: cleanedSubText
            };
            ingredientsWithSubs.push(subIngredient);
            console.log(`🔗 Sub-ingredient extracted: ${parsedSub.name} (parent: ${parentName}${sectionParent ? `, section: ${sectionParent}` : ''}${isMinor ? `, minor: ${minorThreshold}%` : ''})`);
          }
        }
      } else {
        // Parenthetical content but no commas - not sub-ingredients, keep as-is
        ingredientsWithSubs.push(ingredient);
      }
    } else {
      // No parenthetical content, keep as-is
      ingredientsWithSubs.push(ingredient);
    }
  }
  
  // Replace parsedIngredients with the expanded list
  parsedIngredients.length = 0;
  parsedIngredients.push(...ingredientsWithSubs);

  // Post-parsing cleanup
  console.log(`🧹 Starting cleanup: ${parsedIngredients.length} ingredients before filtering`);
  
  // Track removed ingredients for debugging
  const removedIngredients: Array<{name: string; reason: string}> = [];
  
  // Remove duplicates (case-insensitive)
  const afterDedup = parsedIngredients.filter((ingredient, index, array) => {
    const firstIndex = array.findIndex(item => 
      item.name.toLowerCase() === ingredient.name.toLowerCase()
    );
    if (firstIndex !== index) {
      removedIngredients.push({ name: ingredient.name, reason: 'duplicate' });
      return false;
    }
    return true;
  });
  console.log(`   After deduplication: ${afterDedup.length} ingredients`);
  
  // Remove very low confidence ingredients (likely errors)
  const afterConfidence = afterDedup.filter(ingredient => {
    if (ingredient.confidence <= 0.2) {
      removedIngredients.push({ name: ingredient.name, reason: `low confidence (${ingredient.confidence})` });
      return false;
    }
    return true;
  });
  console.log(`   After confidence filter: ${afterConfidence.length} ingredients`);
  
  // Filter out footer notes like "*Organic", "†Fair Trade", etc.
  const afterFooter = afterConfidence.filter(ingredient => {
    if (isFooterNote(ingredient.name)) {
      removedIngredients.push({ name: ingredient.name, reason: 'footer note' });
      return false;
    }
    return true;
  });
  console.log(`   After footer filter: ${afterFooter.length} ingredients`);
  
  // Log any removed ingredients
  if (removedIngredients.length > 0) {
    console.log(`⚠️  Removed ${removedIngredients.length} ingredients during cleanup:`);
    removedIngredients.forEach(({ name, reason }) => {
      console.log(`   - "${name}": ${reason}`);
    });
  }
  
  // Convert markers to Organic/Fair Trade prefixes (using actual footnote meanings)
  const cleanedIngredients = afterFooter.map(ingredient => convertMarkersToPrefix(ingredient, footnotes));

  console.log(`✅ Final result: ${cleanedIngredients.length} ingredients`);
  return cleanedIngredients;
}

/**
 * Check if text is a footer note explaining markers (not an actual ingredient)
 */
function isFooterNote(text: string): boolean {
  const footerPatterns = [
    /^\*\s*organic$/i,
    /^†\s*fair\s*trade$/i,
    /^\*\s*organic\s*†\s*fair\s*trade/i,
    /^†\s*fair\s*trade\s*\*\s*organic/i,
    /^\*\s*organic\s+(ingredients?|certification)/i,
    /^†\s*fair\s*trade\s+(ingredients?|certification)/i,
  ];
  
  return footerPatterns.some(pattern => pattern.test(text.trim()));
}

/**
 * Convert certification markers to descriptive prefixes based on actual footnote meanings
 * Supports multi-symbol ingredients (e.g., "Butter*†") and numbered/lettered markers
 * Example: "Honey*" → "Organic Honey" (if footnote says "* Organic")
 * Example: "Butter*†" → "Organic, Fair Trade Butter" (if both footnotes exist)
 * Example: "Sugar(1)" → "Non-GMO Sugar" (if footnote says "(1) Non-GMO")
 */
function convertMarkersToPrefix(ingredient: ParsedIngredient, footnotes: Record<string, string>): ParsedIngredient {
  let name = ingredient.name;
  const foundPrefixes: string[] = [];
  
  // Check ALL possible markers in the ingredient name
  for (const [marker, meaning] of Object.entries(footnotes)) {
    // Check if this ingredient contains this marker
    if (name.includes(marker)) {
      // Only add as prefix if it's a certification (not trivial/source notes)
      const isTrivialNote = meaning.toLowerCase().includes('trivial') || 
                            meaning.toLowerCase().includes('cholesterol') ||
                            meaning.toLowerCase().includes('source');
      
      if (!isTrivialNote) {
        foundPrefixes.push(meaning);
      }
      
      // Remove the marker from the name
      if (marker.match(/^\(\d+\)$/)) {
        // Numbered marker: (1) (2)
        const escapedMarker = marker.replace(/[()]/g, '\\$&');
        name = name.replace(new RegExp(escapedMarker, 'g'), '');
      } else if (marker.match(/^\[[a-z]\]$/i)) {
        // Lettered marker: [a] [b]
        const escapedMarker = marker.replace(/[[\]]/g, '\\$&');
        name = name.replace(new RegExp(escapedMarker, 'gi'), '');
      } else {
        // Symbol marker: * † ‡ § ¶ #
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        name = name.replace(new RegExp(escapedMarker, 'g'), '');
      }
    }
  }
  
  // Clean up the name
  name = name.trim();
  
  // Apply all found prefixes (handles multi-symbol case)
  if (foundPrefixes.length > 0) {
    const combinedPrefix = foundPrefixes.join(', ');
    // Only add prefix if not already present
    if (!name.toLowerCase().startsWith(combinedPrefix.toLowerCase())) {
      name = `${combinedPrefix} ${name}`;
    }
  }
  
  return {
    ...ingredient,
    name: name.trim()
  };
}

/**
 * Parse individual ingredient with enhanced edge case handling
 */
function parseIndividualIngredient(text: string, commonIngredients: string[]): ParsedIngredient | null {
  let ingredient = text.trim();
  let confidence = 0.5; // Base confidence
  const modifiers: string[] = [];
  
  // Remove leading "and" or "or"
  ingredient = ingredient.replace(/^(and|or)\s+/i, '').trim();
  
  // Check if main part has trademark symbols (®, ™, ©) - indicates brand name
  const hasTrademark = /[®™©]/.test(ingredient);
  
  if (hasTrademark) {
    // Extract the actual ingredient from parentheses (brand vs actual)
    const parenthesesMatch = ingredient.match(/\(([^)]+)\)/);
    if (parenthesesMatch) {
      const parentheticalContent = parenthesesMatch[1].trim();
      
      // Check if parenthetical contains sub-ingredients (has commas = list of ingredients)
      const hasMultipleItems = parentheticalContent.includes(',');
      
      if (hasMultipleItems) {
        // This is a compound ingredient list - keep brand name, store list as modifiers
        // Example: "Good Seed® grain mix (flax seeds, sunflower seeds)" → "Good Seed grain mix"
        const brandProductName = ingredient.replace(/\([^)]*\)/g, '').replace(/[®™©]/g, '').trim();
        ingredient = brandProductName;
        modifiers.push(parentheticalContent);
      } else {
        // Single item in parentheses - use existing logic
        // (handles cases like "Brand® (actual ingredient name)")
        if (!parentheticalContent.toLowerCase().includes('formerly') && 
            !parentheticalContent.toLowerCase().includes('also known') &&
            !parentheticalContent.toLowerCase().includes('aka') &&
            parentheticalContent.length > 2) {
          const brandName = ingredient.replace(/\([^)]*\)/g, '').replace(/[®™©]/g, '').trim();
          if (brandName) {
            modifiers.push(brandName);
          }
          // Use the parenthetical name as the actual ingredient
          ingredient = parentheticalContent;
        }
      }
    }
    
    // Remove trademark symbols
    ingredient = ingredient.replace(/[®™©]/g, '').trim();
  }
  
  // Extract parenthetical information (modifiers) - if not already processed
  if (!hasTrademark) {
    // Use nested parentheses extraction to handle arbitrary depth
    const extractedModifiers = extractNestedParentheses(ingredient);
    modifiers.push(...extractedModifiers);
    confidence += extractedModifiers.length * 0.1;
    
    // Remove all parentheses from main ingredient name
    // This regex only removes top-level, but nested function already extracted content
    let depth = 0;
    let cleaned = '';
    for (let i = 0; i < ingredient.length; i++) {
      const char = ingredient[i];
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (depth === 0) {
        cleaned += char;
      }
    }
    ingredient = cleaned.trim();
  } else {
    // For trademark case, just remove parentheses (already processed)
  ingredient = ingredient.replace(/\s*\([^)]*\)/g, '').trim();
  }
  
  // Extract bracketed information
  const bracketsRegex = /\[([^\]]+)\]/g;
  let match;
  while ((match = bracketsRegex.exec(ingredient)) !== null) {
    const modifier = match[1].trim();
    if (modifier) {
      modifiers.push(modifier);
      confidence += 0.1;
    }
  }
  
  // Remove brackets from main ingredient name
  ingredient = ingredient.replace(/\s*\[[^\]]*\]/g, '').trim();
  
  // Handle multi-word ingredients with commas (like "natural flavors, including vanilla, with color")
  if (ingredient.includes(',')) {
    const commaParts = ingredient.split(',').map(p => p.trim());
    
    // Check if first part is main ingredient and rest are modifiers
    const firstPart = commaParts[0];
    const restParts = commaParts.slice(1);
    
    // If rest starts with modifier keywords or are short descriptors
    const isModifierPattern = restParts.every(part => 
      part.match(/^(including|such as|like|e\.g\.|contains?|with)/i) ||
      part.split(' ').length <= 3  // Short phrases likely modifiers
    );
    
    if (isModifierPattern && restParts.length > 0) {
      ingredient = firstPart;
      modifiers.push(...restParts);
      confidence += 0.15;
    }
  }
  
  // Clean up the ingredient name
  ingredient = ingredient
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s*,\s*/, '') // Remove leading comma
    .replace(/\s*,\s*$/, '') // Remove trailing comma
    .replace(/\s*[.!?;:]+\s*$/, '') // Remove trailing punctuation
    .trim();
  
  // Validate ingredient
  if (!isValidIngredient(ingredient, commonIngredients)) {
    return null;
  }
  
  // Calculate confidence based on various factors
  confidence = calculateIngredientConfidence(ingredient, modifiers, commonIngredients);
  
  return {
    name: ingredient,
    modifiers,
    confidence,
    originalText: text
  };
}

/**
 * Validate if a string is a valid ingredient
 */
function isValidIngredient(ingredient: string, commonIngredients: string[]): boolean {
  if (!ingredient || ingredient.length < 2 || ingredient.length > 150) {
    return false;
  }
  
  // Filter out measurement-only text
  if (ingredient.match(/^\d+\s*(mg|g|ml|oz|lb|kg|l|mcg|iu)/i)) {
    return false;
  }
  
  // Filter out percentage-only text
  if (ingredient.match(/^\d+%$/)) {
    return false;
  }
  
  // Filter out "X or less" patterns
  if (ingredient.match(/^\d+%?\s+or\s+(less|more)/i)) {
    return false;
  }
  
  // Filter out standalone allergen warnings
  if (ingredient.match(/^(contains|may contain)/i) && ingredient.length < 30) {
    return false;
  }
  
  // Check for non-ingredient patterns
  const nonIngredientPatterns = [
    /^\d+\s*(?:mg|g|ml|mcg|iu)$/i, // Just measurements
    /^(mg|g|ml|l|oz|lb|kg)$/i, // Just units
    /calories?/i, // Calorie info
    /daily\s*value/i, // Daily value
    /nutrition/i, // Nutrition facts
    /serving/i, // Serving info
    /^\d+\s*(mg|g|ml|l|oz|lb|kg)/i, // Measurements
    /^\d+%/, // Percentages
    /^\d+\s*calories?/i, // Calorie amounts
    /\d+\s+(eagle|main|oak|pine|elm|maple|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(rd|road|st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|way|circle|cir)/i, // Address
    /^[A-Z]{2}\s+\d{4,5}(\s+(USA|US))?$/i, // State+ZIP
    /^(produced|distributed|manufactured|certified|chat|talk)/i, // Company info
    /(COMPANY|CORPORATION|LLC|INC|LTD|CO\.|CORP\.)/i // Company name
  ];
  
  for (const pattern of nonIngredientPatterns) {
    if (pattern.test(ingredient)) {
      return false;
    }
  }
  
  // Must contain at least one letter
  if (!ingredient.match(/[a-zA-Z]/)) {
    return false;
  }
  
  return true;
}

/**
 * Calculate confidence score for an ingredient
 */
function calculateIngredientConfidence(ingredient: string, modifiers: string[], commonIngredients: string[]): number {
  let confidence = 0.3; // Lower base confidence
  
  // Major confidence boost for common ingredient words (0.3)
  const ingredientLower = ingredient.toLowerCase();
  const hasCommonWord = commonIngredients.some(common => 
    ingredientLower.includes(common.toLowerCase())
  );
  if (hasCommonWord) {
    confidence += 0.3;
  }
  
  // Medium boost for modifiers (0.15)
  if (modifiers.length > 0) {
    confidence += 0.15;
  }
  
  // Small boost for proper formatting (0.1)
  if (ingredient.match(/^[A-Z][a-z]/) || ingredient.match(/^[a-z]/)) {
    confidence += 0.1;
  }
  
  // Small boost for reasonable length (0.1)
  if (ingredient.length >= 3 && ingredient.length <= 50) {
    confidence += 0.1;
  }
  
  // Penalties
  if (ingredient.length < 3) {
    confidence -= 0.3;
  }
  if (ingredient.length > 100) {
    confidence -= 0.2;
  }
  
  // Penalty for too many numbers (likely not an ingredient)
  const numberCount = (ingredient.match(/\d/g) || []).length;
  if (numberCount > 3) {
    confidence -= 0.2;
  }
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Legacy function for backward compatibility - converts new structure to old format
 */
export function parseIngredientsFromTextLegacy(text: string): string[] {
  const parsedIngredients = parseIngredientsFromText(text);
  return parsedIngredients.map(ingredient => ingredient.name);
}

/**
 * Validate if extracted text looks like an ingredient list
 */
export function validateIngredientList(text: string): {
  isValid: boolean;
  confidence: number;
  suggestions: string[];
} {
  const suggestions: string[] = [];
  let confidence = 0;

  // Check for common ingredient list indicators
  const hasIngredientKeywords = /ingredients?|nedents?|contains?|made\s+with/i.test(text);
  if (hasIngredientKeywords) {
    confidence += 0.3;
  } else {
    suggestions.push('Try to capture the "Ingredients" section of the product');
  }

  // Check for common ingredient separators
  const hasSeparators = /[,;]/.test(text);
  if (hasSeparators) {
    confidence += 0.2;
  } else {
    suggestions.push('Ensure the ingredient list is clearly separated by commas');
  }

  // Check for reasonable length
  if (text.length > 20 && text.length < 2000) {
    confidence += 0.2;
  } else if (text.length <= 20) {
    suggestions.push('The text seems too short - try capturing more of the ingredient list');
  } else {
    suggestions.push('The text seems too long - try focusing on just the ingredient list');
  }

  // Check for common food-related terms
  const hasFoodTerms = /organic|natural|sugar|salt|oil|water|flour|milk|egg|peanut|peanuts|wheat|corn|rice|soy/i.test(text);
  if (hasFoodTerms) {
    confidence += 0.2;
  }

  // Check for common preservatives/additives (indicates ingredient list)
  const hasAdditives = /preservative|color|flavor|stabilizer|emulsifier/i.test(text);
  if (hasAdditives) {
    confidence += 0.1;
  }

  return {
    isValid: confidence > 0.4,
    confidence,
    suggestions,
  };
}

/**
 * Validate OCR extraction quality and completeness
 */
export function validateOCRExtraction(extractedText: string, parsedIngredients: ParsedIngredient[]): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Check if extracted text is too short
  if (extractedText.length < 20) {
    warnings.push('Extracted text is very short (< 20 characters) - OCR may be incomplete');
  }
  
  // Check if too few ingredients found
  if (parsedIngredients.length < 3) {
    warnings.push(`Only ${parsedIngredients.length} ingredients found - OCR may be incomplete. Expected at least 3 ingredients.`);
  }
  
  // Check if minor marker found but few ingredients after it
  // Uses alternation to handle both "Less than 2% of" (less before %) and "2% or less of" (less after %)
  const minorPattern = /(?:contains?\s+)?(?:less\s+than\s+(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s+(?:or\s+)?less)\s*(?:of\s+)?(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi;
  const hasMinorMarker = minorPattern.test(extractedText);
  
  if (hasMinorMarker) {
    // Reset regex to search from beginning
    minorPattern.lastIndex = 0;
    const markerMatch = minorPattern.exec(extractedText);
    if (markerMatch) {
      const textAfterMarker = extractedText.substring(markerMatch.index + markerMatch[0].length);
      const ingredientsAfterMarker = parseIngredientsFromText(textAfterMarker);
      
      if (ingredientsAfterMarker.length < 2) {
        warnings.push('Minor ingredient marker found but < 2 ingredients detected after it - OCR may be incomplete');
      }
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

// Advanced image processing functions removed - no longer needed with GPT-5 mini
// GPT-5 mini handles image analysis without requiring complex preprocessing

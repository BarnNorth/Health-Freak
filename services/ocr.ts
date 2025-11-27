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

  // PASS 2: Detect ALL minor ingredient sections with their thresholds
  interface MinorSection {
    startIndex: number;
    threshold: number;
  }
  
  const minorSections: MinorSection[] = [];
  
  // Pattern to detect minor sections with percentage extraction
  // Uses alternation to handle both "Less than 2% of" (less before %) and "2% or less of" (less after %)
  const minorPattern = /(?:contains?\s+)?(?:less\s+than\s+(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s+(?:or\s+)?less)\s*(?:of\s+)?(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi;
  
  let searchText = text;
  let match;
  const markersToRemove: Array<{index: number, length: number}> = [];
  
  // Find ALL minor sections (not just the first one)
  while ((match = minorPattern.exec(searchText)) !== null) {
    // Extract the actual percentage threshold
    const threshold = parseFloat(match[1] || match[2] || '2');
    
    // Count commas before this marker using proper nesting
    const textBeforeMarker = searchText.substring(0, match.index);
    const commasBeforeMarker = countCommasWithProperNesting(textBeforeMarker);
    
    minorSections.push({
      startIndex: commasBeforeMarker,
      threshold: threshold
    });
    
    // Log when minor section is found
    console.log(`🎯 Minor section found: threshold ${threshold}% at position ${commasBeforeMarker}`);
    
    // Track marker for removal
    markersToRemove.push({
      index: match.index,
      length: match[0].length
    });
  }
  
  // Remove all markers from text (in reverse order to preserve indices)
  for (let i = markersToRemove.length - 1; i >= 0; i--) {
    const marker = markersToRemove[i];
    let textBeforeMarker = searchText.substring(0, marker.index).trimEnd();
    let textAfterMarker = searchText.substring(marker.index + marker.length).trim();
    
    // Remove trailing "and" or ", and" before marker
    textBeforeMarker = textBeforeMarker.replace(/,?\s*and\s*$/i, '').trimEnd();
    
    // Remove leading "of:" or "of" from text after marker
    textAfterMarker = textAfterMarker.replace(/^of:?\s*/i, '').trim();
    
    // Ensure proper comma placement
    const hasComma = textBeforeMarker.endsWith(',');
    searchText = textBeforeMarker + (hasComma ? ' ' : ', ') + textAfterMarker;
  }
  
  text = searchText;

  // Enhanced regex to split ingredients while preserving parentheses and handling edge cases
  const ingredientSplitRegex = /,(?![^()]*\))/g; // Split on commas not inside parentheses
  
  // Split text into potential ingredients
  const rawIngredients = text.split(ingredientSplitRegex);
  
  const parsedIngredients: ParsedIngredient[] = [];
  
  for (let i = 0; i < rawIngredients.length; i++) {
    const trimmed = rawIngredients[i].trim();
    if (!trimmed) continue;
    
    // Find which minor section this ingredient belongs to (if any)
    // Get the most recent section that starts before or at this index
    const applicableSection = minorSections
      .filter(section => i >= section.startIndex)
      .sort((a, b) => b.startIndex - a.startIndex)[0];
    
    // Parse the ingredient with enhanced logic
    const parsed = parseIndividualIngredient(trimmed, commonIngredients);
    
    if (parsed) {
      // Mark as minor and set threshold if in a minor section
      if (applicableSection) {
        parsed.isMinorIngredient = true;
        parsed.minorThreshold = applicableSection.threshold;
        console.log(`📌 Minor ingredient detected: ${parsed.name} (threshold: ${applicableSection.threshold}%)`);
      }
      parsedIngredients.push(parsed);
    }
  }

  // Post-parsing cleanup
  const cleanedIngredients = parsedIngredients
    // Remove duplicates (case-insensitive)
    .filter((ingredient, index, array) => 
      array.findIndex(item => 
        item.name.toLowerCase() === ingredient.name.toLowerCase()
      ) === index
    )
    // Remove very low confidence ingredients (likely errors)
    .filter(ingredient => ingredient.confidence > 0.2)
    // Filter out footer notes like "*Organic", "†Fair Trade", etc.
    .filter(ingredient => !isFooterNote(ingredient.name))
    // Convert markers to Organic/Fair Trade prefixes (using actual footnote meanings)
    .map(ingredient => convertMarkersToPrefix(ingredient, footnotes));

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

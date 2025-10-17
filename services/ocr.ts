import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { config } from '@/lib/config';
import { logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';
import { withRateLimit, validateImageData, validateExtractedText } from './security';

// OpenAI GPT-4 Vision configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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
 * Extract ingredients from food label using GPT-4 Vision
 * This is simpler and more accurate than Google Vision + complex parsing
 */
async function extractIngredientsWithGPT4Vision(base64Image: string): Promise<OCRResult> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    return {
      text: '',
      confidence: 0,
      error: 'OpenAI API key not configured',
    };
  }

  try {
    const prompt = `You are analyzing a food product label. Extract ONLY the ingredients list.

CRITICAL RULES:
1. Extract ONLY the actual ingredients (after "INGREDIENTS:" label)
2. IGNORE the Nutrition Facts table completely (all % DV values, calories, etc.)
3. IGNORE allergen warnings (CONTAINS, MAY CONTAIN sections)
4. Return ingredients as a clean, comma-separated list
5. Preserve sub-ingredients in parentheses exactly as shown
6. Remove any nutrition data that got mixed in (like "4%", "12%", etc.)
7. Extract ALL ingredients - do not skip any - look carefully for every single ingredient

MARKER EXTRACTION (CRITICAL):
8. If you see certification markers (*, †, °, etc.) printed DIRECTLY AFTER ingredient names, preserve them EXACTLY
9. Look VERY CAREFULLY for these markers - they are often small and easy to miss
10. Check EVERY ingredient for markers - they may appear on many or most ingredients
11. Example: If you see "Peanut Butter*" or "Peanut Butter *" → write "Peanut Butter*"
12. Example: If you see just "Peanut Butter" with no marker → write "Peanut Butter"
13. Do NOT add markers that aren't visible, but do NOT skip markers that ARE visible
14. If "Organic" or "Fairtrade" appears as a WORD before the ingredient, keep it: "Organic Honey"
15. Pay special attention to small superscript markers (*, †) - they're important!

FOOTER NOTES:
16. At the end of ingredients, there may be a note like "*Organic" or "†Fair Trade" - INCLUDE THIS
17. This footer note explains what the markers mean - it's important to capture it

Format: Return ONLY the comma-separated ingredient list exactly as printed, including any markers and footer notes.

Example with markers: "Peanut Butter*, Dark Chocolate* (Chocolate*†, Cane Sugar*†), Organic Honey, Sea Salt, *Organic †Fair Trade"
Example without markers: "Peanut Butter, Dark Chocolate, Honey, Sea Salt"`;

    const requestBody = {
      model: 'gpt-4o-mini', // gpt-4o-mini is 60% faster and cheaper than gpt-4o for ingredient analysis
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'high' // High detail needed for accurate extraction of all ingredients
              } 
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.1, // Low temperature for consistent, accurate extraction
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content?.trim() || '';
    
    if (!extractedText || extractedText.length < 5) {
      return {
        text: '',
        confidence: 0,
        error: 'No ingredients found in image. Please ensure the image shows a clear ingredient list.',
      };
    }

    return {
      text: extractedText,
      confidence: 0.95, // GPT-4 Vision is highly accurate for this task
    };

  } catch (error) {
    logDetailedError('GPT4V_EXTRACTION', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('Unauthorized')) {
        return {
          text: '',
          confidence: 0,
          error: 'OpenAI API key error. Please check configuration.',
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
 * Extract ingredients from food label image using GPT-4 Vision
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

      // Use GPT-4 Vision for ingredient extraction
      return await extractIngredientsWithGPT4Vision(base64Image);
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
      
      // Handle GPT-4 Vision specific errors
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
 * Complex parsing functions removed - replaced by GPT-4 Vision
 * GPT-4 Vision handles all text extraction and cleaning automatically
 */

export interface ParsedIngredient {
  name: string;
  modifiers: string[];
  confidence: number;
  originalText: string;
  isMinorIngredient?: boolean; // true if ingredient appears after "contains X% or less" marker
}

/**
 * Extract and remove footnote definitions from ingredient text (Industry Best Practice: Two-Pass Parsing)
 * Example input: "Flour, Sugar, Butter*. * Organic" 
 * Returns: { cleanedText: "Flour, Sugar, Butter*", footnotes: { '*': 'Organic' } }
 */
function extractAndCleanFootnotes(text: string): { cleanedText: string; footnotes: Record<string, string> } {
  const footnotes: Record<string, string> = {};
  let cleanedText = text;
  
  // Pattern 1: Standalone footnotes at end (". * Organic" or ". † Fair Trade")
  const standalonePattern = /\.\s*([*†‡§¶#]+)\s+([A-Z][^.*†‡§¶#]+?)(?=\s*[.*†‡§¶#]|$)/g;
  
  let match;
  const footnotesToRemove: string[] = [];
  
  while ((match = standalonePattern.exec(text)) !== null) {
    const symbol = match[1].trim();
    const meaning = match[2].trim();
    
    // Only store meaningful footnotes (not ingredient fragments)
    if (meaning.length > 3 && 
        (meaning.toLowerCase().includes('organic') || 
         meaning.toLowerCase().includes('fair trade') ||
         meaning.toLowerCase().includes('trivial') ||
         meaning.toLowerCase().includes('cholesterol') ||
         meaning.toLowerCase().includes('source'))) {
      
      footnotes[symbol] = meaning;
      footnotesToRemove.push(match[0]); // Save full match to remove later
    }
  }
  
  // Remove footnote definitions from text
  for (const footnoteText of footnotesToRemove) {
    cleanedText = cleanedText.replace(footnoteText, '.');
  }
  
  // Pattern 2: Note/Footnote sections (common variations)
  const noteSectionPatterns = [
    /note:\s*[*†‡§¶#]+\s+[^.]+\./gi,
    /\*+\s+(organic|fair\s*trade|fairtrade)(\s+ingredients?)?\.?$/gi,
    /†+\s+(organic|fair\s*trade|fairtrade)(\s+ingredients?)?\.?$/gi,
  ];
  
  for (const pattern of noteSectionPatterns) {
    const noteMatch = cleanedText.match(pattern);
    if (noteMatch) {
      const noteText = noteMatch[0];
      
      // Extract symbol and meaning
      if (noteText.includes('*')) {
        if (noteText.toLowerCase().includes('organic')) footnotes['*'] = 'Organic';
        if (noteText.toLowerCase().includes('fair trade')) footnotes['*'] = 'Fair Trade';
      }
      if (noteText.includes('†')) {
        if (noteText.toLowerCase().includes('organic')) footnotes['†'] = 'Organic';
        if (noteText.toLowerCase().includes('fair trade')) footnotes['†'] = 'Fair Trade';
      }
      
      cleanedText = cleanedText.replace(noteText, '');
    }
  }
  
  return { cleanedText: cleanedText.trim(), footnotes };
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
    console.error('❌ Invalid extracted text:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }

  // PASS 1: Extract and remove footnote definitions from text
  const { cleanedText, footnotes } = extractAndCleanFootnotes(text);
  text = cleanedText; // Use cleaned text for ingredient parsing

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

  // PASS 2: Detect and mark minor ingredient sections, then remove the marker from text
  const minorIngredientPatterns = [
    /contains?\s+(?:2%|less\s+than\s+2%|\d+%)\s+or\s+less\s+of\s+(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi,
    /contains?\s+less\s+than\s+(?:2%|\d+%)\s+of\s+(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi,
    /less\s+than\s+(?:2%|\d+%)\s*(?:of\s+)?(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi,
    /(?:2%|\d+%)\s+or\s+less\s*(?:of\s+)?(?:each\s+of\s+)?(?:the\s+following:\s*)?/gi,
  ];

  let hasMinorSection = false;
  let minorMarkerIndex = -1; // Index in the split array where minor section starts

  // Find and mark the minor ingredient marker, then remove it
  for (const pattern of minorIngredientPatterns) {
    const match = pattern.exec(text);
    if (match) {
      hasMinorSection = true;
      
      // Count commas BEFORE the marker (excluding commas inside parentheses)
      // This must match the split logic: /,(?![^()]*\))/g
      const textBeforeMarker = text.substring(0, match.index);
      const commasBeforeMarker = (textBeforeMarker.match(/,(?![^()]*\))/g) || []).length;
      
      // The minor section starts at the next ingredient after this comma count
      // Since commas separate ingredients, index N follows comma N-1
      // So if there are 3 commas before marker, the first minor ingredient is at index 3
      minorMarkerIndex = commasBeforeMarker - 1; // Subtract 1 because we want > comparison
      
      // Remove the marker from the text
      // Check if there's already a comma before the marker
      const textBeforeTrimmed = text.substring(0, match.index).trimEnd();
      const hasCommaBeforeMarker = textBeforeTrimmed.endsWith(',');
      const textAfterMarker = text.substring(match.index + match[0].length).trim();
      
      if (hasCommaBeforeMarker) {
        // Already has comma, just remove marker
        text = textBeforeTrimmed + ' ' + textAfterMarker;
      } else {
        // Add comma to separate
        text = textBeforeTrimmed + ', ' + textAfterMarker;
      }
      break;
    }
  }

  // Enhanced regex to split ingredients while preserving parentheses and handling edge cases
  const ingredientSplitRegex = /,(?![^()]*\))/g; // Split on commas not inside parentheses
  
  // Split text into potential ingredients
  const rawIngredients = text.split(ingredientSplitRegex);
  
  const parsedIngredients: ParsedIngredient[] = [];
  
  for (let i = 0; i < rawIngredients.length; i++) {
    const trimmed = rawIngredients[i].trim();
    if (!trimmed) continue;
    
    // Determine if this ingredient is in the minor section based on array index
    const isMinor = hasMinorSection && i > minorMarkerIndex;
    
    // Parse the ingredient with enhanced logic
    const parsed = parseIndividualIngredient(trimmed, commonIngredients);
    
    if (parsed) {
      // Mark as minor based on array index
      parsed.isMinorIngredient = isMinor;
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
    // Keep original OCR order - do not sort by confidence
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
 * Example: "Honey*" → "Organic Honey" (if footnote says "* Organic")
 * Example: "Butter*" → "Butter" (if footnote says "* A Trivial Source of Cholesterol")
 */
function convertMarkersToPrefix(ingredient: ParsedIngredient, footnotes: Record<string, string>): ParsedIngredient {
  let name = ingredient.name;
  
  // Check for organic marker (*)
  if (name.includes('*')) {
    const footnoteMeaning = footnotes['*'] || '';
    name = name.replace(/\*/g, '').trim();
    
    // Only add "Organic" prefix if the footnote actually means "organic"
    if (footnoteMeaning.toLowerCase().includes('organic') && !name.toLowerCase().startsWith('organic')) {
      name = `Organic ${name}`;
    }
  }
  
  // Check for fair trade marker (†)
  if (name.includes('†')) {
    const footnoteMeaning = footnotes['†'] || '';
    name = name.replace(/†/g, '').trim();
    
    // Only add "Fair Trade" prefix if the footnote actually means "fair trade"
    if ((footnoteMeaning.toLowerCase().includes('fair trade') || footnoteMeaning.toLowerCase().includes('fairtrade')) 
        && !name.toLowerCase().startsWith('fair trade') && !name.toLowerCase().startsWith('fairtrade')) {
      name = `Fair Trade ${name}`;
    }
  }
  
  // Handle other symbols (‡, §, ¶, #, etc.) - just strip them
  name = name.replace(/[‡§¶#]+/g, '').trim();
  
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
  
  // Extract parenthetical information (modifiers)
  const parenthesesRegex = /\(([^)]+)\)/g;
  let match;
  while ((match = parenthesesRegex.exec(ingredient)) !== null) {
    const modifier = match[1].trim();
    if (modifier) {
      modifiers.push(modifier);
      confidence += 0.1; // Boost confidence for having modifiers
    }
  }
  
  // Remove parentheses from main ingredient name
  ingredient = ingredient.replace(/\s*\([^)]*\)/g, '').trim();
  
  // Extract bracketed information
  const bracketsRegex = /\[([^\]]+)\]/g;
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

// Advanced image processing functions removed - no longer needed with GPT-4 Vision
// GPT-4 Vision handles image analysis without requiring complex preprocessing

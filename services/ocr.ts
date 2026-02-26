import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { config } from '@/lib/config';
import { logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';
import { withRateLimit, validateImageData, validateExtractedText } from './security';
import { supabase } from '../lib/supabase';

/**
 * OCR and Ingredient Parsing Service
 *
 * Uses GPT-5 mini for image-to-text extraction from food labels.
 * The Edge Function returns structured ingredient data directly,
 * eliminating the need for complex client-side regex parsing.
 *
 * For manual text input, a simplified parser handles basic
 * comma-separated ingredient lists.
 */

// Get Supabase URL for Edge Function
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

export interface OCRResult {
  text: string;
  confidence: number;
  error?: string;
}

export interface StructuredIngredient {
  name: string;
  isMinor: boolean;
  minorThreshold?: number;
  parentIngredient?: string | null;
  isSubIngredient?: boolean;
}

export interface OCRResultWithStructured extends OCRResult {
  structured_ingredients?: StructuredIngredient[] | null;
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

export interface ImagePreprocessingOptions {
  resize?: {
    width?: number;
    height?: number;
  };
}

/**
 * Preprocess image to improve OCR accuracy
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
          compress: 0.6,
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
 * Extract ingredients from food label using GPT-5 mini Vision
 * Returns structured ingredient data when available
 */
async function extractIngredientsWithVision(base64Image: string): Promise<OCRResultWithStructured> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return {
        text: '',
        confidence: 0,
        error: 'User not authenticated',
        structured_ingredients: null,
      };
    }

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

    const result = await response.json() as OCRResultWithStructured;
    const extractedText = result.text?.trim() || '';

    if (!extractedText || extractedText.length < 5) {
      return {
        text: '',
        confidence: 0,
        error: 'No ingredients found in image. Please ensure the image shows a clear ingredient list.',
        structured_ingredients: null,
      };
    }

    return {
      text: extractedText,
      confidence: result.confidence || 0.95,
      structured_ingredients: result.structured_ingredients || null,
    };

  } catch (error) {
    logDetailedError('VISION_EXTRACTION', error);

    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('Unauthorized')) {
        return {
          text: '',
          confidence: 0,
          error: 'Authentication error. Please check your session.',
          structured_ingredients: null,
        };
      }

      if (error.message.includes('quota') || error.message.includes('429')) {
        return {
          text: '',
          confidence: 0,
          error: 'OpenAI API quota exceeded. Please try again later.',
          structured_ingredients: null,
        };
      }

      if (error.message.includes('network') || error.message.includes('fetch')) {
        return {
          text: '',
          confidence: 0,
          error: 'Network error. Please check your internet connection.',
          structured_ingredients: null,
        };
      }
    }

    return {
      text: '',
      confidence: 0,
      error: `Failed to extract ingredients: ${error instanceof Error ? error.message : 'Unknown error'}`,
      structured_ingredients: null,
    };
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
): Promise<OCRResultWithStructured> {
  const userIdForRateLimit = userId || 'anonymous';

  return await withRateLimit(userIdForRateLimit, 'ocr', async () => {
    try {
      const qualityCheck = await quickImageQualityCheck(imageUri);
      if (!qualityCheck.shouldProcess) {
        return { text: '', confidence: qualityCheck.confidence, error: qualityCheck.error, structured_ingredients: null };
      }

      const processedImageUri = await preprocessImage(imageUri, {
        ...preprocessingOptions,
        resize: { width: 800, height: 800 },
      });

      const base64Image = await FileSystem.readAsStringAsync(processedImageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const imageValidation = validateImageData(base64Image);
      if (!imageValidation.valid) {
        return {
          text: '',
          confidence: 0,
          error: imageValidation.error,
          structured_ingredients: null,
        };
      }

      return await extractIngredientsWithVision(base64Image);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit')) {
        throw error;
      }

      logDetailedError('OCR_EXTRACTION', error, {
        imageUri,
        hasPreprocessingOptions: !!preprocessingOptions
      });

      if (error instanceof Error) {
        if (error.message.includes('API key') || error.message.includes('unauthorized') || error.message.includes('401')) {
          return { text: '', confidence: 0, error: 'OpenAI API key error. Please check configuration.', structured_ingredients: null };
        }

        if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
          return { text: '', confidence: 0, error: 'OpenAI API quota exceeded. Please try again later.', structured_ingredients: null };
        }

        if (error.message.includes('network') || error.message.includes('fetch')) {
          return { text: '', confidence: 0, error: 'Network error. Please check your internet connection.', structured_ingredients: null };
        }

        if (error.message.includes('invalid') || error.message.includes('image') || error.message.includes('400')) {
          return { text: '', confidence: 0, error: 'Invalid image format. Please try taking a new photo.', structured_ingredients: null };
        }

        if (error.message.includes('file') || error.message.includes('read')) {
          return { text: '', confidence: 0, error: 'Unable to read image file. Please try taking a new photo.', structured_ingredients: null };
        }
      }

      const friendlyMessage = getUserFriendlyErrorMessage(error);
      return {
        text: '',
        confidence: 0,
        error: `Failed to extract ingredients: ${friendlyMessage}. Please try again with a clearer photo.`,
        structured_ingredients: null,
      };
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// Ingredient Parsing (used for manual text input fallback)
// ═══════════════════════════════════════════════════════════════════

export interface ParsedIngredient {
  name: string;
  modifiers: string[];
  confidence: number;
  originalText: string;
  isMinorIngredient?: boolean;
  minorThreshold?: number;
  isSubIngredient?: boolean;
  parentIngredient?: string;
}

/**
 * Convert structured OCR ingredients to ParsedIngredient format
 * Used when the Edge Function returns pre-parsed structured data
 */
export function convertStructuredToParseIngredients(
  structured: StructuredIngredient[]
): ParsedIngredient[] {
  return structured
    .filter(ing => ing.name && ing.name.trim().length >= 2)
    .map(ing => ({
      name: ing.name.trim(),
      modifiers: [],
      confidence: 0.9,
      originalText: ing.name.trim(),
      isMinorIngredient: ing.isMinor || false,
      minorThreshold: ing.minorThreshold,
      isSubIngredient: ing.isSubIngredient || false,
      parentIngredient: ing.parentIngredient || undefined,
    }));
}

/**
 * Split text by commas while respecting both parentheses and brackets
 * Only splits on commas when both parenthesis and bracket depths are zero
 */
function splitByCommasRespectingBrackets(text: string): string[] {
  const parts: string[] = [];
  let currentPart = '';
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '(') {
      parenDepth++;
      currentPart += char;
    } else if (char === ')') {
      parenDepth--;
      currentPart += char;
    } else if (char === '[') {
      bracketDepth++;
      currentPart += char;
    } else if (char === ']') {
      bracketDepth--;
      currentPart += char;
    } else if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }
      currentPart = '';
    } else {
      currentPart += char;
    }
  }

  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }

  return parts;
}

/**
 * Extract all parenthetical content with proper nesting support
 */
function extractNestedParentheses(text: string): string[] {
  const modifiers: string[] = [];
  let depth = 0;
  let currentModifier = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '(') {
      if (depth === 0) {
        // start of top-level paren
      }
      depth++;
      if (depth > 1) {
        currentModifier += char;
      }
    } else if (char === ')') {
      depth--;
      if (depth > 0) {
        currentModifier += char;
      } else if (depth === 0) {
        if (currentModifier.trim()) {
          modifiers.push(currentModifier.trim());
        }
        currentModifier = '';
      }
    } else if (depth > 0) {
      currentModifier += char;
    }
  }

  return modifiers;
}

// Common ingredient words to help identify valid ingredients
const COMMON_INGREDIENTS = [
  'organic', 'natural', 'sugar', 'salt', 'oil', 'water', 'flour', 'milk', 'egg',
  'wheat', 'corn', 'rice', 'soy', 'coconut', 'olive', 'sunflower', 'canola',
  'vanilla', 'cocoa', 'chocolate', 'butter', 'cream', 'cheese', 'yogurt',
  'lemon', 'lime', 'orange', 'apple', 'banana', 'strawberry', 'blueberry',
  'cinnamon', 'ginger', 'garlic', 'onion', 'tomato', 'carrot', 'celery',
  'baking', 'soda', 'powder', 'yeast', 'starch', 'syrup', 'honey', 'molasses',
  'vinegar', 'citric', 'acid', 'lecithin', 'gum', 'xanthan', 'guar', 'carrageenan',
  'preservative', 'color', 'flavor', 'extract', 'essence', 'spice', 'herb'
];

/**
 * Parse extracted text to identify individual ingredients
 * Used as fallback for manual text input (photo path uses structured OCR)
 */
export function parseIngredientsFromText(text: string): ParsedIngredient[] {
  if (!text) return [];

  try {
    text = validateExtractedText(text);
  } catch (error) {
    console.error('Invalid extracted text:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }

  // Strip common prefixes (e.g., "INGREDIENTS:", "Contains:")
  text = text.replace(/^(ingredients|contains)\s*:\s*/i, '');

  // Remove allergen warnings (e.g., "CONTAINS MILK, SOY, WHEAT" at end)
  text = text.replace(/\s+CONTAINS\s+[A-Z,\s]+$/g, '');

  // Normalize semicolons to commas for splitting
  text = text.replace(/;/g, ',');

  // Expand "and/or" to separate ingredients
  text = text.replace(/\s+and\/or\s+/gi, ', ');

  // Split by commas respecting parentheses/brackets
  const parts = splitByCommasRespectingBrackets(text);

  const parsedIngredients: ParsedIngredient[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const parsed = parseIndividualIngredient(trimmed, COMMON_INGREDIENTS);
    if (parsed) {
      parsedIngredients.push(parsed);
    }
  }

  // Extract sub-ingredients from parenthetical content
  const ingredientsWithSubs: ParsedIngredient[] = [];
  for (const ingredient of parsedIngredients) {
    const parentheticalMatch = ingredient.originalText.match(/\(([^)]+)\)/);

    if (parentheticalMatch) {
      const parentheticalContent = parentheticalMatch[1].trim();

      if (parentheticalContent.includes(',')) {
        const parentName = ingredient.name;

        const parentIngredient: ParsedIngredient = {
          ...ingredient,
          modifiers: ingredient.modifiers.filter(mod => !mod.includes(',') || mod !== parentheticalContent)
        };
        ingredientsWithSubs.push(parentIngredient);

        const subParts = splitByCommasRespectingBrackets(parentheticalContent)
          .filter(sub => sub.length > 0);

        for (const subText of subParts) {
          if (!subText || subText.length < 2) continue;

          const parsedSub = parseIndividualIngredient(subText.trim(), COMMON_INGREDIENTS);

          if (parsedSub && parsedSub.name) {
            ingredientsWithSubs.push({
              ...parsedSub,
              isSubIngredient: true,
              parentIngredient: parentName,
              originalText: subText.trim()
            });
          }
        }
      } else {
        ingredientsWithSubs.push(ingredient);
      }
    } else {
      // Check for bracket content
      const bracketMatch = ingredient.originalText.match(/\[([^\]]+)\]/);

      if (bracketMatch) {
        const bracketContent = bracketMatch[1].trim();

        if (bracketContent.includes(',')) {
          const parentName = ingredient.name;
          ingredientsWithSubs.push(ingredient);

          const bracketParts = splitByCommasRespectingBrackets(bracketContent)
            .filter(sub => sub.length > 0);

          for (const subText of bracketParts) {
            if (!subText || subText.length < 2) continue;

            const parsedSub = parseIndividualIngredient(subText.trim(), COMMON_INGREDIENTS);

            if (parsedSub && parsedSub.name) {
              ingredientsWithSubs.push({
                ...parsedSub,
                isSubIngredient: true,
                parentIngredient: parentName,
                originalText: subText.trim()
              });
            }
          }
        } else {
          ingredientsWithSubs.push(ingredient);
        }
      } else {
        ingredientsWithSubs.push(ingredient);
      }
    }
  }

  // Deduplicate (case-insensitive)
  const deduped = ingredientsWithSubs.filter((ingredient, index, array) => {
    const firstIndex = array.findIndex(item =>
      item.name.toLowerCase() === ingredient.name.toLowerCase()
    );
    return firstIndex === index;
  });

  // Remove very low confidence ingredients
  return deduped.filter(ingredient => ingredient.confidence > 0.2);
}

/**
 * Parse individual ingredient with edge case handling
 */
function parseIndividualIngredient(text: string, commonIngredients: string[]): ParsedIngredient | null {
  let ingredient = text.trim();
  let confidence = 0.5;
  const modifiers: string[] = [];

  // Remove leading "and" or "or"
  ingredient = ingredient.replace(/^(and|or)\s+/i, '').trim();

  // Check if main part has trademark symbols
  const hasTrademark = /[®™©]/.test(ingredient);

  if (hasTrademark) {
    const parenthesesMatch = ingredient.match(/\(([^)]+)\)/);
    if (parenthesesMatch) {
      const parentheticalContent = parenthesesMatch[1].trim();
      const hasMultipleItems = parentheticalContent.includes(',');

      if (hasMultipleItems) {
        const brandProductName = ingredient.replace(/\([^)]*\)/g, '').replace(/[®™©]/g, '').trim();
        ingredient = brandProductName;
        modifiers.push(parentheticalContent);
      } else {
        if (!parentheticalContent.toLowerCase().includes('formerly') &&
            !parentheticalContent.toLowerCase().includes('also known') &&
            !parentheticalContent.toLowerCase().includes('aka') &&
            parentheticalContent.length > 2) {
          const brandName = ingredient.replace(/\([^)]*\)/g, '').replace(/[®™©]/g, '').trim();
          if (brandName) {
            modifiers.push(brandName);
          }
          ingredient = parentheticalContent;
        }
      }
    }
    ingredient = ingredient.replace(/[®™©]/g, '').trim();
  }

  // Extract parenthetical information (modifiers)
  if (!hasTrademark) {
    const extractedModifiers = extractNestedParentheses(ingredient);
    modifiers.push(...extractedModifiers);
    confidence += extractedModifiers.length * 0.1;

    // Remove parentheses from main ingredient name
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
  ingredient = ingredient.replace(/\s*\[[^\]]*\]/g, '').trim();

  // Handle multi-word ingredients with commas
  if (ingredient.includes(',')) {
    const commaParts = ingredient.split(',').map(p => p.trim());
    const firstPart = commaParts[0];
    const restParts = commaParts.slice(1);

    const isModifierPattern = restParts.every(part =>
      part.match(/^(including|such as|like|e\.g\.|contains?|with)/i) ||
      part.split(' ').length <= 3
    );

    if (isModifierPattern && restParts.length > 0) {
      ingredient = firstPart;
      modifiers.push(...restParts);
      confidence += 0.15;
    }
  }

  // Clean up the ingredient name
  ingredient = ingredient
    .replace(/\s+/g, ' ')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '')
    .replace(/\s*[.!?;:]+\s*$/, '')
    .trim();

  if (!isValidIngredient(ingredient, commonIngredients)) {
    return null;
  }

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

  if (ingredient.match(/^\d+\s*(mg|g|ml|oz|lb|kg|l|mcg|iu)/i)) {
    return false;
  }

  if (ingredient.match(/^\d+%$/)) {
    return false;
  }

  if (ingredient.match(/^\d+%?\s+or\s+(less|more)/i)) {
    return false;
  }

  if (ingredient.match(/^(contains|may contain)/i) && ingredient.length < 30) {
    return false;
  }

  const nonIngredientPatterns = [
    /^\d+\s*(?:mg|g|ml|mcg|iu)$/i,
    /^(mg|g|ml|l|oz|lb|kg)$/i,
    /calories?/i,
    /daily\s*value/i,
    /nutrition/i,
    /serving/i,
    /^\d+\s*(mg|g|ml|l|oz|lb|kg)/i,
    /^\d+%/,
    /^\d+\s*calories?/i,
    /\d+\s+(eagle|main|oak|pine|elm|maple|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(rd|road|st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|way|circle|cir)/i,
    /^[A-Z]{2}\s+\d{4,5}(\s+(USA|US))?$/i,
    /^(produced|distributed|manufactured|certified|chat|talk)/i,
    /(COMPANY|CORPORATION|LLC|INC|LTD|CO\.|CORP\.)/i
  ];

  for (const pattern of nonIngredientPatterns) {
    if (pattern.test(ingredient)) {
      return false;
    }
  }

  if (!ingredient.match(/[a-zA-Z]/)) {
    return false;
  }

  return true;
}

/**
 * Calculate confidence score for an ingredient
 */
function calculateIngredientConfidence(ingredient: string, modifiers: string[], commonIngredients: string[]): number {
  let confidence = 0.3;

  const ingredientLower = ingredient.toLowerCase();
  const hasCommonWord = commonIngredients.some(common =>
    ingredientLower.includes(common.toLowerCase())
  );
  if (hasCommonWord) {
    confidence += 0.3;
  }

  if (modifiers.length > 0) {
    confidence += 0.15;
  }

  if (ingredient.match(/^[A-Z][a-z]/) || ingredient.match(/^[a-z]/)) {
    confidence += 0.1;
  }

  if (ingredient.length >= 3 && ingredient.length <= 50) {
    confidence += 0.1;
  }

  if (ingredient.length < 3) {
    confidence -= 0.3;
  }
  if (ingredient.length > 100) {
    confidence -= 0.2;
  }

  const numberCount = (ingredient.match(/\d/g) || []).length;
  if (numberCount > 3) {
    confidence -= 0.2;
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Legacy function for backward compatibility
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

  const hasIngredientKeywords = /ingredients?|nedents?|contains?|made\s+with/i.test(text);
  if (hasIngredientKeywords) {
    confidence += 0.3;
  } else {
    suggestions.push('Try to capture the "Ingredients" section of the product');
  }

  const hasSeparators = /[,;]/.test(text);
  if (hasSeparators) {
    confidence += 0.2;
  } else {
    suggestions.push('Ensure the ingredient list is clearly separated by commas');
  }

  if (text.length > 20 && text.length < 2000) {
    confidence += 0.2;
  } else if (text.length <= 20) {
    suggestions.push('The text seems too short - try capturing more of the ingredient list');
  } else {
    suggestions.push('The text seems too long - try focusing on just the ingredient list');
  }

  const hasFoodTerms = /organic|natural|sugar|salt|oil|water|flour|milk|egg|peanut|peanuts|wheat|corn|rice|soy/i.test(text);
  if (hasFoodTerms) {
    confidence += 0.2;
  }

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

  if (extractedText.length < 20) {
    warnings.push('Extracted text is very short (< 20 characters) - OCR may be incomplete');
  }

  if (parsedIngredients.length < 3) {
    warnings.push(`Only ${parsedIngredients.length} ingredients found - OCR may be incomplete. Expected at least 3 ingredients.`);
  }

  return {
    isValid: warnings.length === 0,
    warnings
  };
}

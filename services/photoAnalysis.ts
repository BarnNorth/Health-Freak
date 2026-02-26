import { extractTextFromImage, parseIngredientsFromText, convertStructuredToParseIngredients, validateIngredientList, validateOCRExtraction, ParsedIngredient, ImagePreprocessingOptions } from './ocr';
import { config } from '@/lib/config';

export interface PhotoAnalysisResult {
  success: boolean;
  extractedText: string;
  ingredients: string[];
  confidence: number;
  error?: string;
  suggestions?: string[];
  parsedIngredients?: ParsedIngredient[];
}

/**
 * Main function to analyze a photo and extract ingredient information
 */
export async function analyzePhoto(
  imageUri: string,
  userId: string,
  onProgress?: (message: string) => void
): Promise<PhotoAnalysisResult> {
  try {
    if (!config.ocr.enabled) {
      return {
        success: false,
        extractedText: '',
        ingredients: [],
        confidence: 0,
        error: 'OCR service is disabled in configuration.',
      };
    }
    onProgress?.('Extracting text from image...');

    const ocrResult = await extractTextFromImage(imageUri, userId, {
      resize: {
        width: 800,
        height: 800,
      },
    });

    if (ocrResult.error) {
      return {
        success: false,
        extractedText: ocrResult.text,
        ingredients: [],
        confidence: ocrResult.confidence,
        error: ocrResult.error,
      };
    }

    // Convert structured ingredients if available from Edge Function
    let parsedIngredients: ParsedIngredient[] | undefined;
    if (ocrResult.structured_ingredients && ocrResult.structured_ingredients.length > 0) {
      parsedIngredients = convertStructuredToParseIngredients(ocrResult.structured_ingredients);
    }

    // Validate the extracted text
    const validation = validateIngredientList(ocrResult.text);

    if (!validation.isValid && !parsedIngredients?.length) {
      return {
        success: false,
        extractedText: ocrResult.text,
        ingredients: [],
        confidence: ocrResult.confidence,
        error: 'Could not identify ingredients in the image. Please try again with a clearer photo of the ingredient list.',
        suggestions: validation.suggestions,
      };
    }

    // Validate OCR extraction quality
    const ingredientsForValidation = parsedIngredients || parseIngredientsFromText(ocrResult.text);
    const ocrValidation = validateOCRExtraction(ocrResult.text, ingredientsForValidation);

    if (ocrValidation.warnings.length > 0) {
      console.warn('OCR Validation Warnings:', ocrValidation.warnings);
    }

    return {
      success: true,
      extractedText: ocrResult.text,
      ingredients: [],
      confidence: ocrResult.confidence,
      suggestions: validation.suggestions,
      parsedIngredients,
    };

  } catch (error) {
    return {
      success: false,
      extractedText: '',
      ingredients: [],
      confidence: 0,
      error: error instanceof Error ? error.message : 'An unexpected error occurred during photo analysis. Please try again.',
    };
  }
}

/**
 * Get OCR service status and configuration
 */
export function getOCRStatus(): {
  configured: boolean;
  enabled: boolean;
  message: string;
} {
  const configured = true;
  const enabled = config.ocr.enabled;

  let message = '';
  if (!enabled) {
    message = 'OCR is disabled in configuration';
  } else {
    message = 'OCR service is ready (using secure Edge Function)';
  }

  return {
    configured,
    enabled,
    message,
  };
}

/**
 * Test OCR functionality with a sample image
 */
export async function testOCR(imageUri?: string): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    if (!config.ocr.enabled) {
      return {
        success: false,
        message: 'OCR is disabled in configuration',
      };
    }

    if (!imageUri) {
      return {
        success: true,
        message: 'OCR configuration is valid (using secure Edge Function)',
      };
    }

    const result = await extractTextFromImage(imageUri);

    return {
      success: !result.error,
      message: result.error || 'OCR test successful',
      details: {
        textLength: result.text.length,
        confidence: result.confidence,
        hasError: !!result.error,
      },
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during OCR test',
    };
  }
}

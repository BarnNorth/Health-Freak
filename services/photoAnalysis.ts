import { extractTextFromImage, parseIngredientsFromText, validateIngredientList, OCRResult, ImagePreprocessingOptions } from './ocr';
import { config, isGoogleCloudConfigured } from '@/lib/config';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PhotoAnalysisResult {
  success: boolean;
  extractedText: string;
  ingredients: string[];
  confidence: number;
  error?: string;
  suggestions?: string[];
  retryAttempts?: number;
  retryStrategies?: string[];
}

interface RetryStrategy {
  name: string;
  description: string;
  preprocessingOptions: ImagePreprocessingOptions;
  imageModifications?: (imageUri: string) => Promise<string>;
}

/**
 * Define retry strategies for low confidence OCR results
 */
const RETRY_STRATEGIES: RetryStrategy[] = [
  {
    name: 'enhanced_contrast',
    description: 'Enhanced contrast and brightness',
    preprocessingOptions: {
      enhanceContrast: true,
      correctRotation: true,
      reduceNoise: true,
      adaptiveThresholding: true,
      resize: { width: 1200, height: 1200 }
    }
  },
  {
    name: 'center_crop',
    description: 'Center crop focusing on ingredient list',
    preprocessingOptions: {
      enhanceContrast: true,
      correctRotation: true,
      reduceNoise: true,
      resize: { width: 1000, height: 1000 }
    },
    imageModifications: async (imageUri: string) => {
      // Crop to center 80% of the image to focus on ingredient list
      return await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: 0.1,
              originY: 0.1,
              width: 0.8,
              height: 0.8,
            },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      ).then(result => result.uri);
    }
  },
  {
    name: 'high_resolution',
    description: 'High resolution processing',
    preprocessingOptions: {
      enhanceContrast: true,
      correctRotation: true,
      reduceNoise: true,
      resize: { width: 1600, height: 1600 }
    }
  },
  {
    name: 'minimal_preprocessing',
    description: 'Minimal preprocessing for clear images',
    preprocessingOptions: {
      enhanceContrast: false,
      correctRotation: false,
      reduceNoise: false,
      resize: { width: 800, height: 800 }
    }
  }
];

/**
 * Handle low confidence OCR results with intelligent retry logic
 */
async function handleLowConfidenceOCR(
  imageUri: string,
  initialResult: OCRResult,
  onProgress?: (message: string) => void
): Promise<{ result: OCRResult; strategies: string[] }> {
  console.log('🔄 Starting intelligent retry for low confidence OCR...');
  const strategies: string[] = [];
  
  // Try each retry strategy
  for (const strategy of RETRY_STRATEGIES) {
    try {
      console.log(`🔄 Trying strategy: ${strategy.name} - ${strategy.description}`);
      onProgress?.(`Low confidence detected, trying ${strategy.description.toLowerCase()}...`);
      
      strategies.push(strategy.name);
      
      // Apply image modifications if specified
      let processedImageUri = imageUri;
      if (strategy.imageModifications) {
        console.log(`🖼️ Applying image modifications for ${strategy.name}`);
        processedImageUri = await strategy.imageModifications(imageUri);
      }
      
      // Extract text with strategy-specific preprocessing
      const retryResult = await extractTextFromImage(processedImageUri, strategy.preprocessingOptions);
      
      console.log(`📊 Strategy ${strategy.name} result:`, {
        confidence: retryResult.confidence,
        textLength: retryResult.text.length,
        error: retryResult.error
      });
      
      // Check if this result is better than the initial result
      if (retryResult.confidence > initialResult.confidence && !retryResult.error) {
        console.log(`✅ Strategy ${strategy.name} improved confidence from ${initialResult.confidence} to ${retryResult.confidence}`);
        return { result: retryResult, strategies };
      }
      
      // If confidence is high enough, use this result even if not better than initial
      if (retryResult.confidence >= 0.7 && !retryResult.error) {
        console.log(`✅ Strategy ${strategy.name} achieved acceptable confidence: ${retryResult.confidence}`);
        return { result: retryResult, strategies };
      }
      
    } catch (error) {
      console.warn(`⚠️ Strategy ${strategy.name} failed:`, error);
      continue;
    }
  }
  
  console.log('❌ All retry strategies failed to improve confidence');
  return { result: initialResult, strategies };
}

/**
 * Generate user guidance for retaking photos when OCR fails
 */
function generateRetakeGuidance(confidence: number, strategies: string[]): string[] {
  const suggestions: string[] = [];
  
  if (confidence < 0.3) {
    suggestions.push('The image quality is very poor. Please try:');
    suggestions.push('• Ensure good lighting - avoid shadows and glare');
    suggestions.push('• Hold the camera steady and close to the ingredient list');
    suggestions.push('• Make sure the text is clearly visible and in focus');
    suggestions.push('• Try different angles if the packaging is curved');
  } else if (confidence < 0.5) {
    suggestions.push('The image needs improvement. Please try:');
    suggestions.push('• Better lighting - use natural light or bright indoor lighting');
    suggestions.push('• Get closer to the ingredient list');
    suggestions.push('• Ensure the text is sharp and not blurry');
    suggestions.push('• Avoid reflections on shiny packaging');
  } else {
    suggestions.push('The image quality could be better. Please try:');
    suggestions.push('• Ensure the entire ingredient list is visible');
    suggestions.push('• Use better lighting if possible');
    suggestions.push('• Hold the camera steady');
  }
  
  if (strategies.includes('center_crop')) {
    suggestions.push('• Focus the camera on the center of the ingredient list');
  }
  
  if (strategies.includes('enhanced_contrast')) {
    suggestions.push('• Try better lighting to improve contrast');
  }
  
  return suggestions;
}

/**
 * Main function to analyze a photo and extract ingredient information
 */
export async function analyzePhoto(
  imageUri: string,
  onProgress?: (message: string) => void
): Promise<PhotoAnalysisResult> {
  try {
    console.log('🔧 OCR Configuration Check:', {
      enabled: config.ocr.enabled,
      configured: isGoogleCloudConfigured()
    });

    // Check if OCR is enabled and configured
    if (!config.ocr.enabled || !isGoogleCloudConfigured()) {
      console.log('⚠️ OCR not configured');
      return {
        success: false,
        extractedText: '',
        ingredients: [],
        confidence: 0,
        error: 'OCR service is not configured. Please set up Google Cloud Vision API credentials.',
      };
    }

    console.log('🖼️ Starting OCR with image:', imageUri);
    onProgress?.('Preprocessing image...');
    
    // Extract text using Google Cloud Vision API with standard settings
    const initialOcrResult = await extractTextFromImage(imageUri, {
      enhanceContrast: config.ocr.preprocessingEnabled,
      correctRotation: config.ocr.preprocessingEnabled,
      reduceNoise: config.ocr.preprocessingEnabled,
      resize: {
        width: config.ocr.maxImageSize,
        height: config.ocr.maxImageSize,
      },
    });

    console.log('📄 Initial OCR Result:', {
      text: initialOcrResult.text,
      confidence: initialOcrResult.confidence,
      error: initialOcrResult.error
    });

    if (initialOcrResult.error) {
      console.log('❌ Initial OCR failed with error:', initialOcrResult.error);
      return {
        success: false,
        extractedText: initialOcrResult.text,
        ingredients: [],
        confidence: initialOcrResult.confidence,
        error: initialOcrResult.error,
        retryAttempts: 0,
        retryStrategies: [],
      };
    }

    // Check if we need to retry with different strategies
    let ocrResult = initialOcrResult;
    let retryStrategies: string[] = [];
    
    if (ocrResult.confidence < 0.7) {
      console.log(`🔄 Low confidence detected (${ocrResult.confidence}), starting retry logic...`);
      const retryResult = await handleLowConfidenceOCR(imageUri, initialOcrResult, onProgress);
      ocrResult = retryResult.result;
      retryStrategies = retryResult.strategies;
      
      console.log('📊 Final OCR Result after retries:', {
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        strategies: retryStrategies
      });
    }

    onProgress?.('Parsing ingredients...');

    // Validate the extracted text
    const validation = validateIngredientList(ocrResult.text);
    console.log('✅ Text Validation:', {
      isValid: validation.isValid,
      confidence: validation.confidence,
      suggestions: validation.suggestions
    });
    
    if (!validation.isValid) {
      console.log('❌ Text validation failed');
      const retakeGuidance = generateRetakeGuidance(ocrResult.confidence, retryStrategies);
      return {
        success: false,
        extractedText: ocrResult.text,
        ingredients: [],
        confidence: ocrResult.confidence,
        error: 'Could not identify ingredients in the image. Please try again with a clearer photo of the ingredient list.',
        suggestions: [...validation.suggestions, ...retakeGuidance],
        retryAttempts: retryStrategies.length,
        retryStrategies,
      };
    }

    // Parse ingredients from the extracted text
    const parsedIngredients = parseIngredientsFromText(ocrResult.text);
    console.log('🧪 Parsed Ingredients:', parsedIngredients);

    if (parsedIngredients.length === 0) {
      console.log('❌ No ingredients found after parsing');
      const retakeGuidance = generateRetakeGuidance(ocrResult.confidence, retryStrategies);
      return {
        success: false,
        extractedText: ocrResult.text,
        ingredients: [],
        confidence: ocrResult.confidence,
        error: 'No ingredients were found in the image. Please make sure you\'re photographing the ingredient list clearly.',
        suggestions: [...validation.suggestions, ...retakeGuidance],
        retryAttempts: retryStrategies.length,
        retryStrategies,
      };
    }

    // Extract ingredient names for backward compatibility
    const ingredients = parsedIngredients.map(ingredient => ingredient.name);
    console.log('🧪 Ingredient names:', ingredients);

    onProgress?.('Analysis complete!');

    const result = {
      success: true,
      extractedText: ocrResult.text,
      ingredients,
      confidence: ocrResult.confidence,
      suggestions: validation.suggestions,
      retryAttempts: retryStrategies.length,
      retryStrategies,
    };

    console.log('✅ Final Analysis Result:', result);
    return result;

  } catch (error) {
    console.error('💥 Photo analysis failed:', error);
    
    return {
      success: false,
      extractedText: '',
      ingredients: [],
      confidence: 0,
      error: error instanceof Error ? error.message : 'An unexpected error occurred during photo analysis. Please try again.',
      retryAttempts: 0,
      retryStrategies: [],
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
  const configured = isGoogleCloudConfigured();
  const enabled = config.ocr.enabled;

  let message = '';
  if (!enabled) {
    message = 'OCR is disabled in configuration';
  } else if (!configured) {
    message = 'Google Cloud Vision API is not configured';
  } else {
    message = 'OCR service is ready';
  }

  return {
    configured,
    enabled,
    message,
  };
}

/**
 * Get retry strategy information for debugging
 */
export function getRetryStrategiesInfo(): {
  strategies: Array<{
    name: string;
    description: string;
    features: string[];
  }>;
  confidenceThreshold: number;
} {
  return {
    strategies: RETRY_STRATEGIES.map(strategy => ({
      name: strategy.name,
      description: strategy.description,
      features: [
        strategy.preprocessingOptions.enhanceContrast ? 'Enhanced contrast' : 'Standard contrast',
        strategy.preprocessingOptions.correctRotation ? 'Rotation correction' : 'No rotation correction',
        strategy.preprocessingOptions.reduceNoise ? 'Noise reduction' : 'No noise reduction',
        strategy.preprocessingOptions.adaptiveThresholding ? 'Adaptive thresholding' : 'Standard thresholding',
        strategy.imageModifications ? 'Image modifications' : 'No image modifications',
        `Resize: ${strategy.preprocessingOptions.resize?.width}x${strategy.preprocessingOptions.resize?.height}`
      ]
    })),
    confidenceThreshold: 0.7
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

    if (!isGoogleCloudConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Vision API is not configured. Please set up credentials.',
      };
    }

    // If no image provided, just test configuration
    if (!imageUri) {
      return {
        success: true,
        message: 'OCR configuration is valid',
      };
    }

    // Test with actual image
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

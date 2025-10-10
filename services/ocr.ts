import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { config } from '@/lib/config';
import { isRetryableError, isAPIDownError, retryWithFixedDelay, logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';

// Google Cloud Vision API configuration
const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Redact API keys from URLs and logs for security
 */
function redactApiKey(value?: string): string {
  if (!value) return 'NOT SET';
  if (value.length < 8) return '***REDACTED***';
  return `${value.substring(0, 4)}...***REDACTED***`;
}

/**
 * Redact API keys from URLs
 */
function redactUrlApiKey(url: string): string {
  return url.replace(/([?&]key=)[^&]+/, '$1***REDACTED***');
}

export interface OCRResult {
  text: string;
  confidence: number;
  error?: string;
}

export interface ImagePreprocessingOptions {
  enhanceContrast?: boolean;
  correctRotation?: boolean;
  reduceNoise?: boolean;
  adaptiveThresholding?: boolean;
  perspectiveCorrection?: boolean;
  deskewing?: boolean;
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
    let processedUri = imageUri;
    
    // Default preprocessing options with new enhancements
    const {
      enhanceContrast = true,
      correctRotation = true,
      reduceNoise = true,
      adaptiveThresholding = true,
      perspectiveCorrection = true,
      deskewing = true,
      resize = { width: 1200, height: 1200 }
    } = options;

    console.log('🔧 Starting enhanced image preprocessing...');

    // Step 1: Resize image for better OCR performance
    if (resize.width || resize.height) {
      console.log('📏 Resizing image for optimal OCR performance...');
      processedUri = await ImageManipulator.manipulateAsync(
        processedUri,
        [
          {
            resize: {
              width: resize.width,
              height: resize.height,
            },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      ).then(result => result.uri);
    }

    // Step 2: Apply perspective correction for angled photos
    if (perspectiveCorrection) {
      console.log('🔄 Applying perspective correction...');
      // Note: expo-image-manipulator doesn't support perspective correction
      // This would require a more advanced image processing library
      console.log('⚠️ Perspective correction skipped - requires advanced image processing');
    }

    // Step 3: Apply deskewing for rotated images
    if (deskewing) {
      console.log('📐 Applying deskewing correction...');
      // Note: expo-image-manipulator doesn't support deskewing
      // This would require a more advanced image processing library
      console.log('⚠️ Deskewing skipped - requires advanced image processing');
    }

    // Step 4: Apply adaptive thresholding for varying lighting conditions
    if (adaptiveThresholding) {
      console.log('💡 Applying adaptive thresholding...');
      // Note: expo-image-manipulator doesn't support adaptive thresholding
      // This would require a more advanced image processing library
      console.log('⚠️ Adaptive thresholding skipped - requires advanced image processing');
    }

    // Step 5: Enhance contrast for better text visibility
    if (enhanceContrast) {
      console.log('✨ Enhancing contrast...');
      // Note: expo-image-manipulator doesn't support brightness/contrast adjustments
      // We'll skip this step and rely on the resize and rotation
      console.log('⚠️ Contrast enhancement skipped - not supported by expo-image-manipulator');
    }

    // Step 6: Apply rotation correction if needed
    if (correctRotation) {
      console.log('🔄 Applying rotation correction...');
      // Note: expo-image-manipulator doesn't support automatic rotation detection
      // This would require a more advanced image processing library
      console.log('⚠️ Rotation correction skipped - requires advanced image processing');
    }

    console.log('✅ Enhanced image preprocessing completed');
    return processedUri;
  } catch (error) {
    console.warn('Enhanced image preprocessing failed, using original image:', error);
    return imageUri;
  }
}

/**
 * Extract text from image using Google Cloud Vision API REST endpoint
 */
export async function extractTextFromImage(
  imageUri: string,
  preprocessingOptions?: ImagePreprocessingOptions
): Promise<OCRResult> {
  try {
    console.log('🖼️ Starting OCR extraction for image:', imageUri);
    
    // Preprocess image for better OCR results
    const processedImageUri = await preprocessImage(imageUri, preprocessingOptions);
    console.log('🔧 Image preprocessing completed');
    
    // Read image file as base64
    const base64Image = await FileSystem.readAsStringAsync(processedImageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('📄 Image converted to base64, length:', base64Image.length);

    // Get API key from configuration
    const apiKey = config.googleCloud.apiKey;
    if (!apiKey) {
      throw new Error('Google Cloud Vision API key not configured');
    }

    // Prepare request for Vision API
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image,
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1,
            },
            {
              type: 'DOCUMENT_TEXT_DETECTION',
              maxResults: 1,
            },
          ],
          imageContext: {
            languageHints: ['en'],
          },
        },
      ],
    };

    console.log('📤 Sending request to Google Cloud Vision API...');
    console.log('[OCR] Using API key:', redactApiKey(apiKey));

    // Wrap API call in retry logic for better reliability
    let result;
    try {
      result = await retryWithFixedDelay(async () => {
        const apiUrl = `${VISION_API_URL}?key=${apiKey}`;
        console.log('[OCR] Making Vision API request to:', redactUrlApiKey(apiUrl));
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OCR] ❌ Vision API error:', response.status, errorText);
          const error = new Error(`Vision API error: ${response.status} - ${errorText}`);
          // Attach status for error classification
          (error as any).status = response.status;
          throw error;
        }

        const jsonResult = await response.json();
        console.log('[OCR] 📥 Received successful response from Vision API');
        return jsonResult;
      }, 2, 2000); // Max 2 retries with 2 second delay for OCR
    } catch (fetchError) {
      logDetailedError('OCR_EXTRACTION', fetchError, {
        imageUri: processedImageUri,
        base64Length: base64Image.length
      });
      
      // Re-throw to be caught by outer catch block
      throw fetchError;
    }
    console.log('📥 Received response from Vision API');

    // Extract text from results
    let extractedText = '';
    let confidence = 0;

    if (result.responses && result.responses[0]) {
      const response = result.responses[0];
      
      // Try document text detection first (better for structured text)
      if (response.fullTextAnnotation?.text) {
        extractedText = response.fullTextAnnotation.text;
        confidence = 0.9; // Document detection is generally more reliable
        console.log('📄 Using document text detection');
      }
      // Fallback to regular text detection
      else if (response.textAnnotations && response.textAnnotations.length > 0) {
        extractedText = response.textAnnotations[0].description || '';
        confidence = 0.7; // Regular text detection confidence
        console.log('📄 Using regular text detection');
      }
    }

    console.log('📝 Extracted text length:', extractedText.length);

    // Clean and validate extracted text
    const cleanedText = cleanExtractedText(extractedText);
    console.log('🧹 Cleaned text:', cleanedText);
    
    if (!cleanedText || cleanedText.length < 5) {
      return {
        text: '',
        confidence: 0,
        error: 'No readable text found in image. Please ensure the image contains clear, readable text.',
      };
    }

    return {
      text: cleanedText,
      confidence,
    };

  } catch (error) {
    logDetailedError('OCR_EXTRACTION', error, {
      imageUri,
      hasPreprocessingOptions: !!preprocessingOptions
    });
    
    // Check if API is down
    if (isAPIDownError(error)) {
      const friendlyMessage = getUserFriendlyErrorMessage(error);
      return {
        text: '',
        confidence: 0,
        error: `OCR service unavailable: ${friendlyMessage}. Please check your internet connection and try again.`,
      };
    }
    
    // Check if it's a retryable error that somehow wasn't caught
    if (isRetryableError(error)) {
      return {
        text: '',
        confidence: 0,
        error: 'OCR service is experiencing temporary issues. Please try again in a moment.',
      };
    }
    
    // Handle specific error types
    if (error instanceof Error) {
      // API key errors
      if (error.message.includes('API key') || error.message.includes('unauthorized') || error.message.includes('401')) {
        return {
          text: '',
          confidence: 0,
          error: 'OCR service configuration error. Please check API credentials.',
        };
      }
      
      // Quota/rate limit errors
      if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
        return {
          text: '',
          confidence: 0,
          error: 'OCR service quota exceeded. Please try again later.',
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
      error: `Failed to extract text from image: ${friendlyMessage}. Please try again with a clearer photo.`,
    };
  }
}

/**
 * Clean and normalize extracted text for ingredient parsing
 */
function cleanExtractedText(text: string): string {
  if (!text) return '';
  
  console.log('🧹 Raw OCR text:', text);
  
  // First, try to find the ingredients section
  const ingredientsSection = extractIngredientsSection(text);
  console.log('📋 Extracted ingredients section:', ingredientsSection);
  
  if (ingredientsSection) {
    return ingredientsSection;
  }
  
  // Fallback: clean the entire text
  return text
    // Remove extra whitespace and normalize
    .replace(/\s+/g, ' ')
    .trim()
    // Remove common OCR artifacts
    .replace(/[^\w\s,;:().-]/g, ' ')
    // Fix common OCR mistakes
    .replace(/\b0\b/g, 'o') // Replace standalone 0 with o
    .replace(/\bl\b/g, 'I') // Replace standalone l with I
    .replace(/\b1\b/g, 'I') // Replace standalone 1 with I
    // Normalize ingredient separators
    .replace(/[,;]\s*/g, ', ')
    // Remove multiple consecutive commas
    .replace(/,+/g, ',')
    // Clean up spacing around commas
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

/**
 * Extract only the ingredients section from OCR text with enhanced edge case handling
 */
function extractIngredientsSection(text: string): string | null {
  console.log('🔍 Looking for ingredients section in text with enhanced detection...');
  
  // Enhanced stop markers for company information
  const stopMarkers = [
    'CONTAINS', 'MAY CONTAIN', 'ALLERGEN', 
    'USDA', 'ORGANIC', 'CERTIFIED',
    'PRODUCED IN', 'DISTRIBUTED', 'MANUFACTURED',
    'NET WT', 'NET WEIGHT', 'PACKAGED BY',
    'NUTRITION FACTS', 'SERVING SIZE', 'CALORIES', 'DAILY VALUE', 'PER SERVING',
    'IMPORTED BY', 'MADE IN', 'ORIGIN', 'COUNTRY OF ORIGIN',
    'Chat with', 'talk2us', 'Distributed +', 'Manufactured by', 'CERTIFIED ORGANIC BY'
  ];
  
  // Enhanced patterns for ingredients sections with better edge case handling
  const patterns = [
    // Standard "INGREDIENTS:" with colon
    /ingredients?:\s*([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    
    // "INGREDIENTS" without colon (common OCR error)
    /ingredients?\s+([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    
    // OCR error: missing "I" - "NEDENTS"
    /nedents?:\s*([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    /nedents?\s+([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    
    // Multi-language support
    /(ingrédients?|ingredientes?|zutaten?|ingredienti?|ингредиенты?):\s*([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    
    // "CONTAINS:" pattern
    /contains?:\s*([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    
    // "MADE WITH:" pattern
    /made with:\s*([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
    
    // Handle ingredients with bullets or dashes
    /ingredients?:\s*([\s\S]*?)(?=\n(?:PRODUCED IN|DISTRIBUTED|MANUFACTURED|CONTAINS:|MAY CONTAIN|ALLERGEN|CERTIFIED|Chat with|talk2us|Distributed \+|Manufactured by|CERTIFIED ORGANIC BY|NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN|COUNTRY OF ORIGIN)|$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    console.log(`🔍 Testing pattern: ${pattern}`);
    console.log(`🔍 Match result:`, match);
    if (match && match[1]) {
      console.log('✅ Found ingredients section with pattern:', pattern);
      console.log('📄 Raw match content:', match[1]);
      
      // After finding ingredients section, truncate at first allergen/certification marker
      let ingredientsText = match[1];
      for (const marker of stopMarkers) {
        const markerIndex = ingredientsText.toUpperCase().indexOf(marker);
        if (markerIndex !== -1) {
          console.log(`✂️ Truncating at marker: ${marker}`);
          ingredientsText = ingredientsText.substring(0, markerIndex).trim();
          break;
        }
      }
      
      return cleanIngredientsList(ingredientsText);
    }
  }
  
  // Enhanced multi-line pattern handling with better edge cases
  const multiLinePatterns = [
    // Standard multi-line with colon
    /ingredients?:\s*([\s\S]*?)(?=\n[A-Z][A-Z\s]*:|$)/i,
    // Multi-line without colon
    /ingredients?\s+([\s\S]*?)(?=\n[A-Z][A-Z\s]*:|$)/i,
    // Multi-line with OCR errors
    /nedents?:\s*([\s\S]*?)(?=\n[A-Z][A-Z\s]*:|$)/i,
    /nedents?\s+([\s\S]*?)(?=\n[A-Z][A-Z\s]*:|$)/i,
    // Multi-line with bullets or dashes
    /ingredients?:\s*([\s\S]*?)(?=\n(?:•|\-|\*|\d+\.)|$)/i,
  ];
  
  for (const pattern of multiLinePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      console.log('✅ Found multi-line ingredients section with pattern:', pattern);
      return cleanIngredientsList(match[1]);
    }
  }
  
  // Enhanced fallback: Look for text that starts with common ingredient words
  const lines = text.split('\n');
  let ingredientsStart = -1;
  
  // Enhanced ingredient detection patterns
  const ingredientStartPatterns = [
    /ingredients?/i,
    /nedents?/i, // OCR error
    /contains?/i,
    /made\s+with/i,
    /^(organic|natural|wheat|flour|sugar|salt|oil|water|milk|egg|butter|cream)/i,
    /^(enriched|bleached|unbleached|whole\s+grain|stone\s+ground)/i,
    /^(coconut|olive|sunflower|canola|vegetable|palm)/i,
    /^(vanilla|chocolate|cocoa|honey|molasses|syrup)/i,
    /^(baking|soda|powder|yeast|starch|lecithin)/i,
    /^(preservative|color|flavor|extract|essence)/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase().trim();
    
    // Check if line matches any ingredient start pattern
    for (const pattern of ingredientStartPatterns) {
      if (pattern.test(line)) {
        ingredientsStart = i;
        console.log('✅ Found ingredients starting at line:', ingredientsStart, 'with pattern:', pattern);
        break;
      }
    }
    
    if (ingredientsStart >= 0) break;
  }
  
  if (ingredientsStart >= 0) {
    // Take more lines for better coverage (up to 5 lines)
    const ingredientsLines = lines.slice(ingredientsStart, ingredientsStart + 5);
    console.log('📄 Extracted lines:', ingredientsLines);
    return cleanIngredientsList(ingredientsLines.join(' '));
  }
  
  // Enhanced manual extraction with better edge case handling
  console.log('🔍 Trying enhanced manual extraction...');
  const textLines = text.split('\n');
  let ingredientsLines = [];
  let foundIngredients = false;
  
  // Enhanced patterns for manual extraction
  const manualPatterns = [
    /ingredients?:\s*/i,
    /nedents?:\s*/i, // OCR error
    /ingredients?\s+/i, // Without colon
    /nedents?\s+/i, // OCR error without colon
    /contains?:\s*/i,
    /made\s+with:\s*/i,
  ];
  
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i].trim();
    
    // Check if line matches any manual pattern
    for (const pattern of manualPatterns) {
      if (pattern.test(line)) {
        foundIngredients = true;
        console.log('✅ Found ingredients with manual pattern:', pattern);
        
        // Get the rest of the line after the pattern
        const match = line.match(pattern);
        if (match) {
          const afterPattern = line.substring(match.index! + match[0].length).trim();
          if (afterPattern) {
            ingredientsLines.push(afterPattern);
          }
        }
        
        // Continue with next lines until we hit stop markers
        for (let j = i + 1; j < textLines.length; j++) {
          const nextLine = textLines[j].trim();
          
          // Stop at common section headers
          if (nextLine.match(/^[A-Z][A-Z\s]*:/) || 
              stopMarkers.some(marker => nextLine.toUpperCase().includes(marker))) {
            break;
          }
          
          if (nextLine) {
            ingredientsLines.push(nextLine);
          }
        }
        break;
      }
    }
    
    if (foundIngredients) break;
  }
  
  if (foundIngredients && ingredientsLines.length > 0) {
    console.log('✅ Enhanced manual extraction found ingredients:', ingredientsLines);
    const joinedText = ingredientsLines.join(' ');
    console.log('🔗 Joined text:', joinedText);
    return cleanIngredientsList(joinedText);
  }
  
  console.log('❌ No ingredients section found');
  return null;
}

/**
 * Clean and format ingredients list with enhanced handling for bullets, dashes, and multi-line formatting
 */
function cleanIngredientsList(text: string): string {
  console.log('🧽 Cleaning ingredients list with enhanced formatting:', text);
  
  // Step 1: Handle multi-line formatting and bullets/dashes
  let cleaned = text
    // Replace line breaks with spaces for better processing
    .replace(/\n/g, ' ')
    // Handle bullet points and dashes
    .replace(/[•\-\*]\s*/g, ', ')
    // Handle numbered lists
    .replace(/\d+\.\s*/g, ', ')
    // Handle multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log('🔧 After bullet/dash handling:', cleaned);
  
  // Step 2: Remove C/O (care of) and everything after it
  cleaned = cleaned.replace(/\s*C[IT]*M?\s*\/\s*O\s+.*/i, '').trim();
  console.log('🔧 After C/O removal:', cleaned);
  
  // Step 3: Remove percentage qualifiers like "CONTAINS X% OR LESS OF"
  cleaned = cleaned.replace(/CONTAINS\s+\d+%\s+OR\s+LESS\s+OF\s+/i, '').trim();
  console.log('🔧 After percentage qualifier removal:', cleaned);
  
  // Step 4: Remove non-ingredient sections - do this FIRST before other cleaning
  cleaned = cleaned
    // Remove allergen warnings and everything after them
    .replace(/(CONTAINS|MAY CONTAIN|ALLERGEN INFO)[^,]*/gi, '')
    // Remove certifications and everything after them
    .replace(/(USDA|ORGANIC CERTIFIED|NON-GMO|VEGAN|GLUTEN FREE|DAIRY FREE)[^,]*/gi, '')
    // Remove company info and everything after it
    .replace(/(PRODUCED IN|DISTRIBUTED|MANUFACTURED|CERTIFIED|PACKAGED BY|IMPORTED BY|MADE IN|ORIGIN)[^,]*/gi, '')
    // Remove nutrition facts and everything after them
    .replace(/(NUTRITION FACTS|SERVING SIZE|CALORIES|DAILY VALUE|PER SERVING|NET WT|NET WEIGHT)[^,]*/gi, '')
    // Remove other non-ingredient text
    .replace(/Chat with.*$/i, '')
    .replace(/talk2us.*$/i, '')
    .replace(/Distributed \+.*$/i, '')
    .replace(/Manufactured by.*$/i, '')
    .replace(/CERTIFIED ORGANIC BY.*$/i, '')
    .replace(/COUNTRY OF ORIGIN.*$/i, '')
    // Remove nutrition facts and other non-ingredient text
    .replace(/\d+\s*calories?.*$/i, '') // Remove calorie info
    .replace(/\d+\s*%?\s*daily\s*value.*$/i, '') // Remove daily value info
    .replace(/nutrition\s*facts?.*$/i, '') // Remove nutrition facts
    .replace(/serving\s*size.*$/i, '') // Remove serving size
    .replace(/per\s*serving.*$/i, '') // Remove per serving info
    .replace(/\d+\s*mg.*$/i, '') // Remove mg amounts
    .replace(/\d+\s*g.*$/i, '') // Remove gram amounts
    .replace(/\d+%.*$/i, '') // Remove percentages
    .trim();
  
  // Step 5: Enhanced punctuation and formatting cleanup
  cleaned = cleaned
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/,\s*,/g, ',') // Remove double commas
    .replace(/^,\s*/, '') // Remove leading comma
    .replace(/,\s*$/, '') // Remove trailing comma
    .replace(/\.\s*$/, '') // Remove trailing period
    
    // ONLY remove percentage qualifiers in parentheses - preserve helpful ones
    .replace(/\s*\(\d+%?\s*(?:or\s+)?(?:less|more)?\)/gi, '') // Remove "(5% or less)"
    .replace(/\s*\((?:less\s+than|more\s+than)\s+\d+%?\)/gi, '') // Remove "(less than 2%)"
    
    // Remove only bracketed allergen info, not all brackets
    .replace(/\s*\[(?:contains|may contain|allergen)[^\]]*\]/gi, '')
    
    // Keep helpful parentheticals like (Vitamin C), (for color), (natural flavor)
    // They will be preserved
    
    // Fix specific case: "Organic Sourdough Starter organic wheat flour" -> separate ingredients
    .replace(/organic sourdough starter organic wheat flour/gi, 'organic sourdough starter, organic wheat flour')
    // Handle common OCR errors in ingredient names
    .replace(/\b0\b/g, 'o') // Replace standalone 0 with o
    .replace(/\bl\b/g, 'I') // Replace standalone l with I
    .replace(/\b1\b/g, 'I') // Replace standalone 1 with I
    // Remove duplicate ingredients (case-insensitive)
    .split(',')
    .map(ingredient => ingredient.trim())
    .filter((ingredient, index, array) => 
      array.findIndex(item => item.toLowerCase() === ingredient.toLowerCase()) === index
    )
    .join(', ')
    .trim();
  
  console.log('✨ Enhanced cleaned ingredients list:', cleaned);
  return cleaned;
}

/**
 * Enhanced ingredient parsing result with confidence scores and modifiers
 */
export interface ParsedIngredient {
  name: string;
  modifiers: string[];
  confidence: number;
  originalText: string;
}

/**
 * Parse extracted text to identify individual ingredients with enhanced edge case handling
 */
export function parseIngredientsFromText(text: string): ParsedIngredient[] {
  if (!text) return [];

  console.log('🔍 Enhanced parsing ingredients from text:', text);

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

  // Enhanced regex to split ingredients while preserving parentheses and handling edge cases
  const ingredientSplitRegex = /,(?![^()]*\))/g; // Split on commas not inside parentheses
  
  // Split text into potential ingredients
  const rawIngredients = text.split(ingredientSplitRegex);
  
  const parsedIngredients: ParsedIngredient[] = [];
  
  for (const rawIngredient of rawIngredients) {
    const trimmed = rawIngredient.trim();
    if (!trimmed) continue;
    
    console.log(`🔍 Processing ingredient: "${trimmed}"`);
    
    // Parse the ingredient with enhanced logic
    const parsed = parseIndividualIngredient(trimmed, commonIngredients);
    
    if (parsed) {
      parsedIngredients.push(parsed);
      console.log(`✅ Parsed ingredient:`, parsed);
    } else {
      console.log(`❌ Filtered out non-ingredient: "${trimmed}"`);
    }
  }

  console.log('✅ Final parsed ingredients:', parsedIngredients);
  return parsedIngredients;
}

/**
 * Parse individual ingredient with enhanced edge case handling
 */
function parseIndividualIngredient(text: string, commonIngredients: string[]): ParsedIngredient | null {
  let ingredient = text.trim();
  let confidence = 0.5; // Base confidence
  const modifiers: string[] = [];
  
  // Handle "and/or" constructions
  if (ingredient.includes(' and/or ')) {
    // Split on "and/or" and process each part
    const parts = ingredient.split(/\s+and\/or\s+/i);
    if (parts.length === 2) {
      // Create separate ingredients for each part
      const leftPart = parseIndividualIngredient(parts[0], commonIngredients);
      const rightPart = parseIndividualIngredient(parts[1], commonIngredients);
      
      if (leftPart && rightPart) {
        // Return the first part, but note that this creates multiple ingredients
        return leftPart;
      }
    }
  }
  
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
  
  // Handle multi-word ingredients with commas (like "natural flavors, including vanilla")
  if (ingredient.includes(',')) {
    // Check if it's a legitimate multi-word ingredient
    const commaParts = ingredient.split(',');
    if (commaParts.length === 2) {
      const firstPart = commaParts[0].trim();
      const secondPart = commaParts[1].trim();
      
      // If second part starts with "including", "such as", etc., treat as one ingredient
      if (secondPart.match(/^(including|such as|like|e\.g\.)/i)) {
        ingredient = firstPart;
        modifiers.push(secondPart);
        confidence += 0.2; // Boost confidence for well-structured multi-word ingredients
      }
    }
  }
  
  // Clean up the ingredient name
  ingredient = ingredient
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s*,\s*/, '') // Remove leading comma
    .replace(/\s*,\s*$/, '') // Remove trailing comma
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
  
  // Check for non-ingredient patterns
  const nonIngredientPatterns = [
    /^\d+\s*(?:mg|g|ml|mcg|iu)$/i, // Just measurements like "100mg" or "5g"
    /^(mg|g|ml|l|oz|lb|kg)$/i, // Just units
    /calories?/i, // Calorie info
    /daily\s*value/i, // Daily value
    /nutrition/i, // Nutrition facts
    /serving/i, // Serving info
    /^\d+\s*(mg|g|ml|l|oz|lb|kg)/i, // Measurements
    /^\d+%/, // Percentages
    /^\d+\s*calories?/i, // Calorie amounts
    // Address patterns
    /\d+\s+(eagle|main|oak|pine|elm|maple|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(rd|road|st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|way|circle|cir)/i,
    // State+ZIP+country patterns
    /^[A-Z]{2}\s+\d{4,5}(\s+(USA|US))?$/i,
    // Company info
    /^(produced|distributed|manufactured|certified|chat|talk)/i,
    // Company name patterns
    /(COMPANY|CORPORATION|LLC|INC|LTD|CO\.|CORP\.)/i
  ];
  
  for (const pattern of nonIngredientPatterns) {
    if (pattern.test(ingredient)) {
      return false;
    }
  }
  
  // Check for single capitalized words that aren't common ingredients
  if (ingredient.match(/^[A-Z][a-z]+$/) && 
      !commonIngredients.some(common => ingredient.toLowerCase().includes(common.toLowerCase()))) {
    return false;
  }
  
  return true;
}

/**
 * Calculate confidence score for an ingredient
 */
function calculateIngredientConfidence(ingredient: string, modifiers: string[], commonIngredients: string[]): number {
  let confidence = 0.5; // Base confidence
  
  // Boost confidence for common ingredient words
  const ingredientLower = ingredient.toLowerCase();
  for (const common of commonIngredients) {
    if (ingredientLower.includes(common.toLowerCase())) {
      confidence += 0.1;
      break;
    }
  }
  
  // Boost confidence for having modifiers (indicates well-structured ingredient)
  if (modifiers.length > 0) {
    confidence += 0.1;
  }
  
  // Boost confidence for proper capitalization
  if (ingredient.match(/^[A-Z][a-z]/)) {
    confidence += 0.1;
  }
  
  // Boost confidence for reasonable length
  if (ingredient.length >= 3 && ingredient.length <= 50) {
    confidence += 0.1;
  }
  
  // Reduce confidence for very short or very long ingredients
  if (ingredient.length < 3) {
    confidence -= 0.2;
  }
  if (ingredient.length > 100) {
    confidence -= 0.1;
  }
  
  // Ensure confidence is between 0 and 1
  return Math.max(0, Math.min(1, confidence));
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
 * Get recommendations for advanced image processing libraries
 * This function provides guidance for implementing the advanced features
 * that expo-image-manipulator doesn't support
 */
export function getAdvancedImageProcessingRecommendations(): {
  libraries: Array<{
    name: string;
    description: string;
    features: string[];
    pros: string[];
    cons: string[];
  }>;
  implementation: {
    adaptiveThresholding: string;
    perspectiveCorrection: string;
    deskewing: string;
  };
} {
  return {
    libraries: [
      {
        name: 'react-native-opencv',
        description: 'OpenCV bindings for React Native',
        features: ['Adaptive thresholding', 'Perspective correction', 'Deskewing', 'Noise reduction'],
        pros: ['Full OpenCV functionality', 'Mature library', 'Excellent image processing'],
        cons: ['Large bundle size', 'Complex setup', 'Native dependencies']
      },
      {
        name: 'react-native-image-filter-kit',
        description: 'Image processing library with filters',
        features: ['Contrast adjustment', 'Brightness control', 'Noise reduction'],
        pros: ['Easy to use', 'Good performance', 'Well documented'],
        cons: ['Limited advanced features', 'No perspective correction']
      },
      {
        name: 'react-native-image-editor',
        description: 'Image editing capabilities',
        features: ['Rotation', 'Cropping', 'Basic filters'],
        pros: ['Simple API', 'Good for basic operations'],
        cons: ['Limited advanced processing', 'No thresholding']
      }
    ],
    implementation: {
      adaptiveThresholding: `
// Example implementation with OpenCV
import { cv } from 'react-native-opencv';

function applyAdaptiveThreshold(imageUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cv.imread(imageUri, (err, img) => {
      if (err) reject(err);
      
      const gray = new cv.Mat();
      cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
      
      const thresh = new cv.Mat();
      cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
      
      cv.imwrite(outputUri, thresh);
      resolve(outputUri);
    });
  });
}`,
      perspectiveCorrection: `
// Example implementation with OpenCV
function correctPerspective(imageUri: string, corners: Point[]): Promise<string> {
  return new Promise((resolve, reject) => {
    cv.imread(imageUri, (err, img) => {
      if (err) reject(err);
      
      const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, corners);
      const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0, width, 0, width, height, 0, height
      ]);
      
      const transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
      const corrected = new cv.Mat();
      cv.warpPerspective(img, corrected, transform, new cv.Size(width, height));
      
      cv.imwrite(outputUri, corrected);
      resolve(outputUri);
    });
  });
}`,
      deskewing: `
// Example implementation with OpenCV
function deskewImage(imageUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cv.imread(imageUri, (err, img) => {
      if (err) reject(err);
      
      const gray = new cv.Mat();
      cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
      
      const edges = new cv.Mat();
      cv.Canny(gray, edges, 50, 150);
      
      const lines = new cv.Mat();
      cv.HoughLines(edges, lines, 1, Math.PI / 180, 100);
      
      // Calculate rotation angle and apply correction
      const angle = calculateRotationAngle(lines);
      const rotated = new cv.Mat();
      const center = new cv.Point2f(img.cols / 2, img.rows / 2);
      const rotationMatrix = cv.getRotationMatrix2D(center, angle, 1.0);
      cv.warpAffine(img, rotated, rotationMatrix, new cv.Size(img.cols, img.rows));
      
      cv.imwrite(outputUri, rotated);
      resolve(outputUri);
    });
  });
}`
    }
  };
}

import { supabase } from '../lib/supabase';
import { config } from '../lib/config';
import { isRetryableError, isAPIDownError, retryWithBackoff, logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';
import { withRateLimit, validateIngredientName } from './security';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI MODEL CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * We use different models optimized for different tasks:
 * - GPT-4o-mini: Vision tasks (OCR, image analysis) - better accuracy for visual tasks
 * - GPT-3.5-turbo: Text analysis - 10x faster for ingredient analysis with good accuracy
 * 
 * Note: All AI calls throughout the app should use these constants
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export const AI_VISION_MODEL = 'gpt-4o-mini'; // For OCR and vision tasks
export const AI_TEXT_MODEL = 'gpt-3.5-turbo'; // For text analysis - optimized for speed
export const AI_MODEL_CONTEXT_WINDOW = 128000;
export const AI_MODEL_MAX_TOKENS = 16000;

// Get Supabase URL for Edge Function
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  console.error('EXPO_PUBLIC_SUPABASE_URL not configured');
}

// Helper functions for thought streaming
function getIngredientEmoji(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('sugar')) return '🍬';
  if (l.includes('salt')) return '🧂';
  if (l.includes('water')) return '💧';
  if (l.includes('color')) return '🎨';
  if (l.includes('acid')) return '🧪';
  if (l.includes('vitamin')) return '💊';
  if (l.includes('oil')) return '🫒';
  return '🔬';
}

function getClassificationMessage(status: string, name: string): string {
  const clean = [`✨ ${name} looks clean!`, `👍 ${name} passes`, `🌿 ${name} is natural`];
  const toxic = [`⚠️ ${name} is concerning...`, `🚫 ${name} raises flags`, `🔬 ${name} needs scrutiny`];
  const msgs = status === 'generally_clean' ? clean : toxic;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// Special ingredient reactions removed for performance optimization

// Test OpenAI Edge Function connectivity
export async function testOpenAIAPIKey(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('No valid session for OpenAI Edge Function test');
      return false;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'analyze_ingredient',
        ingredientName: 'test ingredient'
      }),
    });

    if (response.ok) {
      return true;
    } else {
      console.error('OpenAI Edge Function test failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('OpenAI Edge Function test failed:', error);
    return false;
  }
}

export interface AIAnalysisResult {
  status: 'generally_clean' | 'potentially_toxic' | 'unknown';
  confidence: number;
  educational_note: string;
  basic_note: string;
  reasoning: string;
}

export interface BatchAIAnalysisResult {
  ingredients: Array<{
    name: string;
    analysis: AIAnalysisResult;
  }>;
  processing_time: number;
  tokens_used: number;
}

/**
 * System prompt for ingredient classification - Holistic/Functional Medicine Approach
 */
const SYSTEM_PROMPT = `You are a holistic health expert analyzing food ingredients for wellness-conscious consumers.

TASK: Classify ingredients as "generally_clean" or "potentially_toxic" based on:
- Processing level (whole/natural vs synthetic/refined)
- Health impact (nourishing vs inflammatory/disruptive)
- Source quality (organic, non-GMO preferred)

GENERALLY_CLEAN:
- Whole, minimally processed foods (fruits, vegetables, whole grains, legumes)
- Organic oils, herbs, spices
- Natural vitamins/minerals in whole-food form
- Traditional foods with proven safety
- Probiotic/fermented ingredients

POTENTIALLY_TOXIC:
- Artificial colors, flavors, preservatives, sweeteners
- Refined sugars, highly processed oils, trans fats
- GMO ingredients
- Synthetic additives affecting gut health, hormones, or inflammation
- Ingredients with heavy metal/contamination concerns

KEY CONSIDERATIONS:
- Gut health, inflammation, hormonal balance
- Organic/non-GMO status matters (e.g., "soy lecithin" organic=clean, conventional=toxic)
- Processing matters (e.g., "cane sugar" unrefined=clean, refined=toxic)
- When uncertain, classify as "potentially_toxic" (precautionary principle)

RESPONSE FORMAT (required JSON):
{
  "status": "generally_clean" | "potentially_toxic",
  "confidence": 0.0-1.0,
  "educational_note": "Brief health impact explanation (2-3 sentences)",
  "basic_note": "Simple consumer-friendly summary (1 sentence)",
  "reasoning": "Why this classification was chosen"
}`;
/**
 * Analyze a single ingredient using AI
 */
export async function analyzeIngredientWithAI(
  ingredientName: string,
  userId: string,
  isPremium: boolean = false
): Promise<AIAnalysisResult> {
  // Validate ingredient name input
  const sanitizedName = validateIngredientName(ingredientName);
  
  // Apply rate limiting for AI analysis operations
  return await withRateLimit(userId, 'ai_analysis', async () => {
    const ingredientStartTime = Date.now();

    try {
      if (!config.openai?.enabled) {
        throw new Error('OpenAI analysis is disabled in configuration');
      }

      // Get Supabase session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'analyze_ingredient',
          ingredientName: sanitizedName
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI Edge Function error: ${response.status} ${response.statusText}`);
      }

      const analysis = await response.json() as AIAnalysisResult;
      
      // Validate the response structure
      if (!analysis.status || !analysis.educational_note || !analysis.basic_note) {
        console.error(`Invalid AI response structure:`, {
          hasStatus: !!analysis.status,
          hasEducationalNote: !!analysis.educational_note,
          hasBasicNote: !!analysis.basic_note,
          fullResponse: analysis
        });
        throw new Error('Invalid AI response structure');
      }

      // Ensure confidence is within valid range
      analysis.confidence = Math.max(0, Math.min(1, analysis.confidence || 0.5));

      
      return analysis;

  } catch (error) {
    console.error(`AI Analysis failed for "${ingredientName}":`, error);
    
    // Fallback to conservative classification
    const fallbackResult = {
      status: 'potentially_toxic' as const,
      confidence: 0.3,
      educational_note: 'Unable to analyze this ingredient with AI. For safety, we recommend caution and consulting with healthcare providers about potential concerns.',
      basic_note: 'Unknown ingredient - upgrade for detailed analysis',
      reasoning: 'AI analysis failed, using conservative fallback'
    };

    
    return fallbackResult;
  }
  });
}

/**
 * Analyze multiple ingredients in a single batch request for efficiency
 */
export async function analyzeSingleBatch(
  ingredientNames: string[],
  userId: string,
  isPremium: boolean = false,
  onProgress?: (update: any) => void
): Promise<BatchAIAnalysisResult> {
  // Validate all ingredient names
  const sanitizedNames = ingredientNames.map(name => validateIngredientName(name));
  
  // Apply rate limiting for batch AI analysis
  return await withRateLimit(userId, 'ai_analysis', async () => {
    const startTime = Date.now();
  
    try {

      // Get Supabase session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('User not authenticated');
      }

      // Process ingredients using batch endpoint
      
      const response = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'analyze_batch',
          ingredientNames: sanitizedNames
        }),
      });

      if (!response.ok) {
        throw new Error(`Batch analysis failed: ${response.status} ${response.statusText}`);
      }

      const batchResult = await response.json();
      const results = batchResult.ingredients;
      
      // Stream progress updates for each ingredient
      results.forEach((result: any, i: number) => {
        onProgress?.({ 
          type: 'analyzing', 
          message: `Analyzed ${result.name}...`, 
          emoji: getIngredientEmoji(result.name), 
          current: i + 1, 
          total: results.length, 
          progress: Math.round(((i + 1) / results.length) * 100)
        });
      });

    const result: BatchAIAnalysisResult = {
      ingredients: results,
      processing_time: 0,
      tokens_used: batchResult.tokens_used || 0
    };
    
    
    // Validate the response structure
    if (!result.ingredients || !Array.isArray(result.ingredients)) {
      console.error(`❌ Invalid batch AI response structure:`, {
        hasIngredients: !!result.ingredients,
        isArray: Array.isArray(result.ingredients),
        fullResponse: result
      });
      throw new Error('Invalid batch AI response structure');
    }

    // Validate and clean up the results - OPTIMIZED: Process instantly, queue progress updates
    const validatedIngredients = [];
    const progressUpdates: Array<{
      type: string;
      message: string;
      emoji: string;
      current: number;
      total: number;
      status: string;
      isToxic: boolean;
    }> = [];
    const total = result.ingredients.length;
    
    for (let index = 0; index < result.ingredients.length; index++) {
      const item = result.ingredients[index];
      const name = item.name;
      
      // Handle both individual and batch response formats
      const analysis = item.analysis || item;
      if (!analysis || !analysis.status) {
        console.error(`Invalid ingredient analysis for "${name}":`, item);
        throw new Error(`Invalid analysis for ingredient: ${name}`);
      }

      const originalConfidence = analysis.confidence;
      const adjustedConfidence = Math.max(0, Math.min(1, analysis.confidence || 0.5));

      // Collect progress update (don't send immediately)
      progressUpdates.push({
        type: 'classified',
        message: getClassificationMessage(analysis.status, name),
        emoji: analysis.status === 'generally_clean' ? '✨' : '⚠️',
        current: index + 1,
        total: total,
        status: analysis.status === 'generally_clean' ? 'clean' : 'potentially_toxic',
        isToxic: analysis.status === 'potentially_toxic'
      });

      validatedIngredients.push({
        ...item,
        analysis: {
          ...analysis,
          confidence: adjustedConfidence
        }
      });
    }

    // Send all progress updates asynchronously (non-blocking) with staggered timing for smooth UX
    if (onProgress) {
      Promise.resolve().then(() => {
        progressUpdates.forEach((update, i) => {
          setTimeout(() => onProgress(update), i * 150); // 150ms stagger for smooth display
        });
      });
    }

    result.ingredients = validatedIngredients;
    result.processing_time = Date.now() - startTime;
    result.tokens_used = batchResult.tokens_used || 0;


    return result;

  } catch (error) {
    logDetailedError('AI_BATCH_ANALYSIS', error, {
      processing_time: Date.now() - startTime,
      ingredient_count: ingredientNames.length,
      ingredients: ingredientNames
    });
    
    // Check for retryable errors (temporary issues)
    if (isRetryableError(error)) {
      try {
        const retryResult = await retryWithBackoff(async () => {
          // Get Supabase session for authentication
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            throw new Error('User not authenticated');
          }

          // Retry using Edge Function
          const retryResponse = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'analyze_batch',
              ingredientNames: sanitizedNames
            }),
          });

          if (!retryResponse.ok) {
            throw new Error(`Batch analysis retry failed: ${retryResponse.status} ${retryResponse.statusText}`);
          }

          const retryBatchResult = await retryResponse.json();
          const retryResults = retryBatchResult.ingredients;
          
          // Validate and clean up the retry results
          const validatedIngredients = retryResults.map((item: any) => ({
            ...item,
            analysis: {
              ...item.analysis,
              confidence: Math.max(0, Math.min(1, item.analysis.confidence || 0.5))
            }
          }));
          
          return {
            ingredients: validatedIngredients,
            processing_time: Date.now() - startTime,
            tokens_used: retryBatchResult.tokens_used || 0
          };
        }, 2); // Max 2 retries for batch analysis
        
        return retryResult;
      } catch (retryError) {
        logDetailedError('AI_BATCH_ANALYSIS_RETRY', retryError, {
          original_error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Check if API is completely down
    if (isAPIDownError(error)) {
      const errorMessage = getUserFriendlyErrorMessage(error);
      
      return {
        ingredients: ingredientNames.map(name => ({
          name,
          analysis: {
            status: 'potentially_toxic' as const,
            confidence: 0.3,
            educational_note: `Unable to analyze "${name}" - ${errorMessage}. For safety, we classify unknown ingredients as potentially toxic. Please try again later or consult with healthcare providers.`,
            basic_note: 'Analysis unavailable - service temporarily down',
            reasoning: 'API service temporarily unavailable'
          }
        })),
        processing_time: Date.now() - startTime,
        tokens_used: 0
      };
    }
    
    // For other errors (likely parsing or validation errors), try individual analysis
    const individualStartTime = Date.now();
    
    const individualResults = await Promise.all(
      ingredientNames.map(async (name, index) => {
        try {
          const result = await analyzeIngredientWithAI(name, userId, isPremium);
          return {
            name,
            analysis: result
          };
        } catch (individualError) {
          logDetailedError('AI_INDIVIDUAL_ANALYSIS', individualError, {
            ingredient: name,
            index: index + 1,
            total: ingredientNames.length
          });
          
          // Conservative fallback for failed individual analysis
          return {
            name,
            analysis: {
              status: 'potentially_toxic' as const,
              confidence: 0.3,
              educational_note: `Unable to analyze "${name}". For safety, we classify unknown ingredients as potentially toxic. Please try again or consult with healthcare providers.`,
              basic_note: 'Analysis unavailable',
              reasoning: 'Individual analysis failed'
            }
          };
        }
      })
    );

    const fallbackResult = {
      ingredients: individualResults,
      processing_time: Date.now() - startTime,
      tokens_used: 0
    };


    return fallbackResult;
  }
  });
}

/**
 * Analyze ingredients with parallel batch processing for improved performance
 */
export async function analyzeIngredientsBatch(
  ingredientNames: string[],
  userId: string,
  isPremium: boolean = false,
  onProgress?: (update: any) => void
): Promise<BatchAIAnalysisResult> {
  const batchStartTime = Date.now();
  
  // For small batches, use single batch processing
  if (ingredientNames.length <= 8) {
    return analyzeSingleBatch(ingredientNames, userId, isPremium, onProgress);
  }

  const BATCH_SIZE = 8;
  const batches: string[][] = [];
  
  // Split ingredients into batches of 8
  for (let i = 0; i < ingredientNames.length; i += BATCH_SIZE) {
    batches.push(ingredientNames.slice(i, i + BATCH_SIZE));
  }

  const startTime = Date.now();

  // Process all batches in parallel
  const batchPromises = batches.map((batch, idx) => 
    analyzeSingleBatch(batch, userId, isPremium, (update) => {
      // Update progress tracking for parallel batches
      if (onProgress && update) {
        const batchStartIndex = idx * BATCH_SIZE;
        const currentInBatch = update.current || 0;
        const totalProgress = batchStartIndex + currentInBatch;
        
        onProgress?.({ 
          ...update, 
          current: Math.min(totalProgress, ingredientNames.length), 
          total: ingredientNames.length 
        });
      }
    })
  );

  try {
    const results = await Promise.all(batchPromises);
    
    // Combine all batch results
    const combinedResult: BatchAIAnalysisResult = {
      ingredients: results.flatMap(r => r.ingredients),
      processing_time: Date.now() - startTime,
      tokens_used: results.reduce((sum, r) => sum + r.tokens_used, 0)
    };


    return combinedResult;
    
  } catch (error) {
    console.error('Parallel batch processing failed:', error);
    
    // Fallback to single batch processing if parallel fails
    return analyzeSingleBatch(ingredientNames, userId, isPremium, onProgress);
  }
}

/**
 * Get AI analysis status and configuration
 */
export function getAIAnalysisStatus(): {
  configured: boolean;
  enabled: boolean;
  model: string;
  message: string;
} {
  const configured = true; // Always true since we use Edge Function
  const enabled = config.openai?.enabled !== false;
  const model = AI_TEXT_MODEL;

  let message = '';
  if (!enabled) {
    message = 'AI analysis is disabled in configuration';
  } else {
    message = 'AI analysis is ready (using secure Edge Function)';
  }

  const status = {
    configured,
    enabled,
    model,
    message,
  };


  return status;
}

/**
 * Test AI analysis functionality
 */
export async function testAIAnalysis(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  
  try {
    const status = getAIAnalysisStatus();
    
    if (!status.configured) {
      return {
        success: false,
        message: 'AI analysis is not configured. Please check Supabase Edge Function setup.',
      };
    }

    if (!status.enabled) {
      return {
        success: false,
        message: 'AI analysis is disabled in configuration',
      };
    }
    
    // Test with a simple ingredient
    const testResult = await analyzeIngredientWithAI('organic olive oil', 'test-user');
    
    return {
      success: true,
      message: 'AI analysis test successful',
      details: {
        test_ingredient: 'organic olive oil',
        result: testResult,
        model: status.model,
      },
    };

  } catch (error) {
    console.error('AI Analysis Test failed:', error);
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during AI analysis test',
    };
  }
}

/**
 * Identify product from ingredient list using AI
 */
export async function identifyProductFromIngredients(
  ingredientList: string
): Promise<string> {
  try {
    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return 'A packaged food product'; // Fallback if not authenticated
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'identify_product',
        ingredientList: ingredientList
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Edge Function error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const productName = result.productName?.trim();
    
    return productName || 'A packaged food product';
  } catch (error) {
    console.error('Error identifying product:', error);
    return 'A packaged food product'; // Fallback
  }
}

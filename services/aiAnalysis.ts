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
const SYSTEM_PROMPT = `You are a holistic health and functional medicine expert specializing in ingredient analysis for wellness-conscious consumers who prioritize natural, organic, and whole-food nutrition.

Your task is to classify food ingredients as either "generally_clean" or "potentially_toxic" through the lens of holistic health principles, focusing on how ingredients support or disrupt the body's natural healing capacity and overall wellness.

HOLISTIC CLASSIFICATION PHILOSOPHY:

Evaluate ingredients based on:
- **Root Cause Impact**: Does this ingredient address or disrupt underlying health factors (inflammation, gut health, hormonal balance)?
- **Whole Person Wellness**: How does it affect physical, mental, emotional, and energetic well-being?
- **Nature-Alignment**: Is it close to its natural state, or heavily processed/synthetic?
- **Bio-individuality**: Consider potential for sensitivities, allergies, and individual responses
- **Environmental Impact**: Organic, sustainable, and eco-conscious sourcing matters

GENERALLY_CLEAN ingredients (Nourishing & Life-Giving):
- Organic, whole, unprocessed foods (fruits, vegetables, whole grains, legumes)
- Wildcrafted or sustainably sourced ingredients
- Traditional foods with ancestral use and proven safety
- Natural vitamins, minerals, and phytonutrients in their whole-food form
- Ingredients that support gut health, reduce inflammation, and promote vitality
- Organic oils, herbs, and spices with therapeutic properties
- Natural fermented ingredients (probiotics, enzymes)
- Ingredients free from pesticides, GMOs, and synthetic chemicals

POTENTIALLY_TOXIC ingredients (Disruptive to Health):
- **Synthetic additives**: Artificial colors, flavors, preservatives, sweeteners
- **Endocrine disruptors**: Chemicals that interfere with hormonal balance
- **Inflammatory agents**: Refined sugars, trans fats, highly processed oils
- **Gut microbiome disruptors**: Artificial sweeteners, synthetic preservatives
- **Neurotoxins**: Additives linked to brain fog, mood issues, or behavioral concerns
- **GMO ingredients**: Lack long-term safety data, often linked to pesticide use
- **Refined/denatured ingredients**: Stripped of natural nutrients and fiber
- **Hidden synthetic compounds**: "Natural flavors" that may contain synthetic chemicals
- **Heavy metal concerns**: Ingredients with contamination risk

HOLISTIC HEALTH CONCERNS TO PRIORITIZE:

1. **Gut Health**: Does it support or harm the microbiome?
2. **Inflammation**: Anti-inflammatory or pro-inflammatory?
3. **Detoxification**: Does it burden the liver/kidneys or support cleansing?
4. **Hormonal Balance**: Endocrine disruptor or hormone-supportive?
5. **Mental Clarity**: Brain-supportive or linked to fog/mood issues?
6. **Immune Function**: Supports or weakens immunity?
7. **Cellular Health**: Oxidative stress vs antioxidant support?

EXAMPLE CLASSIFICATIONS (Holistic Lens):

GENERALLY_CLEAN examples:
- "Organic Coconut Oil" → Clean (nourishing fat, supports metabolism & brain health)
- "Turmeric Extract" → Clean (powerful anti-inflammatory, supports whole-body wellness)
- "Raw Honey" → Clean (traditional sweetener with enzymes & antimicrobial properties)
- "Sea Salt with Trace Minerals" → Clean (supports electrolyte balance naturally)
- "Organic Apple Cider Vinegar" → Clean (supports digestion & gut health)
- "Sprouted Whole Wheat" → Clean (enhanced nutrient availability, easier digestion)

POTENTIALLY_TOXIC examples:
- "Aspartame" → Toxic (neurotoxin, gut microbiome disruptor, synthetic)
- "Carrageenan" → Toxic (inflammatory, gut irritant despite "natural" label)
- "Soybean Oil (non-organic)" → Toxic (GMO, highly refined, inflammatory omega-6)
- "Maltodextrin" → Toxic (blood sugar spike, gut microbiome disruptor)
- "Natural Flavors" → Toxic (undefined term, may hide synthetic compounds & MSG)
- "Canola Oil" → Toxic (heavily processed, inflammatory, often GMO)
- "Refined White Sugar" → Toxic (inflammatory, depletes nutrients, addictive)

CRUNCHY HOLISTIC EDGE CASES:

- "Cane Sugar" (organic, unrefined) → Clean (minimally processed, trace minerals)
- "Cane Sugar" (refined white) → Toxic (stripped of nutrients, inflammatory)
- "Soy Lecithin" (organic, non-GMO) → Borderline Clean (functional, but watch for sensitivities)
- "Soy Lecithin" (conventional) → Toxic (likely GMO, hexane-extracted)
- "Citric Acid" (from organic citrus) → Clean (natural fermentation)
- "Citric Acid" (from corn, unspecified) → Toxic (likely GMO corn derivative)
- "Xanthan Gum" → Borderline Toxic (synthetic production, gut concerns for some)

QUANTITY & CUMULATIVE LOAD:
- Even "clean" ingredients in excess can be problematic (e.g., too much natural sugar)
- Multiple synthetic additives = increased toxic burden on detox organs
- Consider the "cocktail effect" of combined synthetic ingredients
- Support the body's natural detoxification capacity

FUNCTIONAL MEDICINE APPROACH:
- **Ask "Why?"**: What underlying imbalance might this ingredient create or worsen?
- **Systems Thinking**: Consider interconnected effects (gut-brain axis, hormone-immune links)
- **Personalization**: Note when ingredients may affect sensitive individuals differently
- **Prevention Focus**: Prioritize ingredients that build health, not just avoid disease

CONSERVATIVE & PRECAUTIONARY STANCE:
- When in doubt, classify as "potentially_toxic" to honor the precautionary principle
- Trust ancestral wisdom and traditional foods over modern synthetic innovations
- Synthetic until proven natural (not the reverse)
- Prioritize organic, non-GMO, and minimally processed always
- Honor bio-individuality—what works for one may not work for all

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "status": "generally_clean" | "potentially_toxic",
  "confidence": 0.0-1.0,
  "educational_note": "Holistic health explanation emphasizing root causes, body systems affected, and wellness impact (2-3 sentences)",
  "basic_note": "Simple, empowering explanation for conscious consumers (1 sentence)",
  "reasoning": "Functional medicine rationale connecting ingredient to specific health outcomes"
}

Approach each ingredient with reverence for the body's innate wisdom and healing capacity. Prioritize ingredients that nourish, support, and honor the whole person—body, mind, and spirit.`;

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

      const completion = { model: AI_TEXT_MODEL };

    const result: BatchAIAnalysisResult = {
      ingredients: results
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
    const progressUpdates = [];
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
    result.tokens_used = completion.usage?.total_tokens || 0;


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
          const retryBatchPrompt = `Analyze these food ingredients and classify each one. Return a JSON array with analysis for each ingredient.

Ingredients to analyze: ${ingredientNames.map(name => `"${name.trim()}"`).join(', ')}

Return format:
{
  "ingredients": [
    {
      "name": "ingredient name",
      "analysis": {
        "status": "generally_clean" | "potentially_toxic",
        "confidence": 0.0-1.0,
        "educational_note": "Detailed explanation for premium users",
        "basic_note": "Simple explanation for free users",
        "reasoning": "Brief technical reasoning"
      }
    }
  ]
}`;
          const retryPayload = {
            model: AI_TEXT_MODEL, // GPT-3.5-turbo optimized for speed
            messages: [
              {
                role: "system" as const,
                content: SYSTEM_PROMPT
              },
              {
                role: "user" as const,
                content: retryBatchPrompt
              }
            ],
            temperature: 0, // Optimized for speed - deterministic responses
            max_tokens: 2000, // Prevents worst-case truncation for batches of 8 ingredients
            response_format: { type: "json_object" as const }
          };
          const retryCompletion = await openai.chat.completions.create(retryPayload);
          const retryResponse = retryCompletion.choices[0]?.message?.content;
          if (!retryResponse) {
            throw new Error('No response content from AI batch analysis retry');
          }
          
          const retryParsed = JSON.parse(retryResponse) as BatchAIAnalysisResult;
          
          // Validate and clean up the retry results
          const validatedIngredients = retryParsed.ingredients.map((item) => ({
            ...item,
            analysis: {
              ...item.analysis,
              confidence: Math.max(0, Math.min(1, item.analysis.confidence || 0.5))
            }
          }));
          
          return {
            ingredients: validatedIngredients,
            processing_time: Date.now() - startTime,
            tokens_used: retryCompletion.usage?.total_tokens || 0
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

import OpenAI from 'openai';
import { config } from '../lib/config';
import { isRetryableError, isAPIDownError, retryWithBackoff, logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';
import { withRateLimit, validateIngredientName } from './security';

// Initialize OpenAI client
console.log('🔧 Initializing OpenAI client...');
console.log('🔧 API Key from config:', config.openai?.apiKey ? 'SET' : 'NOT SET');
console.log('🔧 API Key from env:', process.env.EXPO_PUBLIC_OPENAI_API_KEY ? 'SET' : 'NOT SET');

const openai = new OpenAI({
  apiKey: config.openai?.apiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY,
});

console.log('✅ OpenAI client initialized');

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

// Special ingredient reactions for easter eggs
const SPECIAL: Record<string, { emoji: string; msg: string }> = {
  'high fructose corn syrup': { emoji: '😬', msg: 'Yikes! HFCS detected...' },
  'hfcs': { emoji: '😬', msg: 'Oh no, not HFCS...' },
  'organic': { emoji: '🌱', msg: 'Love organic!' },
  'artificial flavor': { emoji: '🤨', msg: 'Artificial detected...' },
  'vitamin': { emoji: '💊', msg: 'Getting vitamins!' },
  'msg': { emoji: '🚨', msg: 'MSG alert!' },
  'aspartame': { emoji: '🤔', msg: 'Aspartame debate...' },
  'stevia': { emoji: '🍃', msg: 'Natural sweetness!' },
  'red dye': { emoji: '🔴', msg: 'Colorful concerns...' },
  'blue dye': { emoji: '🔵', msg: 'Blue mystery...' },
  'yellow dye': { emoji: '🟡', msg: 'Yellow warning...' },
  'sodium benzoate': { emoji: '🧪', msg: 'Preservative alert!' },
  'bht': { emoji: '⚗️', msg: 'BHT spotted!' },
  'bha': { emoji: '⚗️', msg: 'BHA detected!' },
  'natural flavor': { emoji: '🤷', msg: 'Natural... but what?' },
  'sugar': { emoji: '🍭', msg: 'Sweet tooth activated!' },
  'salt': { emoji: '🧂', msg: 'Salty situation!' },
  'water': { emoji: '💧', msg: 'H2O - the good stuff!' },
};

function checkSpecial(name: string): { emoji: string; msg: string } | null {
  const l = name.toLowerCase();
  for (const [key, reaction] of Object.entries(SPECIAL)) {
    if (l.includes(key)) return { emoji: reaction.emoji, msg: reaction.msg };
  }
  return null;
}

// Test API key validity
export async function testOpenAIAPIKey(): Promise<boolean> {
  try {
    console.log('🧪 Testing OpenAI API key...');
    const testResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "API key is working"' }],
      max_tokens: 10,
    });
    
    console.log('✅ OpenAI API key test successful:', testResponse.choices[0]?.message?.content);
    return true;
  } catch (error) {
    console.error('❌ OpenAI API key test failed:', error);
    return false;
  }
}

export interface AIAnalysisResult {
  status: 'generally_clean' | 'potentially_toxic';
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
 * System prompt for ingredient classification
 */
const SYSTEM_PROMPT = `You are an expert food safety and nutrition analyst specializing in ingredient classification for consumer health applications.

Your task is to classify food ingredients as either "generally_clean" or "potentially_toxic" based on current scientific research and health concerns.

CLASSIFICATION CRITERIA:

GENERALLY_CLEAN ingredients:
- Natural, minimally processed foods (organic fruits, vegetables, whole grains)
- Basic nutrients (vitamins, minerals, amino acids)
- Traditional food ingredients with long safety history
- Natural preservatives with established safety profiles
- Organic, non-GMO ingredients without synthetic additives

POTENTIALLY_TOXIC ingredients:
- Artificial preservatives, colors, flavors, or sweeteners
- Synthetic chemicals with potential health concerns
- Highly processed ingredients with questionable safety
- Ingredients linked to inflammation, allergies, or health issues
- GMO ingredients with limited long-term safety data
- Chemical additives with known or suspected toxicity

EXAMPLE CLASSIFICATIONS:

GENERALLY_CLEAN examples:
- "Water" → Clean (natural, no processing)
- "Organic Whole Wheat Flour" → Clean (minimally processed)
- "Sea Salt" → Clean (natural preservative)
- "Ascorbic Acid (Vitamin C)" → Clean (beneficial vitamin)
- "Citric Acid (from citrus)" → Clean (natural acid)

POTENTIALLY_TOXIC examples:
- "Red 40" → Toxic (artificial color, linked to hyperactivity)
- "BHT (Butylated Hydroxytoluene)" → Toxic (synthetic preservative, health concerns)
- "High Fructose Corn Syrup" → Toxic (highly processed sweetener)
- "Sodium Benzoate" → Toxic (preservative with carcinogenic potential)
- "Artificial Flavors" → Toxic (unspecified synthetic compounds)

EDGE CASES - when in doubt, classify as POTENTIALLY_TOXIC:
- "Natural Flavors" → Toxic (vague term, may hide synthetic chemicals)
- "Modified Food Starch" → Toxic (heavily processed, unknown source)
- "Caramel Color" → Depends on class: I-II Clean, III-IV Toxic (default: Toxic)
- "Citric Acid" (without source specified) → Clean (commonly natural, but verify)

QUANTITY CONSIDERATIONS:
- Small amounts of natural preservatives: Clean
- Multiple synthetic additives in one product: All Toxic
- Sugar as first ingredient: Note high concentration

CONSERVATIVE APPROACH:
- When in doubt, classify as "potentially_toxic" for user safety
- Consider cumulative effects of multiple synthetic ingredients
- Factor in individual sensitivity and allergy concerns
- Prioritize consumer health over industry claims

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "status": "generally_clean" | "potentially_toxic",
  "confidence": 0.0-1.0,
  "educational_note": "Detailed explanation for premium users (2-3 sentences)",
  "basic_note": "Simple explanation for free users (1 sentence)",
  "reasoning": "Brief technical reasoning for the classification"
}

Be thorough, evidence-based, and prioritize consumer safety.`;

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
    const startTime = Date.now();

    try {
      console.log(`🤖 Starting AI analysis for ingredient: "${ingredientName}"`);
      console.log(`👑 Premium user: ${isPremium}`);
      console.log(`🔧 OpenAI API Key configured: ${!!config.openai?.apiKey}`);
      console.log(`🔧 OpenAI API Key value: ${config.openai?.apiKey ? 'SET' : 'NOT SET'}`);
      console.log(`⚙️ Model: ${config.openai?.model || 'gpt-4o-mini'}`);
      console.log(`🔧 OpenAI enabled: ${config.openai?.enabled}`);

      if (!config.openai?.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      if (!config.openai?.enabled) {
        throw new Error('OpenAI analysis is disabled in configuration');
      }

      const requestPayload = {
        model: "gpt-3.5-turbo", // Optimized for speed - 10x faster than gpt-4o-mini for ingredient analysis
        messages: [
          {
            role: "system" as const,
            content: SYSTEM_PROMPT
          },
          {
            role: "user" as const,
            content: `Analyze this food ingredient: "${sanitizedName}"`
          }
        ],
        temperature: 0.1,
        max_tokens: config.openai?.maxTokens || 300,
        response_format: { type: "json_object" as const }
      };

    console.log(`📤 Sending request to OpenAI:`, {
      model: requestPayload.model,
      temperature: requestPayload.temperature,
      max_tokens: requestPayload.max_tokens,
      ingredient: ingredientName,
      apiKeyLength: config.openai?.apiKey?.length || 0
    });

    const completion = await openai.chat.completions.create(requestPayload);

    console.log(`📥 Received response from OpenAI:`, {
      model: completion.model,
      usage: completion.usage,
      finish_reason: completion.choices[0]?.finish_reason,
      processing_time: Date.now() - startTime
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response content from AI');
    }

    console.log(`📄 Raw AI response:`, response);

    const analysis = JSON.parse(response) as AIAnalysisResult;
    
    console.log(`🔍 Parsed AI analysis:`, analysis);
    
    // Validate the response structure
    if (!analysis.status || !analysis.educational_note || !analysis.basic_note) {
      console.error(`❌ Invalid AI response structure:`, {
        hasStatus: !!analysis.status,
        hasEducationalNote: !!analysis.educational_note,
        hasBasicNote: !!analysis.basic_note,
        fullResponse: analysis
      });
      throw new Error('Invalid AI response structure');
    }

    // Ensure confidence is within valid range
    const originalConfidence = analysis.confidence;
    analysis.confidence = Math.max(0, Math.min(1, analysis.confidence || 0.5));
    
    if (originalConfidence !== analysis.confidence) {
      console.log(`🔧 Adjusted confidence from ${originalConfidence} to ${analysis.confidence}`);
    }

    console.log(`✅ AI Analysis completed for "${ingredientName}":`, {
      status: analysis.status,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      processing_time: Date.now() - startTime,
      tokens_used: completion.usage?.total_tokens || 0
    });
    
    return analysis;

  } catch (error) {
    console.error(`❌ AI Analysis failed for "${ingredientName}":`, error);
    console.error(`❌ Error details:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processing_time: Date.now() - startTime,
      ingredient: ingredientName,
      errorType: typeof error,
      errorConstructor: error?.constructor?.name
    });
    
    // Fallback to conservative classification
    const fallbackResult = {
      status: 'potentially_toxic' as const,
      confidence: 0.3,
      educational_note: 'Unable to analyze this ingredient with AI. For safety, we recommend caution and consulting with healthcare providers about potential concerns.',
      basic_note: 'Unknown ingredient - upgrade for detailed analysis',
      reasoning: 'AI analysis failed, using conservative fallback'
    };

    console.log(`🔄 Using conservative fallback for "${sanitizedName}":`, fallbackResult);
    
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
      console.log(`🤖 Starting batch AI analysis for ${sanitizedNames.length} ingredients:`, sanitizedNames);
      console.log(`👑 Premium user: ${isPremium}`);
      console.log(`🔧 OpenAI API Key configured: ${!!config.openai?.apiKey}`);
      console.log(`⚙️ Model: ${config.openai?.model || 'gpt-4o-mini'}`);

    const batchPrompt = `Analyze these food ingredients and classify each one. Return a JSON array with analysis for each ingredient.

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

    const requestPayload = {
      model: "gpt-3.5-turbo", // Optimized for speed - 10x faster than gpt-4o-mini for ingredient analysis
      messages: [
        {
          role: "system" as const,
          content: SYSTEM_PROMPT
        },
        {
          role: "user" as const,
          content: batchPrompt
        }
      ],
      temperature: 0, // Optimized for speed - deterministic responses
      max_tokens: 2000, // Prevents worst-case truncation for batches of 8 ingredients
      response_format: { type: "json_object" as const }
    };

    console.log(`📤 Sending batch request to OpenAI:`, {
      model: requestPayload.model,
      temperature: requestPayload.temperature,
      max_tokens: requestPayload.max_tokens,
      ingredient_count: ingredientNames.length,
      ingredients: ingredientNames
    });

    const completion = await openai.chat.completions.create(requestPayload);

    console.log(`📥 Received batch response from OpenAI:`, {
      model: completion.model,
      usage: completion.usage,
      finish_reason: completion.choices[0]?.finish_reason,
      processing_time: Date.now() - startTime
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response content from AI batch analysis');
    }

    console.log(`📄 Raw batch AI response:`, response);

    const result = JSON.parse(response) as BatchAIAnalysisResult;
    
    console.log(`🔍 Parsed batch AI result:`, result);
    
    // Validate the response structure
    if (!result.ingredients || !Array.isArray(result.ingredients)) {
      console.error(`❌ Invalid batch AI response structure:`, {
        hasIngredients: !!result.ingredients,
        isArray: Array.isArray(result.ingredients),
        fullResponse: result
      });
      throw new Error('Invalid batch AI response structure');
    }

    // Validate and clean up the results with streaming progress
    const validatedIngredients = [];
    const total = result.ingredients.length;
    
    for (let index = 0; index < result.ingredients.length; index++) {
      const item = result.ingredients[index];
      const name = item.name;
      
      console.log(`🔍 Validating ingredient ${index + 1}: "${name}"`);
      
      // Stream analyzing progress
      onProgress?.({ 
        type: 'analyzing', 
        message: `Analyzing ${name}...`, 
        emoji: getIngredientEmoji(name), 
        current: index + 1, 
        total: total, 
        ingredient: name 
      });
      
      // Minimum display time so users can read the thought
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Check for special ingredient reactions (easter eggs)
      const special = checkSpecial(name);
      if (special) {
        onProgress?.({ type: 'encouragement', message: special.msg, emoji: special.emoji });
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      
      if (!item.analysis || !item.analysis.status) {
        console.error(`❌ Invalid ingredient analysis for "${name}":`, item);
        throw new Error(`Invalid analysis for ingredient: ${name}`);
      }

      const originalConfidence = item.analysis.confidence;
      const adjustedConfidence = Math.max(0, Math.min(1, item.analysis.confidence || 0.5));
      
      if (originalConfidence !== adjustedConfidence) {
        console.log(`🔧 Adjusted confidence for "${name}" from ${originalConfidence} to ${adjustedConfidence}`);
      }

      // Stream classification result
      onProgress?.({ 
        type: 'classified', 
        message: getClassificationMessage(item.analysis.status, name), 
        emoji: item.analysis.status === 'generally_clean' ? '✨' : '⚠️', 
        current: index + 1, 
        total: total,
        status: item.analysis.status === 'generally_clean' ? 'clean' : 'potentially_toxic'
      });
      
      // Minimum display time for classification result
      await new Promise(resolve => setTimeout(resolve, 800));

      // Add encouragement every 5 ingredients
      if (index > 0 && index % 5 === 0) {
        const encouragements = ['🕵️ Detective mode...', '🧠 Thinking cap on...', '💪 I was trained for this...'];
        onProgress?.({ 
          type: 'encouragement', 
          message: encouragements[Math.floor(Math.random() * encouragements.length)], 
          emoji: '💭' 
        });
        // Display time for encouragement
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      validatedIngredients.push({
        ...item,
        analysis: {
          ...item.analysis,
          confidence: adjustedConfidence
        }
      });
    }

    result.ingredients = validatedIngredients;
    result.processing_time = Date.now() - startTime;
    result.tokens_used = completion.usage?.total_tokens || 0;

    console.log(`✅ Batch AI Analysis completed successfully:`, {
      ingredients_analyzed: result.ingredients.length,
      processing_time: result.processing_time,
      tokens_used: result.tokens_used,
      results_summary: result.ingredients.map(item => ({
        name: item.name,
        status: item.analysis.status,
        confidence: item.analysis.confidence
      }))
    });

    return result;

  } catch (error) {
    logDetailedError('AI_BATCH_ANALYSIS', error, {
      processing_time: Date.now() - startTime,
      ingredient_count: ingredientNames.length,
      ingredients: ingredientNames
    });
    
    // Check for retryable errors (temporary issues)
    if (isRetryableError(error)) {
      console.log('[AI_BATCH_ANALYSIS] Retryable error detected, attempting retry with backoff...');
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
            model: "gpt-3.5-turbo", // Optimized for speed - 10x faster than gpt-4o-mini for ingredient analysis
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
        
        console.log('[AI_BATCH_ANALYSIS] ✅ Retry successful after temporary error');
        return retryResult;
      } catch (retryError) {
        logDetailedError('AI_BATCH_ANALYSIS_RETRY', retryError, {
          original_error: error instanceof Error ? error.message : String(error)
        });
        console.log('[AI_BATCH_ANALYSIS] ❌ Retry failed, proceeding to fallback strategy');
      }
    }
    
    // Check if API is completely down
    if (isAPIDownError(error)) {
      console.log('[AI_BATCH_ANALYSIS] ⚠️ API unavailable, using conservative fallback for all ingredients');
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
    console.log('[AI_BATCH_ANALYSIS] 🔄 Non-retryable error detected, falling back to individual ingredient analysis');
    console.log(`[AI_BATCH_ANALYSIS] Processing ${ingredientNames.length} ingredients individually...`);
    const individualStartTime = Date.now();
    
    const individualResults = await Promise.all(
      ingredientNames.map(async (name, index) => {
        try {
          console.log(`[AI_BATCH_ANALYSIS] 🔄 Processing ingredient ${index + 1}/${ingredientNames.length}: "${name}"`);
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

    console.log(`[AI_BATCH_ANALYSIS] ✅ Individual analysis fallback completed:`, {
      ingredients_analyzed: fallbackResult.ingredients.length,
      total_processing_time: fallbackResult.processing_time,
      individual_processing_time: Date.now() - individualStartTime
    });

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

  console.log(`🚀 Starting parallel processing of ${ingredientNames.length} ingredients in ${batches.length} batches`);
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

    console.log(`✅ Parallel batch processing completed:`, {
      total_ingredients: combinedResult.ingredients.length,
      batches_processed: results.length,
      total_processing_time: combinedResult.processing_time,
      total_tokens_used: combinedResult.tokens_used,
      average_batch_time: combinedResult.processing_time / results.length
    });

    return combinedResult;
    
  } catch (error) {
    console.error('❌ Parallel batch processing failed:', error);
    
    // Fallback to single batch processing if parallel fails
    console.log('🔄 Falling back to single batch processing...');
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
  const configured = !!(config.openai?.apiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY);
  const enabled = config.openai?.enabled !== false;
  const model = 'gpt-3.5-turbo'; // Optimized default model for speed

  let message = '';
  if (!enabled) {
    message = 'AI analysis is disabled in configuration';
  } else if (!configured) {
    message = 'OpenAI API key is not configured';
  } else {
    message = 'AI analysis is ready';
  }

  const status = {
    configured,
    enabled,
    model,
    message,
  };

  console.log('🔧 AI Analysis Status Check:', {
    configured,
    enabled,
    model,
    message,
    hasApiKey: !!config.openai?.apiKey,
    hasEnvKey: !!process.env.EXPO_PUBLIC_OPENAI_API_KEY,
    configEnabled: config.openai?.enabled
  });

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
  console.log('🧪 Starting AI Analysis Test...');
  
  try {
    const status = getAIAnalysisStatus();
    console.log('📊 AI Status for test:', status);
    
    if (!status.configured) {
      console.log('❌ AI Test failed: API key not configured');
      return {
        success: false,
        message: 'OpenAI API key is not configured. Please set EXPO_PUBLIC_OPENAI_API_KEY environment variable.',
      };
    }

    if (!status.enabled) {
      console.log('❌ AI Test failed: AI analysis disabled');
      return {
        success: false,
        message: 'AI analysis is disabled in configuration',
      };
    }

    console.log('✅ AI configuration valid, running test analysis...');
    
    // Test with a simple ingredient
    const testResult = await analyzeIngredientWithAI('organic olive oil', 'test-user');
    
    console.log('✅ AI Analysis Test completed successfully:', {
      test_ingredient: 'organic olive oil',
      result: testResult,
      model: status.model,
    });
    
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
    console.error('❌ AI Analysis Test failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during AI analysis test',
    };
  }
}

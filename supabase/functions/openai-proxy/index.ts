// @ts-expect-error - Deno module resolution (works at runtime)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error - ESM module resolution (works at runtime)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deno global types declaration
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
)

// OpenAI API configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

// AI Model constants (matching client-side)
const AI_VISION_MODEL = 'gpt-5-mini'
const AI_TEXT_MODEL = 'gpt-5-mini'
const AI_MODEL_MAX_TOKENS = 4000

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10 // 10 requests per minute per user
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

interface OpenAIRequest {
  type: 'analyze_ingredient' | 'extract_text' | 'analyze_batch' | 'identify_product'
  ingredientName?: string
  ingredientNames?: string[] // NEW
  base64Image?: string
  ingredientList?: string // For product identification
}

interface AIAnalysisResult {
  status: 'generally_clean' | 'potentially_toxic'
  confidence: number
  educational_note: string
  basic_note: string
  reasoning: string
  sources?: Array<{
    title: string
    url: string
    type: 'research' | 'database' | 'regulatory' | 'other'
  }>
}

interface OCRResult {
  text: string
  confidence: number
  error?: string
}

// Rate limiting function
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitStore.get(userId)
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }
  
  userLimit.count++
  return true
}

// Validate ingredient name input
function validateIngredientName(name: string): string {
  return name.trim().slice(0, 200) // Limit length
}

// System prompt for ingredient analysis
const SYSTEM_PROMPT = `You are a holistic health analyst specializing in ingredient evaluation for wellness-focused, "crunchy" consumers who prioritize natural, unprocessed, whole foods.

Classify individual ingredients as either "generally_clean" or "potentially_toxic" using a strict precautionary, whole-foods-first approach aligned with crunchy lifestyle values.

## Ingredient Classification Framework
**GENERALLY_CLEAN (Whole & Natural):**
- Whole foods in their natural form (fruits, vegetables, whole grains, legumes, nuts, seeds)
- Minimally processed ingredients that retain their natural state
- Organic, unrefined oils (olive, coconut, avocado)
- Whole-food-derived vitamins and minerals (not synthetic isolates)
- Naturally fermented foods (sauerkraut, miso, kimchi, traditionally fermented pickles)
- Simple, recognizable ingredients—things you'd find in nature or a home kitchen

**POTENTIALLY_TOXIC (Processed & Synthetic):**
- All artificial colors, flavors, preservatives, and sweeteners
- Refined and processed sugars (including "cane sugar," unless specifically labeled as unrefined/organic)
- Highly processed seed oils (canola, soybean, vegetable, corn, palm kernel)
- GMO ingredients or likely GMO derivatives
- Synthetic thickeners and additives (xanthan gum, guar gum, carrageenan, maltodextrin, modified starches)
- "Natural flavors" (due to lack of transparency and potential for hidden synthetic compounds)
- Isolated or synthetic proteins (soy protein isolate, sodium caseinate, whey protein isolate)
- Synthetic vitamins and minerals (ascorbic acid, synthetic beta-carotene—prefer whole-food sources)
- Ultra-processed ingredients that don't resemble their original food source
- Ingredients known or suspected to disrupt gut health, hormones, or promote inflammation

## Crunchy Lifestyle Principles
- Ultra-processed foods are treated as harmful by default
- In cases of uncertainty or missing organic/non-GMO designation, default to "potentially_toxic"
- Any synthetically produced ingredient is classified as toxic, regardless of regulatory status (e.g., GRAS by FDA)
- Favor simple, natural ingredients; distrust modern food science additives
- Level of processing is key: organic/unrefined may be clean; refined/conventional considered toxic
- Common or widespread use does not imply safety

## Health Impact Priorities
Assess ingredient effects on gut microbiome health, inflammatory potential, hormonal balance, and detoxification burden.

## Source Requirements
- Reference 2–3 reputable, verifiable sources informing your assessment
- Acceptable sources: recent research studies, established health databases, regulatory body assessments, or recognized scientific organizations
- Only use full, real URLs; do not include placeholders or fabricated links

## Output Instructions
Respond ONLY with a single JSON object that exactly matches this structure:

\`\`\`
{
  "status": "generally_clean" | "potentially_toxic",
  "confidence": <float>,
  "educational_note": "<string>",
  "basic_note": "<string>",
  "reasoning": "<string>",
  "sources": [
    {
      "title": "<brief source title>",
      "url": "https://actual-url.com",
      "type": "research" | "database" | "regulatory" | "other"
    },
    ...
  ]
}
\`\`\`

- All fields are required and must be present in every response.
- Only "generally_clean" or "potentially_toxic" are allowed for the "status" field.
- "Confidence" must be a float from 0.0 to 1.0, inclusive.
- Only use legitimate URLs in "sources".
- If any doubt exists, or necessary safety information is missing, default classification to "potentially_toxic". Do not skip or error for unknown ingredients—always provide the best possible output per these rules.
- In "educational_note", "basic_note", and "reasoning" fields, use natural language (e.g., "potentially toxic" not "potentially_toxic", "generally clean" not "generally_clean").
- Do not include any text before or after the JSON.`

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limiting
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const requestBody: OpenAIRequest = await req.json()

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle different request types
    if (requestBody.type === 'analyze_ingredient') {
      return await handleIngredientAnalysis(requestBody.ingredientName!)
    } else if (requestBody.type === 'extract_text') {
      return await handleTextExtraction(requestBody.base64Image!)
    } else if (requestBody.type === 'analyze_batch') {
      return await handleBatchAnalysis(requestBody.ingredientNames!)
    } else if (requestBody.type === 'identify_product') {
      return await handleProductIdentification(requestBody.ingredientList!)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid request type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('OpenAI Proxy Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleIngredientAnalysis(ingredientName: string): Promise<Response> {
  const sanitizedName = validateIngredientName(ingredientName)

  try {
    const requestPayload = {
      model: AI_TEXT_MODEL,
      messages: [
        {
          role: "system" as const,
          content: SYSTEM_PROMPT
        },
        {
          role: "user" as const,
          content: `Analyze this food ingredient: "${sanitizedName}". Respond ONLY with a JSON object using this structure:
{
  "status": "generally_clean" | "potentially_toxic",
  "confidence": number between 0 and 1,
  "educational_note": string,
  "basic_note": string,
  "reasoning": string,
  "sources": [
    {
      "title": string,
      "url": string,
      "type": "research" | "database" | "regulatory" | "other"
    }
  ]
}`
        }
      ],
      max_completion_tokens: AI_MODEL_MAX_TOKENS,
      reasoning_effort: 'minimal' as const,
      verbosity: 'low' as const
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI detailed error:', response.status, errorBody)
      throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`)
    }

    const completion = await response.json()
    const analysis = JSON.parse(completion.choices[0]?.message?.content || '{}') as AIAnalysisResult

    // Validate response structure
    if (!analysis.status || !analysis.educational_note || !analysis.basic_note) {
      throw new Error('Invalid AI response structure')
    }

    // Ensure confidence is within valid range
    analysis.confidence = Math.max(0, Math.min(1, analysis.confidence || 0.5))

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Ingredient analysis error:', error)
    
    // Return fallback response
    const fallbackResult: AIAnalysisResult = {
      status: 'potentially_toxic',
      confidence: 0.3,
      educational_note: 'Unable to analyze this ingredient with AI. For safety, we recommend caution and consulting with healthcare providers about potential concerns.',
      basic_note: 'Unknown ingredient - upgrade for detailed analysis',
      reasoning: 'AI analysis unavailable - using conservative classification'
    }

    return new Response(
      JSON.stringify(fallbackResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleTextExtraction(base64Image: string): Promise<Response> {
  try {
    const prompt = `You are analyzing a food product label. Extract ONLY the ingredients list with EXACT structural accuracy.

CRITICAL STRUCTURE RULES:

1. PRESERVE EXACT NESTING of parentheses () and brackets []

   - Parentheses contain sub-ingredients: "Sauce (Water, Salt)" 

   - Brackets contain sub-sub-ingredients: "Enriched Flour [Wheat, Niacin, Iron]"

   - Count opening/closing symbols - they MUST match

   

2. PRESERVE EXACT PLACEMENT of "Contains X% Or Less Of:" markers

   - These markers can appear INSIDE parentheses as part of a compound ingredient

   - Example: "Sauce (Water, Oil, Contains 2% Or Less Of: Salt, Spices)"

   - The marker and ingredients after it are INSIDE the Sauce parentheses

   - Do NOT move closing parenthesis before the marker

   

3. DO NOT DUPLICATE ingredients

   - If "[Red Chili Peppers, Vinegar, Garlic]" appears in Chili Paste, do NOT repeat those ingredients elsewhere

   

4. Extract ONLY actual ingredients (after "INGREDIENTS:" label)

5. IGNORE Nutrition Facts, allergen warnings, company info

6. Return as clean, comma-separated list preserving all nesting

VALIDATION: Before returning, verify:

- Every ( has matching )

- Every [ has matching ]

- "Contains X% Or Less Of:" appears in correct position relative to closing )

If you cannot find ingredients, return "NO_INGREDIENTS_FOUND".`

    const requestPayload = {
      model: AI_VISION_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `${prompt}\n\nReturn ONLY a JSON object with this structure:\n{\n  "ingredients_text": "comma-separated ingredients list",\n  "raw_text": "original extracted text"\n}\nIf no ingredients are found, return {"error": "NO_INGREDIENTS_FOUND"}.`
            },
            {
              type: "image_url" as const,
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_completion_tokens: 1000,
      reasoning_effort: 'minimal' as const,
      verbosity: 'low' as const
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI detailed error:', response.status, errorBody)
      throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`)
    }

    const completion = await response.json()
    const extractedContent = completion.choices[0]?.message?.content?.trim() || ''
    const parsedExtraction = (() => {
      try {
        return JSON.parse(extractedContent)
      } catch {
        return { ingredients_text: extractedContent, raw_text: extractedContent }
      }
    })()

    const result: OCRResult = parsedExtraction.error
      ? {
          text: '',
          confidence: 0,
          error: parsedExtraction.error
        }
      : {
          text: parsedExtraction.ingredients_text || parsedExtraction.raw_text || '',
          confidence: 0.8 // GPT-5 nano vision mode is generally reliable
        }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Text extraction error:', error)
    
    const errorResult: OCRResult = {
      text: '',
      confidence: 0,
      error: 'Failed to extract text from image'
    }

    return new Response(
      JSON.stringify(errorResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleBatchAnalysis(ingredientNames: string[]): Promise<Response> {
  try {
    console.log(`🚀 [EDGE_FUNCTION] Starting batch analysis for ${ingredientNames.length} ingredients:`, ingredientNames);
    const sanitizedNames = ingredientNames.map(validateIngredientName)
    
    const batchPrompt = `Analyze these ${sanitizedNames.length} food ingredients. Return a JSON object with an "ingredients" array containing one object per ingredient in the EXACT order provided.

Ingredients to analyze:
${sanitizedNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Return format:
{
  "ingredients": [
    {
      "name": "ingredient 1 name",
      "status": "generally_clean" | "potentially_toxic",
      "confidence": 0.0-1.0,
      "educational_note": "...",
      "basic_note": "...",
      "reasoning": "...",
      "sources": [
        {
          "title": "Brief source title",
          "url": "https://actual-url.com",
          "type": "research" | "database" | "regulatory" | "other"
        }
      ]
    },
    // ... one object per ingredient
  ]
}`

    const requestPayload = {
      model: AI_TEXT_MODEL,
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: `${batchPrompt}\n\nReturn ONLY the JSON object described above.` }
      ],
      max_completion_tokens: Math.min(AI_MODEL_MAX_TOKENS * sanitizedNames.length, 128000),
      reasoning_effort: 'minimal' as const,
      verbosity: 'low' as const
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI detailed error:', response.status, errorBody)
      throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`)
    }

    const completion = await response.json()
    const responseData = JSON.parse(completion.choices[0]?.message?.content || '{"ingredients": []}')
    const analyses = responseData.ingredients || []
    
    console.log(`✅ [EDGE_FUNCTION] Batch analysis completed for ${analyses.length} ingredients`);

    return new Response(
      JSON.stringify({ ingredients: analyses }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Batch analysis error:', error)
    // Fallback to individual processing
    return new Response(
      JSON.stringify({ error: 'Batch processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleProductIdentification(ingredientList: string): Promise<Response> {
  try {
    const prompt = `Based on this ingredient list, identify the general food category.

Ingredient list: "${ingredientList}"

Rules:
1. Return a generic food category description
2. Examples: "A frozen pasta meal", "A canned soup", "A packaged sauce", "A frozen dinner"
3. Keep it concise (under 30 characters)
4. Don't guess specific brand names or product names
5. Focus on the general type of food product

Return ONLY the generic food category, nothing else.`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_TEXT_MODEL,
        messages: [
          {
            role: 'user',
            content: `${prompt}\nRespond with a short JSON object: {"productName": "<category description>"}`
          }
        ],
        max_completion_tokens: 50,
        reasoning_effort: 'minimal',
        verbosity: 'low'
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI detailed error:', response.status, errorBody)
      throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`)
    }

    const completion = await response.json()
    const productContent = completion.choices[0]?.message?.content?.trim() || '{}'
    const parsedProduct = (() => {
      try {
        return JSON.parse(productContent)
      } catch {
        return { productName: productContent }
      }
    })()
    const productName = parsedProduct.productName || 'A packaged food product'
    
    return new Response(
      JSON.stringify({ productName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Product identification error:', error)
    return new Response(
      JSON.stringify({ error: 'Product identification failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

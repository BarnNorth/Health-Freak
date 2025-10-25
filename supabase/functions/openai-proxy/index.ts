import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
const AI_VISION_MODEL = 'gpt-4o-mini'
const AI_TEXT_MODEL = 'gpt-3.5-turbo'
const AI_MODEL_MAX_TOKENS = 300

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

// System prompt for ingredient analysis (matching client-side)
const SYSTEM_PROMPT = `You are a functional medicine expert and holistic health practitioner with deep expertise in food ingredients, additives, and their impact on human health. Your role is to analyze food ingredients through the lens of functional medicine, which emphasizes root cause analysis, systems thinking, and personalized wellness approaches.

CORE PRINCIPLES:
- Prioritize whole, natural, minimally processed ingredients
- Consider bio-individuality and genetic variations in response
- Focus on ingredients that support optimal health, not just avoid harm
- Understand the interconnected nature of body systems
- Apply the precautionary principle when scientific evidence is limited
- Consider the cumulative effects of synthetic ingredients
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

Approach each ingredient with reverence for the body's innate wisdom and healing capacity. Prioritize ingredients that nourish, support, and honor the whole person—body, mind, and spirit.`

serve(async (req) => {
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
          content: `Analyze this food ingredient: "${sanitizedName}"`
        }
      ],
      temperature: 0.1,
      max_tokens: AI_MODEL_MAX_TOKENS,
      response_format: { type: "json_object" as const }
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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
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
    const prompt = `You are analyzing a food product label. Extract ONLY the ingredients list.

CRITICAL RULES:
1. Extract ONLY the actual ingredients (after "INGREDIENTS:" label)
2. IGNORE the Nutrition Facts table completely (all % DV values, calories, etc.)
3. IGNORE allergen warnings (CONTAINS, MAY CONTAIN sections)
4. Return ingredients as a clean, comma-separated list
5. Preserve sub-ingredients in parentheses exactly as shown
6. Remove any nutrition data that got mixed in (like "4%", "12%", etc.)
7. Extract ALL ingredients - do not skip any - look carefully for every single ingredient

If you cannot find ingredients, return "NO_INGREDIENTS_FOUND".`

    const requestPayload = {
      model: AI_VISION_MODEL,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: prompt
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
      temperature: 0.1,
      max_tokens: 1000
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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const completion = await response.json()
    const extractedText = completion.choices[0]?.message?.content?.trim() || ''

    const result: OCRResult = {
      text: extractedText,
      confidence: 0.8, // GPT-4 Vision is generally reliable
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
      "reasoning": "..."
    },
    // ... one object per ingredient
  ]
}`

    const requestPayload = {
      model: AI_TEXT_MODEL,
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: batchPrompt }
      ],
      temperature: 0.1,
      max_tokens: AI_MODEL_MAX_TOKENS * sanitizedNames.length, // Scale tokens
      response_format: { type: "json_object" as const }
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
      throw new Error(`OpenAI API error: ${response.status}`)
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
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const completion = await response.json()
    const productName = completion.choices[0]?.message?.content?.trim() || 'A packaged food product'
    
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

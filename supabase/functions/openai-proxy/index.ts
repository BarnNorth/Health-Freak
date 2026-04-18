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
// NOTE: Must stay in sync with services/security.ts RATE_LIMITS.ai_analysis
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15 // 15 requests per minute per user

// Maximum ingredients per batch request (prevents cost-amplification abuse)
const MAX_BATCH_SIZE = 30

interface OpenAIRequest {
  type: 'analyze_ingredient' | 'extract_text' | 'analyze_batch' | 'identify_product'
  ingredientName?: string
  ingredientNames?: string[] // NEW
  base64Image?: string
  ingredientList?: string // For product identification
  identifyProduct?: boolean // When true, include product identification in batch response
  stream?: boolean // When explicitly false, disable SSE streaming for batch analysis
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

// Rate limiting via Supabase RPC (distributed, survives function cold starts)
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
    p_user_id: userId,
    p_operation: 'ai_analysis',
    p_window_ms: RATE_LIMIT_WINDOW_MS,
    p_max_requests: RATE_LIMIT_MAX_REQUESTS,
  })

  if (error) {
    console.error('[RATE_LIMIT] RPC error:', error)
    // Fail open on RPC errors to avoid blocking legitimate users
    return { allowed: true }
  }

  return { allowed: data.allowed, error: data.error }
}

// Validate ingredient name input
function validateIngredientName(name: string): string {
  return name.trim().slice(0, 200) // Limit length
}

// Fake/placeholder domains to filter out
const FAKE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.com', 'placeholder.com', 'fake.com', 'url.com']

// Valid source types from the system prompt contract
const VALID_SOURCE_TYPES = ['research', 'database', 'regulatory', 'other'] as const
type SourceType = typeof VALID_SOURCE_TYPES[number]
type ValidatedSource = { title: string; url: string; type: SourceType }

// Validate and filter source URLs from AI responses
function validateSources(sources?: Array<{ title: string; url: string; type: string }>): ValidatedSource[] {
  if (!sources || !Array.isArray(sources)) return []

  return sources.reduce<ValidatedSource[]>((acc, source) => {
    try {
      const parsed = new URL(source.url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return acc
      if (FAKE_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) return acc
      const type: SourceType = (VALID_SOURCE_TYPES as readonly string[]).includes(source.type)
        ? source.type as SourceType
        : 'other'
      acc.push({ title: source.title, url: source.url, type })
    } catch {
      // invalid URL — skip
    }
    return acc
  }, [])
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

## CONTEXT MATTERS - Common Whole-Food Ingredients
The following ingredients should be classified as "generally_clean" when they appear in their natural/traditional form, as they are recognizable kitchen staples:
- Water, salt, sugar (in small amounts as a minor ingredient), vinegar, citric acid (naturally occurring in citrus fruits)
- Baking soda, baking powder, cream of tartar, cornstarch (traditional cooking staples)
- Butter, cream, milk, eggs, honey, molasses
- Herbs and spices in their whole or ground form (e.g., garlic, onion, black pepper, cinnamon, turmeric)
- Basic oils in unrefined form (olive oil, coconut oil, avocado oil, sesame oil)

If the ingredient is a common recognizable food or kitchen staple, default to "generally_clean" even without an explicit organic designation. Reserve "potentially_toxic" for synthetic additives, artificial colors/flavors, highly processed seed oils, and ingredients that don't resemble their original food source.

## Crunchy Lifestyle Principles
- Ultra-processed foods are treated as harmful by default
- For synthetic or unfamiliar ingredients with uncertainty, default to "potentially_toxic"
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

    // Check rate limiting (distributed via Supabase RPC)
    const rateCheck = await checkRateLimit(user.id)
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.error || 'Rate limit exceeded. Please try again later.' }),
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

    // Enforce free-tier scan limit on cost-incurring AI analysis request types.
    // `extract_text` and `identify_product` are cheap helpers; `analyze_ingredient`
    // and `analyze_batch` are the expensive calls and the ones counted against quota.
    if (requestBody.type === 'analyze_ingredient' || requestBody.type === 'analyze_batch') {
      const { data: limitCheck, error: limitErr } = await supabase
        .rpc('get_user_analysis_stats', { user_id: user.id })
        .maybeSingle()

      if (!limitErr && limitCheck) {
        const stats = limitCheck as { can_analyze: boolean; total_used: number; subscription_status: string }
        if (stats.can_analyze === false) {
          return new Response(
            JSON.stringify({
              error: 'Free tier scan limit reached. Upgrade to Premium for unlimited scans.',
              total_used: stats.total_used,
              subscription_status: stats.subscription_status,
            }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Handle different request types
    if (requestBody.type === 'analyze_ingredient') {
      return await handleIngredientAnalysis(requestBody.ingredientName!)
    } else if (requestBody.type === 'extract_text') {
      return await handleTextExtraction(requestBody.base64Image!)
    } else if (requestBody.type === 'analyze_batch') {
      const names = requestBody.ingredientNames ?? []
      if (!Array.isArray(names) || names.length === 0) {
        return new Response(
          JSON.stringify({ error: 'ingredientNames array is required and must not be empty' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (names.length > MAX_BATCH_SIZE) {
        return new Response(
          JSON.stringify({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} ingredients` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return await handleBatchAnalysis(names, requestBody.identifyProduct, requestBody.ingredientList, requestBody.stream)
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
      temperature: 0.3,
      reasoning_effort: 'medium' as const,
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

    // Validate source URLs
    analysis.sources = validateSources(analysis.sources)

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
    const prompt = `You are analyzing a food product label image. Extract the ingredients list and return structured JSON.

RULES:
1. Extract ONLY the ingredients (after "INGREDIENTS:" label if present)
2. IGNORE Nutrition Facts, allergen warnings ("CONTAINS: ..."), company info, addresses, phone numbers
3. For compound ingredients with sub-ingredients in parentheses like "Sauce (Water, Salt, Onion)", list the parent AND each sub-ingredient separately
4. For bracket sub-ingredients like "Enriched Flour [Wheat, Niacin]", list parent AND each sub-ingredient separately
5. Detect "Contains X% Or Less Of:" markers - ingredients after this marker are minor ingredients with that threshold
6. Minor markers can appear at top-level OR inside compound ingredient parentheses
7. "and/or" constructions should be split into separate ingredients
8. Remove footnote markers (*, †, etc.) from ingredient names but note if they indicate "Organic" or "Fair Trade" - prepend that to the name (e.g. "Honey*" becomes "Organic Honey")
9. Section headers like "Filling:" or "Tortilla:" indicate parent groupings, not ingredients themselves

Return a JSON object with this EXACT structure:
{
  "ingredients": [
    { "name": "Water", "isMinor": false, "parentIngredient": null, "isSubIngredient": false },
    { "name": "Enriched Flour", "isMinor": false, "parentIngredient": null, "isSubIngredient": false },
    { "name": "Wheat", "isMinor": false, "parentIngredient": "Enriched Flour", "isSubIngredient": true },
    { "name": "Salt", "isMinor": true, "minorThreshold": 2, "parentIngredient": null, "isSubIngredient": false }
  ],
  "raw_text": "the original comma-separated text as read from the label"
}

If no ingredients are found, return: { "error": "NO_INGREDIENTS_FOUND" }`

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
      max_completion_tokens: 2500,
      temperature: 0.3,
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
        const parsed = JSON.parse(extractedContent)
        if (parsed.error) return parsed
        if (parsed.ingredients && Array.isArray(parsed.ingredients)) return parsed
        // Legacy format fallback
        return {
          ingredients: [],
          raw_text: parsed.ingredients_text || parsed.raw_text || extractedContent
        }
      } catch {
        return { ingredients: [], raw_text: extractedContent }
      }
    })()

    if (parsedExtraction.error) {
      return new Response(
        JSON.stringify({
          text: '',
          confidence: 0,
          error: parsedExtraction.error,
          structured_ingredients: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const structuredIngredients = parsedExtraction.ingredients || null
    const rawText = parsedExtraction.raw_text || ''

    const result = {
      text: rawText,
      confidence: 0.9,
      structured_ingredients: structuredIngredients
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Text extraction error:', error)

    return new Response(
      JSON.stringify({
        text: '',
        confidence: 0,
        error: 'Failed to extract text from image',
        structured_ingredients: null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleBatchAnalysis(ingredientNames: string[], identifyProduct?: boolean, ingredientList?: string, streamResponse?: boolean): Promise<Response> {
  const shouldStream = streamResponse !== false // Default to streaming unless explicitly disabled
  try {
    console.log(`🚀 [EDGE_FUNCTION] Starting batch analysis for ${ingredientNames.length} ingredients:`, ingredientNames);
    const sanitizedNames = ingredientNames.map(validateIngredientName)

    const productIdInstruction = identifyProduct ? `\n\nAlso identify the general food category based on the full ingredient list${ingredientList ? `: "${ingredientList}"` : ''}. Include a "productName" field in the root of the response JSON (e.g., "A frozen pasta meal", "A canned soup"). Keep it concise (under 30 characters). Don't guess specific brand names.` : ''

    const batchPrompt = `Analyze these ${sanitizedNames.length} food ingredients. Analyze each ingredient independently with the same depth as if it were a single ingredient analysis. Provide specific reasoning for each ingredient, not generic batch reasoning. For each ingredient, consider its specific health impacts, processing level, and common sourcing before classifying.

Return a JSON object with an "ingredients" array containing one object per ingredient in the EXACT order provided.

Ingredients to analyze:
${sanitizedNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Return format:
{${identifyProduct ? '\n  "productName": "A generic food category",' : ''}
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
}${productIdInstruction}`

    const requestPayload = {
      model: AI_TEXT_MODEL,
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: `${batchPrompt}\n\nReturn ONLY the JSON object described above.` }
      ],
      max_completion_tokens: 8000,
      temperature: 0.3,
      reasoning_effort: 'medium' as const,
      verbosity: 'low' as const,
      stream: shouldStream
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

    // Non-streaming path (used for retries)
    if (!shouldStream) {
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '{}'
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const responseData = JSON.parse(cleanedContent || '{"ingredients": []}')
      const analyses = responseData.ingredients || []

      for (const item of analyses) {
        item.sources = validateSources(item.sources)
      }

      console.log(`✅ [EDGE_FUNCTION] Batch analysis (non-streaming) completed for ${analyses.length} ingredients`)

      return new Response(
        JSON.stringify({ ingredients: analyses, productName: responseData.productName }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Stream SSE to client - relay OpenAI stream chunks and collect full content
    const encoder = new TextEncoder()
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta?.content || ''
                if (delta) {
                  fullContent += delta
                  // Send progress event to client
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`))
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // Parse the complete response
          const responseData = JSON.parse(fullContent || '{"ingredients": []}')
          const analyses = responseData.ingredients || []

          // Validate source URLs for each ingredient
          for (const item of analyses) {
            item.sources = validateSources(item.sources)
          }

          console.log(`✅ [EDGE_FUNCTION] Batch analysis completed for ${analyses.length} ingredients`)

          // Send final complete result
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', ingredients: analyses, productName: responseData.productName })}\n\n`))
          controller.close()
        } catch (streamError) {
          console.error('Streaming error:', streamError)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Streaming failed' })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
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
        temperature: 0.3,
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

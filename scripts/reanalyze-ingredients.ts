/**
 * Re-analyze all cached ingredients with fresh AI analysis
 * 
 * Usage:
 *   npx tsx scripts/reanalyze-ingredients.ts [--dry-run]
 * 
 * Options:
 *   --dry-run    Preview what would be updated without making changes
 * 
 * Required environment variables:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY for admin access)
 *   EXPO_PUBLIC_OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Configuration
const BATCH_SIZE = 8;
const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second between batches to avoid rate limiting
const EXPIRY_DAYS = 180;

// OpenAI API configuration (matching Edge Function)
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const AI_TEXT_MODEL = 'gpt-5-mini';
const AI_MODEL_MAX_TOKENS = 4000;

// Types
interface IngredientCache {
  id: string;
  ingredient_name: string;
  status: 'generally_clean' | 'potentially_toxic';
  educational_note: string;
  basic_note?: string;
  cached_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

interface AIAnalysisResult {
  name: string;
  status: 'generally_clean' | 'potentially_toxic';
  confidence: number;
  educational_note: string;
  basic_note: string;
  reasoning: string;
  sources?: Array<{
    title: string;
    url: string;
    type: 'research' | 'database' | 'regulatory' | 'other';
  }>;
}

/**
 * Extract SYSTEM_PROMPT from the Edge Function source file
 */
function extractSystemPrompt(): string {
  const edgeFunctionPath = path.join(
    __dirname,
    '..',
    'supabase',
    'functions',
    'openai-proxy',
    'index.ts'
  );

  const fileContent = fs.readFileSync(edgeFunctionPath, 'utf-8');
  
  // Match the SYSTEM_PROMPT constant using regex
  // It starts with "const SYSTEM_PROMPT = `" and ends with the closing backtick
  const match = fileContent.match(/const SYSTEM_PROMPT = `([\s\S]*?)`\s*(?:;|\n)/);
  
  if (!match || !match[1]) {
    throw new Error('Could not extract SYSTEM_PROMPT from Edge Function');
  }

  return match[1];
}

/**
 * Validate and sanitize ingredient name (matching Edge Function)
 */
function validateIngredientName(name: string): string {
  return name.trim().slice(0, 200);
}

/**
 * Get basic note for cache based on status (matching lib/database.ts)
 */
function getBasicNoteForCache(status: 'generally_clean' | 'potentially_toxic'): string {
  if (status === 'generally_clean') {
    return 'Generally recognized as safe for consumption';
  } else {
    return 'May contain concerning compounds - upgrade for detailed explanation';
  }
}

/**
 * Analyze a batch of ingredients using OpenAI (matching Edge Function pattern)
 */
async function analyzeBatch(
  ingredientNames: string[],
  systemPrompt: string,
  openaiApiKey: string
): Promise<AIAnalysisResult[]> {
  const sanitizedNames = ingredientNames.map(validateIngredientName);

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
    }
  ]
}`;

  const requestPayload = {
    model: AI_TEXT_MODEL,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `${batchPrompt}\n\nReturn ONLY the JSON object described above.` }
    ],
    max_completion_tokens: Math.min(AI_MODEL_MAX_TOKENS * sanitizedNames.length, 128000),
    reasoning_effort: 'minimal' as const,
    verbosity: 'low' as const
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
  }

  const completion = await response.json();
  const responseData = JSON.parse(completion.choices[0]?.message?.content || '{"ingredients": []}');
  
  return responseData.ingredients || [];
}

/**
 * Update ingredient in database
 */
async function updateIngredient(
  supabase: ReturnType<typeof createClient>,
  ingredientName: string,
  analysis: AIAnalysisResult
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase
    .from('ingredients_cache')
    .upsert({
      ingredient_name: ingredientName.toLowerCase().trim(),
      status: analysis.status,
      educational_note: analysis.educational_note,
      basic_note: analysis.basic_note || getBasicNoteForCache(analysis.status),
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    }, {
      onConflict: 'ingredient_name'
    });

  if (error) {
    console.error(`  ❌ Error updating ${ingredientName}:`, error.message);
    return false;
  }

  return true;
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main script
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔬 Reanalyze Ingredients Script');
  console.log('================================');
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Validate environment variables
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const openaiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('   Required: EXPO_PUBLIC_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY)');
    process.exit(1);
  }

  if (!openaiApiKey) {
    console.error('❌ Missing EXPO_PUBLIC_OPENAI_API_KEY environment variable');
    process.exit(1);
  }

  // Extract SYSTEM_PROMPT from Edge Function
  console.log('📄 Extracting SYSTEM_PROMPT from Edge Function...');
  let systemPrompt: string;
  try {
    systemPrompt = extractSystemPrompt();
    console.log(`   ✅ Extracted prompt (${systemPrompt.length} characters)\n`);
  } catch (error) {
    console.error('❌ Failed to extract SYSTEM_PROMPT:', error);
    process.exit(1);
  }

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch all ingredients from cache
  console.log('📦 Fetching ingredients from cache...');
  const { data: ingredients, error: fetchError } = await supabase
    .from('ingredients_cache')
    .select('*')
    .order('ingredient_name');

  if (fetchError) {
    console.error('❌ Error fetching ingredients:', fetchError.message);
    process.exit(1);
  }

  if (!ingredients || ingredients.length === 0) {
    console.log('   No ingredients found in cache');
    process.exit(0);
  }

  console.log(`   Found ${ingredients.length} ingredients\n`);

  // Process ingredients in batches
  const totalBatches = Math.ceil(ingredients.length / BATCH_SIZE);
  let successCount = 0;
  let errorCount = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, ingredients.length);
    const batch = ingredients.slice(start, end);
    const ingredientNames = batch.map((i: IngredientCache) => i.ingredient_name);

    console.log(`🔄 Batch ${batchIndex + 1}/${totalBatches} (${batch.length} ingredients)`);
    console.log(`   Ingredients: ${ingredientNames.join(', ')}`);

    if (dryRun) {
      console.log('   ⏭️  Skipping API call (dry run)\n');
      successCount += batch.length;
      continue;
    }

    try {
      // Analyze batch
      const analyses = await analyzeBatch(ingredientNames, systemPrompt, openaiApiKey);
      console.log(`   📊 Received ${analyses.length} analysis results`);

      // Update each ingredient
      for (let i = 0; i < batch.length; i++) {
        const ingredient = batch[i] as IngredientCache;
        const analysis = analyses[i];

        if (!analysis) {
          console.log(`   ⚠️  No analysis returned for: ${ingredient.ingredient_name}`);
          errorCount++;
          continue;
        }

        const success = await updateIngredient(supabase, ingredient.ingredient_name, analysis);
        if (success) {
          console.log(`   ✅ ${ingredient.ingredient_name}: ${analysis.status}`);
          successCount++;
        } else {
          errorCount++;
        }
      }

    } catch (error) {
      console.error(`   ❌ Batch failed:`, error instanceof Error ? error.message : error);
      errorCount += batch.length;
    }

    // Rate limiting delay between batches
    if (batchIndex < totalBatches - 1) {
      console.log(`   ⏳ Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...\n`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    } else {
      console.log('');
    }
  }

  // Summary
  console.log('================================');
  console.log('📊 Summary');
  console.log(`   Total ingredients: ${ingredients.length}`);
  console.log(`   Successfully updated: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  
  if (dryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  }
}

main().catch(console.error);





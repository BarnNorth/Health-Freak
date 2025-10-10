/**
 * Pre-cache Common Ingredients Script
 * 
 * This script pre-analyzes and caches the most common food ingredients
 * to reduce API costs and improve response times for users.
 * 
 * Usage: npm run precache
 * 
 * Benefits:
 * - Reduces OpenAI API costs by ~80-90% (most products use common ingredients)
 * - Faster analysis for users (instant cache hits vs 2-3 second API calls)
 * - Better user experience with consistent results
 * 
 * Cost: ~$0.003 per ingredient × 290 ingredients ≈ $0.90 one-time cost
 * Savings: Avoid ~$0.003 per scan for cached ingredients (pays for itself after ~300 scans)
 */

import { analyzeIngredientWithAI } from '../services/aiAnalysis';
import { cacheIngredientInfo, getIngredientInfo } from '../lib/database';
import commonIngredients from '../data/commonIngredients.json';

// Configuration
const RATE_LIMIT_DELAY_MS = 2000; // 2 seconds between requests
const BATCH_SIZE = 10; // Process in batches to show progress
const CACHE_EXPIRY_DAYS = 180; // 6 months

interface CacheStats {
  total: number;
  success: number;
  error: number;
  alreadyCached: number;
  skipped: number;
  startTime: number;
}

/**
 * Check if ingredient is already cached and fresh
 */
async function isIngredientCached(ingredient: string): Promise<boolean> {
  try {
    const cached = await getIngredientInfo(ingredient);
    return cached !== null;
  } catch (error) {
    console.error(`Error checking cache for ${ingredient}:`, error);
    return false;
  }
}

/**
 * Analyze and cache a single ingredient
 */
async function cacheIngredient(
  ingredient: string,
  stats: CacheStats
): Promise<void> {
  const progress = `[${stats.success + stats.error + stats.alreadyCached + 1}/${stats.total}]`;
  
  try {
    // Check if already cached
    const isCached = await isIngredientCached(ingredient);
    if (isCached) {
      console.log(`${progress} ⏭️  ${ingredient} - Already cached (skipping)`);
      stats.alreadyCached++;
      return;
    }
    
    console.log(`${progress} 🔍 Analyzing: ${ingredient}...`);
    
    // Analyze with AI (use premium analysis for comprehensive educational notes)
    const result = await analyzeIngredientWithAI(ingredient, true);
    
    // Cache the result with 6-month expiry
    await cacheIngredientInfo(
      ingredient,
      result.status,
      result.educational_note,
      CACHE_EXPIRY_DAYS
    );
    
    const confidencePercent = Math.round((result.confidence || 0) * 100);
    console.log(`${progress} ✅ ${ingredient}: ${result.status} (${confidencePercent}% confidence)`);
    stats.success++;
    
  } catch (error) {
    console.error(`${progress} ❌ Failed to analyze ${ingredient}:`, error instanceof Error ? error.message : error);
    stats.error++;
  }
}

/**
 * Display progress statistics
 */
function displayProgress(stats: CacheStats): void {
  const elapsed = Date.now() - stats.startTime;
  const processed = stats.success + stats.error + stats.alreadyCached;
  const remaining = stats.total - processed;
  const rate = processed > 0 ? elapsed / processed : 0;
  const estimatedTimeRemaining = remaining * rate;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Progress Report:');
  console.log('='.repeat(60));
  console.log(`   Processed: ${processed}/${stats.total} (${Math.round(processed / stats.total * 100)}%)`);
  console.log(`   ✅ Successfully cached: ${stats.success}`);
  console.log(`   ⏭️  Already cached: ${stats.alreadyCached}`);
  console.log(`   ❌ Errors: ${stats.error}`);
  console.log(`   ⏱️  Elapsed time: ${Math.round(elapsed / 1000)}s`);
  console.log(`   ⏰ Estimated time remaining: ${Math.round(estimatedTimeRemaining / 1000)}s`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main pre-caching function
 */
async function precacheIngredients(): Promise<void> {
  console.log('\n' + '🚀'.repeat(30));
  console.log('🚀 Starting Common Ingredients Pre-Caching Job');
  console.log('🚀'.repeat(30) + '\n');
  
  const stats: CacheStats = {
    total: commonIngredients.length,
    success: 0,
    error: 0,
    alreadyCached: 0,
    skipped: 0,
    startTime: Date.now()
  };
  
  console.log(`📦 Total ingredients to process: ${stats.total}`);
  console.log(`⏱️  Rate limit: ${RATE_LIMIT_DELAY_MS}ms between requests`);
  console.log(`⏰ Estimated total time: ~${Math.round(stats.total * RATE_LIMIT_DELAY_MS / 1000 / 60)} minutes`);
  console.log(`💰 Estimated cost: $${(stats.total * 0.003).toFixed(2)} (if none cached)\n`);
  
  // Process ingredients
  for (let i = 0; i < commonIngredients.length; i++) {
    const ingredient = commonIngredients[i];
    
    await cacheIngredient(ingredient, stats);
    
    // Show progress every batch
    if ((i + 1) % BATCH_SIZE === 0) {
      displayProgress(stats);
    }
    
    // Rate limiting: wait between requests to avoid hitting API limits
    // Skip delay for the last ingredient
    if (i < commonIngredients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }
  
  // Final report
  const totalTime = Date.now() - stats.startTime;
  const actualCost = stats.success * 0.003;
  
  console.log('\n' + '🎉'.repeat(30));
  console.log('🎉 Pre-Caching Complete!');
  console.log('🎉'.repeat(30) + '\n');
  
  console.log('📊 Final Statistics:');
  console.log('━'.repeat(60));
  console.log(`   Total ingredients: ${stats.total}`);
  console.log(`   ✅ Successfully cached: ${stats.success}`);
  console.log(`   ⏭️  Already cached: ${stats.alreadyCached}`);
  console.log(`   ❌ Errors: ${stats.error}`);
  console.log(`   📈 New cache entries: ${stats.success}`);
  console.log('━'.repeat(60));
  
  console.log('\n💰 Cost Analysis:');
  console.log('━'.repeat(60));
  console.log(`   Actual API cost: $${actualCost.toFixed(2)}`);
  console.log(`   Ingredients analyzed: ${stats.success}`);
  console.log(`   Average cost per ingredient: $${(actualCost / stats.success).toFixed(4)}`);
  console.log('━'.repeat(60));
  
  console.log('\n⏱️  Time Analysis:');
  console.log('━'.repeat(60));
  console.log(`   Total time: ${Math.round(totalTime / 1000)}s (${Math.round(totalTime / 60000)}m)`);
  console.log(`   Average time per ingredient: ${Math.round(totalTime / stats.total)}ms`);
  console.log('━'.repeat(60));
  
  console.log('\n💡 Impact Projection:');
  console.log('━'.repeat(60));
  console.log(`   If each user scans 10 products with ~15 ingredients each:`);
  console.log(`   - Without cache: ${15} ingredients × 10 scans × $0.003 = $0.45 per user`);
  console.log(`   - With cache (90% hit rate): ${15 * 0.1} ingredients × 10 scans × $0.003 = $0.045 per user`);
  console.log(`   - Savings: $0.405 per user (90% reduction!) 🎉`);
  console.log(`   - Break-even: ~${Math.ceil(actualCost / 0.405)} users`);
  console.log('━'.repeat(60));
  
  if (stats.error > 0) {
    console.log('\n⚠️  Note: Some ingredients failed to cache. You may want to:');
    console.log('   1. Check the error messages above');
    console.log('   2. Verify your OpenAI API key is valid');
    console.log('   3. Re-run the script to retry failed ingredients');
  }
  
  console.log('\n✨ Next steps:');
  console.log('   - Run "npm run precache:check" to view cache statistics');
  console.log('   - Monitor cache hit rates in production logs');
  console.log('   - Re-run this script every 6 months to refresh expired entries\n');
}

// Run script with error handling
if (require.main === module) {
  precacheIngredients()
    .then(() => {
      console.log('✅ Pre-caching job completed successfully!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Pre-caching job failed:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
      process.exit(1);
    });
}

export { precacheIngredients };


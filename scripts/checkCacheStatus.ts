/**
 * Cache Status Checker Script
 * 
 * This script provides comprehensive statistics about the ingredient cache,
 * helping you monitor cache health and determine when to run maintenance tasks.
 * 
 * Usage: npm run precache:check
 */

import { getCacheStatistics, getExpiringIngredients } from '../lib/database';
import commonIngredients from '../data/commonIngredients.json';

/**
 * Format a date in a readable way
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Format days until expiry
 */
function formatDaysUntilExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'N/A';
  const now = new Date();
  const expiry = new Date(expiresAt);
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (days < 0) return '❌ Expired';
  if (days < 30) return `⚠️  ${days} days`;
  if (days < 90) return `⏰ ${days} days`;
  return `✅ ${days} days`;
}

/**
 * Calculate cache hit rate for common ingredients
 */
function calculateCacheHitRate(cached: number, total: number): string {
  const percentage = ((cached / total) * 100).toFixed(1);
  const emoji = cached / total > 0.9 ? '🎉' : cached / total > 0.7 ? '✅' : cached / total > 0.5 ? '⚠️' : '❌';
  return `${emoji} ${percentage}%`;
}

/**
 * Main cache status check function
 */
async function checkCacheStatus(): Promise<void> {
  console.log('\n' + '📊'.repeat(30));
  console.log('📊 Ingredient Cache Status Report');
  console.log('📊'.repeat(30) + '\n');

  try {
    // Get comprehensive cache statistics
    const stats = await getCacheStatistics();
    
    if (!stats) {
      console.error('❌ Unable to fetch cache statistics');
      return;
    }

    // Overall Statistics
    console.log('🗄️  Overall Cache Statistics:');
    console.log('━'.repeat(60));
    console.log(`   Total cached ingredients: ${stats.total_cached}`);
    console.log(`   ✅ Fresh (not expired): ${stats.fresh_ingredients}`);
    console.log(`   ❌ Expired: ${stats.expired_ingredients}`);
    console.log(`   ⚠️  Expiring soon (30 days): ${stats.expiring_soon}`);
    console.log('━'.repeat(60));

    // Cache Age
    console.log('\n📅 Cache Age:');
    console.log('━'.repeat(60));
    console.log(`   Oldest entry: ${formatDate(stats.oldest_cached)}`);
    console.log(`   Newest entry: ${formatDate(stats.newest_cached)}`);
    console.log('━'.repeat(60));

    // Common Ingredients Coverage
    const commonIngredientsCached = stats.total_cached; // Simplified - in production, query specific list
    const coverageRate = calculateCacheHitRate(commonIngredientsCached, commonIngredients.length);
    
    console.log('\n🎯 Common Ingredients Coverage:');
    console.log('━'.repeat(60));
    console.log(`   Total common ingredients: ${commonIngredients.length}`);
    console.log(`   Currently cached: ${commonIngredientsCached}`);
    console.log(`   Coverage rate: ${coverageRate}`);
    console.log('━'.repeat(60));

    // Expiring Ingredients
    console.log('\n⏰ Ingredients Expiring Soon:');
    console.log('━'.repeat(60));
    
    if (stats.expiring_soon > 0) {
      const expiringList = await getExpiringIngredients(30);
      
      if (expiringList.length > 0) {
        console.log(`   Found ${expiringList.length} ingredients expiring in the next 30 days:\n`);
        
        // Show first 10 expiring ingredients
        const displayCount = Math.min(10, expiringList.length);
        for (let i = 0; i < displayCount; i++) {
          const item = expiringList[i];
          console.log(`   ${i + 1}. ${item.ingredient_name}`);
          console.log(`      Status: ${item.status}`);
          console.log(`      Days until expiry: ${item.days_until_expiry}`);
          console.log();
        }
        
        if (expiringList.length > 10) {
          console.log(`   ... and ${expiringList.length - 10} more`);
        }
      }
    } else {
      console.log('   ✅ No ingredients expiring in the next 30 days');
    }
    console.log('━'.repeat(60));

    // Cost Savings Estimate
    const avgScansPerDay = 100; // Estimate
    const avgIngredientsPerScan = 15;
    const cacheHitRate = stats.fresh_ingredients / Math.max(commonIngredients.length, 1);
    const dailySavings = avgScansPerDay * avgIngredientsPerScan * cacheHitRate * 0.003;
    const monthlySavings = dailySavings * 30;
    const yearlySavings = dailySavings * 365;

    console.log('\n💰 Estimated Cost Savings:');
    console.log('━'.repeat(60));
    console.log(`   Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
    console.log(`   Daily savings: $${dailySavings.toFixed(2)}`);
    console.log(`   Monthly savings: $${monthlySavings.toFixed(2)}`);
    console.log(`   Yearly savings: $${yearlySavings.toFixed(2)}`);
    console.log('━'.repeat(60));

    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('━'.repeat(60));
    
    const recommendations: string[] = [];
    
    if (stats.fresh_ingredients < commonIngredients.length * 0.8) {
      recommendations.push('⚠️  Cache coverage is below 80%. Run "npm run precache" to improve hit rate.');
    }
    
    if (stats.expiring_soon > 20) {
      recommendations.push('⏰ Many ingredients are expiring soon. Consider running "npm run precache" to refresh them.');
    }
    
    if (stats.expired_ingredients > 10) {
      recommendations.push('🧹 Run "npm run cache:cleanup" to remove expired ingredients and reclaim space.');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ Cache is healthy! No actions needed at this time.');
    }
    
    recommendations.forEach(rec => console.log(`   ${rec}`));
    console.log('━'.repeat(60));

    // Available Commands
    console.log('\n📚 Available Commands:');
    console.log('━'.repeat(60));
    console.log('   npm run precache         - Pre-cache common ingredients');
    console.log('   npm run precache:check   - View this cache status report');
    console.log('   npm run cache:cleanup    - Clean up expired cache entries');
    console.log('━'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error checking cache status:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Verify database connection is working');
    console.log('   2. Check that migrations have been run');
    console.log('   3. Ensure Supabase credentials are correct\n');
  }
}

// Run script
if (require.main === module) {
  checkCacheStatus()
    .then(() => {
      console.log('✅ Cache status check completed successfully!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Cache status check failed:', error);
      process.exit(1);
    });
}

export { checkCacheStatus };


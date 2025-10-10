import { supabase } from '@/lib/supabase';

/**
 * Track AI classification accuracy for calibration
 * 
 * @param ingredient - Ingredient name
 * @param classification - AI classification result
 * @param confidence - AI confidence score (0-1)
 * @param wasCorrect - Whether the classification was correct
 */
export async function trackClassification(
  ingredient: string,
  classification: 'generally_clean' | 'potentially_toxic',
  confidence: number,
  wasCorrect: boolean
): Promise<void> {
  try {
    console.log('[CALIBRATION] Tracking classification:', {
      ingredient,
      classification,
      confidence,
      wasCorrect
    });

    const { error } = await supabase.from('ai_accuracy_tracking').insert({
      ingredient_name: ingredient.toLowerCase().trim(),
      ai_classification: classification,
      ai_confidence: confidence,
      user_feedback: wasCorrect ? 'correct' : 'incorrect'
    });

    if (error) {
      console.error('[CALIBRATION] Error tracking classification:', error);
      // Don't throw - tracking is not critical
    } else {
      console.log('[CALIBRATION] ✅ Successfully tracked classification');
    }
  } catch (error) {
    console.error('[CALIBRATION] Exception tracking classification:', error);
    // Don't throw - tracking is not critical
  }
}

/**
 * Get overall calibration statistics
 * 
 * @returns Accuracy statistics by classification type
 */
export async function getCalibrationStats(): Promise<{
  cleanAccuracy: number;
  toxicAccuracy: number;
  totalTracked: number;
} | null> {
  try {
    console.log('[CALIBRATION] Fetching calibration stats...');

    const { data, error } = await supabase.rpc('get_calibration_stats');

    if (error) {
      console.error('[CALIBRATION] Error getting stats:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log('[CALIBRATION] No calibration data available yet');
      return null;
    }

    const cleanStats = data.find((s: any) => s.classification === 'generally_clean');
    const toxicStats = data.find((s: any) => s.classification === 'potentially_toxic');

    const stats = {
      cleanAccuracy: Number(cleanStats?.accuracy_rate || 0),
      toxicAccuracy: Number(toxicStats?.accuracy_rate || 0),
      totalTracked: data.reduce((sum: number, s: any) => sum + Number(s.total_count), 0)
    };

    console.log('[CALIBRATION] ✅ Calibration stats:', stats);
    return stats;
  } catch (error) {
    console.error('[CALIBRATION] Exception getting calibration stats:', error);
    return null;
  }
}

/**
 * Get accuracy statistics for a specific ingredient
 * 
 * @param ingredientName - Name of the ingredient
 * @returns Accuracy stats for that ingredient
 */
export async function getIngredientAccuracyStats(
  ingredientName: string
): Promise<{
  totalFeedback: number;
  correctFeedback: number;
  accuracyRate: number;
  avgConfidence: number;
} | null> {
  try {
    console.log('[CALIBRATION] Fetching ingredient accuracy:', ingredientName);

    const { data, error } = await supabase
      .rpc('get_ingredient_accuracy', { 
        ingredient_name_param: ingredientName.toLowerCase().trim() 
      })
      .single();

    if (error) {
      console.error('[CALIBRATION] Error getting ingredient accuracy:', error);
      return null;
    }

    if (!data || data.total_feedback === 0) {
      console.log('[CALIBRATION] No feedback data for ingredient:', ingredientName);
      return null;
    }

    const stats = {
      totalFeedback: Number(data.total_feedback),
      correctFeedback: Number(data.correct_feedback),
      accuracyRate: Number(data.accuracy_rate),
      avgConfidence: Number(data.avg_confidence)
    };

    console.log('[CALIBRATION] ✅ Ingredient accuracy:', stats);
    return stats;
  } catch (error) {
    console.error('[CALIBRATION] Exception getting ingredient accuracy:', error);
    return null;
  }
}

/**
 * Get accuracy trends over time
 * 
 * @param daysBack - Number of days to look back (default: 30)
 * @returns Time-series accuracy data
 */
export async function getAccuracyTrends(daysBack: number = 30): Promise<Array<{
  date: string;
  classification: string;
  accuracyRate: number;
  sampleCount: number;
}>> {
  try {
    console.log('[CALIBRATION] Fetching accuracy trends for', daysBack, 'days');

    const { data, error } = await supabase
      .rpc('get_accuracy_trends', { days_back: daysBack });

    if (error) {
      console.error('[CALIBRATION] Error getting accuracy trends:', error);
      return [];
    }

    const trends = (data || []).map((item: any) => ({
      date: item.date,
      classification: item.classification,
      accuracyRate: Number(item.accuracy_rate),
      sampleCount: Number(item.sample_count)
    }));

    console.log('[CALIBRATION] ✅ Found', trends.length, 'trend data points');
    return trends;
  } catch (error) {
    console.error('[CALIBRATION] Exception getting accuracy trends:', error);
    return [];
  }
}

/**
 * Get confidence calibration analysis
 * 
 * @returns Confidence bucket analysis showing expected vs actual accuracy
 */
export async function getConfidenceCalibration(): Promise<Array<{
  confidenceBucket: string;
  expectedAccuracy: number;
  actualAccuracy: number;
  sampleCount: number;
  calibrationError: number;
}>> {
  try {
    console.log('[CALIBRATION] Fetching confidence calibration data...');

    const { data, error } = await supabase.rpc('get_confidence_calibration');

    if (error) {
      console.error('[CALIBRATION] Error getting confidence calibration:', error);
      return [];
    }

    const calibration = (data || []).map((item: any) => ({
      confidenceBucket: item.confidence_bucket,
      expectedAccuracy: Number(item.expected_accuracy),
      actualAccuracy: Number(item.actual_accuracy),
      sampleCount: Number(item.sample_count),
      calibrationError: Number(item.calibration_error)
    }));

    console.log('[CALIBRATION] ✅ Confidence calibration data:', calibration);
    return calibration;
  } catch (error) {
    console.error('[CALIBRATION] Exception getting confidence calibration:', error);
    return [];
  }
}

/**
 * Calculate calibrated confidence score based on historical accuracy
 * 
 * This adjusts AI confidence scores based on how accurate the AI has been historically
 * for this type of classification. If the AI is overconfident (high confidence but
 * low accuracy), this reduces the confidence. If underconfident (low confidence but
 * high accuracy), this increases it.
 * 
 * @param classification - The classification type
 * @param rawConfidence - Raw confidence from AI (0-1)
 * @param historicalAccuracy - Historical accuracy percentage (0-100)
 * @returns Calibrated confidence score (0-1)
 */
export function getCalibratedConfidence(
  classification: 'generally_clean' | 'potentially_toxic',
  rawConfidence: number,
  historicalAccuracy?: number
): number {
  console.log('[CALIBRATION] Calibrating confidence:', {
    classification,
    rawConfidence,
    historicalAccuracy
  });

  // If we don't have historical data, return raw confidence
  if (historicalAccuracy === undefined || historicalAccuracy === null) {
    console.log('[CALIBRATION] No historical data, using raw confidence');
    return rawConfidence;
  }

  // Convert accuracy percentage to decimal
  const accuracyFactor = historicalAccuracy / 100;

  // Calibrate based on historical accuracy
  // Formula: calibrated = raw * (accuracy / expected_accuracy)
  // If AI is perfectly calibrated, accuracy ≈ raw confidence
  // If AI is overconfident, accuracy < raw confidence → reduce
  // If AI is underconfident, accuracy > raw confidence → increase
  
  // Simple calibration: multiply by accuracy factor
  let calibrated = rawConfidence * accuracyFactor;

  // Apply smoothing to avoid over-correction
  // Blend 70% calibrated + 30% original for stability
  calibrated = (0.7 * calibrated) + (0.3 * rawConfidence);

  // Ensure confidence stays within valid range [0, 1]
  calibrated = Math.max(0, Math.min(1, calibrated));

  console.log('[CALIBRATION] ✅ Calibrated confidence:', {
    original: rawConfidence,
    calibrated,
    adjustment: calibrated - rawConfidence
  });

  return calibrated;
}

/**
 * Get comprehensive calibration report for monitoring
 * 
 * @returns Full calibration analysis including stats, trends, and confidence calibration
 */
export async function getCalibrationReport(): Promise<{
  overallStats: Awaited<ReturnType<typeof getCalibrationStats>>;
  recentTrends: Awaited<ReturnType<typeof getAccuracyTrends>>;
  confidenceCalibration: Awaited<ReturnType<typeof getConfidenceCalibration>>;
} | null> {
  try {
    console.log('[CALIBRATION] Generating comprehensive calibration report...');

    const [overallStats, recentTrends, confidenceCalibration] = await Promise.all([
      getCalibrationStats(),
      getAccuracyTrends(30),
      getConfidenceCalibration()
    ]);

    const report = {
      overallStats,
      recentTrends,
      confidenceCalibration
    };

    console.log('[CALIBRATION] ✅ Generated calibration report');
    return report;
  } catch (error) {
    console.error('[CALIBRATION] Exception generating calibration report:', error);
    return null;
  }
}

/**
 * Check if calibration data is sufficient for reliable adjustments
 * 
 * @param minSamples - Minimum number of samples needed (default: 10)
 * @returns Whether calibration is reliable
 */
export async function isCalibrationReliable(minSamples: number = 10): Promise<boolean> {
  const stats = await getCalibrationStats();
  
  if (!stats) {
    console.log('[CALIBRATION] No calibration data available');
    return false;
  }

  const isReliable = stats.totalTracked >= minSamples;
  console.log('[CALIBRATION] Calibration reliability:', {
    totalTracked: stats.totalTracked,
    minRequired: minSamples,
    isReliable
  });

  return isReliable;
}


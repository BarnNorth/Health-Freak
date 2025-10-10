import { supabase } from '@/lib/supabase';
import { trackClassification } from './calibration';

/**
 * Submit user feedback for an ingredient classification
 * 
 * @param ingredientName - The name of the ingredient
 * @param aiClassification - The AI's classification (generally_clean or potentially_toxic)
 * @param userFeedback - User's feedback (correct, should_be_clean, or should_be_toxic)
 * @param aiConfidence - AI's confidence score for calibration tracking
 * @param productName - Optional product name for context
 */
export async function submitIngredientFeedback(
  ingredientName: string,
  aiClassification: 'generally_clean' | 'potentially_toxic',
  userFeedback: 'correct' | 'should_be_clean' | 'should_be_toxic',
  aiConfidence: number = 0.5,
  productName?: string
): Promise<void> {
  try {
    console.log('📊 Submitting ingredient feedback:', {
      ingredientName,
      aiClassification,
      userFeedback,
      aiConfidence,
      productName
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('❌ Error getting user:', userError);
      throw new Error('User not authenticated');
    }
    
    if (!user) {
      console.error('❌ No user found');
      throw new Error('User not authenticated');
    }

    // Insert feedback into database
    const { error } = await supabase.from('ingredient_feedback').insert({
      user_id: user.id,
      ingredient_name: ingredientName.toLowerCase().trim(),
      ai_classification: aiClassification,
      user_classification: userFeedback,
      product_name: productName || null
    });

    if (error) {
      console.error('❌ Error inserting feedback:', error);
      throw error;
    }

    console.log('✅ Feedback submitted successfully');

    // Track classification for calibration
    const wasCorrect = userFeedback === 'correct';
    console.log('📊 Tracking for calibration:', { wasCorrect, aiConfidence });
    
    await trackClassification(
      ingredientName,
      aiClassification,
      aiConfidence,
      wasCorrect
    );
    
  } catch (error) {
    console.error('❌ Failed to submit feedback:', error);
    throw error;
  }
}

/**
 * Get accuracy statistics for a specific ingredient based on user feedback
 * 
 * @param ingredientName - The name of the ingredient to check
 * @returns Object with accuracy percentage and total feedback count, or null if no feedback
 */
export async function getIngredientAccuracy(
  ingredientName: string
): Promise<{ accuracy: number; totalFeedback: number } | null> {
  try {
    console.log('📊 Fetching ingredient accuracy for:', ingredientName);

    // Fetch all feedback for this ingredient
    const { data, error } = await supabase
      .from('ingredient_feedback')
      .select('user_classification')
      .eq('ingredient_name', ingredientName.toLowerCase().trim());

    if (error) {
      console.error('❌ Error fetching ingredient accuracy:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('ℹ️ No feedback found for ingredient:', ingredientName);
      return null;
    }

    // Calculate accuracy (percentage of users who marked as 'correct')
    const correctFeedback = data.filter(f => f.user_classification === 'correct').length;
    const totalFeedback = data.length;
    const accuracy = Math.round((correctFeedback / totalFeedback) * 100);

    console.log('✅ Ingredient accuracy calculated:', {
      ingredientName,
      accuracy,
      totalFeedback,
      correctFeedback
    });

    return {
      accuracy,
      totalFeedback
    };
  } catch (error) {
    console.error('❌ Failed to get ingredient accuracy:', error);
    return null;
  }
}

/**
 * Get feedback statistics for multiple ingredients at once
 * 
 * @param ingredientNames - Array of ingredient names
 * @returns Map of ingredient names to their accuracy statistics
 */
export async function getBatchIngredientAccuracy(
  ingredientNames: string[]
): Promise<Map<string, { accuracy: number; totalFeedback: number }>> {
  try {
    console.log('📊 Fetching batch ingredient accuracy for:', ingredientNames.length, 'ingredients');

    const normalizedNames = ingredientNames.map(name => name.toLowerCase().trim());

    // Fetch all feedback for these ingredients
    const { data, error } = await supabase
      .from('ingredient_feedback')
      .select('ingredient_name, user_classification')
      .in('ingredient_name', normalizedNames);

    if (error) {
      console.error('❌ Error fetching batch ingredient accuracy:', error);
      throw error;
    }

    const accuracyMap = new Map<string, { accuracy: number; totalFeedback: number }>();

    if (!data || data.length === 0) {
      console.log('ℹ️ No feedback found for any ingredients');
      return accuracyMap;
    }

    // Group feedback by ingredient and calculate accuracy
    const feedbackByIngredient = new Map<string, string[]>();
    
    data.forEach(item => {
      if (!feedbackByIngredient.has(item.ingredient_name)) {
        feedbackByIngredient.set(item.ingredient_name, []);
      }
      feedbackByIngredient.get(item.ingredient_name)!.push(item.user_classification);
    });

    // Calculate accuracy for each ingredient
    feedbackByIngredient.forEach((classifications, ingredientName) => {
      const correctFeedback = classifications.filter(c => c === 'correct').length;
      const totalFeedback = classifications.length;
      const accuracy = Math.round((correctFeedback / totalFeedback) * 100);

      accuracyMap.set(ingredientName, {
        accuracy,
        totalFeedback
      });
    });

    console.log('✅ Batch ingredient accuracy calculated:', {
      totalIngredients: ingredientNames.length,
      ingredientsWithFeedback: accuracyMap.size
    });

    return accuracyMap;
  } catch (error) {
    console.error('❌ Failed to get batch ingredient accuracy:', error);
    return new Map();
  }
}

/**
 * Check if user has already submitted feedback for a specific ingredient in this session
 * 
 * @param ingredientName - The name of the ingredient
 * @returns True if user has already submitted feedback, false otherwise
 */
export async function hasUserFeedbackForIngredient(
  ingredientName: string
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('ingredient_feedback')
      .select('id')
      .eq('ingredient_name', ingredientName.toLowerCase().trim())
      .eq('user_id', user.id)
      .limit(1);

    if (error) {
      console.error('❌ Error checking user feedback:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('❌ Failed to check user feedback:', error);
    return false;
  }
}


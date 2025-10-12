import { supabase, User, IngredientCache, AnalysisHistory, Scan } from './supabase';

// User management functions
export async function createUserProfile(userId: string, email: string): Promise<User | null> {
  try {
    console.log('👤 Creating user profile for:', userId, email);
    
    // Check current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('🔐 Current session for profile creation:', session?.user?.id);
    console.log('🔐 Session error:', sessionError);
    
    if (!session) {
      console.error('❌ No active session found for profile creation');
      return null;
    }
    
    if (session.user.id !== userId) {
      console.error('❌ Session user ID does not match provided user ID for profile creation');
      return null;
    }
    
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        subscription_status: 'free',
        total_scans_used: 0,
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate key error gracefully
      if (error.code === '23505') {
        console.log('✅ User profile already exists, fetching existing profile');
        return await getUserProfile(userId);
      }
      console.error('❌ Error creating user profile:', error);
      return null;
    }

    console.log('✅ User profile created successfully:', data);
    return data;
  } catch (error) {
    console.error('💥 Exception creating user profile:', error);
    return null;
  }
}

export async function getUserProfile(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .maybeSingle(); // Use maybeSingle() to handle cases where user doesn't exist

    if (error) {
      console.error('Error updating user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return null;
  }
}

export async function acceptTerms(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ terms_accepted: true })
      .eq('id', userId);

    if (error) {
      console.error('Error accepting terms:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error accepting terms:', error);
    return false;
  }
}

// Ingredient cache functions with expiration support
export async function getIngredientInfo(ingredientName: string): Promise<IngredientCache | null> {
  try {
    console.log('[DATABASE] Fetching ingredient info:', ingredientName);
    
    // Use the database function to get only fresh (non-expired) ingredients
    const { data, error } = await supabase
      .rpc('get_fresh_ingredient', { ingredient_name_param: ingredientName.toLowerCase().trim() })
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - ingredient not in cache or expired
        console.log('[DATABASE] Ingredient not found or expired:', ingredientName);
        return null;
      }
      console.error('[DATABASE] Error fetching ingredient info:', error);
      return null;
    }

    if (!data) {
      console.log('[DATABASE] Ingredient not found in cache:', ingredientName);
      return null;
    }

    console.log('[DATABASE] Found fresh ingredient in cache:', {
      name: data.ingredient_name,
      expires_at: data.expires_at
    });
    
    return data;
  } catch (error) {
    console.error('[DATABASE] Exception fetching ingredient info:', error);
    return null;
  }
}

/**
 * Get multiple ingredients from cache in a single query (batch operation)
 */
export async function getIngredientsBatch(ingredientNames: string[]): Promise<Map<string, IngredientCache>> {
  try {
    console.log('[DATABASE] Fetching batch ingredients:', ingredientNames.length);
    
    const { data, error } = await supabase
      .rpc('get_fresh_ingredients_batch', { 
        ingredient_names: ingredientNames.map(name => name.toLowerCase().trim()) 
      });

    if (error) {
      console.error('[DATABASE] Error fetching batch ingredients:', error);
      return new Map();
    }

    // Convert array to map for easy lookup
    const resultMap = new Map<string, IngredientCache>();
    if (data) {
      data.forEach((ingredient: IngredientCache) => {
        resultMap.set(ingredient.ingredient_name.toLowerCase(), ingredient);
      });
    }

    console.log('[DATABASE] Batch fetch completed:', {
      requested: ingredientNames.length,
      found: resultMap.size
    });

    return resultMap;
  } catch (error) {
    console.error('[DATABASE] Exception fetching batch ingredients:', error);
    return new Map();
  }
}

export async function cacheIngredientInfo(
  ingredientName: string,
  status: 'generally_clean' | 'potentially_toxic',
  educationalNote: string,
  expiryDays: number = 180
): Promise<IngredientCache | null> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);
    
    console.log('[DATABASE] Caching ingredient with expiration:', {
      ingredient: ingredientName,
      expiryDays,
      expiresAt: expiresAt.toISOString()
    });
    
    const { data, error } = await supabase
      .from('ingredients_cache')
      .upsert({
        ingredient_name: ingredientName.toLowerCase().trim(),
        status,
        educational_note: educationalNote,
        basic_note: getBasicNoteForCache(status),
        cached_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'ingredient_name'
      })
      .select()
      .single();

    if (error) {
      // Log the error but don't throw - caching is not critical for app functionality
      console.warn('[DATABASE] Could not cache ingredient info (this is not critical):', error.message);
      return null;
    }

    console.log('[DATABASE] Successfully cached ingredient:', data?.ingredient_name);
    return data;
  } catch (error) {
    // Log the error but don't throw - caching is not critical for app functionality
    console.warn('[DATABASE] Could not cache ingredient info (this is not critical):', error);
    return null;
  }
}

/**
 * Get ingredients that are expiring soon (for background refresh)
 */
export async function getExpiringIngredients(daysUntilExpiry: number = 30): Promise<Array<{
  ingredient_name: string;
  status: string;
  days_until_expiry: number;
}>> {
  try {
    console.log('[DATABASE] Fetching ingredients expiring within', daysUntilExpiry, 'days');
    
    const { data, error } = await supabase
      .rpc('get_expiring_ingredients', { expiry_threshold_days: daysUntilExpiry });

    if (error) {
      console.error('[DATABASE] Error getting expiring ingredients:', error);
      return [];
    }

    console.log('[DATABASE] Found', data?.length || 0, 'ingredients expiring soon');
    return data || [];
  } catch (error) {
    console.error('[DATABASE] Exception getting expiring ingredients:', error);
    return [];
  }
}



/**
 * Helper function to generate basic note for caching
 */
function getBasicNoteForCache(status: 'generally_clean' | 'potentially_toxic'): string {
  if (status === 'generally_clean') {
    return 'Generally recognized as safe for consumption';
  } else {
    return 'May contain concerning compounds - upgrade for detailed explanation';
  }
}


// Analysis history functions
// Note: Only Premium users have their history saved
// Free tier users (5 scans) do NOT save history - they only get real-time analysis
export async function saveAnalysis(
  userId: string,
  extractedText: string,
  results: any
): Promise<AnalysisHistory | null> {
  try {
    console.log('💾 Saving analysis for user:', userId);
    console.log('📝 Extracted text length:', extractedText.length);
    console.log('📊 Results:', results);
    
    // Check current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('🔐 Current session:', session?.user?.id);
    console.log('🔐 Session error:', sessionError);
    
    if (!session) {
      console.error('❌ No active session found');
      return null;
    }
    
    if (session.user.id !== userId) {
      console.error('❌ Session user ID does not match provided user ID');
      return null;
    }
    
    const { data, error } = await supabase
      .from('analyses_history')
      .insert({
        user_id: userId,
        extracted_text: extractedText,
        results_json: results,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving analysis:', error);
      return null;
    }

    console.log('✅ Analysis saved successfully:', data);
    return data;
  } catch (error) {
    console.error('💥 Exception saving analysis:', error);
    return null;
  }
}

export async function getUserAnalyses(userId: string): Promise<AnalysisHistory[]> {
  try {
    console.log('📚 Fetching analyses for user:', userId);
    
    // Get user profile to check subscription status
    // Note: Free tier users don't save history, so this will always return empty for them
    const user = await getUserProfile(userId);
    const limit = user?.subscription_status === 'premium' ? undefined : 10;
    
    console.log('👤 User subscription status:', user?.subscription_status);
    console.log('📊 Limit for analyses:', limit);
    
    let query = supabase
      .from('analyses_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // Apply limit for free users
    if (limit) {
      query = query.limit(limit);
    }
    
    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching user analyses:', error);
      return [];
    }

    console.log('📚 Found analyses:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('💥 Exception fetching user analyses:', error);
    return [];
  }
}

export async function deleteAnalysis(userId: string, analysisId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('analyses_history')
      .delete()
      .eq('id', analysisId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting analysis:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting analysis:', error);
    return false;
  }
}

// Scan management functions for Premium users
export async function addUserScan(
  userId: string,
  productName: string,
  result: any,
  barcode?: string
): Promise<Scan | null> {
  try {
    console.log('💾 Adding scan for user:', userId);
    
    const { data, error } = await supabase
      .rpc('add_user_scan', {
        user_uuid: userId,
        p_product_name: productName,
        p_result: result,
        p_barcode: barcode
      });

    if (error) {
      console.error('❌ Error adding scan:', error);
      return null;
    }

    console.log('✅ Scan added successfully:', data);
    return data;
  } catch (error) {
    console.error('💥 Exception adding scan:', error);
    return null;
  }
}

export async function getUserScans(userId: string): Promise<Scan[]> {
  try {
    console.log('📚 Fetching scans for user:', userId);
    
    const { data, error } = await supabase
      .from('user_scan_history')
      .select('*');

    if (error) {
      console.error('[DATABASE] Error fetching user scans:', error);
      return [];
    }

    console.log('[DATABASE] Found', data?.length || 0, 'scans for user');
    return data || [];
  } catch (error) {
    console.error('[DATABASE] Exception fetching user scans:', error);
    return [];
  }
}

// Usage tracking functions
// Note: This tracks scans for ALL users (both Free and Premium)
// Free tier: Limited to 5 scans total
// Premium tier: Unlimited scans
export async function incrementAnalysisCount(userId: string): Promise<boolean> {
  try {
    // Get current count first, then increment
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('total_scans_used')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching current analysis count:', fetchError);
      return false;
    }

    const newCount = (user?.total_scans_used || 0) + 1;

    const { error } = await supabase
      .from('users')
      .update({ 
        total_scans_used: newCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('Error incrementing analysis count:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error incrementing analysis count:', error);
    return false;
  }
}

export async function checkUserLimits(userId: string): Promise<{
  canAnalyze: boolean;
  totalUsed: number;
  subscriptionStatus: string;
  remaining: number;
}> {
  try {
    console.log('[LIMITS] Checking scan limits for user:', userId);
    
    // Call the database function to get user analysis stats
    const { data, error } = await supabase
      .rpc('get_user_analysis_stats', { user_id: userId })
      .single();

    if (error) {
      console.error('[LIMITS] Error checking user limits:', error);
      // Default to allowing analysis on error
      return { canAnalyze: true, totalUsed: 0, subscriptionStatus: 'free', remaining: 5 };
    }

    const result = {
      canAnalyze: data.can_analyze,
      totalUsed: data.total_used,
      subscriptionStatus: data.subscription_status,
      remaining: data.subscription_status === 'premium' ? 999 : Math.max(0, 5 - data.total_used)
    };

    console.log('[LIMITS] Scan limit check result:', result);
    return result;
  } catch (error) {
    console.error('[LIMITS] Exception checking user limits:', error);
    // Default to allowing analysis on exception
    return { canAnalyze: true, totalUsed: 0, subscriptionStatus: 'free', remaining: 5 };
  }
}

// Database connection test
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  tablesExist: boolean;
  sampleDataExists: boolean;
  error?: string;
}> {
  try {
    // Test basic connection
    const { data: connectionTest, error: connectionError } = await supabase
      .from('ingredients_cache')
      .select('count')
      .limit(1);

    if (connectionError) {
      return {
        connected: false,
        tablesExist: false,
        sampleDataExists: false,
        error: connectionError.message,
      };
    }

    // Test if sample data exists
    const { data: sampleData, error: sampleError } = await supabase
      .from('ingredients_cache')
      .select('ingredient_name')
      .eq('ingredient_name', 'organic cane sugar')
      .single();

    return {
      connected: true,
      tablesExist: true,
      sampleDataExists: !!sampleData && !sampleError,
    };
  } catch (error) {
    return {
      connected: false,
      tablesExist: false,
      sampleDataExists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
import { supabase, User, IngredientCache, AnalysisHistory } from './supabase';

/**
 * Determine which payment method a user is using
 * @param user - User object from database
 * @returns 'apple' | 'none'
 */
export function getPaymentMethod(user: User): 'apple' | 'none' {
  if (user.subscription_status !== 'premium') return 'none';
  
  // Check explicit payment_method field (set by webhooks)
  if (user.payment_method === 'apple_iap') {
    return 'apple';
  }
  
  // Legacy Stripe users will have payment_method='stripe' but we don't support Stripe anymore
  // Return 'none' to prevent routing to Apple cancellation flow for legacy users
  return 'none';
}

// User management functions
export async function createUserProfile(userId: string, email: string): Promise<User | null> {
  try {
    console.log('👤 Creating user profile for:', userId, email);
    
    // Check current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('🔐 Current session for profile creation:', session?.user?.id);
    
    if (sessionError) {
      console.error('❌ Session error:', sessionError.message);
    }
    
    if (!session) {
      console.error('❌ Cannot create profile without active session');
      return null;
    }
    
    if (session.user.id !== userId) {
      console.error('❌ Session user ID does not match provided user ID');
      console.error(`   Session ID: ${session.user.id}, Provided ID: ${userId}`);
      return null;
    }
    
    console.log('[DATABASE] Inserting new user profile...');
    const insertStart = Date.now();
    
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        subscription_status: 'free',
        total_scans_used: 0,
        onboarding_completed: false,
      })
      .select()
      .single();
    
    const insertTime = Date.now() - insertStart;
    console.log(`[DATABASE] Insert query completed in ${insertTime}ms`);

    if (error) {
      // Handle duplicate key error gracefully (profile already exists)
      if (error.code === '23505') {
        console.log('✅ Profile already exists (likely created by another process)');
        try {
          const existingProfile = await getUserProfile(userId);
          if (existingProfile) {
            console.log('✅ Successfully fetched existing profile:', existingProfile.email);
            return existingProfile;
          } else {
            console.error('❌ Failed to fetch existing profile after duplicate key error');
            return null;
          }
        } catch (fetchError: any) {
          console.error('❌ Exception fetching existing profile:', fetchError?.message || fetchError);
          return null;
        }
      }
      
      // Log detailed error information for other errors
      console.error('❌ Error creating user profile');
      console.error(`   Error code: ${error.code || 'unknown'}`);
      console.error(`   Error message: ${error.message || 'unknown'}`);
      console.error(`   Error details:`, error.details || 'none');
      return null;
    }

    console.log('✅ User profile created successfully:', data);
    return data;
  } catch (error: any) {
    console.error('💥 Exception creating user profile');
    console.error(`   Exception message: ${error?.message || 'unknown'}`);
    console.error(`   Exception type: ${error?.constructor?.name || 'unknown'}`);
    return null;
  }
}

export async function getUserProfile(userId: string): Promise<User | null> {
  try {
    console.log('[DATABASE] Fetching user profile for:', userId);
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

    const queryTime = Date.now() - startTime;
    console.log(`[DATABASE] getUserProfile query completed in ${queryTime}ms`);

    if (error) {
      console.error('[DATABASE] Error fetching user profile:', error);
      console.error('[DATABASE] Error code:', error.code);
      console.error('[DATABASE] Error message:', error.message);
      return null;
    }

    console.log('[DATABASE] Profile fetch result:', data ? 'Found' : 'Not found');
    return data;
  } catch (error: any) {
    console.error('[DATABASE] Exception fetching user profile:', error?.message || error);
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

    // Type assertion for RPC response
    const ingredientData = data as IngredientCache;

    console.log('[DATABASE] Found fresh ingredient in cache:', {
      name: ingredientData.ingredient_name,
      expires_at: ingredientData.expires_at
    });
    
    return ingredientData;
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
// Note: All users have their history saved
// Free tier users: 10 scans with full features including saved history
// Premium users: Unlimited scans with saved history
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

// Usage tracking functions
// Note: This tracks scans for ALL users (both Free and Premium)
// Free tier: Limited to 10 scans total with full premium features
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

// Constants for limits
const FREE_TIER_SCAN_LIMIT = 10;
const PREMIUM_TIER_SCAN_LIMIT = 999;

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
      .maybeSingle();

    if (error) {
      console.error('[LIMITS] Error checking user limits:', error);
      // Default to allowing analysis on error
      return { 
        canAnalyze: true, 
        totalUsed: 0, 
        subscriptionStatus: 'free', 
        remaining: FREE_TIER_SCAN_LIMIT 
      };
    }

    // If no data returned (new user or profile not ready), default to free tier
    if (!data) {
      console.log('[LIMITS] No profile data found, defaulting to free tier');
      return {
        canAnalyze: true,
        totalUsed: 0,
        subscriptionStatus: 'free',
        remaining: FREE_TIER_SCAN_LIMIT
      };
    }

    // Type-safe data extraction with proper defaults
    const typedData = data as {
      can_analyze: boolean;
      total_used: number;
      subscription_status: string;
    };

    const canAnalyze = typedData.can_analyze ?? true;
    const totalUsed = typedData.total_used ?? 0;
    const subscriptionStatus = typedData.subscription_status ?? 'free';
    const remaining = subscriptionStatus === 'premium'
      ? PREMIUM_TIER_SCAN_LIMIT
      : Math.max(0, FREE_TIER_SCAN_LIMIT - totalUsed);

    const result = {
      canAnalyze,
      totalUsed,
      subscriptionStatus,
      remaining
    };

    console.log('[LIMITS] Scan limit check result:', result);
    return result;
  } catch (error) {
    console.error('[LIMITS] Exception checking user limits:', error);
    // Default to allowing analysis on exception
    return { 
      canAnalyze: true, 
      totalUsed: 0, 
      subscriptionStatus: 'free', 
      remaining: FREE_TIER_SCAN_LIMIT 
    };
  }
}

// Database connection test
export async function markOnboardingComplete(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', userId);
      
    if (error) {
      console.error('Error marking onboarding complete:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error marking onboarding complete:', error);
    throw error;
  }
}

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
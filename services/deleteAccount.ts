import { supabase } from '@/lib/supabase';

/**
 * Deletes a user account and all associated data
 * 
 * This function:
 * - Cancels any active Stripe subscriptions
 * - Deletes Stripe customer records
 * - Deletes all user data from database tables
 * - Deletes the auth user account
 * 
 * Note: Apple IAP subscriptions are handled automatically by RevenueCat
 * 
 * @param userId - The ID of the user account to delete
 * @throws {Error} If deletion fails or user is not authenticated
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  try {
    console.log('🗑️ [Delete Account] Starting deletion for user:', userId);

    // Get current session, refresh if needed
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('🔄 [Delete Account] Refreshing session...');
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
      
      if (!session) {
        throw new Error('Authentication session expired. Please sign in again.');
      }
    }

    // Call the delete-user Edge Function
    const { data, error } = await supabase.functions.invoke('delete-user', {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) {
      console.error('❌ [Delete Account] Error:', error);
      throw new Error(error.message || 'Failed to delete account');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Account deletion failed');
    }

    console.log('✅ [Delete Account] Successfully deleted');
  } catch (error: any) {
    console.error('💥 [Delete Account] Error:', error);
    throw error;
  }
}



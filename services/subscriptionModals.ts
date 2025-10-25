import { supabase } from '@/lib/supabase';
import { Alert } from 'react-native';

interface CancelSubscriptionResponse {
  success: boolean;
  subscription_id: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  cancelled_immediately: boolean;
}

export async function cancelSubscription(instant: boolean = false): Promise<CancelSubscriptionResponse> {
  try {
    // Check if user is authenticated and refresh if needed
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      // Try to refresh the session
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshedSession) {
        throw new Error('User not authenticated and session refresh failed');
      }
      
      // Use the refreshed session
      if (!refreshedSession?.access_token) {
        throw new Error('No valid session token found');
      }
      
      // Use refreshedSession for the API call
      const { data, error} = await supabase.functions.invoke('stripe-cancel-subscription', {
        body: { instant: instant && __DEV__ }, // Only allow instant in DEV mode
        headers: {
          'Authorization': `Bearer ${refreshedSession.access_token}`
        }
      });
      
      if (error) {
        throw error;
      }
      
      return data as CancelSubscriptionResponse;
    }
    
    // Use the original session
    if (!session?.access_token) {
      throw new Error('No valid session token found');
    }
    
    const { data, error} = await supabase.functions.invoke('stripe-cancel-subscription', {
      body: { instant: instant && __DEV__ }, // Only allow instant in DEV mode
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (error) {
      throw error;
    }

    return data as CancelSubscriptionResponse;
  } catch (error: any) {
    throw error;
  }
}

export async function showCancelSubscriptionPrompt(): Promise<void> {
  Alert.alert(
    'Cancel Subscription',
    'Are you sure you want to cancel your premium subscription?',
    [
      { text: 'Keep Subscription', style: 'cancel' },
      { 
        text: 'Cancel Subscription', 
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await cancelSubscription();
            
            // Show different messages based on cancellation mode
            if (result.cancelled_immediately) {
              Alert.alert(
                'Subscription Cancelled',
                'Your subscription has been cancelled immediately. You will lose premium access right away.\n\nNote: This is test mode behavior. In production, you would retain access until the end of your billing period.',
                [{ text: 'OK' }]
              );
            } else {
              const endDate = new Date(result.current_period_end * 1000).toLocaleDateString();
              Alert.alert(
                'Subscription Cancelled',
                `Your subscription has been cancelled. You will retain premium access until ${endDate}.`,
                [{ text: 'OK' }]
              );
            }
          } catch (error) {
            Alert.alert(
              'Cancellation Failed',
              'Unable to cancel your subscription. Please try again or contact support.',
              [{ text: 'OK' }]
            );
          }
        }
      }
    ]
  );
}

export async function showPremiumUpgradePrompt(): Promise<void> {
  Alert.alert(
    'Upgrade to Premium',
    'Get unlimited scans and automatic scan history tracking.\n\n• ♾️ Unlimited ingredient scans\n• 💾 Scan history saved automatically\n• 🔍 Search and filter features\n\n$10/month',
    [
      { text: 'Maybe Later', style: 'cancel' },
      { 
        text: 'Upgrade to Premium - $10/month', 
        onPress: async () => {
          try {
            const { startPremiumSubscription } = require('./stripe');
            await startPremiumSubscription();
          } catch (error) {
            // Handle subscription start error
          }
        }
      }
    ]
  );
}

export async function showScanLimitReachedModal(): Promise<void> {
  Alert.alert(
    'You\'ve Used All 10 Free Scans',
    'You\'ve used your 10 free scans with full ingredient analysis.\n\nUpgrade to Premium for unlimited scanning and automatic scan history.\n\n• ♾️ Unlimited scans forever\n• 💾 Scan history saved automatically\n• 🔍 Search and export features\n\n$10/month',
    [
      { text: 'Learn More', style: 'default', onPress: () => {
        // Navigate to profile/upgrade section
        const { router } = require('expo-router');
        router.push('/profile');
      }},
      { 
        text: 'Upgrade to Premium - $10/month', 
        onPress: async () => {
          try {
            const { startPremiumSubscription } = require('./stripe');
            await startPremiumSubscription();
          } catch (error) {
            // Handle subscription start error
          }
        }
      }
    ]
  );
}

export function getIngredientCounts(results: any) {
  if (!results || !results.ingredients) {
    return { cleanCount: 0, toxicCount: 0, overallVerdict: 'UNKNOWN' };
  }
  
  const cleanCount = results.ingredients.filter((i: any) => i.status === 'generally_clean').length;
  const toxicCount = results.ingredients.filter((i: any) => i.status === 'potentially_toxic').length;
  const overallVerdict = results.overallVerdict || (toxicCount > 0 ? 'TOXIC' : 'CLEAN');
  
  return { cleanCount, toxicCount, overallVerdict };
}
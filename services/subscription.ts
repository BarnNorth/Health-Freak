import { supabase } from '@/lib/supabase';
import { Alert } from 'react-native';

export async function cancelSubscription(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-cancel-subscription', {
      body: {},
    });

    if (error) {
      console.error('❌ Error cancelling subscription:', error);
      throw error;
    }

    return true;
  } catch (error: any) {
    console.error('❌ Failed to cancel subscription:', error);
    throw error;
  }
}

export async function showCancelSubscriptionPrompt(): Promise<void> {
  Alert.alert(
    'Cancel Subscription',
    'Are you sure you want to cancel your premium subscription? You will lose access to premium features immediately (testing mode).',
    [
      { text: 'Keep Subscription', style: 'cancel' },
      { 
        text: 'Cancel Subscription', 
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelSubscription();
            Alert.alert(
              'Subscription Cancelled',
              'Your subscription has been cancelled immediately. You will lose premium access right away (testing mode).',
              [{ text: 'OK' }]
            );
          } catch (error) {
            console.error('❌ Subscription cancellation failed:', error);
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
    'See exactly which ingredients are toxic and why. Get detailed explanations for every ingredient.\n\n$10/month',
    [
      { text: 'Maybe Later', style: 'cancel' },
      { 
        text: 'Upgrade Now', 
        onPress: () => {
          // Navigate to subscription/payment flow
          console.log('Navigate to subscription flow');
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
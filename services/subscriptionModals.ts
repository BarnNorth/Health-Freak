import { Alert, Platform } from 'react-native';

export async function showCancelSubscriptionPrompt(): Promise<void> {
  if (Platform.OS !== 'ios') {
    Alert.alert(
      'iOS Only',
      'Apple In-App Purchases are only available on iOS devices.',
      [{ text: 'OK' }]
    );
    return;
  }

  Alert.alert(
    'Cancel Subscription',
    'To cancel your Apple subscription:\n\n1. Open iPhone Settings\n2. Tap your name at the top\n3. Tap Subscriptions\n4. Tap Health Freak\n5. Tap Cancel Subscription',
    [{ text: 'OK' }]
  );
}

export async function showPremiumUpgradePrompt(): Promise<void> {
  if (Platform.OS !== 'ios') {
    Alert.alert(
      'iOS Only',
      'Apple In-App Purchases are only available on iOS devices.',
      [{ text: 'OK' }]
    );
    return;
  }

  Alert.alert(
    'Upgrade to Premium',
    'Get unlimited scans and automatic scan history tracking.\n\n• ♾️ Unlimited ingredient scans\n• 💾 Scan history saved automatically\n• 🔍 Search and filter features\n\n$4.99/month',
    [
      { text: 'Maybe Later', style: 'cancel' },
      { 
        text: 'Upgrade to Premium - $4.99/month', 
        onPress: async () => {
          try {
            const { purchasePremiumSubscription } = require('./revenueCat');
            await purchasePremiumSubscription();
          } catch (error) {
            // Handle subscription start error
          }
        }
      }
    ]
  );
}

export async function showScanLimitReachedModal(): Promise<void> {
  if (Platform.OS !== 'ios') {
    Alert.alert(
      'Scan Limit Reached',
      'You\'ve used all 10 free scans. Apple In-App Purchases are only available on iOS devices.',
      [{ text: 'OK' }]
    );
    return;
  }

  Alert.alert(
    'You\'ve Used All 10 Free Scans',
    'You\'ve used your 10 free scans with full ingredient analysis.\n\nUpgrade to Premium for unlimited scanning and automatic scan history.\n\n• ♾️ Unlimited scans forever\n• 💾 Scan history saved automatically\n• 🔍 Search and export features\n\n$4.99/month',
    [
      { text: 'Learn More', style: 'default', onPress: () => {
        // Navigate to profile/upgrade section
        const { router } = require('expo-router');
        router.push('/profile');
      }},
      { 
        text: 'Upgrade to Premium - $4.99/month', 
        onPress: async () => {
          try {
            const { purchasePremiumSubscription } = require('./revenueCat');
            await purchasePremiumSubscription();
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
/**
 * Deep Link Utilities
 * 
 * Handles deep linking to native platform settings and features.
 */

import { Linking, Alert, Platform } from 'react-native';
import { logDetailedError } from '@/services/errorHandling';

/**
 * Opens iPhone Settings app to Subscriptions page
 * Works on iOS 13+ with app-settings: URL scheme
 * 
 * @returns Promise<boolean> - true if deep link opened successfully, false otherwise
 */
export async function openAppleSubscriptions(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    console.warn('[DEEPLINKS] Apple Settings deep link only works on iOS');
    return false;
  }

  try {
    // iOS 13+ deep link to Subscriptions
    const url = 'app-settings:root=SUBSCRIPTIONS_AND_BILLING';
    const canOpen = await Linking.canOpenURL(url);
    
    if (canOpen) {
      await Linking.openURL(url);
      console.log('[DEEPLINKS] Successfully opened Apple Settings');
      return true;
    } else {
      // Fallback: Show manual instructions
      console.warn('[DEEPLINKS] Cannot open deep link, showing manual instructions');
      showAppleSubscriptionInstructions();
      return false;
    }
  } catch (error) {
    logDetailedError('DEEPLINKS', error);
    showAppleSubscriptionInstructions();
    return false;
  }
}

/**
 * Shows manual instructions for managing Apple subscriptions
 * Used as fallback when deep linking fails
 */
export function showAppleSubscriptionInstructions(): void {
  Alert.alert(
    'Manage Apple Subscription',
    'To manage your subscription:\n\n1. Open the Settings app\n2. Tap your Apple ID at the top\n3. Tap Subscriptions\n4. Find Health Freak\n5. Manage or cancel your subscription',
    [
      { text: 'Got It', style: 'default' }
    ]
  );
}


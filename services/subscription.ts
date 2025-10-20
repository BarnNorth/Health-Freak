/**
 * Unified Subscription Service
 * 
 * Provides a single interface for managing subscriptions across both Stripe and RevenueCat (Apple IAP).
 * This abstracts the complexity of dual payment systems behind a clean API.
 */

import { getUserProfile } from '@/lib/database';
import { startPremiumSubscription } from '@/services/stripe';
import { 
  purchasePremiumSubscription, 
  isPremiumActiveViaIAP, 
  getSubscriptionStatus 
} from '@/services/revenueCat';
import { cancelSubscription as cancelStripeSubscription } from '@/services/subscriptionModals';
import { logDetailedError, getUserFriendlyErrorMessage } from '@/services/errorHandling';

// ============================================
// TYPES & INTERFACES
// ============================================

/**
 * Unified subscription information regardless of payment method
 */
export interface SubscriptionInfo {
  isActive: boolean;
  paymentMethod: 'stripe' | 'apple_iap' | null;
  renewalDate: number | null; // timestamp
  cancelsAtPeriodEnd: boolean;
}

/**
 * Result of starting a subscription purchase
 */
export interface PurchaseResult {
  success: boolean;
  error?: string;
}

/**
 * Result of cancelling a subscription
 */
export interface CancellationResult {
  success: boolean;
  instructions?: string;
  error?: string;
}

// ============================================
// CACHE MANAGEMENT
// ============================================

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface StatusCache {
  isPremium: boolean;
  timestamp: number;
  userId: string;
}

let statusCache: StatusCache | null = null;

/**
 * Clear the premium status cache
 * Call this after purchases, cancellations, or other subscription changes
 */
export function clearSubscriptionCache(): void {
  statusCache = null;
  if (__DEV__) {
    console.log('🔄 [Subscription] Status cache cleared');
  }
}

/**
 * Check if cached status is still valid for the given user
 */
function isCacheValid(userId: string): boolean {
  if (!statusCache) return false;
  if (statusCache.userId !== userId) return false;
  
  const now = Date.now();
  const isValid = (now - statusCache.timestamp) < CACHE_DURATION_MS;
  
  if (__DEV__ && !isValid) {
    console.log('🔄 [Subscription] Cache expired for user:', userId);
  }
  
  return isValid;
}

// ============================================
// UNIFIED SUBSCRIPTION FUNCTIONS
// ============================================

/**
 * Check if user has an active premium subscription regardless of payment method
 * 
 * @param userId - The user's ID
 * @param forceRefresh - Skip cache and check fresh status
 * @returns Promise<boolean> - True if premium is active, false otherwise
 */
export async function isPremiumActive(userId: string, forceRefresh: boolean = false): Promise<boolean> {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(userId)) {
      if (__DEV__) {
        console.log('📋 [Subscription] Using cached premium status:', statusCache?.isPremium);
      }
      return statusCache!.isPremium;
    }

    if (__DEV__) {
      console.log('🔍 [Subscription] Checking premium status for user:', userId);
    }

    // Get user profile to determine payment method
    const user = await getUserProfile(userId);
    if (!user) {
      if (__DEV__) {
        console.log('❌ [Subscription] User profile not found');
      }
      return false;
    }

    let isPremium = false;

    // Check subscription status based on payment method
    if (user.payment_method === 'stripe') {
      // For Stripe: Check database subscription status
      isPremium = user.subscription_status === 'premium' && !!user.stripe_subscription_id;
      
      if (__DEV__) {
        console.log('💳 [Subscription] Stripe subscription check:', {
          subscription_status: user.subscription_status,
          has_stripe_id: !!user.stripe_subscription_id,
          is_premium: isPremium
        });
      }
    } else if (user.payment_method === 'apple_iap') {
      // For Apple IAP: Check RevenueCat status
      isPremium = await isPremiumActiveViaIAP(forceRefresh);
      
      if (__DEV__) {
        console.log('🍎 [Subscription] Apple IAP subscription check:', isPremium);
      }
    } else {
      // No payment method set - check if they have premium status anyway
      isPremium = user.subscription_status === 'premium';
      
      if (__DEV__) {
        console.log('❓ [Subscription] No payment method, checking subscription_status:', isPremium);
      }
    }

    // Update cache
    statusCache = {
      isPremium,
      timestamp: Date.now(),
      userId
    };

    if (__DEV__) {
      console.log('✅ [Subscription] Premium status determined:', isPremium);
    }

    return isPremium;

  } catch (error) {
    logDetailedError('Failed to check premium status', error);
    
    // Fail-safe: return false on error
    if (__DEV__) {
      console.log('⚠️ [Subscription] Error checking premium status, defaulting to false');
    }
    return false;
  }
}

/**
 * Get unified subscription information regardless of payment method
 * 
 * @param userId - The user's ID
 * @returns Promise<SubscriptionInfo | null> - Subscription details or null if no subscription
 */
export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo | null> {
  try {
    if (__DEV__) {
      console.log('📊 [Subscription] Getting subscription info for user:', userId);
    }

    // Get user profile to determine payment method
    const user = await getUserProfile(userId);
    if (!user) {
      if (__DEV__) {
        console.log('❌ [Subscription] User profile not found');
      }
      return null;
    }

    // Check if user has any subscription
    const isActive = await isPremiumActive(userId);
    if (!isActive) {
      if (__DEV__) {
        console.log('❌ [Subscription] No active subscription found');
      }
      return null;
    }

    let subscriptionInfo: SubscriptionInfo;

    if (user.payment_method === 'stripe') {
      // For Stripe: Get info from database
      subscriptionInfo = {
        isActive: true,
        paymentMethod: 'stripe',
        renewalDate: null, // TODO: Get from Stripe if needed
        cancelsAtPeriodEnd: false // TODO: Get from Stripe if needed
      };
      
      if (__DEV__) {
        console.log('💳 [Subscription] Stripe subscription info:', subscriptionInfo);
      }
    } else if (user.payment_method === 'apple_iap') {
      // For Apple IAP: Get info from RevenueCat
      const revenueCatStatus = await getSubscriptionStatus();
      
      subscriptionInfo = {
        isActive: revenueCatStatus?.isPremium || false,
        paymentMethod: 'apple_iap',
        renewalDate: revenueCatStatus?.expirationDate?.getTime() || null,
        cancelsAtPeriodEnd: revenueCatStatus ? !revenueCatStatus.willRenew : false
      };
      
      if (__DEV__) {
        console.log('🍎 [Subscription] Apple IAP subscription info:', subscriptionInfo);
      }
    } else {
      // Fallback for users with premium status but no payment method
      subscriptionInfo = {
        isActive: true,
        paymentMethod: null,
        renewalDate: null,
        cancelsAtPeriodEnd: false
      };
      
      if (__DEV__) {
        console.log('❓ [Subscription] Unknown payment method subscription info:', subscriptionInfo);
      }
    }

    return subscriptionInfo;

  } catch (error) {
    logDetailedError('Failed to get subscription info', error);
    return null;
  }
}

/**
 * Start a subscription purchase for the specified payment method
 * 
 * @param paymentMethod - Either 'stripe' or 'apple_iap'
 * @returns Promise<PurchaseResult> - Success status and optional error message
 */
export async function startSubscriptionPurchase(paymentMethod: 'stripe' | 'apple_iap'): Promise<PurchaseResult> {
  try {
    if (__DEV__) {
      console.log('🚀 [Subscription] Starting purchase with method:', paymentMethod);
    }

    if (paymentMethod === 'stripe') {
      // Route to Stripe
      await startPremiumSubscription();
      
      if (__DEV__) {
        console.log('✅ [Subscription] Stripe purchase initiated successfully');
      }
      
      return { success: true };
    } else if (paymentMethod === 'apple_iap') {
      // Route to RevenueCat
      const result = await purchasePremiumSubscription();
      
      if (result.success) {
        // Clear cache after successful purchase
        clearSubscriptionCache();
        
        if (__DEV__) {
          console.log('✅ [Subscription] Apple IAP purchase completed successfully');
        }
        
        return { success: true };
      } else {
        if (__DEV__) {
          console.log('❌ [Subscription] Apple IAP purchase failed:', result.error);
        }
        
        return { 
          success: false, 
          error: result.error || 'Purchase failed' 
        };
      }
    } else {
      const error = `Invalid payment method: ${paymentMethod}`;
      if (__DEV__) {
        console.log('❌ [Subscription]', error);
      }
      return { success: false, error };
    }

  } catch (error) {
    const errorMessage = getUserFriendlyErrorMessage(error);
    logDetailedError('Failed to start subscription purchase', error);
    
    if (__DEV__) {
      console.log('❌ [Subscription] Purchase failed:', errorMessage);
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Cancel a subscription based on the user's current payment method
 * 
 * @param userId - The user's ID
 * @returns Promise<CancellationResult> - Success status, instructions, and optional error
 */
export async function cancelSubscription(userId: string): Promise<CancellationResult> {
  try {
    if (__DEV__) {
      console.log('🛑 [Subscription] Cancelling subscription for user:', userId);
    }

    // Get user profile to determine payment method
    const user = await getUserProfile(userId);
    if (!user) {
      const error = 'User profile not found';
      if (__DEV__) {
        console.log('❌ [Subscription]', error);
      }
      return { success: false, error };
    }

    if (user.payment_method === 'stripe') {
      // Route to Stripe cancellation
      try {
        await cancelStripeSubscription();
        
        // Clear cache after successful cancellation
        clearSubscriptionCache();
        
        if (__DEV__) {
          console.log('✅ [Subscription] Stripe subscription cancelled successfully');
        }
        
        return { success: true };
      } catch (error) {
        const errorMessage = getUserFriendlyErrorMessage(error);
        logDetailedError('Failed to cancel Stripe subscription', error);
        
        if (__DEV__) {
          console.log('❌ [Subscription] Stripe cancellation failed:', errorMessage);
        }
        
        return { success: false, error: errorMessage };
      }
    } else if (user.payment_method === 'apple_iap') {
      // For Apple IAP: Provide instructions to cancel in iOS Settings
      const instructions = 'To cancel your Apple subscription, go to iPhone Settings → [Your Name] → Subscriptions → Health Freak → Cancel Subscription';
      
      if (__DEV__) {
        console.log('📱 [Subscription] Apple IAP cancellation instructions provided');
      }
      
      return { 
        success: true, 
        instructions 
      };
    } else {
      const error = 'No payment method found for cancellation';
      if (__DEV__) {
        console.log('❌ [Subscription]', error);
      }
      return { success: false, error };
    }

  } catch (error) {
    const errorMessage = getUserFriendlyErrorMessage(error);
    logDetailedError('Failed to cancel subscription', error);
    
    if (__DEV__) {
      console.log('❌ [Subscription] Cancellation failed:', errorMessage);
    }
    
    return { success: false, error: errorMessage };
  }
}

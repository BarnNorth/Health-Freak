/**
 * RevenueCat Service
 * Handles Apple in-app purchases for iOS subscriptions
 */

import Purchases, { 
  CustomerInfo, 
  PurchasesPackage,
  PurchasesOffering,
  LOG_LEVEL 
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { logDetailedError, getUserFriendlyErrorMessage } from './errorHandling';

// ============================================
// CONFIGURATION
// ============================================

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
const PREMIUM_ENTITLEMENT_ID = 'premium_access';
const PRODUCT_ID = 'com.healthfreak.premium_monthly';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// TYPES & INTERFACES
// ============================================

/**
 * Configuration state for RevenueCat
 */
export interface RevenueCatConfig {
  isConfigured: boolean;
  userId?: string;
  platform: string;
}

/**
 * Result of a purchase attempt
 */
export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}

/**
 * Result of restoring purchases
 */
export interface RestoreResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}

/**
 * Subscription status information
 */
export interface SubscriptionStatus {
  isPremium: boolean;
  expirationDate?: Date;
  productIdentifier?: string;
  willRenew?: boolean;
}

// ============================================
// STATE MANAGEMENT
// ============================================

let isConfigured = false;
let configuredUserId: string | undefined;

// Cache for premium status checks
interface StatusCache {
  status: boolean;
  timestamp: number;
}

let statusCache: StatusCache | null = null;

/**
 * Clear the premium status cache
 * Call this after purchases or restores
 */
function clearStatusCache(): void {
  statusCache = null;
  if (__DEV__) {
    console.log('🔄 [RevenueCat] Status cache cleared');
  }
}

/**
 * Check if cached status is still valid
 */
function isCacheValid(): boolean {
  if (!statusCache) return false;
  const now = Date.now();
  const isValid = (now - statusCache.timestamp) < CACHE_DURATION_MS;
  
  if (__DEV__ && !isValid) {
    console.log('⏰ [RevenueCat] Cache expired');
  }
  
  return isValid;
}

// ============================================
// CORE CONFIGURATION
// ============================================

/**
 * Configure and initialize RevenueCat SDK
 * 
 * @param userId - The user's unique identifier (Supabase UUID)
 * @returns Promise that resolves when configuration is complete
 */
export async function configureRevenueCat(userId: string): Promise<void> {
  try {
    // Check if already configured for this user
    if (isConfigured && configuredUserId === userId) {
      if (__DEV__) {
        console.log('✅ [RevenueCat] Already configured for user:', userId);
      }
      return;
    }

    // Validate API key
    if (!REVENUECAT_API_KEY) {
      throw new Error('RevenueCat API key not configured. Set EXPO_PUBLIC_REVENUECAT_API_KEY in .env');
    }

    // Only configure on iOS for now
    if (Platform.OS !== 'ios') {
      if (__DEV__) {
        console.log('ℹ️ [RevenueCat] Skipping configuration on non-iOS platform:', Platform.OS);
      }
      return;
    }

    if (__DEV__) {
      console.log('🔧 [RevenueCat] Configuring SDK for user:', userId);
      // Enable debug logs in development
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    // Configure Purchases SDK
    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId,
    });

    isConfigured = true;
    configuredUserId = userId;

    if (__DEV__) {
      console.log('✅ [RevenueCat] Configuration complete');
    }

    // Get initial customer info to verify setup
    const customerInfo = await Purchases.getCustomerInfo();
    if (__DEV__) {
      console.log('📊 [RevenueCat] Customer info loaded:', {
        userId: customerInfo.originalAppUserId,
        activeSubscriptions: customerInfo.activeSubscriptions,
        entitlements: Object.keys(customerInfo.entitlements.active),
      });
    }

  } catch (error) {
    logDetailedError('REVENUECAT_CONFIG', error);
    isConfigured = false;
    configuredUserId = undefined;
    throw new Error(getUserFriendlyErrorMessage(error));
  }
}

/**
 * Check if RevenueCat is properly configured
 * 
 * @returns True if SDK is configured and ready
 */
export function isRevenueCatConfigured(): boolean {
  return isConfigured && Platform.OS === 'ios';
}

/**
 * Get the current configuration state
 * 
 * @returns Current configuration information
 */
export function getRevenueCatConfig(): RevenueCatConfig {
  return {
    isConfigured,
    userId: configuredUserId,
    platform: Platform.OS,
  };
}

// ============================================
// PURCHASE FUNCTIONS
// ============================================

/**
 * Purchase the premium monthly subscription
 * 
 * @returns Result indicating success or failure with details
 */
export async function purchasePremiumSubscription(): Promise<PurchaseResult> {
  try {
    if (!isRevenueCatConfigured()) {
      return {
        success: false,
        error: 'RevenueCat is not configured. Please try restarting the app.',
      };
    }

    if (__DEV__) {
      console.log('🛒 [RevenueCat] Starting purchase flow for:', PRODUCT_ID);
    }

    // Get available offerings
    const offerings = await Purchases.getOfferings();
    
    if (!offerings.current) {
      return {
        success: false,
        error: 'No subscription offerings available. Please try again later.',
      };
    }

    // Find the premium monthly package
    const monthlyPackage = offerings.current.availablePackages.find(
      pkg => pkg.product.identifier === PRODUCT_ID
    );

    if (!monthlyPackage) {
      if (__DEV__) {
        console.log('📦 [RevenueCat] Available packages:', 
          offerings.current.availablePackages.map(p => p.product.identifier)
        );
      }
      return {
        success: false,
        error: 'Premium subscription not available. Please contact support.',
      };
    }

    // Make the purchase
    const { customerInfo } = await Purchases.purchasePackage(monthlyPackage);

    // Clear cache after successful purchase
    clearStatusCache();

    if (__DEV__) {
      console.log('✅ [RevenueCat] Purchase successful');
      console.log('📊 [RevenueCat] Updated entitlements:', 
        Object.keys(customerInfo.entitlements.active)
      );
    }

    return {
      success: true,
      customerInfo,
    };

  } catch (error: any) {
    // Check if user cancelled
    if (error.userCancelled) {
      if (__DEV__) {
        console.log('❌ [RevenueCat] Purchase cancelled by user');
      }
      return {
        success: false,
        userCancelled: true,
        error: 'Purchase cancelled',
      };
    }

    logDetailedError('REVENUECAT_PURCHASE', error);
    
    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to complete purchase. Please try again.',
    };
  }
}

/**
 * Restore previous purchases
 * Useful when user reinstalls app or signs in on new device
 * 
 * @returns Result indicating what was restored
 */
export async function restorePurchases(): Promise<RestoreResult> {
  try {
    if (!isRevenueCatConfigured()) {
      return {
        success: false,
        error: 'RevenueCat is not configured. Please try restarting the app.',
      };
    }

    if (__DEV__) {
      console.log('🔄 [RevenueCat] Restoring purchases...');
    }

    const customerInfo = await Purchases.restorePurchases();

    // Clear cache after restore
    clearStatusCache();

    const hasActivePremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;

    if (__DEV__) {
      console.log('✅ [RevenueCat] Restore complete');
      console.log('📊 [RevenueCat] Active entitlements:', 
        Object.keys(customerInfo.entitlements.active)
      );
    }

    return {
      success: true,
      customerInfo,
    };

  } catch (error) {
    logDetailedError('REVENUECAT_RESTORE', error);
    
    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to restore purchases. Please try again.',
    };
  }
}

/**
 * Get current customer information from RevenueCat
 * Includes subscription status, entitlements, and more
 * 
 * @returns Customer info or null if not available
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    if (!isRevenueCatConfigured()) {
      if (__DEV__) {
        console.log('⚠️ [RevenueCat] Cannot get customer info - not configured');
      }
      return null;
    }

    const customerInfo = await Purchases.getCustomerInfo();
    
    if (__DEV__) {
      console.log('📊 [RevenueCat] Customer info retrieved:', {
        userId: customerInfo.originalAppUserId,
        activeSubscriptions: customerInfo.activeSubscriptions,
        entitlements: Object.keys(customerInfo.entitlements.active),
      });
    }

    return customerInfo;

  } catch (error) {
    logDetailedError('REVENUECAT_CUSTOMER_INFO', error);
    return null;
  }
}

// ============================================
// SUBSCRIPTION STATUS
// ============================================

/**
 * Check if user has active premium subscription via Apple IAP
 * Uses 5-minute cache to reduce API calls
 * Never throws errors - returns false on any error
 * 
 * @param forceRefresh - Skip cache and fetch fresh data
 * @returns True if user has active premium entitlement
 */
export async function isPremiumActiveViaIAP(forceRefresh: boolean = false): Promise<boolean> {
  try {
    // Return cached result if valid and not forcing refresh
    if (!forceRefresh && isCacheValid() && statusCache) {
      if (__DEV__) {
        console.log('📦 [RevenueCat] Returning cached status:', statusCache.status);
      }
      return statusCache.status;
    }

    // Check if configured
    if (!isRevenueCatConfigured()) {
      if (__DEV__) {
        console.log('ℹ️ [RevenueCat] Not configured - returning false');
      }
      return false;
    }

    // Fetch fresh customer info
    const customerInfo = await Purchases.getCustomerInfo();
    
    // Check for active premium entitlement
    const premiumEntitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
    const isPremium = premiumEntitlement !== undefined;

    // Update cache
    statusCache = {
      status: isPremium,
      timestamp: Date.now(),
    };

    if (__DEV__) {
      console.log('✅ [RevenueCat] Premium status:', isPremium);
      if (isPremium) {
        console.log('📅 [RevenueCat] Expiration:', premiumEntitlement.expirationDate);
        console.log('🔄 [RevenueCat] Will renew:', premiumEntitlement.willRenew);
      }
    }

    return isPremium;

  } catch (error) {
    // Never throw - log error and return false
    if (__DEV__) {
      console.log('⚠️ [RevenueCat] Error checking premium status:', error);
    }
    logDetailedError('REVENUECAT_PREMIUM_CHECK', error);
    return false;
  }
}

/**
 * Get detailed subscription status information
 * 
 * @returns Subscription status details or null if unavailable
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus | null> {
  try {
    if (!isRevenueCatConfigured()) {
      return null;
    }

    const customerInfo = await Purchases.getCustomerInfo();
    const premiumEntitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];

    if (!premiumEntitlement) {
      return {
        isPremium: false,
      };
    }

    return {
      isPremium: true,
      expirationDate: premiumEntitlement.expirationDate ? new Date(premiumEntitlement.expirationDate) : undefined,
      productIdentifier: premiumEntitlement.productIdentifier,
      willRenew: premiumEntitlement.willRenew,
    };

  } catch (error) {
    logDetailedError('REVENUECAT_SUBSCRIPTION_STATUS', error);
    return null;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get available offerings from RevenueCat
 * Useful for displaying subscription options
 * 
 * @returns Available offerings or null if not available
 */
export async function getAvailableOfferings(): Promise<PurchasesOffering | null> {
  try {
    if (!isRevenueCatConfigured()) {
      return null;
    }

    const offerings = await Purchases.getOfferings();
    return offerings.current;

  } catch (error) {
    logDetailedError('REVENUECAT_OFFERINGS', error);
    return null;
  }
}

/**
 * Manually clear the premium status cache
 * Useful for testing or forcing refresh
 */
export function clearPremiumStatusCache(): void {
  clearStatusCache();
}

// ============================================
// ENVIRONMENT DETECTION & DEBUGGING
// ============================================

/**
 * Detects the current IAP testing environment
 * @returns 'simulator' | 'sandbox' | 'production' | 'unavailable'
 */
export function getIAPEnvironment(): 'simulator' | 'sandbox' | 'production' | 'unavailable' {
  if (Platform.OS !== 'ios') {
    return 'unavailable';
  }
  
  if (!isRevenueCatConfigured()) {
    return 'unavailable';
  }
  
  // RevenueCat runs in sandbox by default for debug builds
  // Production builds connect to production StoreKit
  return __DEV__ ? 'sandbox' : 'production';
}

/**
 * Checks if RevenueCat is properly connected to App Store
 * @returns Connection status and product availability
 */
export async function checkStoreConnection(): Promise<{
  connected: boolean;
  hasProducts: boolean;
  productCount: number;
}> {
  try {
    const currentOffering = await getAvailableOfferings();
    
    if (!currentOffering) {
      return {
        connected: true,
        hasProducts: false,
        productCount: 0
      };
    }
    
    const productCount = currentOffering.availablePackages?.length || 0;
    const hasProducts = productCount > 0;
    
    return {
      connected: true,
      hasProducts,
      productCount
    };
  } catch (error) {
    return {
      connected: false,
      hasProducts: false,
      productCount: 0
    };
  }
}

/**
 * Logs comprehensive environment information (dev only)
 * Call this after RevenueCat initialization to verify configuration
 */
export function logEnvironmentInfo(): void {
  if (!__DEV__) return;
  
  const environment = getIAPEnvironment();
  const config = getRevenueCatConfig();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 REVENUECAT ENVIRONMENT INFORMATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Environment: ${environment.toUpperCase()}`);
  console.log(`Configured: ${config.isConfigured}`);
  console.log(`User ID: ${config.userId || 'Not set'}`);
  console.log(`Platform: ${Platform.OS}`);
  
  if (environment === 'production' && __DEV__) {
    console.warn('⚠️  WARNING: Running in PRODUCTION IAP mode during development!');
    console.warn('⚠️  Purchases will be real charges. Use development build for testing.');
  }
  
  if (environment === 'sandbox') {
    console.log('✅ Using SANDBOX environment - purchases are FREE for testing');
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Check store connection asynchronously
  checkStoreConnection().then(result => {
    if (result.connected) {
      console.log(`✅ App Store connected - ${result.productCount} product(s) available`);
    } else {
      console.warn('⚠️  App Store connection failed - check RevenueCat configuration');
    }
  }).catch(err => {
    console.error('❌ Failed to check store connection:', err);
  });
}


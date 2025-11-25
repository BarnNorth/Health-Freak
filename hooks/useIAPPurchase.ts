import { useState, useCallback } from 'react';
import { purchasePremiumSubscription } from '@/services/revenueCat';
import { useAuth } from '@/contexts/AuthContext';

interface UseIAPPurchaseReturn {
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
  purchaseSubscription: () => Promise<void>;
  reset: () => void;
}

/**
 * Custom hook for managing Apple In-App Purchase flow via RevenueCat
 * Handles loading states, errors, and success states with automatic cleanup
 */
export function useIAPPurchase(): UseIAPPurchaseReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { setUserPremiumStatus } = useAuth();

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setIsSuccess(false);
  }, []);

  const purchaseSubscription = useCallback(async () => {
    // Reset previous states
    setError(null);
    setIsSuccess(false);
    setIsLoading(true);

    try {
      if (__DEV__) {
        console.log('🛒 [IAP Hook] Starting Apple IAP purchase...');
      }

      const result = await purchasePremiumSubscription();

      if (result.success) {
        if (__DEV__) {
          console.log('✅ [IAP Hook] Purchase successful!');
        }
        
        setIsSuccess(true);
        
        // Optimistically update UI immediately - trust RevenueCat
        // The webhook will update the database in the background for persistence
        setUserPremiumStatus();
        
        // Clear success state after 3 seconds
        setTimeout(() => {
          setIsSuccess(false);
        }, 3000);
      } else if (result.userCancelled) {
        // User cancelled - don't show as error
        if (__DEV__) {
          console.log('ℹ️ [IAP Hook] Purchase cancelled by user');
        }
        // Just reset loading state, no error
      } else {
        // Purchase failed
        const errorMessage = result.error || 'Purchase failed. Please try again.';
        console.error('❌ [IAP Hook] Purchase failed:', errorMessage);
        setError(errorMessage);
        
        // Clear error after 5 seconds
        setTimeout(() => {
          setError(null);
        }, 5000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'An unexpected error occurred. Please try again.';
      
      console.error('❌ [IAP Hook] Exception during purchase:', err);
      setError(errorMessage);
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setError(null);
      }, 5000);
    } finally {
      setIsLoading(false);
    }
  }, [setUserPremiumStatus]);

  return {
    isLoading,
    error,
    isSuccess,
    purchaseSubscription,
    reset,
  };
}


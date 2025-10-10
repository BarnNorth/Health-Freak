import { supabase } from '@/lib/supabase';
import { redirectConfig } from '@/lib/config';
import { getStripeProduct } from '@/src/stripe-config';
import { Linking } from 'react-native';

export interface StripeCheckoutParams {
  priceId: string;
  mode: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
}

export interface StripeCheckoutResponse {
  sessionId: string;
  url: string;
}

/**
 * Creates a Stripe checkout session by calling the Supabase Edge Function
 */
export async function createStripeCheckoutSession(params: StripeCheckoutParams): Promise<StripeCheckoutResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: {
        price_id: params.priceId,
        mode: params.mode,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
    });

    if (error) {
      console.error('❌ Stripe checkout error:', error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }

    if (!data || !data.sessionId || !data.url) {
      throw new Error('Invalid response from Stripe checkout function');
    }

    return {
      sessionId: data.sessionId,
      url: data.url,
    };
  } catch (error) {
    console.error('💥 Error creating Stripe checkout session:', error);
    throw error;
  }
}

/**
 * Initiates a premium subscription checkout
 */
export async function startPremiumSubscription(): Promise<void> {
  try {
    const product = getStripeProduct('premium_subscription');
    
    const checkoutParams: StripeCheckoutParams = {
      priceId: product.priceId,
      mode: 'subscription',
      successUrl: redirectConfig.subscriptionSuccess(),
      cancelUrl: redirectConfig.subscriptionCancel(),
    };

    const { url } = await createStripeCheckoutSession(checkoutParams);
    
    // Open the Stripe checkout URL in the device's browser
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      throw new Error('Cannot open checkout URL');
    }
  } catch (error) {
    console.error('💥 Error starting premium subscription:', error);
    throw error;
  }
}

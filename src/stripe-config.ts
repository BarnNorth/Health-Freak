import Constants from 'expo-constants';

// Stripe product configuration for ingredient analyzer app

const extra = Constants.expoConfig?.extra ?? {};

function resolvePriceId(rawId: string | undefined, envVar: string): string {
  if (!rawId || rawId.startsWith('REPLACE_WITH')) {
    throw new Error(
      `Stripe price ID not configured. Set ${envVar} in your environment or update app.config.js to point to the new $6.99 price.`
    );
  }
  return rawId;
}

const PRODUCTION_PRICE_ID = resolvePriceId(extra?.stripePriceId as string | undefined, 'STRIPE_PRICE_ID');

export interface StripeProduct {
  priceId: string;
  name: string;
  description: string;
  mode: 'subscription' | 'payment';
  price: number;
  currency: string;
  interval?: 'month' | 'year';
}

export const STRIPE_PRODUCTS: Record<string, StripeProduct> = {
  premium_subscription: {
    priceId: PRODUCTION_PRICE_ID,
    name: 'Premium Subscription',
    description:
      'Unlock detailed ingredient explanations, health impact information, alternative suggestions, unlimited history, and export functionality',
    mode: 'subscription',
    price: 6.99,
    currency: 'usd',
    interval: 'month',
  },
};

// Helper function to get product by key
export function getStripeProduct(productKey: keyof typeof STRIPE_PRODUCTS): StripeProduct {
  return STRIPE_PRODUCTS[productKey];
}

// Helper function to format price for display
export function formatPrice(product: StripeProduct): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency.toUpperCase(),
  });

  const price = formatter.format(product.price);

  if (product.mode === 'subscription' && product.interval) {
    return `${price}/${product.interval}`;
  }

  return price;
}
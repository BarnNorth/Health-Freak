// Stripe product configuration for ingredient analyzer app

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
    priceId: 'price_1S5GO7APP9PA4b0C3pBw2yvN',
    name: 'Premium Subscription',
    description: 'Unlock detailed ingredient explanations, health impact information, alternative suggestions, unlimited history, and export functionality',
    mode: 'subscription',
    price: 10.00,
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
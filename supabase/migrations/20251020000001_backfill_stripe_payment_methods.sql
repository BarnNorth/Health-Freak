/*
  # Backfill Payment Methods for Existing Stripe Users
  
  This migration fixes users who subscribed via Stripe before the payment_method 
  field was added to the users table. It identifies Stripe users by joining with 
  the stripe_customers and stripe_subscriptions tables.
*/

-- Backfill payment_method for existing Stripe users
-- Identifies users by checking stripe_customers and stripe_subscriptions tables
UPDATE users u
SET payment_method = 'stripe',
    stripe_customer_id = sc.customer_id,
    stripe_subscription_id = ss.subscription_id
FROM stripe_customers sc
JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
WHERE u.id = sc.user_id
  AND u.subscription_status = 'premium'
  AND u.payment_method IS NULL
  AND ss.status = 'active';

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM users
  WHERE payment_method = 'stripe'
    AND updated_at >= NOW() - INTERVAL '1 minute';
  
  RAISE NOTICE 'Backfilled payment_method for % Stripe users', updated_count;
END $$;

-- Add a comment to document this migration
COMMENT ON COLUMN users.payment_method IS 'Payment provider: stripe for web/card payments, apple_iap for iOS subscriptions. Backfilled on 2025-01-20 for legacy users.';





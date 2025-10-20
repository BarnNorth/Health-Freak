/*
  # Add Apple In-App Purchase Support
  
  This migration adds support for dual payment methods (Stripe + Apple IAP):
  
  1. Adds payment method tracking columns to users table
  2. Adds Apple transaction ID for receipt validation
  3. Adds RevenueCat customer ID for integration
  4. Creates indexes for query performance
  5. Maintains all existing Stripe functionality
*/

-- Add new columns to users table for Apple IAP support
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('stripe', 'apple_iap')),
ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS revenuecat_customer_id TEXT;

-- Add comment documentation for new columns
COMMENT ON COLUMN users.payment_method IS 'Payment provider: stripe for web/card payments, apple_iap for iOS subscriptions';
COMMENT ON COLUMN users.apple_original_transaction_id IS 'Apple original transaction ID from App Store receipt';
COMMENT ON COLUMN users.revenuecat_customer_id IS 'RevenueCat customer identifier (usually matches user_id)';

-- Create indexes for performance on payment method queries
CREATE INDEX IF NOT EXISTS idx_users_payment_method 
  ON users(payment_method) 
  WHERE payment_method IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_apple_transaction 
  ON users(apple_original_transaction_id) 
  WHERE apple_original_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_revenuecat_customer 
  ON users(revenuecat_customer_id) 
  WHERE revenuecat_customer_id IS NOT NULL;

-- Add index for compound queries (premium users by payment method)
CREATE INDEX IF NOT EXISTS idx_users_subscription_payment 
  ON users(subscription_status, payment_method) 
  WHERE subscription_status = 'premium';


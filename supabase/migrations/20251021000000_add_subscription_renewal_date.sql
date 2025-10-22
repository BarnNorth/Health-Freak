-- Add subscription_renewal_date column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_renewal_date TIMESTAMPTZ;

-- Add comment explaining the column
COMMENT ON COLUMN users.subscription_renewal_date IS 'Date when the subscription will renew or expire (for both Stripe and Apple IAP)';

-- Index for querying subscriptions by renewal date
CREATE INDEX IF NOT EXISTS idx_users_subscription_renewal_date 
ON users(subscription_renewal_date) 
WHERE subscription_status = 'premium';



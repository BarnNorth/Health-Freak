-- Add cancels_at_period_end column to track Stripe cancellation state
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS cancels_at_period_end BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN users.cancels_at_period_end IS 'Whether the Stripe subscription will cancel at the end of the current period (does not auto-renew)';



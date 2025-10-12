/*
  # Simplify Tier System Database Schema
  
  This migration updates the database to support the simplified Free/Premium tier system:
  
  1. Updates users table to include Stripe integration fields
  2. Creates new scans table for Premium-only scan history
  3. Adds database constraints to enforce Premium benefits
  4. Cleans up data integrity
  5. Removes unused columns and constraints
*/

-- 1. Update users table schema
-- Add Stripe integration columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Rename total_analyses_used to total_scans_used for clarity
ALTER TABLE users 
RENAME COLUMN total_analyses_used TO total_scans_used;

-- Remove unused terms_accepted column (never used in the app)
ALTER TABLE users 
DROP COLUMN IF EXISTS terms_accepted;

-- Add indexes for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription ON users(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- 2. Create new scans table for Premium users only
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  barcode TEXT,
  product_name TEXT NOT NULL,
  scan_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on scans table
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scans table
CREATE POLICY "Premium users can read own scans"
  ON scans
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND subscription_status = 'premium'
    )
  );

CREATE POLICY "Premium users can insert own scans"
  ON scans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND subscription_status = 'premium'
    )
  );

CREATE POLICY "Premium users can delete own scans"
  ON scans
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND subscription_status = 'premium'
    )
  );

-- Add indexes for scans table
CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_scan_date ON scans(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_scans_barcode ON scans(barcode) WHERE barcode IS NOT NULL;

-- 3. Create constraint function to enforce Premium-only scan saving
CREATE OR REPLACE FUNCTION enforce_premium_scan_constraint()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is Premium before allowing scan insert
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = NEW.user_id 
    AND subscription_status = 'premium'
  ) THEN
    RAISE EXCEPTION 'Only Premium users can save scan history'
      USING ERRCODE = 'check_violation';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to enforce Premium constraint
CREATE TRIGGER enforce_premium_scans_only
  BEFORE INSERT ON scans
  FOR EACH ROW
  EXECUTE FUNCTION enforce_premium_scan_constraint();

-- 4. Data integrity cleanup
-- Ensure all users have valid subscription_status
UPDATE users 
SET subscription_status = 'free' 
WHERE subscription_status IS NULL 
   OR subscription_status NOT IN ('free', 'premium');

-- Ensure all users have non-negative scan counts
UPDATE users 
SET total_scans_used = 0 
WHERE total_scans_used < 0 OR total_scans_used IS NULL;

-- 5. Create helper functions for the new tier system

-- Function to check if user is Premium
CREATE OR REPLACE FUNCTION is_user_premium(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_uuid 
    AND subscription_status = 'premium'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's remaining free scans
CREATE OR REPLACE FUNCTION get_user_remaining_scans(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  user_record RECORD;
BEGIN
  SELECT subscription_status, total_scans_used 
  INTO user_record 
  FROM users 
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Premium users have unlimited scans
  IF user_record.subscription_status = 'premium' THEN
    RETURN 999; -- Represent unlimited as large number
  END IF;
  
  -- Free users get 5 scans total
  RETURN GREATEST(0, 5 - user_record.total_scans_used);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely add a scan (with Premium check)
CREATE OR REPLACE FUNCTION add_user_scan(
  user_uuid UUID,
  p_product_name TEXT,
  p_result JSONB,
  p_barcode TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  scan_id UUID;
BEGIN
  -- Check if user is Premium
  IF NOT is_user_premium(user_uuid) THEN
    RAISE EXCEPTION 'Only Premium users can save scan history'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  
  -- Insert the scan
  INSERT INTO scans (user_id, barcode, product_name, result)
  VALUES (user_uuid, p_barcode, p_product_name, p_result)
  RETURNING id INTO scan_id;
  
  RETURN scan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update database statistics function to use new column name
CREATE OR REPLACE FUNCTION get_user_analysis_stats(user_id uuid)
RETURNS TABLE(
  total_used integer,
  subscription_status text,
  can_analyze boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.total_scans_used as total_used,
    u.subscription_status,
    CASE 
      WHEN u.subscription_status = 'premium' THEN true
      WHEN u.total_scans_used < 5 THEN true
      ELSE false
    END as can_analyze
  FROM users u
  WHERE u.id = user_id;
END;
$$;

-- 7. Update increment function to use new column name  
CREATE OR REPLACE FUNCTION increment_analysis_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users 
  SET total_scans_used = total_scans_used + 1,
      updated_at = now()
  WHERE id = user_id;
END;
$$;

-- 8. Create view for easy scan history access
CREATE VIEW user_scan_history WITH (security_invoker = true) AS
SELECT
  s.id,
  s.barcode,
  s.product_name,
  s.scan_date,
  s.result,
  s.created_at,
  u.email as user_email
FROM scans s
JOIN users u ON s.user_id = u.id
WHERE s.user_id = auth.uid()
  AND u.subscription_status = 'premium'
ORDER BY s.scan_date DESC;

GRANT SELECT ON user_scan_history TO authenticated;

-- 9. Add comments for documentation
COMMENT ON TABLE scans IS 'Scan history - only available for Premium users';
COMMENT ON COLUMN users.total_scans_used IS 'Total number of scans used by the user (max 5 for free tier)';
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for payment processing';
COMMENT ON COLUMN users.stripe_subscription_id IS 'Stripe subscription ID for active subscriptions';
COMMENT ON FUNCTION is_user_premium IS 'Check if a user has Premium subscription status';
COMMENT ON FUNCTION get_user_remaining_scans IS 'Get remaining scans for free users (999 for Premium)';
COMMENT ON FUNCTION add_user_scan IS 'Safely add a scan for Premium users only';

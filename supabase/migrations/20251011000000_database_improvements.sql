-- Database improvements based on audit findings
-- Date: 2025-10-11

-- 0. CLEANUP: Remove orphaned subscription records before adding foreign key
-- These are subscriptions without corresponding customer records
-- Hard delete since they have no valid parent record
DO $$
DECLARE
  orphaned_count INT;
BEGIN
  DELETE FROM stripe_subscriptions
  WHERE customer_id NOT IN (SELECT customer_id FROM stripe_customers);
  
  GET DIAGNOSTICS orphaned_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned subscription records', orphaned_count;
END $$;

-- Also clean up orphaned orders
DO $$
DECLARE
  orphaned_orders_count INT;
BEGIN
  DELETE FROM stripe_orders
  WHERE customer_id NOT IN (SELECT customer_id FROM stripe_customers);
  
  GET DIAGNOSTICS orphaned_orders_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned order records', orphaned_orders_count;
END $$;

-- 1. Add foreign key constraint from stripe_subscriptions to stripe_customers
-- This ensures data integrity and prevents orphaned subscription records
-- Only applies to non-deleted records due to WHERE clause in queries
ALTER TABLE stripe_subscriptions
  ADD CONSTRAINT fk_stripe_subscriptions_customer
  FOREIGN KEY (customer_id)
  REFERENCES stripe_customers(customer_id)
  ON DELETE CASCADE;

-- 2. Add index on stripe_customers.user_id for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);

-- 3. Add index on stripe_orders.customer_id for faster order lookups
CREATE INDEX IF NOT EXISTS idx_stripe_orders_customer_id ON stripe_orders(customer_id);

-- 4. Create function to sync user subscription status with Stripe
-- This keeps users.subscription_status in sync with stripe_subscriptions.status
CREATE OR REPLACE FUNCTION sync_user_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET 
    subscription_status = CASE
      WHEN NEW.status IN ('active', 'trialing') THEN 'premium'
      ELSE 'free'
    END,
    updated_at = NOW()
  WHERE id = (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL
    LIMIT 1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to automatically sync subscription status
DROP TRIGGER IF EXISTS sync_subscription_status ON stripe_subscriptions;
CREATE TRIGGER sync_subscription_status
  AFTER INSERT OR UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_status();

-- 6. Create subscription audit table for tracking changes
CREATE TABLE IF NOT EXISTS subscription_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  stripe_status TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT DEFAULT 'system', -- 'system', 'stripe_webhook', 'admin', 'user'
  notes TEXT
);

-- Enable RLS on subscription_audit
ALTER TABLE subscription_audit ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own audit trail
CREATE POLICY "Users can view their own subscription history"
  ON subscription_audit
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_subscription_audit_user_id ON subscription_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_changed_at ON subscription_audit(changed_at DESC);

-- 7. Create function to track subscription changes in audit table
CREATE OR REPLACE FUNCTION audit_subscription_change()
RETURNS TRIGGER AS $$
DECLARE
  affected_user_id UUID;
BEGIN
  -- Get the user_id for this subscription
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id
  AND deleted_at IS NULL
  LIMIT 1;
  
  -- Only audit if we found a user
  IF affected_user_id IS NOT NULL THEN
    INSERT INTO subscription_audit (
      user_id,
      old_status,
      new_status,
      stripe_status,
      changed_by,
      notes
    ) VALUES (
      affected_user_id,
      CASE 
        WHEN TG_OP = 'UPDATE' THEN 
          CASE WHEN OLD.status IN ('active', 'trialing') THEN 'premium' ELSE 'free' END
        ELSE NULL
      END,
      CASE WHEN NEW.status IN ('active', 'trialing') THEN 'premium' ELSE 'free' END,
      NEW.status::TEXT,
      'stripe_webhook',
      CASE 
        WHEN TG_OP = 'INSERT' THEN 'Subscription created'
        WHEN TG_OP = 'UPDATE' THEN 'Subscription updated from ' || OLD.status::TEXT || ' to ' || NEW.status::TEXT
        ELSE 'Unknown change'
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for subscription audit
DROP TRIGGER IF EXISTS audit_subscription_changes ON stripe_subscriptions;
CREATE TRIGGER audit_subscription_changes
  AFTER INSERT OR UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION audit_subscription_change();

-- 9. Create function to clean up old analyses (data retention)
CREATE OR REPLACE FUNCTION cleanup_old_analyses(retention_days INT DEFAULT 365)
RETURNS TABLE (
  deleted_count INT,
  affected_users INT
) AS $$
DECLARE
  del_count INT;
  usr_count INT;
BEGIN
  -- Count affected users first
  SELECT COUNT(DISTINCT user_id) INTO usr_count
  FROM analyses_history
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
  AND user_id IN (
    SELECT id FROM users WHERE subscription_status = 'free'
  );
  
  -- Delete old analyses for free users only
  DELETE FROM analyses_history
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
  AND user_id IN (
    SELECT id FROM users WHERE subscription_status = 'free'
  );
  
  GET DIAGNOSTICS del_count = ROW_COUNT;
  
  RETURN QUERY SELECT del_count, usr_count;
END;
$$ LANGUAGE plpgsql;

-- 10. Add helpful comments
COMMENT ON TABLE subscription_audit IS 'Audit trail for subscription status changes';
COMMENT ON FUNCTION sync_user_subscription_status IS 'Syncs users.subscription_status with Stripe subscription status';
COMMENT ON FUNCTION audit_subscription_change IS 'Records subscription changes in audit table';
COMMENT ON FUNCTION cleanup_old_analyses IS 'Removes old analysis records for free users (data retention policy)';
COMMENT ON CONSTRAINT fk_stripe_subscriptions_customer ON stripe_subscriptions IS 'Ensures subscription records have valid customers';

-- 11. Update existing subscription statuses to ensure sync
-- This is a one-time sync for existing data
DO $$
DECLARE
  sub_record RECORD;
BEGIN
  FOR sub_record IN 
    SELECT s.customer_id, s.status, c.user_id
    FROM stripe_subscriptions s
    JOIN stripe_customers c ON s.customer_id = c.customer_id
    WHERE c.deleted_at IS NULL AND s.deleted_at IS NULL
  LOOP
    UPDATE users
    SET subscription_status = CASE
      WHEN sub_record.status IN ('active', 'trialing') THEN 'premium'
      ELSE 'free'
    END
    WHERE id = sub_record.user_id;
  END LOOP;
END $$;


-- ============================================
-- Identify Legacy Stripe Users
-- ============================================
-- Run these queries in your Supabase SQL Editor to identify Stripe subscribers

-- 1. Find all active Stripe premium users
SELECT 
  id,
  email,
  subscription_status,
  payment_method,
  stripe_customer_id,
  stripe_subscription_id,
  created_at,
  updated_at
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe'
ORDER BY created_at DESC;

-- 2. Count Stripe users by environment
-- (Sandbox users typically have test email patterns or were created recently)
SELECT 
  COUNT(*) as total_stripe_users,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as recent_stripe_users,
  COUNT(*) FILTER (WHERE email LIKE '%test%' OR email LIKE '%sandbox%') as likely_sandbox_users
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe';

-- 3. Export Stripe users with emails for communication
SELECT 
  email,
  id as user_id,
  stripe_subscription_id,
  created_at as subscription_start_date,
  updated_at as last_updated
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe'
ORDER BY updated_at ASC; -- Oldest first (likely to expire first)

-- 4. Check for users who might have migrated to Apple IAP
-- (Users who had Stripe but now have Apple IAP)
SELECT 
  id,
  email,
  payment_method,
  stripe_subscription_id,
  apple_original_transaction_id
FROM users
WHERE stripe_subscription_id IS NOT NULL
  AND payment_method = 'apple_iap';

-- ============================================
-- Monitoring Queries (Run Weekly)
-- ============================================

-- Check remaining Stripe users count
SELECT COUNT(*) as remaining_stripe_users
FROM users
WHERE payment_method = 'stripe'
  AND subscription_status = 'premium';

-- ============================================
-- Manual Database Updates (After Stripe Expiration Confirmed)
-- ============================================

-- When you confirm a Stripe subscription has expired (via Stripe Dashboard),
-- update the user's status:
-- UPDATE users
-- SET subscription_status = 'free',
--     payment_method = NULL,
--     updated_at = NOW()
-- WHERE id = '[user_id]'
--   AND payment_method = 'stripe'
--   AND subscription_status = 'premium';


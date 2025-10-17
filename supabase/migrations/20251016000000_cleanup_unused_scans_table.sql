/*
  # Cleanup: Remove Unused Scans Table
  
  This migration removes the `scans` table and related database objects that were
  created but never implemented in the application code. The app uses `analyses_history`
  table instead for storing scan history.
  
  Removed items:
  - scans table
  - user_scan_history view
  - enforce_premium_scans_only trigger
  - enforce_premium_scan_constraint() function
  - add_user_scan() function
  - is_user_premium() function
  - get_user_remaining_scans() function
  
  Kept items:
  - analyses_history table (actively used)
  - All other user and subscription management functions
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS enforce_premium_scans_only ON scans;

-- Drop the view
DROP VIEW IF EXISTS user_scan_history;

-- Drop the scans table
DROP TABLE IF EXISTS scans CASCADE;

-- Drop related functions
DROP FUNCTION IF EXISTS enforce_premium_scan_constraint();
DROP FUNCTION IF EXISTS add_user_scan(uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS is_user_premium(uuid);
DROP FUNCTION IF EXISTS get_user_remaining_scans(uuid);

-- Add comment documenting the decision
COMMENT ON TABLE analyses_history IS 'Analysis history for all users. Premium users have unlimited history saved, Free users do not save history.';

-- Ensure analyses_history has proper indexes (should already exist, but let's verify)
CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON analyses_history(user_id, created_at DESC);




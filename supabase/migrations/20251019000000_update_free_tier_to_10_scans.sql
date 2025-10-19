/**
 * Update Free Tier to 10 Scans
 * 
 * Changes the free tier limit from 5 scans to 10 scans with full premium features.
 * Updates the get_user_analysis_stats function to reflect the new limit.
 */

-- Update the database function to check for 10 scans instead of 5
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
      WHEN u.total_scans_used < 10 THEN true  -- Updated from 5 to 10
      ELSE false
    END as can_analyze
  FROM users u
  WHERE u.id = user_id;
END;
$$;


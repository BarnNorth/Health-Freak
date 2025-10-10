/*
  # Create RPC Functions for Health Freak

  1. Functions
    - `increment_analysis_count` - Safely increment user's analysis count
    - `get_user_analysis_stats` - Get user's usage statistics
*/

-- Function to safely increment analysis count
CREATE OR REPLACE FUNCTION increment_analysis_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users 
  SET total_analyses_used = total_analyses_used + 1,
      updated_at = now()
  WHERE id = user_id;
END;
$$;

-- Function to get user analysis statistics
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
    u.total_analyses_used,
    u.subscription_status,
    CASE 
      WHEN u.subscription_status = 'premium' THEN true
      WHEN u.total_analyses_used < 5 THEN true
      ELSE false
    END as can_analyze
  FROM users u
  WHERE u.id = user_id;
END;
$$;
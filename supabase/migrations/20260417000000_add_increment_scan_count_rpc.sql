-- Atomic scan count increment with server-side tier enforcement.
-- Replaces the race-prone read-then-write pattern in lib/database.ts
-- and closes the client-side-only free-tier limit loophole.

CREATE OR REPLACE FUNCTION increment_scan_count(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_status text;
  v_new_count integer;
  v_free_limit constant integer := 10;
BEGIN
  -- Atomic: lock row, read subscription, check limit, increment, return
  SELECT subscription_status, total_scans_used
    INTO v_subscription_status, v_new_count
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'User not found',
      'total_scans_used', 0,
      'subscription_status', 'free'
    );
  END IF;

  -- Enforce free-tier limit server-side
  IF v_subscription_status <> 'premium' AND v_new_count >= v_free_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'Free tier scan limit reached',
      'total_scans_used', v_new_count,
      'subscription_status', COALESCE(v_subscription_status, 'free')
    );
  END IF;

  -- Atomic increment
  UPDATE users
    SET total_scans_used = total_scans_used + 1,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING total_scans_used INTO v_new_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'total_scans_used', v_new_count,
    'subscription_status', COALESCE(v_subscription_status, 'free')
  );
END;
$$;

-- Allow authenticated users to call; RLS on users table is bypassed by SECURITY DEFINER
-- but the function only ever operates on p_user_id passed in, which the edge function
-- verifies against auth.uid() before calling.
REVOKE ALL ON FUNCTION increment_scan_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_scan_count(uuid) TO authenticated, service_role;

-- Rate limits table for distributed rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, operation)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_operation ON rate_limits (user_id, operation);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can only access their own rate limit entries
CREATE POLICY "Users can view own rate limits" ON rate_limits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rate limits" ON rate_limits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rate limits" ON rate_limits
  FOR UPDATE USING (auth.uid() = user_id);

-- Atomic check-and-increment RPC function
CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
  p_user_id uuid,
  p_operation text,
  p_window_ms integer,
  p_max_requests integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry record;
  v_window_start timestamptz;
  v_now timestamptz := now();
  v_window_interval interval;
BEGIN
  v_window_interval := (p_window_ms || ' milliseconds')::interval;
  v_window_start := v_now - v_window_interval;

  -- Try to get existing entry
  SELECT * INTO v_entry FROM rate_limits
    WHERE user_id = p_user_id AND operation = p_operation
    FOR UPDATE;

  IF NOT FOUND THEN
    -- No entry, create one
    INSERT INTO rate_limits (user_id, operation, window_start, count)
      VALUES (p_user_id, p_operation, v_now, 1);
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', p_max_requests - 1,
      'reset_time', extract(epoch from v_now + v_window_interval) * 1000
    );
  END IF;

  -- Check if window has expired
  IF v_entry.window_start < v_window_start THEN
    -- Reset window
    UPDATE rate_limits SET window_start = v_now, count = 1
      WHERE user_id = p_user_id AND operation = p_operation;
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', p_max_requests - 1,
      'reset_time', extract(epoch from v_now + v_window_interval) * 1000
    );
  END IF;

  -- Check if limit exceeded
  IF v_entry.count >= p_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'reset_time', extract(epoch from v_entry.window_start + v_window_interval) * 1000,
      'error', format('Rate limit exceeded. You can make %s %s requests per minute.', p_max_requests, p_operation)
    );
  END IF;

  -- Increment count
  UPDATE rate_limits SET count = count + 1
    WHERE user_id = p_user_id AND operation = p_operation;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', p_max_requests - v_entry.count - 1,
    'reset_time', extract(epoch from v_entry.window_start + v_window_interval) * 1000
  );
END;
$$;

-- Read-only rate limit check (does NOT increment counter)
CREATE OR REPLACE FUNCTION get_rate_limit_status(
  p_user_id uuid,
  p_operation text,
  p_window_ms integer,
  p_max_requests integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry record;
  v_window_start timestamptz;
  v_now timestamptz := now();
  v_window_interval interval;
BEGIN
  v_window_interval := (p_window_ms || ' milliseconds')::interval;
  v_window_start := v_now - v_window_interval;

  SELECT * INTO v_entry FROM rate_limits
    WHERE user_id = p_user_id AND operation = p_operation;

  IF NOT FOUND OR v_entry.window_start < v_window_start THEN
    RETURN jsonb_build_object(
      'remaining', p_max_requests,
      'reset_time', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'remaining', GREATEST(0, p_max_requests - v_entry.count),
    'reset_time', extract(epoch from v_entry.window_start + v_window_interval) * 1000
  );
END;
$$;

-- Cleanup old entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_start < now() - interval '10 minutes';
END;
$$;

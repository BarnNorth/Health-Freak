-- Add caching and expiration columns to ingredients_cache table
ALTER TABLE ingredients_cache ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ingredients_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '180 days';
ALTER TABLE ingredients_cache ADD COLUMN IF NOT EXISTS basic_note TEXT;

-- Create index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_ingredients_cache_expiry ON ingredients_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ingredients_cache_cached_at ON ingredients_cache(cached_at);

-- Function to get fresh (non-expired) ingredient from cache
CREATE OR REPLACE FUNCTION get_fresh_ingredient(ingredient_name_param TEXT)
RETURNS TABLE (
  ingredient_name TEXT,
  status TEXT,
  educational_note TEXT,
  basic_note TEXT,
  cached_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.ingredient_name,
    i.status,
    i.educational_note,
    i.basic_note,
    i.cached_at,
    i.expires_at
  FROM ingredients_cache i
  WHERE LOWER(i.ingredient_name) = LOWER(ingredient_name_param)
    AND i.expires_at > NOW()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get multiple fresh ingredients in a batch
CREATE OR REPLACE FUNCTION get_fresh_ingredients_batch(ingredient_names TEXT[])
RETURNS TABLE (
  ingredient_name TEXT,
  status TEXT,
  educational_note TEXT,
  basic_note TEXT,
  cached_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.ingredient_name,
    i.status,
    i.educational_note,
    i.basic_note,
    i.cached_at,
    i.expires_at
  FROM ingredients_cache i
  WHERE LOWER(i.ingredient_name) = ANY(
    SELECT LOWER(unnest) FROM unnest(ingredient_names)
  )
  AND i.expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get ingredients expiring soon (for background refresh)
CREATE OR REPLACE FUNCTION get_expiring_ingredients(expiry_threshold_days INT DEFAULT 30)
RETURNS TABLE (
  ingredient_name TEXT,
  status TEXT,
  cached_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  days_until_expiry INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.ingredient_name,
    i.status,
    i.cached_at,
    i.expires_at,
    EXTRACT(DAY FROM (i.expires_at - NOW()))::INT as days_until_expiry
  FROM ingredients_cache i
  WHERE i.expires_at > NOW()
    AND i.expires_at < (NOW() + (expiry_threshold_days || ' days')::INTERVAL)
  ORDER BY i.expires_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_statistics()
RETURNS TABLE (
  total_cached INT,
  fresh_ingredients INT,
  expired_ingredients INT,
  expiring_soon INT,
  oldest_cached TIMESTAMPTZ,
  newest_cached TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INT as total_cached,
    COUNT(CASE WHEN expires_at > NOW() THEN 1 END)::INT as fresh_ingredients,
    COUNT(CASE WHEN expires_at <= NOW() THEN 1 END)::INT as expired_ingredients,
    COUNT(CASE WHEN expires_at > NOW() AND expires_at < (NOW() + INTERVAL '30 days') THEN 1 END)::INT as expiring_soon,
    MIN(cached_at) as oldest_cached,
    MAX(cached_at) as newest_cached
  FROM ingredients_cache;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired ingredients (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_ingredients()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM ingredients_cache
  WHERE expires_at < NOW() - INTERVAL '7 days'; -- Keep expired for 7 days for debugging
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON COLUMN ingredients_cache.cached_at IS 'Timestamp when ingredient data was cached';
COMMENT ON COLUMN ingredients_cache.expires_at IS 'Timestamp when cached data expires and should be refreshed';
COMMENT ON FUNCTION get_fresh_ingredient IS 'Retrieves a single non-expired ingredient from cache';
COMMENT ON FUNCTION get_fresh_ingredients_batch IS 'Retrieves multiple non-expired ingredients from cache';
COMMENT ON FUNCTION get_expiring_ingredients IS 'Lists ingredients that will expire within specified days';
COMMENT ON FUNCTION get_cache_statistics IS 'Returns statistics about ingredient cache health';
COMMENT ON FUNCTION cleanup_expired_ingredients IS 'Removes expired ingredients older than 7 days';

-- Update existing rows to have proper expiry dates and basic notes
UPDATE ingredients_cache 
SET 
  cached_at = COALESCE(cached_at, created_at),
  expires_at = COALESCE(expires_at, created_at + INTERVAL '180 days'),
  basic_note = CASE 
    WHEN basic_note IS NULL AND status = 'generally_clean' THEN 'Generally recognized as safe for consumption'
    WHEN basic_note IS NULL AND status = 'potentially_toxic' THEN 'May contain concerning compounds - upgrade for detailed explanation'
    ELSE basic_note
  END
WHERE cached_at IS NULL OR expires_at IS NULL OR basic_note IS NULL;


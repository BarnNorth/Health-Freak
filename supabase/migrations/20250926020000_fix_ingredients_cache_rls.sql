/*
  # Fix ingredients_cache RLS policies
  
  Allow unauthenticated service access to ingredients_cache for AI analysis caching
  This enables the app to cache ingredient analysis results for all users efficiently
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Only authenticated users can insert ingredients" ON ingredients_cache;

-- Create a new policy that allows both authenticated and unauthenticated access for caching
DROP POLICY IF EXISTS "Anyone can insert ingredients for caching" ON ingredients_cache;
CREATE POLICY "Anyone can insert ingredients for caching"
  ON ingredients_cache
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Also allow updates for ingredient information updates
CREATE POLICY "Anyone can update ingredients for caching"
  ON ingredients_cache
  FOR UPDATE
  TO authenticated, anon
  USING (true);

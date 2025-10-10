/*
  # Fix RLS policies for users and analyses_history tables
  
  Ensure authenticated users can create their own profile and manage their analyses
*/

-- Fix users table policies (allow profile creation)
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;

-- Recreate users policies with proper syntax
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Fix analyses_history policies
DROP POLICY IF EXISTS "Users can read own analyses" ON analyses_history;
DROP POLICY IF EXISTS "Users can insert own analyses" ON analyses_history;
DROP POLICY IF EXISTS "Users can delete own analyses" ON analyses_history;

-- Recreate policies with proper syntax
CREATE POLICY "Users can read own analyses"
  ON analyses_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON analyses_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses"
  ON analyses_history
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Also allow updates for analysis corrections
DROP POLICY IF EXISTS "Users can update own analyses" ON analyses_history;
CREATE POLICY "Users can update own analyses"
  ON analyses_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

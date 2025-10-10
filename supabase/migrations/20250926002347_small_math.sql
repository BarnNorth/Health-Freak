/*
  # Create Health Freak Database Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `subscription_status` (text, default 'free')
      - `total_analyses_used` (integer, default 0)
      - `terms_accepted` (boolean, default false)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `ingredients_cache`
      - `id` (uuid, primary key)
      - `ingredient_name` (text, unique)
      - `status` (text, 'generally_clean' or 'potentially_toxic')
      - `educational_note` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `analyses_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `extracted_text` (text)
      - `results_json` (jsonb)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own data
    - Everyone can read ingredients_cache for educational purposes
    - Proper policies for data access and modification
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium')),
  total_analyses_used integer DEFAULT 0,
  terms_accepted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ingredients_cache table
CREATE TABLE IF NOT EXISTS ingredients_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_name text UNIQUE NOT NULL,
  status text NOT NULL CHECK (status IN ('generally_clean', 'potentially_toxic')),
  educational_note text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create analyses_history table
CREATE TABLE IF NOT EXISTS analyses_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  extracted_text text NOT NULL,
  results_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses_history ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Ingredients cache policies (public read for educational purposes)
CREATE POLICY "Anyone can read ingredients"
  ON ingredients_cache
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Only authenticated users can insert ingredients"
  ON ingredients_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Analyses history policies
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients_cache(ingredient_name);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses_history(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses_history(created_at DESC);

-- Insert sample ingredient data for testing
INSERT INTO ingredients_cache (ingredient_name, status, educational_note) VALUES
  ('high fructose corn syrup', 'potentially_toxic', 'Highly processed sweetener derived from corn starch. Some studies suggest links to metabolic concerns, obesity, and insulin resistance when consumed regularly.'),
  ('organic cane sugar', 'generally_clean', 'Natural sweetener derived from sugar cane through minimal processing. Widely accepted as safe in moderate amounts as part of a balanced diet.'),
  ('sea salt', 'generally_clean', 'Essential mineral obtained from evaporated seawater with minimal processing. Contains trace minerals and is generally recognized as safe.'),
  ('bht', 'potentially_toxic', 'Butylated hydroxytoluene - synthetic preservative used to prevent rancidity. Some studies suggest potential concerns regarding hormone disruption and cellular health.'),
  ('natural flavors', 'potentially_toxic', 'Vague regulatory term that may contain synthetic compounds derived from natural sources. Lack of transparency makes it difficult to assess individual ingredients.'),
  ('olive oil', 'generally_clean', 'Traditional cooking oil extracted from olives through mechanical pressing. Rich in monounsaturated fats and widely recognized for its nutritional benefits.'),
  ('soybean oil', 'potentially_toxic', 'Highly processed seed oil extracted using chemical solvents. High in omega-6 fatty acids which may contribute to inflammatory processes when consumed in excess.'),
  ('water', 'generally_clean', 'Essential for life and safe when properly treated and filtered. Forms the base of most food products.'),
  ('organic tomatoes', 'generally_clean', 'Whole food ingredient grown without synthetic pesticides. Rich in nutrients including lycopene and vitamin C.'),
  ('citric acid', 'generally_clean', 'Natural preservative and flavor enhancer found naturally in citrus fruits. Generally recognized as safe and widely used in food preservation.')
ON CONFLICT (ingredient_name) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
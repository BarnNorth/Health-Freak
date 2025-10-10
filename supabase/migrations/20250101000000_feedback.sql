-- Create ingredient_feedback table for user feedback on AI classifications
CREATE TABLE ingredient_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  ai_classification TEXT NOT NULL,
  user_classification TEXT, -- 'correct', 'should_be_clean', 'should_be_toxic'
  product_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_feedback_ingredient ON ingredient_feedback(ingredient_name);
CREATE INDEX idx_feedback_created ON ingredient_feedback(created_at DESC);
CREATE INDEX idx_feedback_user ON ingredient_feedback(user_id);

-- Enable Row Level Security
ALTER TABLE ingredient_feedback ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON ingredient_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to view their own feedback
CREATE POLICY "Users can view their own feedback"
  ON ingredient_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow authenticated users to view aggregated feedback (for community accuracy)
-- This will allow users to see statistics about ingredients
CREATE POLICY "Users can view aggregated feedback statistics"
  ON ingredient_feedback FOR SELECT
  TO authenticated
  USING (true);


-- AI analysis log table for tracking quality, performance, and cache effectiveness
CREATE TABLE IF NOT EXISTS ai_analysis_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ingredient_name text NOT NULL,
  status text, -- 'generally_clean', 'potentially_toxic', 'unknown', 'error'
  confidence real,
  cached boolean NOT NULL DEFAULT false,
  processing_time_ms integer,
  error_message text, -- null for successes, error details for failures
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_user ON ai_analysis_log (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_created ON ai_analysis_log (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_ingredient ON ai_analysis_log (ingredient_name);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_cached ON ai_analysis_log (cached);

-- Enable RLS
ALTER TABLE ai_analysis_log ENABLE ROW LEVEL SECURITY;

-- Only allow inserts (users log their own analyses)
CREATE POLICY "Users can insert own logs" ON ai_analysis_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can read all for analytics
CREATE POLICY "Users can view own logs" ON ai_analysis_log
  FOR SELECT USING (auth.uid() = user_id);

-- Create AI accuracy tracking table for calibration
CREATE TABLE ai_accuracy_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_name TEXT NOT NULL,
  ai_classification TEXT NOT NULL,
  ai_confidence DECIMAL(3,2) NOT NULL,
  user_feedback TEXT, -- 'correct' or 'incorrect'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX idx_accuracy_ingredient ON ai_accuracy_tracking(ingredient_name);
CREATE INDEX idx_accuracy_date ON ai_accuracy_tracking(created_at DESC);
CREATE INDEX idx_accuracy_classification ON ai_accuracy_tracking(ai_classification);
CREATE INDEX idx_accuracy_feedback ON ai_accuracy_tracking(user_feedback) WHERE user_feedback IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE ai_accuracy_tracking ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert tracking data
CREATE POLICY "Authenticated users can track accuracy"
  ON ai_accuracy_tracking FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow all users to view aggregated statistics (needed for calibration)
CREATE POLICY "Anyone can view accuracy data"
  ON ai_accuracy_tracking FOR SELECT
  TO public
  USING (true);

-- Function to get overall calibration statistics
CREATE OR REPLACE FUNCTION get_calibration_stats()
RETURNS TABLE (
  classification TEXT,
  total_count BIGINT,
  correct_count BIGINT,
  accuracy_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ai_classification as classification,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE user_feedback = 'correct') as correct_count,
    ROUND(
      COUNT(*) FILTER (WHERE user_feedback = 'correct')::DECIMAL / 
      NULLIF(COUNT(*), 0) * 100, 
      2
    ) as accuracy_rate
  FROM ai_accuracy_tracking
  WHERE user_feedback IS NOT NULL
  GROUP BY ai_classification;
END;
$$ LANGUAGE plpgsql;

-- Function to get calibration stats for a specific ingredient
CREATE OR REPLACE FUNCTION get_ingredient_accuracy(ingredient_name_param TEXT)
RETURNS TABLE (
  ingredient_name TEXT,
  total_feedback BIGINT,
  correct_feedback BIGINT,
  accuracy_rate DECIMAL,
  avg_confidence DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ingredient_name_param as ingredient_name,
    COUNT(*) as total_feedback,
    COUNT(*) FILTER (WHERE user_feedback = 'correct') as correct_feedback,
    ROUND(
      COUNT(*) FILTER (WHERE user_feedback = 'correct')::DECIMAL / 
      NULLIF(COUNT(*), 0) * 100, 
      2
    ) as accuracy_rate,
    ROUND(AVG(ai_confidence), 2) as avg_confidence
  FROM ai_accuracy_tracking
  WHERE LOWER(ai_accuracy_tracking.ingredient_name) = LOWER(ingredient_name_param)
    AND user_feedback IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get time-series accuracy data (for trend analysis)
CREATE OR REPLACE FUNCTION get_accuracy_trends(days_back INT DEFAULT 30)
RETURNS TABLE (
  date DATE,
  classification TEXT,
  accuracy_rate DECIMAL,
  sample_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(created_at) as date,
    ai_classification as classification,
    ROUND(
      COUNT(*) FILTER (WHERE user_feedback = 'correct')::DECIMAL / 
      NULLIF(COUNT(*), 0) * 100, 
      2
    ) as accuracy_rate,
    COUNT(*) as sample_count
  FROM ai_accuracy_tracking
  WHERE user_feedback IS NOT NULL
    AND created_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY DATE(created_at), ai_classification
  ORDER BY date DESC, classification;
END;
$$ LANGUAGE plpgsql;

-- Function to get confidence calibration data
CREATE OR REPLACE FUNCTION get_confidence_calibration()
RETURNS TABLE (
  confidence_bucket TEXT,
  expected_accuracy DECIMAL,
  actual_accuracy DECIMAL,
  sample_count BIGINT,
  calibration_error DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH bucketed_data AS (
    SELECT 
      CASE 
        WHEN ai_confidence >= 0.9 THEN '0.90-1.00'
        WHEN ai_confidence >= 0.8 THEN '0.80-0.89'
        WHEN ai_confidence >= 0.7 THEN '0.70-0.79'
        WHEN ai_confidence >= 0.6 THEN '0.60-0.69'
        WHEN ai_confidence >= 0.5 THEN '0.50-0.59'
        ELSE '0.00-0.49'
      END as bucket,
      AVG(ai_confidence) as avg_confidence,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE user_feedback = 'correct') as correct
    FROM ai_accuracy_tracking
    WHERE user_feedback IS NOT NULL
    GROUP BY bucket
  )
  SELECT 
    bucket as confidence_bucket,
    ROUND(avg_confidence * 100, 2) as expected_accuracy,
    ROUND((correct::DECIMAL / NULLIF(total, 0)) * 100, 2) as actual_accuracy,
    total as sample_count,
    ROUND(ABS(avg_confidence * 100 - (correct::DECIMAL / NULLIF(total, 0)) * 100), 2) as calibration_error
  FROM bucketed_data
  ORDER BY avg_confidence DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE ai_accuracy_tracking IS 'Tracks AI classification accuracy for confidence calibration';
COMMENT ON COLUMN ai_accuracy_tracking.ai_confidence IS 'AI confidence score (0.00 to 1.00)';
COMMENT ON COLUMN ai_accuracy_tracking.user_feedback IS 'Whether AI classification was correct or incorrect';
COMMENT ON FUNCTION get_calibration_stats IS 'Returns overall accuracy statistics by classification type';
COMMENT ON FUNCTION get_ingredient_accuracy IS 'Returns accuracy statistics for a specific ingredient';
COMMENT ON FUNCTION get_accuracy_trends IS 'Returns time-series accuracy data for trend analysis';
COMMENT ON FUNCTION get_confidence_calibration IS 'Returns confidence calibration analysis comparing expected vs actual accuracy';


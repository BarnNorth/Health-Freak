-- Add onboarding_completed column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Set all existing users to have completed onboarding (legacy users)
UPDATE users SET onboarding_completed = true WHERE onboarding_completed IS NULL;


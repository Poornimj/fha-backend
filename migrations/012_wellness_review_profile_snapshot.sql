ALTER TABLE wellness_review_cases
  ADD COLUMN IF NOT EXISTS profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;


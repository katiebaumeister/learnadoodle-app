-- Migration: Consolidate material_reviews into materials table
-- This script:
-- 1. Adds review columns to materials table
-- 2. Migrates the most recent review for each material
-- 3. Drops the material_reviews table

BEGIN;

-- Step 1: Add review columns to materials table
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS review_child_id uuid REFERENCES children(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_rating int CHECK (review_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS review_emotion text CHECK (review_emotion IN ('loved','liked','neutral','bored','overwhelmed','frustrated')),
  ADD COLUMN IF NOT EXISTS review_pacing_fit text CHECK (review_pacing_fit IN ('too_fast','too_slow','just_right')),
  ADD COLUMN IF NOT EXISTS review_difficulty text CHECK (review_difficulty IN ('too_easy','too_hard','appropriate')),
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS review_updated_at timestamptz;

-- Step 2: Migrate the most recent review for each material
-- For materials with multiple reviews, take the most recent one
UPDATE materials m
SET
  review_child_id = latest_review.child_id,
  review_rating = latest_review.rating,
  review_emotion = latest_review.emotion,
  review_pacing_fit = latest_review.pacing_fit,
  review_difficulty = latest_review.difficulty,
  review_notes = latest_review.notes,
  review_updated_at = latest_review.created_at
FROM (
  SELECT DISTINCT ON (material_id)
    material_id,
    child_id,
    rating,
    emotion,
    pacing_fit,
    difficulty,
    notes,
    created_at
  FROM material_reviews
  ORDER BY material_id, created_at DESC
) AS latest_review
WHERE m.id = latest_review.material_id;

-- Step 3: Drop the material_reviews table
DROP TABLE IF EXISTS material_reviews CASCADE;

-- Step 4: Drop any views or functions that depend on material_reviews
-- (Check if material_usage_stats view uses material_reviews)
DROP VIEW IF EXISTS material_usage_stats CASCADE;

-- Step 5: Recreate material_usage_stats view without material_reviews
CREATE OR REPLACE VIEW material_usage_stats AS
SELECT
  m.id as material_id,
  m.family_id,
  COUNT(DISTINCT mc.child_id) as children_count,
  m.review_rating::numeric(3,2) as avg_rating,
  CASE WHEN m.review_emotion = 'bored' THEN 1.0 ELSE 0.0 END::numeric(3,2) as boredom_rate,
  CASE WHEN m.review_emotion = 'loved' THEN 1.0 ELSE 0.0 END::numeric(3,2) as love_rate,
  BOOL_OR(mc.status = 'completed') as completed_by_someone
FROM materials m
LEFT JOIN material_children mc ON mc.material_id = m.id
WHERE m.deleted_at IS NULL
GROUP BY m.id, m.family_id, m.review_rating, m.review_emotion;

-- Grant permissions on view
GRANT SELECT ON material_usage_stats TO authenticated;

COMMIT;


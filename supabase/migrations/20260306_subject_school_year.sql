-- Add school_year to subject (e.g. 2025/26, 2026/27)
ALTER TABLE subject
  ADD COLUMN IF NOT EXISTS school_year TEXT;

-- Set all existing subjects to 2025/26
UPDATE subject
  SET school_year = '2025/26'
  WHERE school_year IS NULL;

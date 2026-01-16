-- Remove Skills, Standards, and Coverage Tables
-- These features will be rebuilt later

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS standards_coverage_analytics CASCADE;
DROP MATERIALIZED VIEW IF EXISTS standards_gap_analysis CASCADE;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS lesson_standards CASCADE;
DROP TABLE IF EXISTS student_standard_mastery CASCADE;
DROP TABLE IF EXISTS standards_coverage CASCADE;
DROP TABLE IF EXISTS standard_templates CASCADE;
DROP TABLE IF EXISTS standards CASCADE;

DROP TABLE IF EXISTS skill_grades CASCADE;
DROP TABLE IF EXISTS skill_coverage_map CASCADE;

DROP TABLE IF EXISTS subject_coverage_tracking CASCADE;
DROP TABLE IF EXISTS subject_cognitive_load CASCADE;

-- Note: These tables are being removed but may be referenced in code
-- Make sure to remove code references to:
-- - standards
-- - lesson_standards
-- - student_standard_mastery
-- - standard_templates
-- - standards_coverage
-- - skill_grades
-- - skill_coverage_map
-- - subject_coverage_tracking
-- - subject_cognitive_load

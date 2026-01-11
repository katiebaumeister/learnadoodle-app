-- Remove Lesson Templates Functionality
-- This migration removes the lesson_templates table and related functionality
-- WARNING: This will delete all template data. Make sure to backup if needed.

-- ============================================================================
-- 1. Drop dependent objects first
-- ============================================================================

-- Drop template_shares table (references lesson_templates)
DROP TABLE IF EXISTS template_shares CASCADE;

-- Drop function that uses lesson_templates
DROP FUNCTION IF EXISTS copy_shared_template(UUID, UUID, UUID) CASCADE;

-- Drop any other functions that might reference lesson_templates
DROP FUNCTION IF EXISTS create_template_version(UUID, TEXT) CASCADE;

-- ============================================================================
-- 2. Drop RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "lesson_templates_select" ON lesson_templates;
DROP POLICY IF EXISTS "lesson_templates_insert" ON lesson_templates;
DROP POLICY IF EXISTS "lesson_templates_update" ON lesson_templates;
DROP POLICY IF EXISTS "lesson_templates_delete" ON lesson_templates;
DROP POLICY IF EXISTS "lesson_templates_select_public" ON lesson_templates;

-- ============================================================================
-- 3. Drop indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_lesson_templates_family;
DROP INDEX IF EXISTS idx_lesson_templates_subject;
DROP INDEX IF EXISTS idx_lesson_templates_title;

-- ============================================================================
-- 4. Drop the main table
-- ============================================================================

DROP TABLE IF EXISTS lesson_templates CASCADE;

-- ============================================================================
-- 5. Revoke permissions (if any were granted explicitly)
-- ============================================================================

-- Note: CASCADE on DROP TABLE will handle most permissions, but we can be explicit
-- REVOKE ALL ON lesson_templates FROM authenticated;
-- REVOKE ALL ON lesson_templates FROM service_role;


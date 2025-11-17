-- Phase 3: Smart Content Flow + Browser Extension MVP
-- Chunk B: add_external_link RPC (helper for database operations)

-- This RPC handles the database operations after Python backend fetches YouTube metadata
CREATE OR REPLACE FUNCTION add_external_link(
  p_family_id uuid,
  p_child_id uuid,
  p_provider_name text,
  p_title text,
  p_source_url text,
  p_thumbnail_url text,
  p_duration_sec integer,
  p_imported_by uuid,
  p_source_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id uuid;
  v_course_id uuid;
  v_unit_id uuid;
  v_lesson_id uuid;
  v_backlog_task_id uuid;
  v_source_slug_final text;
BEGIN
  -- Get or create provider
  SELECT id INTO v_provider_id
  FROM external_providers
  WHERE name = p_provider_name;
  
  IF v_provider_id IS NULL THEN
    INSERT INTO external_providers (name, base_url, license, attribution_text, is_link_only)
    VALUES (
      p_provider_name,
      CASE 
        WHEN p_provider_name = 'YouTube' THEN 'https://www.youtube.com'
        ELSE 'https://example.com'
      END,
      'Terms of Service',
      'Content from ' || p_provider_name,
      true
    )
    RETURNING id INTO v_provider_id;
  END IF;
  
  -- Generate source_slug if not provided (use URL hash or title slug)
  v_source_slug_final := COALESCE(p_source_slug, md5(p_source_url));
  
  -- Upsert external_course
  INSERT INTO external_courses (
    provider_id,
    source_slug,
    public_url,
    source_url,
    thumbnail_url,
    duration_sec,
    imported_by,
    lesson_count
  )
  VALUES (
    v_provider_id,
    v_source_slug_final,
    p_source_url, -- Use source_url as public_url for now
    p_source_url,
    p_thumbnail_url,
    p_duration_sec,
    p_imported_by,
    1 -- Single lesson course
  )
  ON CONFLICT (provider_id, source_slug) 
  DO UPDATE SET
    thumbnail_url = EXCLUDED.thumbnail_url,
    duration_sec = EXCLUDED.duration_sec,
    updated_at = NOW()
  RETURNING id INTO v_course_id;
  
  -- Create a single unit (for single video courses)
  INSERT INTO external_units (
    course_id,
    ordinal,
    title_safe,
    public_url,
    source_url
  )
  VALUES (
    v_course_id,
    1,
    p_title,
    p_source_url,
    p_source_url
  )
  ON CONFLICT (course_id, ordinal) DO NOTHING;
  
  -- Get the unit ID
  SELECT id INTO v_unit_id
  FROM external_units
  WHERE course_id = v_course_id AND ordinal = 1;
  
  -- Create a single lesson
  INSERT INTO external_lessons (
    unit_id,
    ordinal,
    title_safe,
    resource_type,
    public_url,
    source_url,
    thumbnail_url,
    duration_sec,
    duration_minutes_est
  )
  VALUES (
    v_unit_id,
    1,
    p_title,
    'video',
    p_source_url,
    p_source_url,
    p_thumbnail_url,
    p_duration_sec,
    CASE WHEN p_duration_sec IS NOT NULL THEN CEIL(p_duration_sec / 60.0)::integer ELSE NULL END
  )
  ON CONFLICT (unit_id, ordinal) DO NOTHING
  RETURNING id INTO v_lesson_id;
  
  -- Get lesson_id if it already existed
  IF v_lesson_id IS NULL THEN
    SELECT id INTO v_lesson_id
    FROM external_lessons
    WHERE unit_id = v_unit_id AND ordinal = 1;
  END IF;
  
  -- Create backlog task
  INSERT INTO backlog_items (
    family_id,
    child_id,
    title,
    notes,
    estimated_minutes,
    created_by
  )
  VALUES (
    p_family_id,
    p_child_id,
    p_title,
    'External content: ' || p_source_url,
    CASE WHEN p_duration_sec IS NOT NULL THEN CEIL(p_duration_sec / 60.0)::integer ELSE NULL END,
    p_imported_by
  )
  RETURNING id INTO v_backlog_task_id;
  
  -- Return result
  RETURN jsonb_build_object(
    'course_id', v_course_id,
    'lesson_id', v_lesson_id,
    'title', p_title,
    'thumbnail_url', p_thumbnail_url,
    'duration_sec', p_duration_sec,
    'backlog_task_id', v_backlog_task_id
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION add_external_link(uuid, uuid, text, text, text, text, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION add_external_link(uuid, uuid, text, text, text, text, integer, uuid, text) TO authenticated;


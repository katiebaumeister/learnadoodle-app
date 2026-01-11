-- Create RPC function to get deleted materials (bypasses RLS)
-- This allows fetching soft-deleted materials that RLS policies might filter out

CREATE OR REPLACE FUNCTION get_deleted_materials(_family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSONB;
BEGIN
  -- Verify family membership
  IF NOT is_family_member(_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Return deleted materials with nested material_children
  WITH ordered_materials AS (
    SELECT m.*
    FROM materials m
    WHERE m.family_id = _family_id
      AND m.deleted_at IS NOT NULL
    ORDER BY m.deleted_at DESC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'family_id', m.family_id,
      'title', m.title,
      'type', m.type,
      'subject_key', m.subject_key,
      'grade_range_min', m.grade_range_min,
      'grade_range_max', m.grade_range_max,
      'is_consumable', m.is_consumable,
      'is_subscription', m.is_subscription,
      'provider_name', m.provider_name,
      'provider_url', m.provider_url,
      'location_hint', m.location_hint,
      'cover_image_url', m.cover_image_url,
      'purchase_date', m.purchase_date,
      'purchase_price', m.purchase_price,
      'notes', m.notes,
      'tags', m.tags,
      'created_by', m.created_by,
      'created_at', m.created_at,
      'updated_at', m.updated_at,
      'deleted_at', m.deleted_at,
      'storage_path', m.storage_path,
      'mime', m.mime,
      'bytes', m.bytes,
      'caption', m.caption,
      'material_children', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', mc.id,
            'child_id', mc.child_id,
            'status', mc.status,
            'started_at', mc.started_at,
            'finished_at', mc.finished_at,
            'reuse_candidate', mc.reuse_candidate,
            'child', jsonb_build_object(
              'id', c.id,
              'first_name', c.first_name
            )
          )
        ), '[]'::jsonb)
        FROM material_children mc
        LEFT JOIN children c ON c.id = mc.child_id
        WHERE mc.material_id = m.id
      )
    )
  ), '[]'::jsonb)
  INTO _result
  FROM ordered_materials m;

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION get_deleted_materials IS 'Get all soft-deleted materials for a family with nested material_children (bypasses RLS)';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_deleted_materials(UUID) TO authenticated, service_role;


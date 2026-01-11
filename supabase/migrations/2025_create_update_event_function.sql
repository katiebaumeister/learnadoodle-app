-- Create a function to update events that can handle overlaps
-- Similar to create_task_event but for updates

CREATE OR REPLACE FUNCTION update_event_with_overlap_handling(
  _event_id uuid,
  _updates jsonb,
  _allow_overlaps boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _child_id uuid;
  _child_ids uuid[];
  _final_child_id uuid;
  _final_child_ids uuid[];
  _is_flexible boolean;
  _current_event record;
BEGIN
  -- Get current event
  SELECT * INTO _current_event
  FROM events
  WHERE id = _event_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Event not found');
  END IF;
  
  -- Extract values from updates JSONB
  _child_id := (_updates->>'child_id')::uuid;
  -- Handle child_ids - it might be an array or null
  IF _updates ? 'child_ids' AND jsonb_typeof(_updates->'child_ids') = 'array' THEN
    _child_ids := ARRAY(SELECT jsonb_array_elements_text(_updates->'child_ids'))::uuid[];
  ELSE
    _child_ids := NULL;
  END IF;
  _is_flexible := (_updates->>'is_flexible')::boolean;
  
  -- Determine final child_id and child_ids
  IF _child_ids IS NOT NULL AND array_length(_child_ids, 1) > 0 THEN
    _final_child_ids := _child_ids;
    _final_child_id := _child_ids[1];
  ELSIF _child_id IS NOT NULL THEN
    _final_child_id := _child_id;
    _final_child_ids := ARRAY[_child_id];
  ELSE
    _final_child_id := _current_event.child_id;
    _final_child_ids := _current_event.child_ids;
  END IF;
  
  -- If allowing overlaps, set is_flexible = true
  IF _allow_overlaps THEN
    _is_flexible := true;
  ELSIF _is_flexible IS NULL THEN
    _is_flexible := _current_event.is_flexible;
  END IF;
  
  -- If allowing overlaps, set child_id to NULL first, then update
  -- For flexible events, we keep child_id as NULL and use child_ids array instead
  -- This bypasses the exclusion constraint which only checks child_id, not child_ids
  IF _allow_overlaps AND _final_child_id IS NOT NULL AND _final_child_id != _current_event.child_id THEN
    -- Step 1: Set child_id to NULL and is_flexible to true
    -- NULL child_id bypasses the exclusion constraint
    UPDATE events
    SET child_id = NULL,
        is_flexible = true
    WHERE id = _event_id;
    
    -- Step 2: Update all other fields (including child_ids array)
    -- We use child_ids array to store the child assignment instead of child_id
    -- This allows flexible events to have overlaps while still tracking the assignment
    UPDATE events
    SET 
      child_ids = _final_child_ids,
      is_flexible = true,
      title = COALESCE((_updates->>'title')::text, title),
      description = COALESCE((_updates->>'description')::text, description),
      status = COALESCE((_updates->>'status')::text, status),
      tags = CASE 
        WHEN _updates ? 'tags' AND jsonb_typeof(_updates->'tags') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'tags'))::text[] 
        WHEN _updates ? 'tags' 
        THEN tags -- If tags exists but is not an array, keep existing tags
        ELSE tags 
      END,
      material_id = CASE WHEN _updates ? 'material_id' THEN (_updates->>'material_id')::uuid ELSE material_id END,
      materials_attachment_ids = CASE 
        WHEN _updates ? 'materials_attachment_ids' AND jsonb_typeof(_updates->'materials_attachment_ids') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'materials_attachment_ids'))::uuid[] 
        WHEN _updates ? 'materials_attachment_ids' 
        THEN materials_attachment_ids -- If exists but is not an array, keep existing
        ELSE materials_attachment_ids 
      END,
      event_type = COALESCE((_updates->>'event_type')::text, event_type),
      subject_id = CASE WHEN _updates ? 'subject_id' THEN (_updates->>'subject_id')::uuid ELSE subject_id END,
      unit = COALESCE((_updates->>'unit')::text, unit),
      grade = COALESCE((_updates->>'grade')::text, grade),
      location = COALESCE((_updates->>'location')::text, location),
      mode = COALESCE((_updates->>'mode')::text, mode),
      instructor = COALESCE((_updates->>'instructor')::text, instructor),
      goal_link = CASE WHEN _updates ? 'goal_link' THEN (_updates->>'goal_link')::uuid ELSE goal_link END,
      recurrence_rule = CASE WHEN _updates ? 'recurrence_rule' THEN (_updates->'recurrence_rule')::jsonb ELSE recurrence_rule END,
      start_ts = CASE WHEN _updates ? 'start_ts' THEN (_updates->>'start_ts')::timestamptz ELSE start_ts END,
      end_ts = CASE WHEN _updates ? 'end_ts' THEN (_updates->>'end_ts')::timestamptz ELSE end_ts END,
      updated_at = NOW()
    WHERE id = _event_id;
    
    -- Step 3: Try to set child_id
    -- Note: Even with is_flexible=true, PostgreSQL may still check the exclusion constraint
    -- when updating child_id if there's a conflict with existing non-flexible events
    -- If this fails, we keep child_id as NULL and rely on child_ids array (which is acceptable for flexible events)
    -- The exclusion constraint only checks child_id, not child_ids, so using child_ids array bypasses the constraint
    BEGIN
      -- Try to set child_id directly - this may still fail due to the constraint checking against existing events
      UPDATE events
      SET child_id = _final_child_id,
          is_flexible = true
      WHERE id = _event_id
        AND is_flexible = true; -- Only update if is_flexible is still true
      
      -- If no rows were updated, the is_flexible check might have failed
      IF NOT FOUND THEN
        RAISE WARNING 'Could not update child_id - is_flexible might not be set correctly, keeping child_id as NULL';
        -- child_id remains NULL, child_ids array has the assignment
      END IF;
    EXCEPTION
      WHEN exclusion_violation THEN
        -- If setting child_id still fails due to constraint (even with is_flexible=true),
        -- keep it as NULL and rely on child_ids array
        -- This is acceptable for flexible events - the constraint only checks child_id, not child_ids
        -- The child assignment is still properly tracked via child_ids array
        RAISE WARNING 'Could not set child_id due to overlap constraint (even with is_flexible=true), keeping child_id as NULL and using child_ids array';
        -- child_id remains NULL, child_ids array has the assignment
        -- This is fine for flexible events - the application should check child_ids if child_id is NULL
      WHEN OTHERS THEN
        -- For any other error, keep child_id as NULL
        RAISE WARNING 'Error setting child_id: %, keeping child_id as NULL and using child_ids array', SQLERRM;
    END;
    
  ELSE
    -- Normal update - try direct update first
    BEGIN
      UPDATE events
      SET 
        child_id = COALESCE(_final_child_id, child_id),
        child_ids = COALESCE(_final_child_ids, child_ids),
        is_flexible = COALESCE(_is_flexible, is_flexible),
        title = COALESCE((_updates->>'title')::text, title),
        description = COALESCE((_updates->>'description')::text, description),
        status = COALESCE((_updates->>'status')::text, status),
        tags = CASE 
        WHEN _updates ? 'tags' AND jsonb_typeof(_updates->'tags') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'tags'))::text[] 
        WHEN _updates ? 'tags' 
        THEN tags -- If tags exists but is not an array, keep existing tags
        ELSE tags 
      END,
        material_id = CASE WHEN _updates ? 'material_id' THEN (_updates->>'material_id')::uuid ELSE material_id END,
        materials_attachment_ids = CASE 
        WHEN _updates ? 'materials_attachment_ids' AND jsonb_typeof(_updates->'materials_attachment_ids') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'materials_attachment_ids'))::uuid[] 
        WHEN _updates ? 'materials_attachment_ids' 
        THEN materials_attachment_ids -- If exists but is not an array, keep existing
        ELSE materials_attachment_ids 
      END,
        event_type = COALESCE((_updates->>'event_type')::text, event_type),
        subject_id = CASE WHEN _updates ? 'subject_id' THEN (_updates->>'subject_id')::uuid ELSE subject_id END,
        unit = COALESCE((_updates->>'unit')::text, unit),
        grade = COALESCE((_updates->>'grade')::text, grade),
        location = COALESCE((_updates->>'location')::text, location),
        mode = COALESCE((_updates->>'mode')::text, mode),
        instructor = COALESCE((_updates->>'instructor')::text, instructor),
        goal_link = CASE WHEN _updates ? 'goal_link' THEN (_updates->>'goal_link')::uuid ELSE goal_link END,
        recurrence_rule = CASE WHEN _updates ? 'recurrence_rule' THEN (_updates->'recurrence_rule')::jsonb ELSE recurrence_rule END,
        start_ts = CASE WHEN _updates ? 'start_ts' THEN (_updates->>'start_ts')::timestamptz ELSE start_ts END,
        end_ts = CASE WHEN _updates ? 'end_ts' THEN (_updates->>'end_ts')::timestamptz ELSE end_ts END,
        updated_at = NOW()
      WHERE id = _event_id;
      
    EXCEPTION
      WHEN exclusion_violation THEN
        -- If overlap error and allow_overlaps is true, handle it
        IF _allow_overlaps THEN
          -- Set child_id to NULL first
          UPDATE events
          SET child_id = NULL,
              is_flexible = true
          WHERE id = _event_id;
          
          -- Update all fields except child_id
          UPDATE events
          SET 
            child_ids = _final_child_ids,
            is_flexible = true,
            title = COALESCE((_updates->>'title')::text, title),
            description = COALESCE((_updates->>'description')::text, description),
            status = COALESCE((_updates->>'status')::text, status),
            tags = CASE 
        WHEN _updates ? 'tags' AND jsonb_typeof(_updates->'tags') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'tags'))::text[] 
        WHEN _updates ? 'tags' 
        THEN tags -- If tags exists but is not an array, keep existing tags
        ELSE tags 
      END,
            material_id = CASE WHEN _updates ? 'material_id' THEN (_updates->>'material_id')::uuid ELSE material_id END,
            materials_attachment_ids = CASE 
        WHEN _updates ? 'materials_attachment_ids' AND jsonb_typeof(_updates->'materials_attachment_ids') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'materials_attachment_ids'))::uuid[] 
        WHEN _updates ? 'materials_attachment_ids' 
        THEN materials_attachment_ids -- If exists but is not an array, keep existing
        ELSE materials_attachment_ids 
      END,
            event_type = COALESCE((_updates->>'event_type')::text, event_type),
            subject_id = CASE WHEN _updates ? 'subject_id' THEN (_updates->>'subject_id')::uuid ELSE subject_id END,
            unit = COALESCE((_updates->>'unit')::text, unit),
            grade = COALESCE((_updates->>'grade')::text, grade),
            location = COALESCE((_updates->>'location')::text, location),
            mode = COALESCE((_updates->>'mode')::text, mode),
            instructor = COALESCE((_updates->>'instructor')::text, instructor),
            goal_link = CASE WHEN _updates ? 'goal_link' THEN (_updates->>'goal_link')::uuid ELSE goal_link END,
            recurrence_rule = CASE WHEN _updates ? 'recurrence_rule' THEN (_updates->'recurrence_rule')::jsonb ELSE recurrence_rule END,
            start_ts = CASE WHEN _updates ? 'start_ts' THEN (_updates->>'start_ts')::timestamptz ELSE start_ts END,
            end_ts = CASE WHEN _updates ? 'end_ts' THEN (_updates->>'end_ts')::timestamptz ELSE end_ts END,
            updated_at = NOW()
          WHERE id = _event_id;
          
          -- Now try to set child_id (may still fail due to constraint checking against other events)
          -- If it fails, we keep child_id as NULL and rely on child_ids array
          BEGIN
            UPDATE events
            SET child_id = _final_child_id,
                is_flexible = true
            WHERE id = _event_id;
          EXCEPTION
            WHEN exclusion_violation THEN
              -- If setting child_id still fails, keep it as NULL - child_ids array has the assignment
              RAISE WARNING 'Could not set child_id due to overlap constraint in exception handler, keeping child_id as NULL and using child_ids array';
              -- child_id remains NULL, which is acceptable for flexible events
          END;
        ELSE
          RAISE EXCEPTION 'Event overlaps with existing event for child: %', COALESCE(_final_child_id::text, 'unknown');
        END IF;
    END;
  END IF;
  
  RETURN jsonb_build_object('ok', true, 'id', _event_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_event_with_overlap_handling(uuid, jsonb, boolean) TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_event_with_overlap_handling IS 'Updates an event with optional overlap handling. If _allow_overlaps is true, sets is_flexible=true and uses child_ids array to bypass constraint.';


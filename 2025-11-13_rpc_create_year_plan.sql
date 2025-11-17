-- RPC: Create a year plan with children and milestones
-- Part of Phase 1 - Year-Round Intelligence Core
-- Uses SECURITY DEFINER to bypass RLS while still validating family membership

CREATE OR REPLACE FUNCTION public.create_year_plan(
  p_family_id uuid,
  p_start date,
  p_end date,
  p_breaks jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT auth.uid(),
  p_scope text DEFAULT 'current',
  p_children jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
OWNER TO postgres
AS $$
DECLARE
  _year_plan_id uuid;
  _user_family_id uuid;
  _child_record jsonb;
  _week_start date;
  _week_end date;
  _current_date date;
BEGIN
  -- Verify the user belongs to the family being used
  SELECT family_id INTO _user_family_id
  FROM profiles
  WHERE id = p_created_by;
  
  IF _user_family_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  IF _user_family_id != p_family_id THEN
    RAISE EXCEPTION 'Family ID does not match user profile';
  END IF;
  
  -- Validate dates
  IF p_start >= p_end THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;
  
  IF (p_end - p_start) > 370 THEN
    RAISE EXCEPTION 'Year plan cannot exceed 370 days';
  END IF;
  
  -- Validate breaks array length
  IF jsonb_array_length(p_breaks) > 40 THEN
    RAISE EXCEPTION 'Too many breaks (maximum 40)';
  END IF;
  
  -- Create the year plan
  INSERT INTO year_plans(
    family_id,
    plan_scope,
    start_date,
    end_date,
    created_by
  )
  VALUES (
    p_family_id,
    p_scope,
    p_start,
    p_end,
    p_created_by
  )
  RETURNING id INTO _year_plan_id;
  
  -- Add children to year_plan_children
  FOR _child_record IN SELECT * FROM jsonb_array_elements(p_children)
  LOOP
    INSERT INTO year_plan_children(
      year_plan_id,
      child_id,
      subjects,
      hours_per_week
    )
    VALUES (
      _year_plan_id,
      (_child_record->>'childId')::uuid,
      COALESCE(_child_record->'subjects', '[]'::jsonb),
      COALESCE(_child_record->'hoursPerWeek', '{}'::jsonb)
    );
  END LOOP;
  
  -- Auto-generate weekly milestones
  _current_date := p_start;
  WHILE _current_date <= p_end
  LOOP
    _week_start := _current_date;
    _week_end := LEAST(_current_date + INTERVAL '6 days', p_end);
    
    INSERT INTO term_milestones(
      year_plan_id,
      week_start,
      week_end,
      summary,
      progress_target
    )
    VALUES (
      _year_plan_id,
      _week_start,
      _week_end,
      NULL,
      '{}'::jsonb
    );
    
    _current_date := _week_end + INTERVAL '1 day';
  END LOOP;
  
  RETURN _year_plan_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create year plan: %', SQLERRM;
END;
$$;


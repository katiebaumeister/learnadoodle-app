-- Fix trigger that runs when event status -> 'done': it used ON CONFLICT (event_id)
-- but we now have UNIQUE (event_id, child_id). Update the function to use that and
-- resolve child_id from event (skip insert if no child so API can insert per-child).

CREATE OR REPLACE FUNCTION public._attendance_upsert_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  _date DATE;
  _mins INT;
  _cap INT := 24 * 60;
  _has_day_date BOOLEAN;
  _child_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_records' AND column_name = 'day_date'
  ) INTO _has_day_date;

  IF (TG_OP = 'UPDATE' AND NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done')) OR
     (TG_OP = 'INSERT' AND NEW.status = 'done') THEN
    _date := (NEW.start_ts AT TIME ZONE 'UTC')::DATE;
    _mins := GREATEST(0, CAST(EXTRACT(EPOCH FROM (NEW.end_ts - NEW.start_ts)) / 60 AS INT));
    -- Resolve one child for this row (trigger inserts one row; API can add rest for whole-family)
    _child_id := NEW.child_id;
    IF _child_id IS NULL AND NEW.child_ids IS NOT NULL AND array_length(NEW.child_ids, 1) > 0 THEN
      _child_id := NEW.child_ids[1];
    END IF;

    IF _has_day_date AND _child_id IS NOT NULL THEN
      INSERT INTO public.attendance_records (family_id, child_id, event_id, day_date, minutes, status)
      VALUES (NEW.family_id, _child_id, NEW.id, _date, LEAST(_mins, _cap), 'present')
      ON CONFLICT (event_id, child_id) DO UPDATE
        SET minutes = LEAST(
          COALESCE(public.attendance_records.minutes, 0) + EXCLUDED.minutes, _cap
        ),
        status = CASE WHEN EXCLUDED.minutes > 0 THEN 'present' ELSE public.attendance_records.status END;
    ELSIF NOT _has_day_date AND _child_id IS NOT NULL THEN
      INSERT INTO public.attendance_records (family_id, child_id, date, status, minutes_present, source)
      VALUES (NEW.family_id, _child_id, _date, 'present', LEAST(_mins, _cap), 'event')
      ON CONFLICT (child_id, date) DO UPDATE
        SET minutes_present = LEAST(
          COALESCE(public.attendance_records.minutes_present, 0) + EXCLUDED.minutes_present, _cap
        ),
        status = CASE WHEN EXCLUDED.minutes_present > 0 THEN 'present' ELSE public.attendance_records.status END
        WHERE public.attendance_records.family_id = NEW.family_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

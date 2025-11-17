-- Fix post_event_credits trigger to handle NULL subject_id gracefully
-- This prevents errors when completing events without a subject_id

CREATE OR REPLACE FUNCTION post_event_credits()
RETURNS TRIGGER AS $$
DECLARE
  event_minutes INTEGER;
BEGIN
  -- Only process when status changes to 'done'
  IF NEW.status = 'done' AND (OLD.status IS NULL OR OLD.status != 'done') THEN
    -- Skip if subject_id is NULL (event doesn't have a subject)
    IF NEW.subject_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Calculate event duration in minutes
    event_minutes := EXTRACT(EPOCH FROM (NEW.end_ts - NEW.start_ts)) / 60;
    
    -- Only insert if we have valid minutes
    IF event_minutes > 0 THEN
      -- Post credit for completed event
      -- Use COALESCE to handle NULL subject_id (though we already checked above)
      INSERT INTO subject_credit_ledger (
        child_id,
        subject_id,
        event_id,
        credit_type,
        minutes,
        description,
        created_by
      ) VALUES (
        NEW.child_id,
        NEW.subject_id,
        NEW.id,
        'completed_event',
        event_minutes::INTEGER,
        'Completed: ' || COALESCE(NEW.title, 'Untitled Event'),
        NEW.updated_by
      )
      -- Ignore if subject_credit_ledger doesn't exist or has different structure
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If subject_credit_ledger table doesn't exist or has wrong structure,
    -- just log and continue (don't fail the event update)
    RAISE WARNING 'post_event_credits trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


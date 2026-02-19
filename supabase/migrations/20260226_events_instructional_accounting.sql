-- Instructional accounting layer (bridge for plan compliance)
-- See DESIGN_PLAN_YEAR.md and instructional accounting spec.

-- 1) instructional_minutes: authoritative when set; otherwise derive from start_ts/end_ts
ALTER TABLE events
ADD COLUMN IF NOT EXISTS instructional_minutes integer NULL;

COMMENT ON COLUMN events.instructional_minutes IS 'When set, used as authoritative instructional minutes for plan compliance. When null, derived from start_ts/end_ts.';

-- 2) instructional_day_credit: optional explicit day credit (e.g. for partial/field-trip days)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS instructional_day_credit numeric NULL;

COMMENT ON COLUMN events.instructional_day_credit IS 'Optional explicit day credit for compliance. When null, day credit is computed from presence of counted minutes on that day.';

-- 3) counts_toward_plan: default FALSE for new manual events (opt-in to count)
-- Existing rows keep current value; new inserts default false unless set by apply_to_calendar or user.
ALTER TABLE events
ALTER COLUMN counts_toward_plan SET DEFAULT false;

-- 4) Plan health / compliance: only count events tied to a plan
-- academic_year_id already exists (20260217). We filter by it in plan_health queries.

-- 5) learning_category: internal classification for sane defaults
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'learning_category') THEN
    ALTER TABLE events ADD COLUMN learning_category text NULL;
    COMMENT ON COLUMN events.learning_category IS 'Internal: INSTRUCTIONAL | NON_INSTRUCTIONAL. Lesson/Assignment/Project default INSTRUCTIONAL; Appointment default NON_INSTRUCTIONAL. counts_toward_plan is the explicit opt-in.';
  END IF;
END $$;

-- Index for plan health: events that count toward a given academic year
CREATE INDEX IF NOT EXISTS idx_events_academic_year_counts
ON events(academic_year_id)
WHERE counts_toward_plan = true AND deleted_at IS NULL;

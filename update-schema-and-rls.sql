/* Update schema and RLS policies for AI integration */

/* --------------------------------------------------------------------
 (1) Possible cleanup – confirm these tables are truly obsolete.
     Remove "--" if you really want to drop them.
-------------------------------------------------------------------- */
-- DROP TABLE public.class_day_mappings;
-- DROP TABLE public.class_days;
-- DROP TABLE public.holidays;
-- DROP TABLE public.typical_holidays;

/* --------------------------------------------------------------------
 (2) Bring academic_years in line with main schema
-------------------------------------------------------------------- */

-- 2-a  Add global_year_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'academic_years'
      AND column_name  = 'global_year_id'
  ) THEN
    ALTER TABLE public.academic_years
      ADD COLUMN global_year_id uuid;            -- temporarily nullable
  END IF;
END $$;

-- 2-b  FK → global_academic_years
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'academic_years_global_year_id_fkey'
  ) THEN
    ALTER TABLE public.academic_years
      ADD CONSTRAINT academic_years_global_year_id_fkey
      FOREIGN KEY (global_year_id)
      REFERENCES public.global_academic_years(id);
  END IF;
END $$;

-- 2-c  RLS by family_id
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_academic_years ON public.academic_years;
CREATE POLICY family_access_academic_years
  ON public.academic_years
  USING (
    family_id = (
      current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
    )::uuid
  );

/* --------------------------------------------------------------------
 (3) LESSONS table: change progress → jsonb; add is_auto + updated_at
-------------------------------------------------------------------- */

ALTER TABLE public.lessons
  ALTER COLUMN progress TYPE jsonb USING progress::jsonb,
  ADD COLUMN IF NOT EXISTS is_auto      boolean,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

/* ===========================================================
 (4) Attendance needs family_id for RLS, needs foreign key to academic_year
=========================================================== */

-- (4.a)  family_id missing
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS family_id uuid;

UPDATE public.attendance
SET    family_id = (
        SELECT family_id
        FROM   public.children c
        WHERE  c.id = attendance.child_id
      )
WHERE  family_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_family_id_fkey'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_family_id_fkey
      FOREIGN KEY (family_id) REFERENCES public.family(id);
  END IF;
END $$;

-- (4.b)   Add academic_year_id
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS academic_year_id uuid;

-- FK to academic_years
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_academic_year_id_fkey'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_academic_year_id_fkey
      FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);
  END IF;
END $$;

/* --------------------------------------------------------------------
 (6) RLS for AI tables + global look-ups
-------------------------------------------------------------------- */

/* ai_conversations */
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_ai_conversations ON public.ai_conversations;
CREATE POLICY family_ai_conversations
  ON public.ai_conversations
  USING (
    family_id = (
      current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
    )::uuid
  );

/* ai_messages */
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_ai_messages ON public.ai_messages;
CREATE POLICY family_ai_messages
  ON public.ai_messages
  USING (
    (SELECT family_id
     FROM   public.ai_conversations c
     WHERE  c.id = ai_messages.conversation_id)
    = (
      current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
    )::uuid
  );

/* ai_actions */
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_ai_actions ON public.ai_actions;
CREATE POLICY family_ai_actions
  ON public.ai_actions
  USING (
    (SELECT family_id
     FROM   public.ai_conversations c
     WHERE  c.id = ai_actions.conversation_id)
    = (
      current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
    )::uuid
  );

/* global_academic_years (read-only) */
ALTER TABLE public.global_academic_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_only_global_years ON public.global_academic_years;
CREATE POLICY read_only_global_years
  ON public.global_academic_years
  FOR SELECT USING (true);

/* global_official_holidays (read-only) */
ALTER TABLE public.global_official_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_only_holidays ON public.global_official_holidays;
CREATE POLICY read_only_holidays
  ON public.global_official_holidays
  FOR SELECT USING (true);

/* --------------------------------------------------------------------
 (7) RLS for Family-Scoped Tables
      Policy: Only rows belonging to the current family_id are visible
-------------------------------------------------------------------- */

/* attendance */
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_attendance ON public.attendance;
CREATE POLICY family_access_attendance
ON public.attendance
USING (
  child_id IS NOT NULL AND  -- keeps structure consistent
  (SELECT family_id
   FROM public.children c
   WHERE c.id = attendance.child_id)
  = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

/* lessons */
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_lessons ON public.lessons;
CREATE POLICY family_access_lessons
ON public.lessons
USING (
  family_id = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

/* planning_comments */
ALTER TABLE public.planning_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_planning_comments ON public.planning_comments;
CREATE POLICY family_access_planning_comments
ON public.planning_comments
USING (
  family_id = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

/* subject */
ALTER TABLE public.subject ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_subject ON public.subject;
CREATE POLICY family_access_subject
ON public.subject
USING (
  family_id = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

/* subject_track */
ALTER TABLE public.subject_track ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_subject_track ON public.subject_track;
CREATE POLICY family_access_subject_track
ON public.subject_track
USING (
  family_id = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

/* track */
ALTER TABLE public.track ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_track ON public.track;
CREATE POLICY family_access_track
ON public.track
USING (
  family_id = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

/* children */
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_access_children ON public.children;
CREATE POLICY family_access_children
ON public.children
USING (
  family_id = (
    current_setting('request.jwt.claims', true)::jsonb ->> 'family_id'
  )::uuid
);

-- Complete Setup for Attendance, Uploads, and Lesson Plans Systems
-- Run this entire file in Supabase SQL Editor

-- ============================================================================
-- STEP 1: ATTENDANCE SYSTEM
-- ============================================================================

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_family_member(_family UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.children c
    WHERE c.family_id = _family
  );
$$;

CREATE OR REPLACE FUNCTION public.child_belongs_to_family(_child UUID, _family UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = _child AND c.family_id = _family
  );
$$;

-- attendance_records table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','tardy','excused','holiday')),
  minutes_present INT NOT NULL DEFAULT 0 CHECK (minutes_present >= 0),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_records_family_date_idx ON public.attendance_records (family_id, date);
CREATE INDEX IF NOT EXISTS attendance_records_child_date_idx ON public.attendance_records (child_id, date);

-- RLS for attendance_records
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select ON public.attendance_records;
CREATE POLICY attendance_select ON public.attendance_records FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_insert ON public.attendance_records;
CREATE POLICY attendance_insert ON public.attendance_records FOR INSERT WITH CHECK (
  is_family_member(family_id) AND child_belongs_to_family(child_id, family_id)
);

DROP POLICY IF EXISTS attendance_update ON public.attendance_records;
CREATE POLICY attendance_update ON public.attendance_records FOR UPDATE 
USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_delete ON public.attendance_records;
CREATE POLICY attendance_delete ON public.attendance_records FOR DELETE USING (is_family_member(family_id));

-- Trigger for automatic attendance from events
CREATE OR REPLACE FUNCTION public._attendance_upsert_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  _date DATE;
  _mins INT;
  _cap INT := 24 * 60;
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done')) OR
     (TG_OP = 'INSERT' AND NEW.status = 'done') THEN
    _date := (NEW.start_ts AT TIME ZONE 'UTC')::DATE;
    _mins := GREATEST(0, CAST(EXTRACT(EPOCH FROM (NEW.end_ts - NEW.start_ts)) / 60 AS INT));

    INSERT INTO public.attendance_records (family_id, child_id, date, status, minutes_present, source)
    VALUES (NEW.family_id, NEW.child_id, _date, 'present', LEAST(_mins, _cap), 'event')
    ON CONFLICT (child_id, date) DO UPDATE
      SET minutes_present = LEAST(
        COALESCE(public.attendance_records.minutes_present,0) + EXCLUDED.minutes_present, _cap
      ),
      status = CASE WHEN EXCLUDED.minutes_present > 0 THEN 'present' ELSE public.attendance_records.status END
      WHERE public.attendance_records.family_id = NEW.family_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_from_event ON public.events;
CREATE TRIGGER trg_attendance_from_event
AFTER INSERT OR UPDATE OF status ON public.events
FOR EACH ROW
EXECUTE FUNCTION public._attendance_upsert_from_event();

-- Attendance RPCs
CREATE OR REPLACE FUNCTION public.upsert_attendance(
  _family UUID, _child UUID, _date DATE, _status TEXT, _minutes_present INT, _notes TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_family_member(_family) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT child_belongs_to_family(_child, _family) THEN RAISE EXCEPTION 'child not in family'; END IF;
  IF _status NOT IN ('present','absent','tardy','excused','holiday') THEN RAISE EXCEPTION 'invalid status %', _status; END IF;

  INSERT INTO attendance_records (family_id, child_id, date, status, minutes_present, notes, source)
  VALUES (_family, _child, _date, _status, GREATEST(0,_minutes_present), _notes, 'manual')
  ON CONFLICT (child_id, date) DO UPDATE
    SET status = EXCLUDED.status, minutes_present = GREATEST(0, EXCLUDED.minutes_present), notes = EXCLUDED.notes, source = 'manual';

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_range(
  _family UUID, _from DATE, _to DATE, _child_ids UUID[] DEFAULT NULL
) RETURNS TABLE (day DATE, child_id UUID, status TEXT, minutes_present INT)
LANGUAGE SQL SECURITY DEFINER SET search_path = public
AS $$
  SELECT ar.date AS day, ar.child_id, ar.status, ar.minutes_present
  FROM attendance_records ar
  WHERE ar.family_id = _family AND ar.date >= _from AND ar.date <= _to
    AND ( _child_ids IS NULL OR ar.child_id = ANY(_child_ids) );
$$;

DROP FUNCTION IF EXISTS public.get_attendance_summary(UUID, DATE, DATE);
CREATE OR REPLACE FUNCTION public.get_attendance_summary(_family UUID, _from DATE, _to DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _by_child JSON; _total_days INT; _present_days INT; _pct NUMERIC;
BEGIN
  IF NOT is_family_member(_family) THEN RAISE EXCEPTION 'not authorized'; END IF;

  WITH days AS (
    SELECT ar.child_id, ar.status, COUNT(*)::INT AS cnt, SUM(ar.minutes_present)::INT AS minutes
    FROM attendance_records ar
    WHERE ar.family_id = _family AND ar.date BETWEEN _from AND _to
    GROUP BY ar.child_id, ar.status
  )
  SELECT COALESCE(json_agg(json_build_object(
    'child_id', child_id,
    'present_days', COALESCE((SELECT cnt FROM days d2 WHERE d2.child_id=days.child_id AND d2.status='present'),0),
    'absent_days',  COALESCE((SELECT cnt FROM days d2 WHERE d2.child_id=days.child_id AND d2.status='absent'),0),
    'tardy_days',   COALESCE((SELECT cnt FROM days d2 WHERE d2.child_id=days.child_id AND d2.status='tardy'),0),
    'excused_days', COALESCE((SELECT cnt FROM days d2 WHERE d2.child_id=days.child_id AND d2.status='excused'),0),
    'minutes_present', COALESCE((SELECT minutes FROM days d2 WHERE d2.child_id=days.child_id AND d2.status='present'),0)
  )), '[]'::JSON) INTO _by_child
  FROM (SELECT DISTINCT child_id FROM attendance_records WHERE family_id=_family AND date BETWEEN _from AND _to) days;

  SELECT COUNT(DISTINCT date)::INT INTO _total_days FROM attendance_records ar WHERE ar.family_id=_family AND ar.date BETWEEN _from AND _to;
  SELECT COUNT(*)::INT INTO _present_days FROM (
    SELECT child_id, date FROM attendance_records WHERE family_id=_family AND date BETWEEN _from AND _to AND status='present'
  ) s;

  _pct := CASE WHEN _total_days = 0 THEN 0 ELSE ROUND((_present_days::NUMERIC / _total_days::NUMERIC)*100,2) END;
  RETURN json_build_object('by_child', _by_child, 'pct_present', _pct);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_attendance(UUID, UUID, DATE, TEXT, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_attendance_range(UUID, DATE, DATE, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(UUID, DATE, DATE) TO authenticated, service_role;

-- ============================================================================
-- STEP 2: UPLOADS SYSTEM
-- ============================================================================

-- uploads table
CREATE TABLE IF NOT EXISTS public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  child_id UUID NULL REFERENCES public.children(id) ON DELETE SET NULL,
  subject_id UUID NULL,
  event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploads_family_created_idx ON public.uploads (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_child_created_idx ON public.uploads (child_id, created_at DESC);

-- RLS for uploads
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uploads_select ON public.uploads;
CREATE POLICY uploads_select ON public.uploads FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS uploads_insert ON public.uploads;
CREATE POLICY uploads_insert ON public.uploads FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS uploads_update ON public.uploads;
CREATE POLICY uploads_update ON public.uploads FOR UPDATE 
USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS uploads_delete ON public.uploads;
CREATE POLICY uploads_delete ON public.uploads FOR DELETE USING (is_family_member(family_id));

-- Storage RLS (requires 'evidence' bucket to exist)
DROP POLICY IF EXISTS "evidence read" ON storage.objects;
CREATE POLICY "evidence read" ON storage.objects FOR SELECT
USING (bucket_id = 'evidence' AND (metadata->>'family_id')::UUID IS NOT NULL AND is_family_member((metadata->>'family_id')::UUID));

DROP POLICY IF EXISTS "evidence write" ON storage.objects;
CREATE POLICY "evidence write" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'evidence' AND (metadata->>'family_id')::UUID IS NOT NULL AND is_family_member((metadata->>'family_id')::UUID));

DROP POLICY IF EXISTS "evidence update" ON storage.objects;
CREATE POLICY "evidence update" ON storage.objects FOR UPDATE
USING (bucket_id='evidence' AND is_family_member((metadata->>'family_id')::UUID))
WITH CHECK (bucket_id='evidence' AND is_family_member((metadata->>'family_id')::UUID));

DROP POLICY IF EXISTS "evidence delete" ON storage.objects;
CREATE POLICY "evidence delete" ON storage.objects FOR DELETE
USING (bucket_id='evidence' AND is_family_member((metadata->>'family_id')::UUID));

-- Uploads RPCs
CREATE OR REPLACE FUNCTION public.create_upload_record(
  _family UUID, _child UUID, _subject UUID, _event UUID, _path TEXT, _mime TEXT, _bytes INT, _title TEXT,
  _tags TEXT[] DEFAULT '{}', _notes TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE _id UUID;
BEGIN
  IF NOT is_family_member(_family) THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO public.uploads (family_id, child_id, subject_id, event_id, storage_path, mime, bytes, title, tags, notes)
  VALUES (_family, _child, _subject, _event, _path, _mime, COALESCE(_bytes,0), _title, COALESCE(_tags,'{}'::TEXT[]), _notes)
  RETURNING id INTO _id;
  RETURN json_build_object('ok', true, 'id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_uploads(
  _family UUID, _q TEXT DEFAULT NULL, _child_ids UUID[] DEFAULT NULL, _limit INT DEFAULT 50, _cursor TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, title TEXT, storage_path TEXT, mime TEXT, bytes INT,
                 child_id UUID, subject_id UUID, event_id UUID, tags TEXT[], notes TEXT)
LANGUAGE SQL SECURITY DEFINER
AS $$
  SELECT u.id, u.created_at, u.title, u.storage_path, u.mime, u.bytes, u.child_id, u.subject_id, u.event_id, u.tags, u.notes
  FROM public.uploads u
  WHERE u.family_id = _family AND (_cursor IS NULL OR u.created_at < _cursor)
    AND (_child_ids IS NULL OR u.child_id = ANY(_child_ids))
    AND (_q IS NULL OR (u.title ILIKE '%'||_q||'%' OR u.notes ILIKE '%'||_q||'%'))
  ORDER BY u.created_at DESC LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public.create_upload_record(UUID, UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, TEXT[], TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_uploads(UUID, TEXT, UUID[], INT, TIMESTAMPTZ) TO authenticated, service_role;

-- ============================================================================
-- STEP 3: LESSON PLANS SYSTEM
-- ============================================================================

-- lesson_plans table
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  subject_id UUID NULL,
  title TEXT NOT NULL,
  description TEXT,
  grade_level TEXT,
  estimated_minutes INT NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- lesson_plan_steps table
CREATE TABLE IF NOT EXISTS public.lesson_plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  "order" INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('read','practice','quiz','project','other')),
  title TEXT NOT NULL,
  details TEXT,
  resource_urls TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS lesson_plan_steps_plan_order_idx ON public.lesson_plan_steps (plan_id, "order");

-- child_plan_links table
CREATE TABLE IF NOT EXISTS public.child_plan_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  week_start DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for lesson plans
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_plan_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_plan_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lp_select ON public.lesson_plans;
CREATE POLICY lp_select ON public.lesson_plans FOR SELECT USING (is_family_member(family_id));
DROP POLICY IF EXISTS lp_ins ON public.lesson_plans;
CREATE POLICY lp_ins ON public.lesson_plans FOR INSERT WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS lp_upd ON public.lesson_plans;
CREATE POLICY lp_upd ON public.lesson_plans FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS lp_del ON public.lesson_plans;
CREATE POLICY lp_del ON public.lesson_plans FOR DELETE USING (is_family_member(family_id));

DROP POLICY IF EXISTS lps_select ON public.lesson_plan_steps;
CREATE POLICY lps_select ON public.lesson_plan_steps FOR SELECT USING (
  EXISTS (SELECT 1 FROM lesson_plans lp WHERE lp.id=plan_id AND is_family_member(lp.family_id))
);
DROP POLICY IF EXISTS lps_write ON public.lesson_plan_steps;
CREATE POLICY lps_write ON public.lesson_plan_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM lesson_plans lp WHERE lp.id=plan_id AND is_family_member(lp.family_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM lesson_plans lp WHERE lp.id=plan_id AND is_family_member(lp.family_id))
);

DROP POLICY IF EXISTS cpl_select ON public.child_plan_links;
CREATE POLICY cpl_select ON public.child_plan_links FOR SELECT USING (
  EXISTS(SELECT 1 FROM lesson_plans lp JOIN children c ON c.family_id=lp.family_id 
         WHERE lp.id=plan_id AND c.id=child_id AND is_family_member(lp.family_id))
);
DROP POLICY IF EXISTS cpl_write ON public.child_plan_links;
CREATE POLICY cpl_write ON public.child_plan_links FOR ALL USING (
  EXISTS(SELECT 1 FROM lesson_plans lp JOIN children c ON c.family_id=lp.family_id 
         WHERE lp.id=plan_id AND c.id=child_id AND is_family_member(lp.family_id))
) WITH CHECK (
  EXISTS(SELECT 1 FROM lesson_plans lp JOIN children c ON c.family_id=lp.family_id 
         WHERE lp.id=plan_id AND c.id=child_id AND is_family_member(lp.family_id))
);

-- Lesson Plans RPCs
CREATE OR REPLACE FUNCTION public.create_lesson_plan(
  _family UUID, _subject UUID, _title TEXT, _description TEXT, _grade_level TEXT, _tags TEXT[], _steps JSONB
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE _id UUID; _est INT := 0; s JSONB;
BEGIN
  IF NOT is_family_member(_family) THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO lesson_plans (family_id, subject_id, title, description, grade_level, tags, estimated_minutes)
  VALUES (_family, _subject, _title, _description, _grade_level, COALESCE(_tags,'{}'::TEXT[]), 0) RETURNING id INTO _id;

  FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(_steps,'[]'::JSONB)) LOOP
    INSERT INTO lesson_plan_steps (plan_id, "order", kind, title, details, resource_urls)
    VALUES (_id, COALESCE((s->>'order')::INT, 1), COALESCE(s->>'kind','other'), COALESCE(s->>'title','Step'), s->>'details',
            COALESCE((SELECT array_agg(value::TEXT) FROM jsonb_array_elements_text(s->'resource_urls')), '{}'));
    _est := _est + COALESCE((s->>'minutes')::INT, 0);
  END LOOP;

  UPDATE lesson_plans SET estimated_minutes = _est WHERE id=_id;
  RETURN json_build_object('ok', true, 'id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lesson_plans(_family UUID, _q TEXT DEFAULT NULL, _subject_ids UUID[] DEFAULT NULL)
RETURNS TABLE (id UUID, title TEXT, description TEXT, subject_id UUID, estimated_minutes INT, tags TEXT[], created_at TIMESTAMPTZ)
LANGUAGE SQL SECURITY DEFINER
AS $$
  SELECT id, title, description, subject_id, estimated_minutes, tags, created_at FROM lesson_plans
  WHERE family_id = _family
    AND (_q IS NULL OR title ILIKE '%'||_q||'%' OR COALESCE(description,'') ILIKE '%'||_q||'%')
    AND (_subject_ids IS NULL OR subject_id = ANY(_subject_ids))
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.instantiate_plan_to_week(_family UUID, _plan_id UUID, _child_id UUID, _week_start DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE _created INT := 0; _steps RECORD; _from DATE := _week_start; _to DATE := _week_start + 6;
        _avail RECORD; _cursor TIMESTAMPTZ; _need INT; _slot_start TIMESTAMPTZ; _slot_end TIMESTAMPTZ; _snap INT := 15;
BEGIN
  IF NOT is_family_member(_family) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT child_belongs_to_family(_child_id, _family) THEN RAISE EXCEPTION 'child mismatch'; END IF;

  FOR _steps IN
    SELECT s.id, s."order", s.kind, s.title,
           COALESCE(NULLIF((regexp_match(s.details, '(\d+)\s*min'))[1], '')::INT, 0) AS minutes
    FROM lesson_plan_steps s WHERE s.plan_id = _plan_id ORDER BY s."order"
  LOOP
    _need := GREATEST(15, COALESCE(_steps.minutes, 0));
    FOR _avail IN SELECT * FROM get_child_availability(_child_id, _from, _to) ORDER BY start_ts LOOP
      _cursor := _avail.start_ts;
      WHILE _need > 0 AND _cursor < _avail.end_ts LOOP
        _slot_start := _cursor;
        _slot_end := LEAST(_avail.end_ts, _slot_start + INTERVAL '15 minutes');
        BEGIN
          INSERT INTO events (family_id, child_id, subject_id, start_ts, end_ts, status, title)
          VALUES (_family, _child_id, (SELECT subject_id FROM lesson_plans WHERE id=_plan_id),
                  _slot_start, _slot_end, 'scheduled', _steps.title);
          _created := _created + 1;
          _need := _need - _snap;
        EXCEPTION WHEN OTHERS THEN NULL; END;
        _cursor := _cursor + INTERVAL '15 minutes';
      END LOOP;
      EXIT WHEN _need <= 0;
    END LOOP;
  END LOOP;

  INSERT INTO child_plan_links (plan_id, child_id, week_start, status)
  VALUES (_plan_id, _child_id, _week_start, 'planned') ON CONFLICT DO NOTHING;

  RETURN json_build_object('ok', true, 'created_events', _created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lesson_plan(UUID, UUID, TEXT, TEXT, TEXT, TEXT[], JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lesson_plans(UUID, TEXT, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.instantiate_plan_to_week(UUID, UUID, UUID, DATE) TO authenticated, service_role;

-- ============================================================================
-- DONE! Now create the storage bucket via Supabase Dashboard:
-- 1. Go to Storage in the left sidebar
-- 2. Click "New bucket"
-- 3. Name it "evidence"
-- 4. Make it Private (uncheck "Public bucket")
-- 5. Click "Create bucket"
-- ============================================================================


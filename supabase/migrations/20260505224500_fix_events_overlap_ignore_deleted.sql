-- Ensure overlap enforcement ignores soft-deleted events.
-- This keeps DB behavior aligned with fix_target_gap conflict pre-check:
--   family_id match, status != canceled, deleted_at IS NULL, child overlap, time overlap.

DO $$
DECLARE
  c RECORD;
BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;

  -- Drop any existing exclusion constraints on events overlap shape.
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND contype = 'x'
      AND conname LIKE 'events_no_overlap_exclude%'
  LOOP
    EXECUTE format('ALTER TABLE public.events DROP CONSTRAINT IF EXISTS %I CASCADE', c.conname);
  END LOOP;

  -- Recreate canonical overlap guard. Soft-deleted and canceled rows do not block inserts.
  ALTER TABLE public.events
    ADD CONSTRAINT events_no_overlap_exclude
    EXCLUDE USING gist (
      child_id WITH =,
      tstzrange(start_ts, end_ts) WITH &&
    )
    WHERE (
      COALESCE(is_backlog, false) = false
      AND COALESCE(is_flexible, false) = false
      AND recurrence_rule IS NULL
      AND COALESCE(status, '') <> 'canceled'
      AND canceled_at IS NULL
      AND deleted_at IS NULL
    );
END $$;

COMMENT ON CONSTRAINT events_no_overlap_exclude ON public.events IS
  'Prevents overlapping events for the same child. Ignores canceled and soft-deleted events.';

-- Some environments still have an events overlap TRIGGER function (outside repo migrations)
-- that may count soft-deleted rows. Patch those trigger functions in-place.
DO $$
DECLARE
  trg RECORD;
  patched_count integer := 0;
BEGIN
  FOR trg IN
    SELECT
      t.tgname,
      n.nspname AS func_schema,
      p.proname AS func_name,
      pg_get_functiondef(p.oid) AS func_def
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.events'::regclass
      AND NOT t.tgisinternal
  LOOP
    -- Patch only trigger functions that look like overlap checks.
    IF trg.func_def ILIKE '%overlap%'
       AND trg.func_def ILIKE '%start_ts%'
       AND trg.func_def ILIKE '%end_ts%'
       AND trg.func_def ILIKE '%child%' THEN
      EXECUTE format($sql$
        CREATE OR REPLACE FUNCTION %I.%I()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $fn$
        DECLARE
          new_child_ids uuid[] := COALESCE(NEW.child_ids, ARRAY[]::uuid[]);
        BEGIN
          -- Soft-deleted or canceled incoming rows should never participate in overlap checks.
          IF NEW.deleted_at IS NOT NULL OR COALESCE(NEW.status, '') = 'canceled' THEN
            RETURN NEW;
          END IF;

          IF NEW.start_ts IS NULL OR NEW.end_ts IS NULL OR NEW.end_ts <= NEW.start_ts THEN
            RETURN NEW;
          END IF;

          IF NEW.child_id IS NOT NULL AND NOT (NEW.child_id = ANY(new_child_ids)) THEN
            new_child_ids := array_append(new_child_ids, NEW.child_id);
          END IF;

          IF EXISTS (
            SELECT 1
            FROM public.events existing
            WHERE existing.family_id = NEW.family_id
              AND existing.deleted_at IS NULL
              AND COALESCE(existing.status, '') <> 'canceled'
              AND existing.id <> NEW.id
              AND NEW.start_ts < existing.end_ts
              AND NEW.end_ts > existing.start_ts
              AND (
                (existing.child_id IS NOT NULL AND existing.child_id = ANY(new_child_ids))
                OR (NEW.child_id IS NOT NULL AND existing.child_ids IS NOT NULL AND NEW.child_id = ANY(existing.child_ids))
                OR (existing.child_ids IS NOT NULL AND existing.child_ids && new_child_ids)
                OR (existing.child_id IS NOT NULL AND NEW.child_id IS NOT NULL AND existing.child_id = NEW.child_id)
              )
          ) THEN
            RAISE EXCEPTION 'Event overlaps with existing event for child: %%', COALESCE(NEW.child_id::text, 'unknown');
          END IF;

          RETURN NEW;
        END;
        $fn$;
      $sql$, trg.func_schema, trg.func_name);

      patched_count := patched_count + 1;
      RAISE NOTICE 'Patched events overlap trigger function: %.% (trigger=%)', trg.func_schema, trg.func_name, trg.tgname;
    END IF;
  END LOOP;

  IF patched_count = 0 THEN
    RAISE NOTICE 'No overlap-like non-internal trigger functions found on public.events';
  END IF;
END $$;

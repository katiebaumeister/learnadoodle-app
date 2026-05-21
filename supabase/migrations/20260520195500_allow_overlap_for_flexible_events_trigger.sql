-- Restore overlap-allowed behavior for flexible events.
-- Current overlap trigger checks child_ids even when is_flexible=true,
-- which blocks drag conflict "save anyway / dismiss keep move" persistence.

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
          -- Soft-deleted, canceled, backlog, or flexible rows should never block overlap checks.
          IF NEW.deleted_at IS NOT NULL
             OR COALESCE(NEW.status, '') = 'canceled'
             OR COALESCE(NEW.is_backlog, false) = true
             OR COALESCE(NEW.is_flexible, false) = true THEN
            RETURN NEW;
          END IF;

          IF NEW.start_ts IS NULL OR NEW.end_ts IS NULL OR NEW.end_ts <= NEW.start_ts THEN
            RETURN NEW;
          END IF;

          IF NEW.child_id IS NOT NULL AND NOT (NEW.child_id = ANY(new_child_ids)) THEN
            new_child_ids := array_append(new_child_ids, NEW.child_id);
          END IF;

          -- No assignees means no child-based overlap check.
          IF array_length(new_child_ids, 1) IS NULL THEN
            RETURN NEW;
          END IF;

          IF EXISTS (
            SELECT 1
            FROM public.events existing
            WHERE existing.family_id = NEW.family_id
              AND existing.deleted_at IS NULL
              AND COALESCE(existing.status, '') <> 'canceled'
              AND COALESCE(existing.is_backlog, false) = false
              AND COALESCE(existing.is_flexible, false) = false
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
      RAISE NOTICE 'Patched overlap trigger function for flexible bypass: %.% (trigger=%)',
        trg.func_schema, trg.func_name, trg.tgname;
    END IF;
  END LOOP;

  IF patched_count = 0 THEN
    RAISE NOTICE 'No overlap-like trigger functions found on public.events';
  END IF;
END $$;


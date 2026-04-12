-- Canonical active-event semantics + soft-delete guardrails.
-- Active event = deleted_at IS NULL AND canceled_at IS NULL AND (status IS NULL OR status <> 'canceled')

CREATE OR REPLACE FUNCTION public.event_is_active(
  _status text,
  _canceled_at timestamptz,
  _deleted_at timestamptz
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    _deleted_at IS NULL
    AND _canceled_at IS NULL
    AND (_status IS NULL OR lower(_status) <> 'canceled');
$$;

COMMENT ON FUNCTION public.event_is_active(text, timestamptz, timestamptz)
IS 'Canonical active-event predicate used by views/helpers and index predicates.';

CREATE OR REPLACE VIEW public.active_events AS
SELECT e.*
FROM public.events e
WHERE public.event_is_active(e.status, e.canceled_at, e.deleted_at);

COMMENT ON VIEW public.active_events
IS 'Only active events. Canonical filter: not soft-deleted, not canceled_at, status != canceled.';

CREATE OR REPLACE FUNCTION public.events_block_updates_on_soft_deleted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _old_cmp jsonb;
  _new_cmp jsonb;
BEGIN
  -- Not soft-deleted before update: allow.
  IF OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Restore path is allowed (deleted_at -> NULL).
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  -- Ignore bookkeeping-only changes.
  _old_cmp := to_jsonb(OLD) - ARRAY['updated_at', 'last_viewed_at', 'last_opened_at'];
  _new_cmp := to_jsonb(NEW) - ARRAY['updated_at', 'last_viewed_at', 'last_opened_at'];

  IF _new_cmp IS DISTINCT FROM _old_cmp THEN
    RAISE EXCEPTION 'Cannot modify business fields on soft-deleted events (id=%). Restore first.', OLD.id
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_block_updates_on_soft_deleted ON public.events;
CREATE TRIGGER trg_events_block_updates_on_soft_deleted
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.events_block_updates_on_soft_deleted();

-- Rebuild non-partial unique/exclusion indexes on events as active-only partial indexes.
-- This avoids false conflicts against canceled/soft-deleted rows.
DO $$
DECLARE
  _rec record;
  _new_name text;
  _new_def text;
  _active_pred text := ' WHERE (deleted_at IS NULL AND canceled_at IS NULL AND (status IS NULL OR lower(status) <> ''canceled''))';
BEGIN
  FOR _rec IN
    SELECT
      ci.relname AS index_name,
      pg_get_indexdef(i.indexrelid) AS index_def
    FROM pg_index i
    JOIN pg_class ci ON ci.oid = i.indexrelid
    JOIN pg_class ct ON ct.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = ct.relnamespace
    WHERE ns.nspname = 'public'
      AND ct.relname = 'events'
      AND (i.indisunique OR i.indisexclusion)
      AND i.indpred IS NULL
      AND ci.relname <> 'events_pkey'
  LOOP
    -- Keep explicit active-aware indexes as-is.
    IF _rec.index_def ILIKE '%deleted_at%' OR _rec.index_def ILIKE '%canceled_at%' THEN
      CONTINUE;
    END IF;

    _new_name := _rec.index_name || '_active';
    IF to_regclass(format('public.%I', _new_name)) IS NOT NULL THEN
      CONTINUE;
    END IF;

    _new_def := regexp_replace(
      _rec.index_def,
      '^CREATE\\s+(UNIQUE\\s+)?INDEX\\s+\\S+\\s+ON\\s+public\\.events',
      format('CREATE \\1INDEX %I ON public.events', _new_name),
      'i'
    );

    IF _new_def = _rec.index_def THEN
      CONTINUE;
    END IF;

    EXECUTE _new_def || _active_pred;
    EXECUTE format('DROP INDEX IF EXISTS public.%I', _rec.index_name);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.purge_soft_deleted_events(
  _retention_days integer DEFAULT 90,
  _batch_size integer DEFAULT 2000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _deleted_count integer := 0;
BEGIN
  WITH doomed AS (
    SELECT id
    FROM public.events
    WHERE deleted_at IS NOT NULL
      AND deleted_at < (now() - make_interval(days => GREATEST(_retention_days, 1)))
    ORDER BY deleted_at ASC
    LIMIT GREATEST(_batch_size, 1)
  )
  DELETE FROM public.events e
  USING doomed d
  WHERE e.id = d.id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  RETURN _deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_soft_deleted_events(integer, integer)
IS 'Permanently delete soft-deleted events older than retention window. Schedule externally (cron/pg_cron).';

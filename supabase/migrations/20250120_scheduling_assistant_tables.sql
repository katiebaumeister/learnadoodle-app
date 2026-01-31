-- ============================================================
-- Scheduling Assistant: Availability Overrides and Holds
-- ============================================================

-- 1. Availability Overrides Table
-- Allows users to mark time blocks as busy or available
CREATE TABLE IF NOT EXISTS availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE, -- NULL for family-wide
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('blocked', 'available')),
  reason TEXT, -- e.g., "doctor", "no school mornings", "travel"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_overrides_family ON availability_overrides(family_id);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_child ON availability_overrides(child_id);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_time ON availability_overrides(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_kind ON availability_overrides(kind);

-- 2. Scheduling Holds Table
-- Temporary holds for scheduling (expire after 10 minutes)
CREATE TABLE IF NOT EXISTS scheduling_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE, -- References backlog event (is_backlog=true)
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_scheduling_holds_family ON scheduling_holds(family_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_holds_child ON scheduling_holds(child_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_holds_time ON scheduling_holds(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_scheduling_holds_expires ON scheduling_holds(expires_at);
CREATE INDEX IF NOT EXISTS idx_scheduling_holds_event ON scheduling_holds(event_id);

-- 3. Enhance events table with scheduling constraints for backlog items
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS earliest_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS energy_pref TEXT CHECK (energy_pref IN ('AM', 'PM', 'any')),
  ADD COLUMN IF NOT EXISTS allowed_days INTEGER[], -- Array of day numbers (0=Sunday, 6=Saturday)
  ADD COLUMN IF NOT EXISTS scheduling_constraints JSONB DEFAULT '{}'::jsonb; -- e.g., {"needs": ["home", "tutor", "computer"]}

CREATE INDEX IF NOT EXISTS idx_events_earliest_start ON events(earliest_start_at) WHERE earliest_start_at IS NOT NULL AND is_backlog = true;
CREATE INDEX IF NOT EXISTS idx_events_energy_pref ON events(energy_pref) WHERE is_backlog = true;

-- 4. RLS Policies
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_holds ENABLE ROW LEVEL SECURITY;

-- Availability Overrides Policies
DROP POLICY IF EXISTS "Users can view availability overrides for their family" ON availability_overrides;
CREATE POLICY "Users can view availability overrides for their family"
  ON availability_overrides FOR SELECT
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can create availability overrides for their family" ON availability_overrides;
CREATE POLICY "Users can create availability overrides for their family"
  ON availability_overrides FOR INSERT
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can update availability overrides for their family" ON availability_overrides;
CREATE POLICY "Users can update availability overrides for their family"
  ON availability_overrides FOR UPDATE
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can delete availability overrides for their family" ON availability_overrides;
CREATE POLICY "Users can delete availability overrides for their family"
  ON availability_overrides FOR DELETE
  USING (is_family_member(family_id));

-- Scheduling Holds Policies
DROP POLICY IF EXISTS "Users can view scheduling holds for their family" ON scheduling_holds;
CREATE POLICY "Users can view scheduling holds for their family"
  ON scheduling_holds FOR SELECT
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can create scheduling holds for their family" ON scheduling_holds;
CREATE POLICY "Users can create scheduling holds for their family"
  ON scheduling_holds FOR INSERT
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can delete scheduling holds for their family" ON scheduling_holds;
CREATE POLICY "Users can delete scheduling holds for their family"
  ON scheduling_holds FOR DELETE
  USING (is_family_member(family_id));

-- 5. Function to clean expired holds
CREATE OR REPLACE FUNCTION cleanup_expired_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM scheduling_holds
  WHERE expires_at < NOW();
END;
$$;

-- 6. Helper function to get busy intervals for a time range
CREATE OR REPLACE FUNCTION get_busy_intervals(
  p_family_id UUID,
  p_child_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS TABLE (
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  source TEXT,
  event_id UUID,
  is_tentative BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Get events (confirmed and tentative, but NOT backlog items)
  -- Show ALL events for the family (all children) so the Scheduling Assistant
  -- can display busy intervals for everyone, helping users see when ANY child is busy
  RETURN QUERY
  SELECT 
    e.start_ts AS start_at,
    e.end_ts AS end_at,
    'event'::TEXT,
    e.id,
    (e.status = 'tentative')::BOOLEAN
  FROM events e
  WHERE e.family_id = p_family_id
    -- Include ALL events for the family (all children), not just the selected child
    -- This allows the Scheduling Assistant to show when ANY child is busy
    AND e.start_ts < p_end_at
    AND e.end_ts > p_start_at
    AND e.status != 'canceled'
    AND e.deleted_at IS NULL
    -- Exclude backlog items (they're not actually scheduled yet)
    AND (e.is_backlog IS NULL OR e.is_backlog = false);
  
  -- Get blocked availability overrides
  RETURN QUERY
  SELECT 
    ao.start_at,
    ao.end_at,
    'override'::TEXT,
    NULL::UUID,
    false::BOOLEAN
  FROM availability_overrides ao
  WHERE ao.family_id = p_family_id
    -- Family-wide overrides (NULL child_id) also apply to this child
    AND (ao.child_id = p_child_id OR ao.child_id IS NULL)
    AND ao.kind = 'blocked'
    AND ao.start_at < p_end_at
    AND ao.end_at > p_start_at;
  
  -- Get active scheduling holds (not expired)
  RETURN QUERY
  SELECT 
    sh.start_at,
    sh.end_at,
    'hold'::TEXT,
    NULL::UUID,
    false::BOOLEAN
  FROM scheduling_holds sh
  WHERE sh.family_id = p_family_id
    AND sh.child_id = p_child_id
    AND sh.expires_at > NOW()
    AND sh.start_at < p_end_at
    AND sh.end_at > p_start_at;
END;
$$;

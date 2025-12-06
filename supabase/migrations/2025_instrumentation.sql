-- Planner Instrumentation & Logging Migration
-- Creates tables for tracking planner runs, errors, warnings, and user actions

-- ============================================================================
-- 1. planner_runs - Track planner execution runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS planner_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  task_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  mode TEXT NOT NULL CHECK (mode IN ('auto_reschedule', 'manual_adjustment', 'full_plan', 'weekly_rules_update')),
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_runs_family_id ON planner_runs(family_id);
CREATE INDEX IF NOT EXISTS idx_planner_runs_child_id ON planner_runs(child_id);
CREATE INDEX IF NOT EXISTS idx_planner_runs_started_at ON planner_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_planner_runs_status ON planner_runs(status);
CREATE INDEX IF NOT EXISTS idx_planner_runs_mode ON planner_runs(mode);

COMMENT ON TABLE planner_runs IS 'Tracks planner execution runs including timing and status';
COMMENT ON COLUMN planner_runs.mode IS 'Type of planner run: auto_reschedule, manual_adjustment, full_plan, weekly_rules_update';
COMMENT ON COLUMN planner_runs.metadata IS 'Additional context: trigger source, reason, etc.';

-- ============================================================================
-- 2. planner_errors - Track planner errors
-- ============================================================================
CREATE TABLE IF NOT EXISTS planner_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  run_id UUID REFERENCES planner_runs(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  stack_trace TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_errors_family_id ON planner_errors(family_id);
CREATE INDEX IF NOT EXISTS idx_planner_errors_child_id ON planner_errors(child_id);
CREATE INDEX IF NOT EXISTS idx_planner_errors_run_id ON planner_errors(run_id);
CREATE INDEX IF NOT EXISTS idx_planner_errors_timestamp ON planner_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_planner_errors_error_type ON planner_errors(error_type);

COMMENT ON TABLE planner_errors IS 'Logs errors encountered during planner execution';
COMMENT ON COLUMN planner_errors.error_type IS 'Error classification: validation_error, api_error, database_error, etc.';
COMMENT ON COLUMN planner_errors.metadata IS 'Additional context: affected dates, event IDs, etc.';

-- ============================================================================
-- 3. planner_warnings - Track planner warnings
-- ============================================================================
CREATE TABLE IF NOT EXISTS planner_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  run_id UUID REFERENCES planner_runs(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  warning_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_warnings_family_id ON planner_warnings(family_id);
CREATE INDEX IF NOT EXISTS idx_planner_warnings_child_id ON planner_warnings(child_id);
CREATE INDEX IF NOT EXISTS idx_planner_warnings_run_id ON planner_warnings(run_id);
CREATE INDEX IF NOT EXISTS idx_planner_warnings_timestamp ON planner_warnings(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_planner_warnings_warning_type ON planner_warnings(warning_type);

COMMENT ON TABLE planner_warnings IS 'Logs warnings during planner execution (non-fatal issues)';
COMMENT ON COLUMN planner_warnings.warning_type IS 'Warning classification: constraint_violation, optimization_warning, etc.';

-- ============================================================================
-- 4. planner_user_actions - Track user interactions with planner
-- ============================================================================
CREATE TABLE IF NOT EXISTS planner_user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_user_actions_family_id ON planner_user_actions(family_id);
CREATE INDEX IF NOT EXISTS idx_planner_user_actions_child_id ON planner_user_actions(child_id);
CREATE INDEX IF NOT EXISTS idx_planner_user_actions_user_id ON planner_user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_planner_user_actions_timestamp ON planner_user_actions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_planner_user_actions_action_type ON planner_user_actions(action_type);

COMMENT ON TABLE planner_user_actions IS 'Tracks user interactions with planner UI';
COMMENT ON COLUMN planner_user_actions.action_type IS 'Action classification: drag_drop, add_event, delete_event, undo_reschedule, etc.';

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE planner_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_user_actions ENABLE ROW LEVEL SECURITY;

-- Planner Runs Policies
CREATE POLICY planner_runs_select ON planner_runs
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY planner_runs_insert ON planner_runs
  FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Planner Errors Policies
CREATE POLICY planner_errors_select ON planner_errors
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY planner_errors_insert ON planner_errors
  FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Planner Warnings Policies
CREATE POLICY planner_warnings_select ON planner_warnings
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY planner_warnings_insert ON planner_warnings
  FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Planner User Actions Policies
CREATE POLICY planner_user_actions_select ON planner_user_actions
  FOR SELECT
  USING (
    user_id = auth.uid() AND
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY planner_user_actions_insert ON planner_user_actions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- Helper RPC: Get latest planner run for a child/family
-- ============================================================================
CREATE OR REPLACE FUNCTION get_latest_planner_run(
  p_family_id UUID,
  p_child_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  child_id UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT,
  mode TEXT,
  duration_ms INTEGER,
  event_count INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    pr.id,
    pr.child_id,
    pr.started_at,
    pr.finished_at,
    pr.status,
    pr.mode,
    pr.duration_ms,
    pr.event_count
  FROM planner_runs pr
  WHERE pr.family_id = p_family_id
    AND (p_child_id IS NULL OR pr.child_id = p_child_id)
  ORDER BY pr.started_at DESC
  LIMIT 1;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_latest_planner_run TO authenticated;

-- ============================================================================
-- Helper RPC: Get recent planner errors/warnings
-- ============================================================================
CREATE OR REPLACE FUNCTION get_recent_planner_issues(
  p_family_id UUID,
  p_child_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  type TEXT,
  issue_timestamp TIMESTAMPTZ,
  error_type TEXT,
  warning_type TEXT,
  message TEXT,
  metadata JSONB
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    'error'::TEXT as type,
    pe.timestamp as issue_timestamp,
    pe.error_type,
    NULL::TEXT as warning_type,
    pe.message,
    pe.metadata
  FROM planner_errors pe
  WHERE pe.family_id = p_family_id
    AND (p_child_id IS NULL OR pe.child_id = p_child_id)
  
  UNION ALL
  
  SELECT 
    'warning'::TEXT as type,
    pw.timestamp as issue_timestamp,
    NULL::TEXT as error_type,
    pw.warning_type,
    pw.message,
    pw.metadata
  FROM planner_warnings pw
  WHERE pw.family_id = p_family_id
    AND (p_child_id IS NULL OR pw.child_id = p_child_id)
  
  ORDER BY issue_timestamp DESC
  LIMIT p_limit;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_recent_planner_issues TO authenticated;


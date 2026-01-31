-- Migration: Create event_change_log table
-- Tracks event changes for undo functionality and explainability

CREATE TABLE IF NOT EXISTS event_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_type TEXT NOT NULL CHECK (action_type IN ('move', 'bulk_reschedule', 'autoplace')),
  changes JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Add comment
COMMENT ON TABLE event_change_log IS 'Logs all event changes (moves, reschedules, auto-placements) for undo functionality and explainability';
COMMENT ON COLUMN event_change_log.action_type IS 'Type of action: move (single event), bulk_reschedule (multiple events), autoplace (automatic placement)';
COMMENT ON COLUMN event_change_log.changes IS 'JSONB array of change objects: [{event_id, before: {...}, after: {...}}, ...]';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_change_log_family_id ON event_change_log(family_id);
CREATE INDEX IF NOT EXISTS idx_event_change_log_user_id ON event_change_log(user_id);
CREATE INDEX IF NOT EXISTS idx_event_change_log_created_at ON event_change_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_change_log_action_type ON event_change_log(action_type);
CREATE INDEX IF NOT EXISTS idx_event_change_log_changes_event_id ON event_change_log USING GIN ((changes -> 'event_id'));

-- Enable RLS
ALTER TABLE event_change_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Family members can view event change logs" ON event_change_log;
CREATE POLICY "Family members can view event change logs"
  ON event_change_log
  FOR SELECT
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can insert event change logs" ON event_change_log;
CREATE POLICY "Family members can insert event change logs"
  ON event_change_log
  FOR INSERT
  WITH CHECK (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT ON event_change_log TO authenticated;
GRANT SELECT, INSERT ON event_change_log TO service_role;

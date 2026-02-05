-- Create learning_velocity table
-- Tracks adaptive learning speed per child/subject (0.6-1.5 range)
-- Used for adjusting required minutes based on actual vs expected completion rates

CREATE TABLE IF NOT EXISTS learning_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    velocity NUMERIC(3, 2) NOT NULL DEFAULT 1.0 CHECK (velocity >= 0.6 AND velocity <= 1.5),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(family_id, child_id, subject_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_velocity_family_id ON learning_velocity(family_id);
CREATE INDEX IF NOT EXISTS idx_learning_velocity_child_id ON learning_velocity(child_id);
CREATE INDEX IF NOT EXISTS idx_learning_velocity_subject_id ON learning_velocity(subject_id);
CREATE INDEX IF NOT EXISTS idx_learning_velocity_family_child ON learning_velocity(family_id, child_id);

-- Enable RLS
ALTER TABLE learning_velocity ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS family_read_own_velocity ON learning_velocity;
CREATE POLICY family_read_own_velocity
ON learning_velocity
FOR SELECT
USING (
    family_id IN (
        SELECT id FROM family WHERE id = family_id
    )
);

DROP POLICY IF EXISTS family_insert_own_velocity ON learning_velocity;
CREATE POLICY family_insert_own_velocity
ON learning_velocity
FOR INSERT
WITH CHECK (
    family_id IN (
        SELECT id FROM family WHERE id = family_id
    )
);

DROP POLICY IF EXISTS family_update_own_velocity ON learning_velocity;
CREATE POLICY family_update_own_velocity
ON learning_velocity
FOR UPDATE
USING (
    family_id IN (
        SELECT id FROM family WHERE id = family_id
    )
);

DROP POLICY IF EXISTS family_delete_own_velocity ON learning_velocity;
CREATE POLICY family_delete_own_velocity
ON learning_velocity
FOR DELETE
USING (
    family_id IN (
        SELECT id FROM family WHERE id = family_id
    )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_velocity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_velocity TO service_role;

-- Add comment
COMMENT ON TABLE learning_velocity IS 'Tracks adaptive learning speed per child/subject. Velocity of 1.0 means on track, >1.0 means ahead, <1.0 means behind. Used to adjust required minutes for scheduling.';

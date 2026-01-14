-- Create extracurricular_activities table for tracking student activities
-- This table stores volunteer hours, leadership roles, work/internships, certifications, etc.

CREATE TABLE IF NOT EXISTS extracurricular_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    
    -- Required fields
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Volunteer',
        'Club / Organization',
        'Job / Internship',
        'Leadership Role',
        'Sport',
        'Creative / Independent Project',
        'Certificate / Credential',
        'Competition / Award'
    )),
    organization TEXT NOT NULL,
    start_date DATE NOT NULL,
    
    -- Optional date fields
    end_date DATE,
    is_ongoing BOOLEAN DEFAULT false,
    
    -- Optional descriptive fields
    description TEXT,
    hours_per_week TEXT, -- Stored as text to allow flexible input (e.g., "5", "5-10", "varies")
    total_hours TEXT, -- Stored as text to allow flexible input
    location TEXT,
    
    -- Supervisor/Reference fields
    supervisor_name TEXT,
    supervisor_contact TEXT, -- Email or phone
    
    -- Proof/Evidence
    proof_url TEXT, -- URL to certificate, letter, screenshot, etc.
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    
    -- Constraints
    CONSTRAINT check_end_date_if_not_ongoing CHECK (
        is_ongoing = true OR end_date IS NOT NULL
    ),
    CONSTRAINT check_end_date_after_start CHECK (
        end_date IS NULL OR end_date >= start_date
    )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_extracurricular_activities_family_id 
    ON extracurricular_activities(family_id);
CREATE INDEX IF NOT EXISTS idx_extracurricular_activities_child_id 
    ON extracurricular_activities(child_id);
CREATE INDEX IF NOT EXISTS idx_extracurricular_activities_category 
    ON extracurricular_activities(category);
CREATE INDEX IF NOT EXISTS idx_extracurricular_activities_start_date 
    ON extracurricular_activities(start_date);
CREATE INDEX IF NOT EXISTS idx_extracurricular_activities_family_child 
    ON extracurricular_activities(family_id, child_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_extracurricular_activities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_extracurricular_activities_updated_at
    BEFORE UPDATE ON extracurricular_activities
    FOR EACH ROW
    EXECUTE FUNCTION update_extracurricular_activities_updated_at();

-- Enable Row Level Security
ALTER TABLE extracurricular_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view activities for their family's children
CREATE POLICY "Users can view family extracurricular activities" 
    ON extracurricular_activities
    FOR SELECT
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Users can insert activities for their family's children
CREATE POLICY "Users can insert family extracurricular activities" 
    ON extracurricular_activities
    FOR INSERT
    WITH CHECK (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
        AND child_id IN (
            SELECT id 
            FROM children 
            WHERE family_id IN (
                SELECT family_id 
                FROM profiles 
                WHERE id = auth.uid()
            )
        )
    );

-- Users can update activities for their family's children
CREATE POLICY "Users can update family extracurricular activities" 
    ON extracurricular_activities
    FOR UPDATE
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
        AND child_id IN (
            SELECT id 
            FROM children 
            WHERE family_id IN (
                SELECT family_id 
                FROM profiles 
                WHERE id = auth.uid()
            )
        )
    );

-- Users can delete activities for their family's children
CREATE POLICY "Users can delete family extracurricular activities" 
    ON extracurricular_activities
    FOR DELETE
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Set created_by automatically on insert
CREATE OR REPLACE FUNCTION set_extracurricular_activity_created_by()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_by = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_extracurricular_activity_created_by
    BEFORE INSERT ON extracurricular_activities
    FOR EACH ROW
    EXECUTE FUNCTION set_extracurricular_activity_created_by();

-- Add helpful comments
COMMENT ON TABLE extracurricular_activities IS 'Tracks extracurricular activities including volunteer hours, leadership roles, work/internships, and certifications for compliance and college applications';
COMMENT ON COLUMN extracurricular_activities.category IS 'Type of activity: Volunteer, Club/Organization, Job/Internship, Leadership Role, Sport, Creative/Independent Project, Certificate/Credential, Competition/Award';
COMMENT ON COLUMN extracurricular_activities.hours_per_week IS 'Stored as text to allow flexible formats (e.g., "5", "5-10", "varies")';
COMMENT ON COLUMN extracurricular_activities.total_hours IS 'Stored as text to allow flexible formats';
COMMENT ON COLUMN extracurricular_activities.proof_url IS 'URL to certificate, letter, screenshot, or other proof document';

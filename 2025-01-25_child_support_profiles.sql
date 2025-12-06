-- Migration: Child Support Profiles & Essential Documents
-- Adds support for learning differences, disabilities, and essential documents

-- ============================================================
-- 1. child_support_profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS child_support_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    diagnoses TEXT[] DEFAULT '{}',  -- ADHD, Dyslexia, etc.
    learning_modalities TEXT[] DEFAULT '{}',  -- Visual, Hands-on, Verbal, etc.
    support_needs TEXT[] DEFAULT '{}',  -- Frequent breaks, Step-by-step, etc.
    executive_function TEXT[] DEFAULT '{}',  -- Difficulty with transitions, etc.
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_id)
);

CREATE INDEX IF NOT EXISTS idx_support_profiles_child ON child_support_profiles(child_id);

-- ============================================================
-- 2. child_documents table
-- ============================================================
CREATE TYPE document_type AS ENUM (
    'medical_profile',
    'id_card',
    'allergy_sheet',
    'vaccination_record',
    'safety_plan',
    'permission_form',
    'iep',
    '504_plan',
    'behavior_plan',
    'therapy_contact',
    'other'
);

CREATE TABLE IF NOT EXISTS child_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    type document_type NOT NULL,
    title TEXT NOT NULL,
    file_url TEXT,  -- Supabase Storage URL
    metadata JSONB DEFAULT '{}',  -- Additional structured data (allergies, medications, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_child ON child_documents(child_id);
CREATE INDEX IF NOT EXISTS idx_documents_family ON child_documents(family_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON child_documents(type);

-- ============================================================
-- 3. child_cards_generated table (for auto-generated ID cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS child_cards_generated (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL CHECK (card_type IN ('student_id', 'medical_profile')),
    generated_url TEXT NOT NULL,
    qr_code_data TEXT,  -- QR code data for emergency profile link
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_id, card_type)
);

CREATE INDEX IF NOT EXISTS idx_cards_child ON child_cards_generated(child_id);

-- ============================================================
-- 4. Update trigger for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_support_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_support_profiles_updated_at
    BEFORE UPDATE ON child_support_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_support_profile_updated_at();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON child_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_support_profile_updated_at();

CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON child_cards_generated
    FOR EACH ROW
    EXECUTE FUNCTION update_support_profile_updated_at();

-- ============================================================
-- 5. RLS Policies
-- ============================================================

-- Enable RLS
ALTER TABLE child_support_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_cards_generated ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user can access child
CREATE OR REPLACE FUNCTION can_access_child(_child_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM children c
        JOIN profiles p ON c.family_id = p.family_id
        WHERE c.id = _child_id
        AND p.id = auth.uid()
    );
$$;

-- child_support_profiles policies
DROP POLICY IF EXISTS support_profiles_select ON child_support_profiles;
CREATE POLICY support_profiles_select ON child_support_profiles
    FOR SELECT
    USING (can_access_child(child_id));

DROP POLICY IF EXISTS support_profiles_insert ON child_support_profiles;
CREATE POLICY support_profiles_insert ON child_support_profiles
    FOR INSERT
    WITH CHECK (can_access_child(child_id));

DROP POLICY IF EXISTS support_profiles_update ON child_support_profiles;
CREATE POLICY support_profiles_update ON child_support_profiles
    FOR UPDATE
    USING (can_access_child(child_id))
    WITH CHECK (can_access_child(child_id));

DROP POLICY IF EXISTS support_profiles_delete ON child_support_profiles;
CREATE POLICY support_profiles_delete ON child_support_profiles
    FOR DELETE
    USING (can_access_child(child_id));

-- child_documents policies
DROP POLICY IF EXISTS documents_select ON child_documents;
CREATE POLICY documents_select ON child_documents
    FOR SELECT
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS documents_insert ON child_documents;
CREATE POLICY documents_insert ON child_documents
    FOR INSERT
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        AND can_access_child(child_id)
    );

DROP POLICY IF EXISTS documents_update ON child_documents;
CREATE POLICY documents_update ON child_documents
    FOR UPDATE
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS documents_delete ON child_documents;
CREATE POLICY documents_delete ON child_documents
    FOR DELETE
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- child_cards_generated policies
DROP POLICY IF EXISTS cards_select ON child_cards_generated;
CREATE POLICY cards_select ON child_cards_generated
    FOR SELECT
    USING (can_access_child(child_id));

DROP POLICY IF EXISTS cards_insert ON child_cards_generated;
CREATE POLICY cards_insert ON child_cards_generated
    FOR INSERT
    WITH CHECK (can_access_child(child_id));

DROP POLICY IF EXISTS cards_update ON child_cards_generated;
CREATE POLICY cards_update ON child_cards_generated
    FOR UPDATE
    USING (can_access_child(child_id))
    WITH CHECK (can_access_child(child_id));

DROP POLICY IF EXISTS cards_delete ON child_cards_generated;
CREATE POLICY cards_delete ON child_cards_generated
    FOR DELETE
    USING (can_access_child(child_id));

-- ============================================================
-- 6. Comments for documentation
-- ============================================================
COMMENT ON TABLE child_support_profiles IS 'Stores learning differences, disabilities, and support needs for children';
COMMENT ON COLUMN child_support_profiles.diagnoses IS 'Array of diagnosed learning differences (ADHD, Dyslexia, etc.)';
COMMENT ON COLUMN child_support_profiles.learning_modalities IS 'Preferred learning styles (Visual, Hands-on, Verbal, etc.)';
COMMENT ON COLUMN child_support_profiles.support_needs IS 'Support accommodations needed (Frequent breaks, Step-by-step instructions, etc.)';
COMMENT ON COLUMN child_support_profiles.executive_function IS 'Executive function challenges (Difficulty with transitions, etc.)';

COMMENT ON TABLE child_documents IS 'Stores essential documents like medical profiles, ID cards, safety plans, etc.';
COMMENT ON COLUMN child_documents.metadata IS 'JSONB field for structured data like allergies, medications, emergency contacts';

COMMENT ON TABLE child_cards_generated IS 'Stores auto-generated ID cards and medical profile cards';


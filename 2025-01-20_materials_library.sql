-- Materials Library System
-- Tracks purchased resources and per-child reception/reviews
-- Safe to run multiple times (IF NOT EXISTS guards)

-- 1) materials table
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text GENERATED ALWAYS AS (lower(regexp_replace(title, '\s+', '-', 'g'))) STORED,
  type text NOT NULL CHECK (type IN ('textbook','workbook','kit','course','subscription','video','other')),
  subject_key text,
  grade_range_min int,
  grade_range_max int,
  is_consumable boolean DEFAULT false NOT NULL,
  is_subscription boolean DEFAULT false NOT NULL,
  provider_name text,
  provider_url text,
  location_hint text,
  cover_image_url text,
  purchase_date date,
  purchase_price numeric(10,2),
  notes text,
  tags text[] DEFAULT '{}',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  archived_at timestamptz
);

-- Indexes for materials
CREATE INDEX IF NOT EXISTS materials_family_id_idx ON materials(family_id);
CREATE INDEX IF NOT EXISTS materials_type_idx ON materials(type);
CREATE INDEX IF NOT EXISTS materials_subject_key_idx ON materials(subject_key) WHERE subject_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_archived_idx ON materials(archived_at) WHERE archived_at IS NULL;

-- Enable RLS
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON materials TO authenticated;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_materials ON materials;
CREATE POLICY family_read_own_materials
ON materials
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_materials ON materials;
CREATE POLICY family_insert_own_materials
ON materials
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_materials ON materials;
CREATE POLICY family_update_own_materials
ON materials
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_materials ON materials;
CREATE POLICY family_delete_own_materials
ON materials
FOR DELETE
USING (is_family_member(family_id));

-- 2) material_children bridge table
CREATE TABLE IF NOT EXISTS material_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('planned','in_use','completed','abandoned')) DEFAULT 'planned',
  started_at date,
  finished_at date,
  reuse_candidate boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(material_id, child_id)
);

-- Indexes for material_children
CREATE INDEX IF NOT EXISTS material_children_family_idx ON material_children(family_id);
CREATE INDEX IF NOT EXISTS material_children_material_idx ON material_children(material_id);
CREATE INDEX IF NOT EXISTS material_children_child_idx ON material_children(child_id);
CREATE INDEX IF NOT EXISTS material_children_status_idx ON material_children(status);

-- Enable RLS
ALTER TABLE material_children ENABLE ROW LEVEL SECURITY;

-- Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON material_children TO authenticated;

-- RLS policies
DROP POLICY IF EXISTS family_read_own_material_children ON material_children;
CREATE POLICY family_read_own_material_children
ON material_children
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_material_children ON material_children;
CREATE POLICY family_insert_own_material_children
ON material_children
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_material_children ON material_children;
CREATE POLICY family_update_own_material_children
ON material_children
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_material_children ON material_children;
CREATE POLICY family_delete_own_material_children
ON material_children
FOR DELETE
USING (is_family_member(family_id));

-- 3) material_reviews table
CREATE TABLE IF NOT EXISTS material_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  rating int CHECK (rating BETWEEN 1 AND 5),
  emotion text CHECK (emotion IN ('loved','liked','neutral','bored','overwhelmed','frustrated')),
  pacing_fit text CHECK (pacing_fit IN ('too_fast','too_slow','just_right')),
  difficulty text CHECK (difficulty IN ('too_easy','too_hard','appropriate')),
  engagement_style text[],
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for material_reviews
CREATE INDEX IF NOT EXISTS material_reviews_family_idx ON material_reviews(family_id);
CREATE INDEX IF NOT EXISTS material_reviews_material_idx ON material_reviews(material_id);
CREATE INDEX IF NOT EXISTS material_reviews_child_idx ON material_reviews(child_id);
CREATE INDEX IF NOT EXISTS material_reviews_event_idx ON material_reviews(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS material_reviews_created_at_idx ON material_reviews(created_at DESC);

-- Enable RLS
ALTER TABLE material_reviews ENABLE ROW LEVEL SECURITY;

-- Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON material_reviews TO authenticated;

-- RLS policies
DROP POLICY IF EXISTS family_read_own_material_reviews ON material_reviews;
CREATE POLICY family_read_own_material_reviews
ON material_reviews
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_material_reviews ON material_reviews;
CREATE POLICY family_insert_own_material_reviews
ON material_reviews
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_material_reviews ON material_reviews;
CREATE POLICY family_update_own_material_reviews
ON material_reviews
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_material_reviews ON material_reviews;
CREATE POLICY family_delete_own_material_reviews
ON material_reviews
FOR DELETE
USING (is_family_member(family_id));

-- 4) Add material_id column to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'material_id'
  ) THEN
    ALTER TABLE events ADD COLUMN material_id uuid REFERENCES materials(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_events_material_id ON events(material_id) WHERE material_id IS NOT NULL;
  END IF;
END $$;

-- 5) Create material_usage_stats view
CREATE OR REPLACE VIEW material_usage_stats AS
SELECT
  m.id as material_id,
  m.family_id,
  COUNT(DISTINCT mc.child_id) as children_count,
  AVG(r.rating)::numeric(3,2) as avg_rating,
  AVG(CASE WHEN r.emotion = 'bored' THEN 1 ELSE 0 END)::numeric(3,2) as boredom_rate,
  AVG(CASE WHEN r.emotion = 'loved' THEN 1 ELSE 0 END)::numeric(3,2) as love_rate,
  BOOL_OR(mc.status = 'completed') as completed_by_someone
FROM materials m
LEFT JOIN material_children mc ON mc.material_id = m.id
LEFT JOIN material_reviews r ON r.material_id = m.id AND r.child_id = mc.child_id
GROUP BY m.id, m.family_id;

-- Grant permissions on view
GRANT SELECT ON material_usage_stats TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE materials IS 'Tracks purchased resources (books, courses, kits, subscriptions)';
COMMENT ON TABLE material_children IS 'Bridge table linking materials to children who have used them';
COMMENT ON TABLE material_reviews IS 'Per-child reception logs with ratings, emotions, pacing, and difficulty feedback';
COMMENT ON COLUMN events.material_id IS 'Links event to a material resource used during the session';
COMMENT ON VIEW material_usage_stats IS 'Aggregated statistics per material showing usage across children and average ratings';


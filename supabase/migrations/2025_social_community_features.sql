-- Social & Community Features Migration
-- Implements family connections, groups, sharing, co-op planning, marketplace

-- ============================================================
-- 1. Family Groups Table
-- ============================================================
CREATE TABLE IF NOT EXISTS family_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  group_type text NOT NULL CHECK (group_type IN ('coop', 'pod', 'class', 'club', 'study_group')),
  
  -- Ownership
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  
  -- Settings
  is_public boolean DEFAULT false,
  requires_approval boolean DEFAULT true,
  max_members integer, -- NULL = unlimited
  
  -- Metadata
  tags text[] DEFAULT '{}',
  location text,
  meeting_schedule jsonb, -- Recurring meeting times
  cover_image_url text,
  invite_code text UNIQUE, -- Unique invite code for group
  
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS family_groups_type_idx ON family_groups(group_type);
CREATE INDEX IF NOT EXISTS family_groups_public_idx ON family_groups(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS family_groups_tags_idx ON family_groups USING GIN(tags);
CREATE INDEX IF NOT EXISTS family_groups_invite_code_idx ON family_groups(invite_code);

-- ============================================================
-- 2. Group Members Table
-- ============================================================
CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  role text DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  joined_at timestamptz DEFAULT now(),
  invited_by uuid REFERENCES profiles(id),
  UNIQUE(group_id, family_id) -- One family per group
);

CREATE INDEX IF NOT EXISTS group_members_group_idx ON group_members(group_id);
CREATE INDEX IF NOT EXISTS group_members_family_idx ON group_members(family_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id);
CREATE INDEX IF NOT EXISTS group_members_status_idx ON group_members(status);

-- ============================================================
-- 3. Shared Resources Table
-- ============================================================
CREATE TABLE IF NOT EXISTS shared_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('template', 'curriculum', 'lesson_plan', 'syllabus', 'evidence', 'document')),
  resource_id uuid NOT NULL, -- References various tables based on resource_type
  shared_by uuid NOT NULL REFERENCES profiles(id),
  shared_with_type text NOT NULL CHECK (shared_with_type IN ('family', 'group', 'public')),
  shared_with_id uuid, -- family_id or group_id (NULL if public)
  visibility text DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'invite_only')),
  title text NOT NULL,
  description text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS shared_resources_type_idx ON shared_resources(resource_type);
CREATE INDEX IF NOT EXISTS shared_resources_shared_by_idx ON shared_resources(shared_by);
CREATE INDEX IF NOT EXISTS shared_resources_shared_with_idx ON shared_resources(shared_with_type, shared_with_id);
CREATE INDEX IF NOT EXISTS shared_resources_tags_idx ON shared_resources USING GIN(tags);
CREATE INDEX IF NOT EXISTS shared_resources_visibility_idx ON shared_resources(visibility);

-- ============================================================
-- 4. Shared Classes Table (Multi-Family Classes)
-- ============================================================
-- Note: shared_classes table may already exist from 2025_family_calendar_features.sql
-- We need to add the group_id column and other new columns if they don't exist

-- Add group_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shared_classes' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE shared_classes 
    ADD COLUMN group_id uuid REFERENCES family_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add name column if it doesn't exist (existing table has 'title')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shared_classes' AND column_name = 'name'
  ) THEN
    -- If title exists, we can rename it or add name as alias
    -- For now, add name column (can be populated from title later if needed)
    ALTER TABLE shared_classes 
    ADD COLUMN name text;
    -- Update name from title if title exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'shared_classes' AND column_name = 'title'
    ) THEN
      UPDATE shared_classes SET name = title WHERE name IS NULL;
    END IF;
  END IF;
END $$;

-- Add is_public column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shared_classes' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE shared_classes 
    ADD COLUMN is_public boolean DEFAULT false;
  END IF;
END $$;

-- Add max_students column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shared_classes' AND column_name = 'max_students'
  ) THEN
    ALTER TABLE shared_classes 
    ADD COLUMN max_students integer;
  END IF;
END $$;

-- Add meeting_times column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shared_classes' AND column_name = 'meeting_times'
  ) THEN
    ALTER TABLE shared_classes 
    ADD COLUMN meeting_times jsonb;
  END IF;
END $$;

-- Add visibility column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shared_classes' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE shared_classes 
    ADD COLUMN visibility text DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'invite_only'));
  END IF;
END $$;

-- Create indexes (will fail gracefully if they already exist due to IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS shared_classes_group_idx ON shared_classes(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_classes_subject_idx ON shared_classes(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_classes_created_by_idx ON shared_classes(created_by) WHERE created_by IS NOT NULL;

-- ============================================================
-- 5. Shared Class Enrollments
-- ============================================================
CREATE TABLE IF NOT EXISTS shared_class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES shared_classes(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  enrolled_by uuid NOT NULL REFERENCES profiles(id),
  enrolled_at timestamptz DEFAULT now() NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
  UNIQUE(class_id, child_id)
);

CREATE INDEX IF NOT EXISTS shared_class_enrollments_class_idx ON shared_class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS shared_class_enrollments_child_idx ON shared_class_enrollments(child_id);
CREATE INDEX IF NOT EXISTS shared_class_enrollments_family_idx ON shared_class_enrollments(family_id);

-- ============================================================
-- 6. Marketplace Listings Table
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('template', 'curriculum', 'lesson_pack', 'syllabus')),
  resource_id uuid NOT NULL,
  listed_by uuid NOT NULL REFERENCES profiles(id),
  family_id uuid NOT NULL REFERENCES family(id),
  
  -- Listing details
  title text NOT NULL,
  description text NOT NULL,
  price_cents integer DEFAULT 0, -- 0 = free, >0 = paid
  tags text[] DEFAULT '{}',
  category text,
  
  -- Marketplace stats
  views integer DEFAULT 0,
  downloads integer DEFAULT 0,
  rating numeric(3,2) DEFAULT NULL,
  review_count integer DEFAULT 0,
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'removed')),
  
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS marketplace_listings_resource_type_idx ON marketplace_listings(resource_type);
CREATE INDEX IF NOT EXISTS marketplace_listings_listed_by_idx ON marketplace_listings(listed_by);
CREATE INDEX IF NOT EXISTS marketplace_listings_status_idx ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS marketplace_listings_tags_idx ON marketplace_listings USING GIN(tags);
CREATE INDEX IF NOT EXISTS marketplace_listings_category_idx ON marketplace_listings(category);

-- ============================================================
-- 7. Marketplace Purchases Table
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id),
  purchased_by uuid NOT NULL REFERENCES profiles(id),
  family_id uuid NOT NULL REFERENCES family(id),
  price_paid_cents integer NOT NULL,
  purchased_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS marketplace_purchases_listing_idx ON marketplace_purchases(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_purchases_purchased_by_idx ON marketplace_purchases(purchased_by);
CREATE INDEX IF NOT EXISTS marketplace_purchases_family_idx ON marketplace_purchases(family_id);

-- ============================================================
-- 8. Marketplace Reviews Table
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id),
  reviewed_by uuid NOT NULL REFERENCES profiles(id),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(listing_id, reviewed_by)
);

CREATE INDEX IF NOT EXISTS marketplace_reviews_listing_idx ON marketplace_reviews(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_reviews_reviewed_by_idx ON marketplace_reviews(reviewed_by);

-- ============================================================
-- 9. Family Connections Table (Social Network)
-- ============================================================
CREATE TABLE IF NOT EXISTS family_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id_1 uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  family_id_2 uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES profiles(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(family_id_1, family_id_2),
  CHECK (family_id_1 != family_id_2)
);

CREATE INDEX IF NOT EXISTS family_connections_family_1_idx ON family_connections(family_id_1);
CREATE INDEX IF NOT EXISTS family_connections_family_2_idx ON family_connections(family_id_2);
CREATE INDEX IF NOT EXISTS family_connections_status_idx ON family_connections(status);

-- ============================================================
-- 10. Group Invite Codes Table
-- ============================================================
CREATE TABLE IF NOT EXISTS group_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  max_uses integer, -- NULL = unlimited
  uses_count integer DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS group_invite_codes_group_idx ON group_invite_codes(group_id);
CREATE INDEX IF NOT EXISTS group_invite_codes_code_idx ON group_invite_codes(code);

-- ============================================================
-- Helper Functions
-- ============================================================
-- NOTE: Functions must be created AFTER all tables exist
-- Drop functions if they exist (to avoid conflicts)
DROP FUNCTION IF EXISTS is_group_member(uuid, uuid);
DROP FUNCTION IF EXISTS is_group_admin(uuid, uuid);
DROP FUNCTION IF EXISTS generate_invite_code();

-- Check if user is a group member
CREATE OR REPLACE FUNCTION is_group_member(_group_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _family_id uuid;
BEGIN
  -- Return false if group_id is NULL
  IF _group_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user's family_id
  SELECT p.family_id INTO _family_id
  FROM public.profiles p
  WHERE p.id = _user_id;
  
  IF _family_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if family is a member of the group
  RETURN EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = _group_id
      AND gm.family_id = _family_id
      AND gm.status = 'approved'
  );
END;
$$;

-- Check if user is a group admin
CREATE OR REPLACE FUNCTION is_group_admin(_group_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _family_id uuid;
BEGIN
  -- Return false if group_id is NULL
  IF _group_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user's family_id
  SELECT p.family_id INTO _family_id
  FROM public.profiles p
  WHERE p.id = _user_id;
  
  IF _family_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if family is an admin of the group
  RETURN EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = _group_id
      AND gm.family_id = _family_id
      AND gm.role = 'admin'
      AND gm.status = 'approved'
  );
END;
$$;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_group_admin(uuid, uuid) TO authenticated;

-- Generate unique invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars
  code text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- ============================================================
-- RLS Policies
-- ============================================================
-- Ensure we're in the public schema
SET search_path = public;

-- Family Groups
ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view public groups" ON family_groups;
CREATE POLICY "Anyone can view public groups"
ON family_groups FOR SELECT
TO authenticated
USING (is_public = true OR public.is_group_member(id));

DROP POLICY IF EXISTS "Group members can view private groups" ON family_groups;
CREATE POLICY "Group members can view private groups"
ON family_groups FOR SELECT
TO authenticated
USING (public.is_group_member(id));

DROP POLICY IF EXISTS "Users can create groups" ON family_groups;
CREATE POLICY "Users can create groups"
ON family_groups FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Group admins can update groups" ON family_groups;
CREATE POLICY "Group admins can update groups"
ON family_groups FOR UPDATE
TO authenticated
USING (public.is_group_admin(id))
WITH CHECK (public.is_group_admin(id));

-- Group Members
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group members can view members" ON group_members;
CREATE POLICY "Group members can view members"
ON group_members FOR SELECT
TO authenticated
USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
CREATE POLICY "Group admins can manage members"
ON group_members FOR ALL
TO authenticated
USING (public.is_group_admin(group_id))
WITH CHECK (public.is_group_admin(group_id));

DROP POLICY IF EXISTS "Users can request to join groups" ON group_members;
CREATE POLICY "Users can request to join groups"
ON group_members FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Shared Resources
ALTER TABLE shared_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view shared resources they have access to" ON shared_resources;
CREATE POLICY "Users can view shared resources they have access to"
ON shared_resources FOR SELECT
TO authenticated
USING (
  visibility = 'public'
  OR (shared_with_type = 'family' AND shared_with_id IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid()))
  OR (shared_with_type = 'group' AND public.is_group_member(shared_with_id))
);

DROP POLICY IF EXISTS "Users can create shared resources" ON shared_resources;
CREATE POLICY "Users can create shared resources"
ON shared_resources FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can update their own shared resources" ON shared_resources;
CREATE POLICY "Users can update their own shared resources"
ON shared_resources FOR UPDATE
TO authenticated
USING (auth.uid() = shared_by)
WITH CHECK (auth.uid() = shared_by);

-- Shared Classes
ALTER TABLE shared_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view shared classes they have access to" ON shared_classes;
CREATE POLICY "Users can view shared classes they have access to"
ON shared_classes FOR SELECT
TO authenticated
USING (
  visibility = 'public'
  OR (group_id IS NULL AND is_public = true)
  OR (group_id IS NOT NULL AND public.is_group_member(group_id))
);

DROP POLICY IF EXISTS "Users can create shared classes" ON shared_classes;
CREATE POLICY "Users can create shared classes"
ON shared_classes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Shared Class Enrollments
ALTER TABLE shared_class_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view enrollments for classes they have access to" ON shared_class_enrollments;
CREATE POLICY "Users can view enrollments for classes they have access to"
ON shared_class_enrollments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shared_classes sc
    WHERE sc.id = class_id
      AND (
        sc.visibility = 'public' 
        OR sc.is_public = true 
        OR (sc.group_id IS NOT NULL AND public.is_group_member(sc.group_id))
      )
  )
  OR family_id IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS "Users can enroll their children" ON shared_class_enrollments;
CREATE POLICY "Users can enroll their children"
ON shared_class_enrollments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = enrolled_by
  AND family_id IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- Marketplace Listings
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active marketplace listings" ON marketplace_listings;
CREATE POLICY "Anyone can view active marketplace listings"
ON marketplace_listings FOR SELECT
TO authenticated
USING (status = 'active');

DROP POLICY IF EXISTS "Users can create marketplace listings" ON marketplace_listings;
CREATE POLICY "Users can create marketplace listings"
ON marketplace_listings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = listed_by);

DROP POLICY IF EXISTS "Users can update their own listings" ON marketplace_listings;
CREATE POLICY "Users can update their own listings"
ON marketplace_listings FOR UPDATE
TO authenticated
USING (auth.uid() = listed_by)
WITH CHECK (auth.uid() = listed_by);

-- Marketplace Purchases
ALTER TABLE marketplace_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own purchases" ON marketplace_purchases;
CREATE POLICY "Users can view their own purchases"
ON marketplace_purchases FOR SELECT
TO authenticated
USING (auth.uid() = purchased_by);

DROP POLICY IF EXISTS "Users can create purchases" ON marketplace_purchases;
CREATE POLICY "Users can create purchases"
ON marketplace_purchases FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = purchased_by);

-- Marketplace Reviews
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reviews" ON marketplace_reviews;
CREATE POLICY "Anyone can view reviews"
ON marketplace_reviews FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can create reviews" ON marketplace_reviews;
CREATE POLICY "Users can create reviews"
ON marketplace_reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reviewed_by);

DROP POLICY IF EXISTS "Users can update their own reviews" ON marketplace_reviews;
CREATE POLICY "Users can update their own reviews"
ON marketplace_reviews FOR UPDATE
TO authenticated
USING (auth.uid() = reviewed_by)
WITH CHECK (auth.uid() = reviewed_by);

-- Family Connections
ALTER TABLE family_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view connections involving their family" ON family_connections;
CREATE POLICY "Users can view connections involving their family"
ON family_connections FOR SELECT
TO authenticated
USING (
  family_id_1 IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
  OR family_id_2 IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS "Users can create connections" ON family_connections;
CREATE POLICY "Users can create connections"
ON family_connections FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = initiated_by
  AND (family_id_1 IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
       OR family_id_2 IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can update connections involving their family" ON family_connections;
CREATE POLICY "Users can update connections involving their family"
ON family_connections FOR UPDATE
TO authenticated
USING (
  family_id_1 IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
  OR family_id_2 IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- Group Invite Codes
ALTER TABLE group_invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group admins can manage invite codes" ON group_invite_codes;
CREATE POLICY "Group admins can manage invite codes"
ON group_invite_codes FOR ALL
TO authenticated
USING (public.is_group_admin(group_id))
WITH CHECK (public.is_group_admin(group_id));

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-generate invite code for groups
CREATE OR REPLACE FUNCTION generate_group_invite_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    LOOP
      NEW.invite_code := generate_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM family_groups WHERE invite_code = NEW.invite_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_group_invite_code_trigger
BEFORE INSERT ON family_groups
FOR EACH ROW
EXECUTE FUNCTION generate_group_invite_code();

-- Update marketplace rating when review is added/updated
CREATE OR REPLACE FUNCTION update_marketplace_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE marketplace_listings
  SET 
    rating = (
      SELECT AVG(rating)::numeric(3,2)
      FROM marketplace_reviews
      WHERE listing_id = NEW.listing_id
    ),
    review_count = (
      SELECT COUNT(*)
      FROM marketplace_reviews
      WHERE listing_id = NEW.listing_id
    )
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_marketplace_rating_trigger
AFTER INSERT OR UPDATE ON marketplace_reviews
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_rating();

-- Update marketplace downloads when purchase is made
CREATE OR REPLACE FUNCTION update_marketplace_downloads()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE marketplace_listings
  SET downloads = downloads + 1
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_marketplace_downloads_trigger
AFTER INSERT ON marketplace_purchases
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_downloads();


-- Family bulletin board: shared notes stream with optional audience, subject, materials, and comments.

CREATE TABLE IF NOT EXISTS public.family_bulletin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  subject_id uuid NULL REFERENCES public.subject (id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'self', 'selected')),
  audience_user_ids uuid[] NOT NULL DEFAULT '{}',
  audience_child_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_bulletin_posts_family_created_idx
  ON public.family_bulletin_posts (family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS family_bulletin_posts_author_idx
  ON public.family_bulletin_posts (author_user_id, created_at DESC);

COMMENT ON TABLE public.family_bulletin_posts IS
  'Family bulletin board posts. visibility=all|self|selected with optional audience arrays.';

CREATE TABLE IF NOT EXISTS public.family_bulletin_post_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.family_bulletin_posts (id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, material_id)
);

CREATE INDEX IF NOT EXISTS family_bulletin_post_materials_post_idx
  ON public.family_bulletin_post_materials (post_id, sort_order);

CREATE TABLE IF NOT EXISTS public.family_bulletin_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.family_bulletin_posts (id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.family (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_bulletin_post_comments_post_created_idx
  ON public.family_bulletin_post_comments (post_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.can_view_family_bulletin_post(
  p_family_id uuid,
  p_author_user_id uuid,
  p_visibility text,
  p_audience_user_ids uuid[],
  p_audience_child_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  viewer_child_id uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_family_member(p_family_id) THEN
    RETURN false;
  END IF;

  IF p_author_user_id = uid THEN
    RETURN true;
  END IF;

  IF p_visibility = 'self' THEN
    RETURN false;
  END IF;

  IF p_visibility = 'all' THEN
    RETURN true;
  END IF;

  IF uid = ANY(COALESCE(p_audience_user_ids, '{}'::uuid[])) THEN
    RETURN true;
  END IF;

  SELECT fm.child_id
  INTO viewer_child_id
  FROM public.family_members fm
  WHERE fm.family_id = p_family_id
    AND fm.user_id = uid
  LIMIT 1;

  IF viewer_child_id IS NOT NULL
    AND viewer_child_id = ANY(COALESCE(p_audience_child_ids, '{}'::uuid[])) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.family_bulletin_posts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_bulletin_posts_updated_at ON public.family_bulletin_posts;
CREATE TRIGGER family_bulletin_posts_updated_at
  BEFORE UPDATE ON public.family_bulletin_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.family_bulletin_posts_set_updated_at();

ALTER TABLE public.family_bulletin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_bulletin_post_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_bulletin_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_bulletin_posts_select ON public.family_bulletin_posts;
CREATE POLICY family_bulletin_posts_select ON public.family_bulletin_posts
  FOR SELECT
  USING (
    public.can_view_family_bulletin_post(
      family_id,
      author_user_id,
      visibility,
      audience_user_ids,
      audience_child_ids
    )
  );

DROP POLICY IF EXISTS family_bulletin_posts_insert ON public.family_bulletin_posts;
CREATE POLICY family_bulletin_posts_insert ON public.family_bulletin_posts
  FOR INSERT
  WITH CHECK (
    public.is_family_member(family_id)
    AND author_user_id = auth.uid()
    AND (
      visibility <> 'selected'
      OR cardinality(audience_user_ids) > 0
      OR cardinality(audience_child_ids) > 0
    )
  );

DROP POLICY IF EXISTS family_bulletin_posts_delete ON public.family_bulletin_posts;
CREATE POLICY family_bulletin_posts_delete ON public.family_bulletin_posts
  FOR DELETE
  USING (
    author_user_id = auth.uid()
    OR public.is_family_parent(family_id)
  );

DROP POLICY IF EXISTS family_bulletin_post_materials_select ON public.family_bulletin_post_materials;
CREATE POLICY family_bulletin_post_materials_select ON public.family_bulletin_post_materials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_bulletin_posts p
      WHERE p.id = post_id
        AND public.can_view_family_bulletin_post(
          p.family_id,
          p.author_user_id,
          p.visibility,
          p.audience_user_ids,
          p.audience_child_ids
        )
    )
  );

DROP POLICY IF EXISTS family_bulletin_post_materials_insert ON public.family_bulletin_post_materials;
CREATE POLICY family_bulletin_post_materials_insert ON public.family_bulletin_post_materials
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_bulletin_posts p
      WHERE p.id = post_id
        AND p.author_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS family_bulletin_post_materials_delete ON public.family_bulletin_post_materials;
CREATE POLICY family_bulletin_post_materials_delete ON public.family_bulletin_post_materials
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_bulletin_posts p
      WHERE p.id = post_id
        AND (
          p.author_user_id = auth.uid()
          OR public.is_family_parent(p.family_id)
        )
    )
  );

DROP POLICY IF EXISTS family_bulletin_post_comments_select ON public.family_bulletin_post_comments;
CREATE POLICY family_bulletin_post_comments_select ON public.family_bulletin_post_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_bulletin_posts p
      WHERE p.id = post_id
        AND public.can_view_family_bulletin_post(
          p.family_id,
          p.author_user_id,
          p.visibility,
          p.audience_user_ids,
          p.audience_child_ids
        )
    )
  );

DROP POLICY IF EXISTS family_bulletin_post_comments_insert ON public.family_bulletin_post_comments;
CREATE POLICY family_bulletin_post_comments_insert ON public.family_bulletin_post_comments
  FOR INSERT
  WITH CHECK (
    public.is_family_member(family_id)
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.family_bulletin_posts p
      WHERE p.id = post_id
        AND p.family_id = family_id
        AND public.can_view_family_bulletin_post(
          p.family_id,
          p.author_user_id,
          p.visibility,
          p.audience_user_ids,
          p.audience_child_ids
        )
    )
  );

DROP POLICY IF EXISTS family_bulletin_post_comments_delete ON public.family_bulletin_post_comments;
CREATE POLICY family_bulletin_post_comments_delete ON public.family_bulletin_post_comments
  FOR DELETE
  USING (
    author_user_id = auth.uid()
    OR public.is_family_parent(family_id)
    OR EXISTS (
      SELECT 1
      FROM public.family_bulletin_posts p
      WHERE p.id = post_id
        AND p.author_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, DELETE ON public.family_bulletin_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.family_bulletin_post_materials TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.family_bulletin_post_comments TO authenticated;
GRANT ALL ON public.family_bulletin_posts TO service_role;
GRANT ALL ON public.family_bulletin_post_materials TO service_role;
GRANT ALL ON public.family_bulletin_post_comments TO service_role;

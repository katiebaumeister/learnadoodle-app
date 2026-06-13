-- Allow post authors to edit their bulletin posts.

DROP POLICY IF EXISTS family_bulletin_posts_update ON public.family_bulletin_posts;
CREATE POLICY family_bulletin_posts_update ON public.family_bulletin_posts
  FOR UPDATE
  USING (author_user_id = auth.uid())
  WITH CHECK (
    author_user_id = auth.uid()
    AND (
      visibility <> 'selected'
      OR cardinality(audience_user_ids) > 0
      OR cardinality(audience_child_ids) > 0
    )
  );

GRANT UPDATE ON public.family_bulletin_posts TO authenticated;

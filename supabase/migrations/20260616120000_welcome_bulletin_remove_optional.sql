-- Remove legacy "(optional)" copy from subject welcome bulletin posts.
UPDATE public.family_bulletin_posts
SET body = replace(body, 'Edit units (optional)', 'Edit units')
WHERE system_kind = 'subject_getting_started'
  AND body LIKE '%Edit units (optional)%';

-- Update Configure Schedule welcome copy to Edit subject / set dates wording.
UPDATE public.family_bulletin_posts
SET body = regexp_replace(
  body,
  'Configure Schedule — open this subject.''s .* recurring planner slots for ([^.]+)\.',
  'Configure Schedule — Edit this subject and set dates to see recurring planner slots for \1.',
  'gi'
)
WHERE system_kind = 'subject_getting_started'
  AND body ~* 'Configure Schedule — open this subject';

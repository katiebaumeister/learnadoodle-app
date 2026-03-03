-- Fix parent account incorrectly marked as child in profiles and family_members
-- Run this if a parent has role='child' in profiles (e.g. from testing child invite flow)
UPDATE profiles
SET role = 'parent'
WHERE email = 'katiebaumeister@icloud.com'
  AND role = 'child'
  AND family_id IS NOT NULL;

-- Also fix family_members so /api/me uses correct role (family_members overrides profiles)
UPDATE family_members fm
SET member_role = 'parent'
FROM profiles p
WHERE fm.user_id = p.id
  AND fm.family_id = p.family_id
  AND p.email = 'katiebaumeister@icloud.com'
  AND fm.member_role IN ('child', 'student');

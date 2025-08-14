-- Fix user family connection
-- This script will create a family for the current user and link them to it

-- First, let's see the current user's profile
SELECT id, email, family_id FROM profiles WHERE id = auth.uid();

-- Create a family for the current user if they don't have one
INSERT INTO families (id, name, created_at, updated_at)
SELECT 
    gen_random_uuid(), 
    'Family of ' || (SELECT email FROM auth.users WHERE id = auth.uid()),
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM families f 
    JOIN profiles p ON p.family_id = f.id 
    WHERE p.id = auth.uid()
);

-- Update the user's profile with the family_id
UPDATE profiles 
SET family_id = (
    SELECT f.id 
    FROM families f 
    WHERE f.id NOT IN (
        SELECT DISTINCT family_id 
        FROM profiles 
        WHERE family_id IS NOT NULL
    )
    LIMIT 1
)
WHERE id = auth.uid() AND family_id IS NULL;

-- Verify the connection was made
SELECT 
    p.id as user_id,
    p.email,
    p.family_id,
    f.name as family_name
FROM profiles p
LEFT JOIN families f ON p.family_id = f.id
WHERE p.id = auth.uid(); 
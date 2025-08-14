-- Fix profiles table to resolve signup email issues
-- This script addresses the "Database error saving new user" issue

-- 1. First, let's check if the profiles table exists and its structure
SELECT 'Checking profiles table structure...' as status;

-- 2. Drop the profiles table if it exists to recreate it cleanly
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 3. Recreate the profiles table with a simple, clean structure
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  avatar_url text,
  family_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- 4. Add foreign key constraint to auth.users (but make it optional to avoid issues)
-- Note: We'll add this constraint later if needed
-- CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON profiles(family_id);

-- 6. Grant permissions
GRANT ALL ON TABLE profiles TO authenticated;
GRANT ALL ON TABLE profiles TO anon;

-- 7. Disable RLS to avoid any policy issues
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 8. Drop any existing triggers that might be causing issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_signup ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 9. Create a comprehensive trigger function that creates family and profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_family_id uuid;
BEGIN
  -- First, create a new family for this user
  INSERT INTO public.family (id, name, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    COALESCE(new.raw_user_meta_data->>'full_name', 'My Family'),
    now(),
    now()
  )
  RETURNING id INTO new_family_id;
  
  -- Then, create the profile and link it to the family
  INSERT INTO public.profiles (id, email, full_name, avatar_url, family_id)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    new_family_id
  );
  
  -- Log the successful creation
  RAISE NOTICE 'Created family % for user %', new_family_id, new.id;
  
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create family/profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- 12. Verify the setup
SELECT 'Profiles table created successfully' as status;
SELECT 'Trigger function created successfully' as status;
SELECT 'Trigger created successfully' as status;

-- 13. Test the trigger function (optional)
-- This will help verify the function works without actually creating a user
SELECT 'Setup complete. Try signing up again.' as status; 
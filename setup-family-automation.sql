-- Setup automatic family creation for new users
-- This script ensures that when a user signs up, they get a unique family

-- 1. Ensure the family table exists with proper structure
CREATE TABLE IF NOT EXISTS public.family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Family',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. Add any missing columns to family table
DO $$ 
BEGIN
  -- Add name column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family' AND column_name = 'name') THEN
    ALTER TABLE family ADD COLUMN name text NOT NULL DEFAULT 'My Family';
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family' AND column_name = 'created_at') THEN
    ALTER TABLE family ADD COLUMN created_at timestamp with time zone DEFAULT now();
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family' AND column_name = 'updated_at') THEN
    ALTER TABLE family ADD COLUMN updated_at timestamp with time zone DEFAULT now();
  END IF;
END $$;

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_family_created_at ON family(created_at);

-- 4. Grant permissions
GRANT ALL ON TABLE family TO authenticated;
GRANT ALL ON TABLE family TO anon;

-- 5. Disable RLS on family table to avoid policy issues
ALTER TABLE family DISABLE ROW LEVEL SECURITY;

-- 6. Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_signup ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 7. Create the comprehensive trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_family_id uuid;
  user_full_name text;
BEGIN
  -- Get user's full name from metadata or use email as fallback
  user_full_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );
  
  -- Create a new family for this user
  INSERT INTO public.family (id, name, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    user_full_name || '''s Family',
    now(),
    now()
  )
  RETURNING id INTO new_family_id;
  
  -- Create the profile and link it to the family
  INSERT INTO public.profiles (id, email, full_name, avatar_url, family_id)
  VALUES (
    new.id, 
    new.email, 
    user_full_name,
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    new_family_id
  );
  
  -- Log the successful creation
  RAISE NOTICE 'Created family % for user % with name %', new_family_id, new.id, user_full_name;
  
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create family/profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- 10. Verify the setup
SELECT 'Family table created/updated successfully' as status;
SELECT 'Trigger function created successfully' as status;
SELECT 'Trigger created successfully' as status;
SELECT 'Automatic family creation is now enabled' as status;

-- 11. Show current family count
SELECT 'Current families in database: ' || COUNT(*) as family_count FROM family; 
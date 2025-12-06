-- Fix RLS Permissions for Materials Tables
-- Run this in Supabase SQL Editor if you're getting "permission denied" errors

-- Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON material_children TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON material_reviews TO authenticated;

-- Ensure is_family_member function has execute permissions
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO service_role;


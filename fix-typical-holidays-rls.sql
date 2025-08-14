-- Fix RLS for typical_holidays table
-- This table should be readable by all authenticated users

-- Enable RLS on typical_holidays
ALTER TABLE typical_holidays ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can view typical holidays" ON typical_holidays;
DROP POLICY IF EXISTS "Users can insert typical holidays" ON typical_holidays;
DROP POLICY IF EXISTS "Users can update typical holidays" ON typical_holidays;
DROP POLICY IF EXISTS "Users can delete typical holidays" ON typical_holidays;

-- Create RLS policies for typical_holidays
-- This table should be readable by all authenticated users since it's global holiday data
CREATE POLICY "Users can view typical holidays" ON typical_holidays
    FOR SELECT USING (auth.role() = 'authenticated');

-- Only allow service role to modify typical holidays (admin function)
CREATE POLICY "Service role can manage typical holidays" ON typical_holidays
    FOR ALL USING (auth.role() = 'service_role');

-- Show the policies
SELECT 'TYPICAL_HOLIDAYS POLICIES:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'typical_holidays'
ORDER BY policyname;

SELECT 'Typical holidays RLS fixed!' as status; 
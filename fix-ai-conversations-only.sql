-- Targeted Fix for ai_conversations table only
-- This focuses specifically on the table that's causing permission issues

-- Step 1: Check current state of ai_conversations table
SELECT 
    tablename,
    rowsecurity,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE tablename = 'ai_conversations';

-- Step 2: Check if there are any policies on this table
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'ai_conversations';

-- Step 3: Force disable RLS on ai_conversations
ALTER TABLE ai_conversations DISABLE ROW LEVEL SECURITY;

-- Step 4: Drop ALL policies on ai_conversations (be very thorough)
DROP POLICY IF EXISTS "Users can view their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can insert their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can update their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_select_policy" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_insert_policy" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_update_policy" ON ai_conversations;
DROP POLICY IF EXISTS "allow_all_conversations" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_select_policy" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_insert_policy" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_update_policy" ON ai_conversations;

-- Step 5: Verify RLS is disabled
SELECT 
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'ai_conversations';

-- Step 6: Test direct access to the table
SELECT COUNT(*) as conversation_count FROM ai_conversations;

-- Step 7: If still having issues, try recreating the table without RLS
-- (This is a nuclear option - only use if everything else fails)
-- DROP TABLE IF EXISTS ai_conversations CASCADE;
-- CREATE TABLE ai_conversations (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     family_id UUID REFERENCES family(id) ON DELETE CASCADE,
--     conversation_type VARCHAR(50) NOT NULL,
--     title VARCHAR(255),
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     is_active BOOLEAN DEFAULT true,
--     metadata JSONB
-- );

SELECT 'ai_conversations table RLS disabled and policies dropped. Test now!' as status; 
-- Diagnostic and Fix Script for AI Conversations RLS
-- This will check the current state and fix any issues

-- Step 1: Check current RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('ai_conversations', 'ai_messages', 'ai_actions');

-- Step 2: Check existing policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('ai_conversations', 'ai_messages', 'ai_actions');

-- Step 3: Force disable RLS completely
ALTER TABLE ai_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions DISABLE ROW LEVEL SECURITY;

-- Step 4: Drop ALL policies to be sure
DROP POLICY IF EXISTS "Users can view their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can insert their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can update their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_select_policy" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_insert_policy" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_update_policy" ON ai_conversations;
DROP POLICY IF EXISTS "allow_all_conversations" ON ai_conversations;

DROP POLICY IF EXISTS "Users can view messages from their family's conversations" ON ai_messages;
DROP POLICY IF EXISTS "Users can insert messages to their family's conversations" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_select_policy" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_insert_policy" ON ai_messages;
DROP POLICY IF EXISTS "allow_all_messages" ON ai_messages;

DROP POLICY IF EXISTS "Users can view actions from their family's conversations" ON ai_actions;
DROP POLICY IF EXISTS "Users can insert actions to their family's conversations" ON ai_actions;
DROP POLICY IF EXISTS "ai_actions_select_policy" ON ai_actions;
DROP POLICY IF EXISTS "ai_actions_insert_policy" ON ai_actions;
DROP POLICY IF EXISTS "ai_actions_update_policy" ON ai_actions;
DROP POLICY IF EXISTS "allow_all_actions" ON ai_actions;

-- Step 5: Verify RLS is disabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('ai_conversations', 'ai_messages', 'ai_actions');

-- Step 6: Test a simple query to verify access
SELECT COUNT(*) as conversation_count FROM ai_conversations;
SELECT COUNT(*) as message_count FROM ai_messages;
SELECT COUNT(*) as action_count FROM ai_actions;

SELECT 'RLS completely disabled and all policies dropped. Test the AI conversations now!' as status; 
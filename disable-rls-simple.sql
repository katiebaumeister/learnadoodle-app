-- Simple RLS Disable for ai_conversations
-- This just disables RLS without any complex operations

ALTER TABLE ai_conversations DISABLE ROW LEVEL SECURITY;

SELECT 'RLS disabled on ai_conversations table' as status; 
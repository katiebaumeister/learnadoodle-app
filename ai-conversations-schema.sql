-- AI Conversations and Tracking Schema
-- This file contains the database changes needed to support AI conversations
-- and track changes throughout conversations

-- 1. AI Conversations Table
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES family(id) ON DELETE CASCADE,
    conversation_type VARCHAR(50) NOT NULL, -- 'doodlebot', 'subject_assistant', 'progress_analysis', etc.
    title VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB -- Store additional context like planning dates, etc.
);

-- 2. AI Messages Table
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB -- Store message-specific data like context used, etc.
);

-- 3. AI Actions Table (for tracking what actions were taken)
CREATE TABLE IF NOT EXISTS ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'reschedule_task', 'update_progress', 'plan_activities', etc.
    action_data JSONB NOT NULL, -- Store the actual action details
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- 4. Update existing tables to support AI tracking

-- Add AI tracking to subject_track table
ALTER TABLE subject_track ADD COLUMN IF NOT EXISTS ai_conversation_history JSONB DEFAULT '[]';
ALTER TABLE subject_track ADD COLUMN IF NOT EXISTS last_ai_analysis TIMESTAMP WITH TIME ZONE;
ALTER TABLE subject_track ADD COLUMN IF NOT EXISTS ai_recommendations TEXT;

-- Add AI tracking to lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS ai_progress_analysis JSONB DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS last_ai_review TIMESTAMP WITH TIME ZONE;

-- Add AI tracking to activities table (if you have one)
-- If not, you might want to create one:
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES family(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- 'live', 'self-paced', 'custom'
    schedule_data JSONB, -- Store schedule information
    ai_analysis JSONB DEFAULT '{}', -- Store AI analysis results
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_conversations_family_id ON ai_conversations(family_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_type ON ai_conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_timestamp ON ai_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation_id ON ai_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_type ON ai_actions(action_type);

-- 6. Row Level Security (RLS) policies
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_conversations
CREATE POLICY "Users can view their family's AI conversations" ON ai_conversations
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their family's AI conversations" ON ai_conversations
    FOR INSERT WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their family's AI conversations" ON ai_conversations
    FOR UPDATE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can insert their family's AI conversations" ON ai_conversations;
DROP POLICY IF EXISTS "Users can update their family's AI conversations" ON ai_conversations;

-- Create new policies
CREATE POLICY "Users can view their family's AI conversations" ON ai_conversations
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their family's AI conversations" ON ai_conversations
    FOR INSERT WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their family's AI conversations" ON ai_conversations
    FOR UPDATE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- RLS policies for ai_messages
CREATE POLICY "Users can view messages from their family's conversations" ON ai_messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM ai_conversations 
            WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert messages to their family's conversations" ON ai_messages
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT id FROM ai_conversations 
            WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- RLS policies for ai_actions
CREATE POLICY "Users can view actions from their family's conversations" ON ai_actions
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM ai_conversations 
            WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert actions to their family's conversations" ON ai_actions
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT id FROM ai_conversations 
            WHERE family_id IN (
                SELECT family_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- 7. Functions for common operations

-- Function to create a new AI conversation
CREATE OR REPLACE FUNCTION create_ai_conversation(
    p_family_id UUID,
    p_conversation_type VARCHAR(50),
    p_title VARCHAR(255) DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    INSERT INTO ai_conversations (family_id, conversation_type, title, metadata)
    VALUES (p_family_id, p_conversation_type, p_title, p_metadata)
    RETURNING id INTO v_conversation_id;
    
    RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add a message to a conversation
CREATE OR REPLACE FUNCTION add_ai_message(
    p_conversation_id UUID,
    p_role VARCHAR(20),
    p_content TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_message_id UUID;
BEGIN
    INSERT INTO ai_messages (conversation_id, role, content, metadata)
    VALUES (p_conversation_id, p_role, p_content, p_metadata)
    RETURNING id INTO v_message_id;
    
    -- Update conversation timestamp
    UPDATE ai_conversations 
    SET updated_at = NOW() 
    WHERE id = p_conversation_id;
    
    RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record an AI action
CREATE OR REPLACE FUNCTION record_ai_action(
    p_conversation_id UUID,
    p_action_type VARCHAR(50),
    p_action_data JSONB,
    p_status VARCHAR(20) DEFAULT 'pending'
) RETURNS UUID AS $$
DECLARE
    v_action_id UUID;
BEGIN
    INSERT INTO ai_actions (conversation_id, action_type, action_data, status)
    VALUES (p_conversation_id, p_action_type, p_action_data, p_status)
    RETURNING id INTO v_action_id;
    
    RETURN v_action_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 
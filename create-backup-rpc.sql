-- Backup RPC function to bypass RLS issues
-- This creates a function that can access ai_conversations without RLS restrictions

-- Function to get conversation by ID (bypasses RLS)
CREATE OR REPLACE FUNCTION get_conversation_raw(conversation_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', c.id,
        'conversation_type', c.conversation_type,
        'title', c.title,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'metadata', c.metadata,
        'ai_messages', COALESCE(
            (SELECT json_agg(json_build_object(
                'id', m.id,
                'role', m.role,
                'content', m.content,
                'timestamp', m.timestamp,
                'metadata', m.metadata
            )) FROM ai_messages m WHERE m.conversation_id = c.id),
            '[]'::json
        ),
        'ai_actions', COALESCE(
            (SELECT json_agg(json_build_object(
                'id', a.id,
                'action_type', a.action_type,
                'action_data', a.action_data,
                'status', a.status,
                'created_at', a.created_at,
                'completed_at', a.completed_at,
                'error_message', a.error_message
            )) FROM ai_actions a WHERE a.conversation_id = c.id),
            '[]'::json
        )
    ) INTO result
    FROM ai_conversations c
    WHERE c.id = conversation_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get conversation history (bypasses RLS)
CREATE OR REPLACE FUNCTION get_conversation_history_raw(
    p_family_id UUID,
    p_conversation_type VARCHAR(50) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSON AS $$
DECLARE
    result JSON;
    query_text TEXT;
BEGIN
    query_text := 'SELECT json_agg(json_build_object(
        ''id'', c.id,
        ''conversation_type'', c.conversation_type,
        ''title'', c.title,
        ''created_at'', c.created_at,
        ''updated_at'', c.updated_at,
        ''metadata'', c.metadata,
        ''ai_messages'', COALESCE(
            (SELECT json_agg(json_build_object(
                ''id'', m.id,
                ''role'', m.role,
                ''content'', m.content,
                ''timestamp'', m.timestamp,
                ''metadata'', m.metadata
            )) FROM ai_messages m WHERE m.conversation_id = c.id),
            ''[]''::json
        )
    )) FROM ai_conversations c WHERE c.family_id = $1 AND c.is_active = true';
    
    IF p_conversation_type IS NOT NULL THEN
        query_text := query_text || ' AND c.conversation_type = $2';
    END IF;
    
    query_text := query_text || ' ORDER BY c.updated_at DESC LIMIT $3';
    
    IF p_conversation_type IS NOT NULL THEN
        EXECUTE query_text INTO result USING p_family_id, p_conversation_type, p_limit;
    ELSE
        EXECUTE query_text INTO result USING p_family_id, p_limit;
    END IF;
    
    RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Backup RPC functions created successfully!' as status; 
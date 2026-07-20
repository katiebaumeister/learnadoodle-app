// AI Conversation Service
// Handles database operations for AI conversations and tracking

import { supabase } from './supabase.js';

export class AIConversationService {
  // Create a new AI conversation
  static async createConversation(familyId, conversationType, title = null, metadata = {}) {
    try {
      const { data, error } = await supabase.rpc('create_ai_conversation', {
        p_family_id: familyId,
        p_conversation_type: conversationType,
        p_title: title,
        p_metadata: metadata
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Add a message to a conversation
  static async addMessage(conversationId, role, content, metadata = {}) {
    try {
      const { data, error } = await supabase.rpc('add_ai_message', {
        p_conversation_id: conversationId,
        p_role: role,
        p_content: content,
        p_metadata: metadata
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Record an AI / chatbot action (audit). For user-confirmed commits use status 'completed' and include
   * { source_channel, proposal, result } in action_data (see lib/assistant/chatCommit.js).
   */
  static async recordAction(conversationId, actionType, actionData, status = 'pending') {
    try {
      const { data, error } = await supabase.rpc('record_ai_action', {
        p_conversation_id: conversationId,
        p_action_type: actionType,
        p_action_data: actionData,
        p_status: status,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Get conversation history
  static async getConversationHistory(familyId, conversationType = null, limit = 50) {
    try {
      // First try with RLS
      let query = supabase
        .from('ai_conversations')
        .select(`
          id,
          conversation_type,
          title,
          created_at,
          updated_at,
          metadata,
          ai_messages (
            id,
            role,
            content,
            timestamp,
            metadata
          )
        `)
        .eq('family_id', familyId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (conversationType) {
        query = query.eq('conversation_type', conversationType);
      }

      let { data, error } = await query;

      if (error) {
        // If RLS fails, try a simpler query
        let simpleQuery = supabase
          .from('ai_conversations')
          .select('*')
          .eq('family_id', familyId)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(limit);

        if (conversationType) {
          simpleQuery = simpleQuery.eq('conversation_type', conversationType);
        }

        const { data: simpleData, error: simpleError } = await simpleQuery;
        if (simpleError) {
          return [];
        }
        return simpleData;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the latest conversation of a type for a family (oldest→newest messages).
   * Returns { conversationId, messages } or null.
   */
  static async getLatestConversationByType(familyId, conversationType = 'doodlebot') {
    try {
      const list = await this.getConversationHistory(familyId, conversationType, 1);
      if (!list || list.length === 0) return null;

      const conv = list[0];
      const conversationId = conv.id;

      let rawMessages = conv.ai_messages;
      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        const full = await this.getConversation(conversationId);
        rawMessages = full?.ai_messages || [];
      }

      const messages = rawMessages
        .map((m) => {
          const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {};
          const createdAt = m.timestamp || m.created_at || null;
          return {
            id: m.id || `msg_${createdAt || Date.now()}`,
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
            createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
            timestamp: createdAt ? new Date(createdAt).getTime() : Date.now(),
            structured: meta.structured || null,
            attachments: Array.isArray(meta.attachments) ? meta.attachments : [],
          };
        })
        .filter((m) => m.role && m.content !== undefined)
        .sort((a, b) => a.timestamp - b.timestamp);

      return { conversationId, messages };
    } catch {
      return null;
    }
  }

  /**
   * Get the latest Doodle conversation for a family with its messages, for hydrating chat on open.
   * Returns { conversationId, messages } or null. messages are { role, content, timestamp } sorted by time.
   */
  static async getLatestDoodleConversation(familyId) {
    return this.getLatestConversationByType(familyId, 'doodlebot');
  }

  /** Left-rail Doodle command pane thread (separate from legacy SearchModal doodlebot). */
  static async getLatestDoodleCommandConversation(familyId) {
    return this.getLatestConversationByType(familyId, 'doodle_command');
  }

  // Get a specific conversation with all messages
  static async getConversation(conversationId) {
    try {
      // Try multiple approaches to handle RLS issues
      
      // Approach 1: Full query with joins
      let { data, error } = await supabase
        .from('ai_conversations')
        .select(`
          id,
          conversation_type,
          title,
          created_at,
          updated_at,
          metadata,
          ai_messages (
            id,
            role,
            content,
            timestamp,
            metadata
          ),
          ai_actions (
            id,
            action_type,
            action_data,
            status,
            created_at,
            completed_at,
            error_message
          )
        `)
        .eq('id', conversationId)
        .single();

      if (error) {
        // Approach 2: Simple query without joins
        const { data: simpleData, error: simpleError } = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('id', conversationId)
          .single();
        
        if (simpleError) {
          // Approach 3: Return basic conversation data without joins
          return {
            id: conversationId,
            conversation_type: 'unknown',
            title: 'Conversation',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {},
            ai_messages: [],
            ai_actions: []
          };
        }
        
        return simpleData;
      }
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Update conversation metadata
  static async updateConversationMetadata(conversationId, metadata) {
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .update({ 
          metadata: metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Mark conversation as inactive
  static async deactivateConversation(conversationId) {
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  /** Active Doodle pane + legacy bot threads for Settings → Chats. */
  static async listDoodleConversationsForClear(familyId, limit = 40) {
    if (!familyId) return [];
    const types = ['doodle_command', 'doodlebot'];
    const rows = [];
    for (const conversationType of types) {
      const list = await this.getConversationHistory(familyId, conversationType, limit);
      for (const conv of (Array.isArray(list) ? list : [])) {
        if (!conv?.id) continue;
        const messages = Array.isArray(conv.ai_messages) ? conv.ai_messages : [];
        const preview = [...messages]
          .sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0))
          .find((m) => String(m?.content || '').trim());
        rows.push({
          id: String(conv.id),
          conversationType,
          title: conversationType === 'doodle_command' ? 'Doodle' : 'Doodle (classic)',
          updatedAt: conv.updated_at || conv.created_at || null,
          preview: preview ? String(preview.content || '').replace(/\s+/g, ' ').trim().slice(0, 80) : 'No messages yet',
          messageCount: messages.length,
        });
      }
    }
    return rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  /** Soft-clear Doodle conversations (is_active = false). */
  static async clearDoodleConversations(familyId, { conversationIds = [], clearAll = false } = {}) {
    if (!familyId) return { cleared: 0, error: new Error('Missing family id') };
    try {
      let ids = [...new Set((conversationIds || []).map(String).filter(Boolean))];
      if (clearAll) {
        const listed = await this.listDoodleConversationsForClear(familyId, 100);
        ids = listed.map((r) => r.id);
      }
      if (!ids.length) return { cleared: 0, error: null };

      const { error } = await supabase
        .from('ai_conversations')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('family_id', familyId)
        .in('id', ids)
        .in('conversation_type', ['doodle_command', 'doodlebot']);

      if (error) return { cleared: 0, error };

      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage?.removeItem('learnadoodle_doodle_chat_v1');
        } catch {
          // ignore
        }
        window.dispatchEvent(new CustomEvent('doodleConversationsCleared', {
          detail: { familyId: String(familyId), conversationIds: ids },
        }));
      }
      return { cleared: ids.length, error: null };
    } catch (error) {
      return { cleared: 0, error };
    }
  }

  // Update AI action status
  static async updateActionStatus(actionId, status, errorMessage = null) {
    try {
      const updateData = { 
        status: status,
        updated_at: new Date().toISOString()
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      const { data, error } = await supabase
        .from('ai_actions')
        .update(updateData)
        .eq('id', actionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Get AI analysis for a subject track
  static async getSubjectTrackAnalysis(subjectTrackId) {
    try {
      const { data, error } = await supabase
        .from('subject_track')
        .select('ai_conversation_history, last_ai_analysis, ai_recommendations')
        .eq('id', subjectTrackId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Update subject track AI analysis
  static async updateSubjectTrackAnalysis(subjectTrackId, analysis) {
    try {
      const { data, error } = await supabase
        .from('subject_track')
        .update({
          ai_conversation_history: analysis.conversation_history || [],
          last_ai_analysis: new Date().toISOString(),
          ai_recommendations: analysis.recommendations || null
        })
        .eq('id', subjectTrackId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Get lesson AI analysis
  static async getLessonAnalysis(lessonId) {
    try {
      const { data, error } = await supabase
        .from('lessons')
        .select('ai_progress_analysis, last_ai_review')
        .eq('id', lessonId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Update lesson AI analysis
  static async updateLessonAnalysis(lessonId, analysis) {
    try {
      const { data, error } = await supabase
        .from('lessons')
        .update({
          ai_progress_analysis: analysis,
          last_ai_review: new Date().toISOString()
        })
        .eq('id', lessonId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Search conversations by content
  static async searchConversations(familyId, searchTerm, limit = 20) {
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select(`
          id,
          content,
          timestamp,
          role,
          ai_conversations!inner (
            id,
            conversation_type,
            title,
            family_id
          )
        `)
        .eq('ai_conversations.family_id', familyId)
        .ilike('content', `%${searchTerm}%`)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }
} 
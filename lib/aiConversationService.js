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
      console.error('Error creating AI conversation:', error);
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
      console.error('Error adding AI message:', error);
      throw error;
    }
  }

  // Record an AI action
  static async recordAction(conversationId, actionType, actionData, status = 'pending') {
    try {
      const { data, error } = await supabase.rpc('record_ai_action', {
        p_conversation_id: conversationId,
        p_action_type: actionType,
        p_action_data: actionData,
        p_status: status
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error recording AI action:', error);
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
        console.warn('RLS error, trying simple query:', error);
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
          console.warn('Simple query failed, returning empty array:', simpleError);
          return [];
        }
        return simpleData;
      }

      return data;
    } catch (error) {
      console.error('Error getting conversation history:', error);
      throw error;
    }
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
        console.warn('Full query failed, trying simple query:', error);
        
        // Approach 2: Simple query without joins
        const { data: simpleData, error: simpleError } = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('id', conversationId)
          .single();
        
        if (simpleError) {
          console.warn('Simple query failed, returning basic data:', simpleError);
          
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
      console.error('Error getting conversation:', error);
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
      console.error('Error updating conversation metadata:', error);
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
      console.error('Error deactivating conversation:', error);
      throw error;
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
      console.error('Error updating action status:', error);
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
      console.error('Error getting subject track analysis:', error);
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
      console.error('Error updating subject track analysis:', error);
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
      console.error('Error getting lesson analysis:', error);
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
      console.error('Error updating lesson analysis:', error);
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
      console.error('Error searching conversations:', error);
      throw error;
    }
  }
} 
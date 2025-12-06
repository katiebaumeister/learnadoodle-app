/**
 * AI Coach Tab Component
 * Personal learning coach interface for parents and children
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MessageSquare, Send, User, Bot, Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { coachConversation, getCoachSessions, getCoachRecommendations, acceptCoachRecommendation } from '../../lib/services/aiCoachClient';

export default function CoachTab({ familyId, children = [], userRole = 'parent' }) {
  const [sessionType, setSessionType] = useState(userRole === 'child' ? 'child' : 'parent');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const scrollViewRef = useRef(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [sessionType, selectedChildId]);

  // Load session when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  const loadSessions = async () => {
    const { data, error } = await getCoachSessions(sessionType, selectedChildId);
    if (!error && data) {
      setSessions(data);
      // Load most recent session if available
      if (data.length > 0 && !sessionId) {
        setSessionId(data[0].id);
      }
    }
  };

  const loadSession = async (id) => {
    const { data, error } = await getCoachSessions(sessionType, selectedChildId);
    if (!error && data) {
      const session = data.find(s => s.id === id);
      if (session) {
        setMessages(session.conversation_history || []);
        // Load recommendations for this session
        loadRecommendations(id);
      }
    }
  };

  const loadRecommendations = async (sessionId) => {
    const { data, error } = await getCoachRecommendations(sessionId, 'pending');
    if (!error && data) {
      setRecommendations(data);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const { data, error } = await coachConversation(
        inputMessage.trim(),
        sessionId,
        selectedChildId,
        sessionType
      );

      if (error) {
        console.error('Coach conversation error:', error);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        }]);
      } else if (data) {
        setSessionId(data.session_id);
        setMessages(data.conversation_history || []);
        
        // Load new recommendations if any
        if (data.recommendations && data.recommendations.length > 0) {
          setRecommendations(prev => [...prev, ...data.recommendations]);
        }
      }
    } catch (err) {
      console.error('Coach conversation exception:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRecommendation = async (recommendationId) => {
    const { data, error } = await acceptCoachRecommendation(recommendationId);
    if (!error && data) {
      setRecommendations(prev => prev.map(r => 
        r.id === recommendationId ? { ...r, status: 'accepted' } : r
      ));
    }
  };

  const handleStartNewSession = () => {
    setSessionId(null);
    setMessages([]);
    setRecommendations([]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Sparkles size={20} color={colors.indigo} />
            <Text style={styles.headerTitle}>AI Learning Coach</Text>
          </View>
          <TouchableOpacity onPress={handleStartNewSession} style={styles.newSessionButton}>
            <Text style={styles.newSessionText}>New Session</Text>
          </TouchableOpacity>
        </View>

        {/* Session Type Selector */}
        {userRole === 'parent' && (
          <View style={styles.sessionTypeSelector}>
            <TouchableOpacity
              style={[styles.sessionTypeButton, sessionType === 'parent' && styles.sessionTypeButtonActive]}
              onPress={() => {
                setSessionType('parent');
                setSelectedChildId(null);
                setSessionId(null);
              }}
            >
              <Text style={[styles.sessionTypeText, sessionType === 'parent' && styles.sessionTypeTextActive]}>
                Parent Coach
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sessionTypeButton, sessionType === 'child' && styles.sessionTypeButtonActive]}
              onPress={() => setSessionType('child')}
            >
              <Text style={[styles.sessionTypeText, sessionType === 'child' && styles.sessionTypeTextActive]}>
                Child Coach
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Child Selector (for child sessions) */}
        {sessionType === 'child' && children.length > 0 && (
          <View style={styles.childSelector}>
            <Text style={styles.childSelectorLabel}>For:</Text>
            {children.map(child => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childButton,
                  selectedChildId === child.id && styles.childButtonActive
                ]}
                onPress={() => {
                  setSelectedChildId(child.id);
                  setSessionId(null);
                }}
              >
                <Text style={[
                  styles.childButtonText,
                  selectedChildId === child.id && styles.childButtonTextActive
                ]}>
                  {child.first_name || child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <View style={styles.recommendationsContainer}>
          <Text style={styles.recommendationsTitle}>Recommendations</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recommendations.filter(r => r.status === 'pending').map(rec => (
              <View key={rec.id} style={styles.recommendationCard}>
                <Text style={styles.recommendationTitle}>{rec.title}</Text>
                <Text style={styles.recommendationDescription}>{rec.description}</Text>
                {rec.action_items && rec.action_items.length > 0 && (
                  <View style={styles.actionItems}>
                    {rec.action_items.map((item, idx) => (
                      <Text key={idx} style={styles.actionItem}>• {item}</Text>
                    ))}
                  </View>
                )}
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleAcceptRecommendation(rec.id)}
                >
                  <CheckCircle size={16} color={colors.white} />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Chat Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Bot size={48} color={colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>Start a conversation</Text>
            <Text style={styles.emptyStateText}>
              Ask me anything about learning, scheduling, or how to support your child's education.
            </Text>
          </View>
        )}

        {messages.map((message, index) => (
          <View
            key={index}
            style={[
              styles.message,
              message.role === 'user' ? styles.userMessage : styles.assistantMessage
            ]}
          >
            {message.role === 'assistant' && (
              <View style={styles.assistantIcon}>
                <Bot size={16} color={colors.indigo} />
              </View>
            )}
            {message.role === 'user' && (
              <View style={styles.userIcon}>
                <User size={16} color={colors.white} />
              </View>
            )}
            <View style={[
              styles.messageBubble,
              message.role === 'user' ? styles.userBubble : styles.assistantBubble
            ]}>
              <Text style={[
                styles.messageText,
                message.role === 'user' ? styles.userMessageText : styles.assistantMessageText
              ]}>
                {message.content}
              </Text>
            </View>
          </View>
        ))}

        {loading && (
          <View style={[styles.message, styles.assistantMessage]}>
            <View style={styles.assistantIcon}>
              <Bot size={16} color={colors.indigo} />
            </View>
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <ActivityIndicator size="small" color={colors.indigo} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask your learning coach..."
          value={inputMessage}
          onChangeText={setInputMessage}
          multiline
          onSubmitEditing={handleSendMessage}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputMessage.trim() || loading) && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!inputMessage.trim() || loading}
        >
          <Send size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  newSessionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.indigo,
    borderRadius: 6,
  },
  newSessionText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  sessionTypeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sessionTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionTypeButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  sessionTypeText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sessionTypeTextActive: {
    color: colors.white,
    fontWeight: '500',
  },
  childSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  childSelectorLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  childButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  childButtonTextActive: {
    color: colors.white,
    fontWeight: '500',
  },
  recommendationsContainer: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recommendationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  recommendationCard: {
    width: 280,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  recommendationDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  actionItems: {
    marginBottom: 8,
  },
  actionItem: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    backgroundColor: colors.indigo,
    borderRadius: 6,
    marginTop: 8,
  },
  acceptButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  message: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  userIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  assistantIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 12,
  },
  userBubble: {
    backgroundColor: colors.indigo,
  },
  assistantBubble: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: colors.white,
  },
  assistantMessageText: {
    color: colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderRadius: 20,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});


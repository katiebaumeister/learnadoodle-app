import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, Animated } from 'react-native'
import { X, Send, Bot } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { processDoodleMessage, executeTool } from '../lib/doodleAssistant.js'
import { supabase } from '../lib/supabase'

export default function SearchModal({ visible, onClose }) {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [familyId, setFamilyId] = useState(null)
  const slideAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current

  // Initialize when modal opens
  useEffect(() => {
    if (visible) {
      initializeModal()
      // Animate in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start()
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        })
      ]).start()
    }
  }, [visible])

  const initializeModal = async () => {
    try {
      // Get user's family_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()
      
      if (profile?.family_id) {
        setFamilyId(profile.family_id)
      }
    } catch (error) {
      console.warn('Could not get user profile:', error)
    }
    
    // Add welcome message
    const welcomeMessage = `Hi! I'm Doodle, your fast chat assistant for Learnadoodle! 🤖

I can help you with:
• Quick questions → direct answers
• Log homework/activities → add_activity
• Check recent progress → progress_summary
• Request short-term schedule shifts → queue_reschedule
• Suggest subjects for a child/year
• Suggest courses (live-class, self-paced, custom)

How can I help you today?`
    
    setMessages([{ role: 'assistant', content: welcomeMessage, timestamp: Date.now() }])
  }

  const handleSearch = async () => {
    console.log('handleSearch called with query:', searchQuery);
    if (!searchQuery.trim()) {
      console.log('Search blocked - no query');
      return;
    }

    const userMessage = searchQuery.trim();
    console.log('Processing message:', userMessage);
    setSearchQuery('')
    setIsLoading(true)

    // Add user message immediately
    const newMessages = [...messages, { role: 'user', content: userMessage, timestamp: Date.now() }]
    setMessages(newMessages)

    try {
      if (familyId) {
        // Process with actual Doodle assistant
        const response = await processDoodleMessage(userMessage, familyId, null)
        
        let finalResponse = response.message || response
        
        // Handle tool execution if needed
        if (response.tool) {
          try {
            const toolResult = await executeTool(response.tool, response.params, familyId)
            if (toolResult.success) {
              finalResponse += `\n\n✅ ${response.tool} completed successfully!`
            }
          } catch (toolError) {
            console.error('Tool execution error:', toolError)
            finalResponse += `\n\n❌ Sorry, I couldn't complete that action. Please try again.`
          }
        }

        // Add assistant response
        setMessages([...newMessages, { role: 'assistant', content: finalResponse, timestamp: Date.now() }])
      } else {
        // Fallback response if no family_id
        const fallbackResponse = `I received your message: "${userMessage}". I'm here to help with your learning questions! 🤖

I can help you with:
• Quick questions and answers
• Logging homework and activities
• Checking progress
• Scheduling and planning
• Subject recommendations

What would you like to know more about?`
        
        setMessages([...newMessages, { role: 'assistant', content: fallbackResponse, timestamp: Date.now() }])
      }

    } catch (error) {
      console.error('Error processing search:', error)
      const errorMessage = 'Sorry, I encountered an error while processing your request. Please try again.'
      setMessages([...newMessages, { role: 'assistant', content: errorMessage, timestamp: Date.now() }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setSearchQuery('')
    setMessages([])
    setFamilyId(null)
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      animationDuration={150}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View 
          style={[
            styles.modalContent,
            {
              transform: [
                { translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [100, 0]
                })},
                { scale: scaleAnim }
              ]
            }
          ]}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <Bot size={24} color="#1a1a1a" />
              <Text style={styles.modalTitle}>Ask Doodle</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close search modal"
            >
              <X size={20} color="#666666" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView style={styles.messagesContainer} showsVerticalScrollIndicator={false}>
            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.messageItem,
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage
                ]}
              >
                <Text style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userMessageText : styles.assistantMessageText
                ]}>
                  {message.content}
                </Text>
              </View>
            ))}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1a1a1a" />
                <Text style={styles.loadingText}>Doodle is thinking...</Text>
              </View>
            )}
          </ScrollView>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Ask Doodle anything..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendButton, !searchQuery.trim() && styles.sendButtonDisabled]}
              onPress={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
            >
              <Send size={20} color={searchQuery.trim() ? "#ffffff" : "#cccccc"} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  modalContent: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: 400,
    height: 500,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    backgroundColor: '#fafbfc',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  closeButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
  },
  messagesContainer: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fafbfc',
  },
  messageItem: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    marginLeft: 'auto',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    marginRight: 'auto',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: '#1a1a1a',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#f8f9fa',
    maxHeight: 100,
  },
  searchInputFocus: {
    borderColor: '#1a1a1a',
    backgroundColor: '#ffffff',
    boxShadow: '0 0 0 3px rgba(26, 26, 26, 0.1)',
  },
  sendButton: {
    backgroundColor: '#80C1E1',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  sendButtonHover: {
    backgroundColor: '#000000',
    transform: 'scale(1.05)',
  },
  sendButtonDisabled: {
    backgroundColor: '#e9ecef',
    cursor: 'not-allowed',
  },
})

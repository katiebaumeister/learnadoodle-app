import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, Animated } from 'react-native'
import { X, Send } from 'lucide-react'
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
    if (!user?.id) return
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
      }
    
    setMessages([])
  }

  const INTRO_TEXT = `Hi! I'm Doodle , your fast chat assistant. Ask away... 🐩💌`
  const showCenteredIntro = messages.length === 0

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    const userMessage = searchQuery.trim();

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
          }
        }
        
        // Add assistant response
        setMessages([...newMessages, { role: 'assistant', content: finalResponse, timestamp: Date.now() }])
      }
    } catch (error) {
      console.error('Search error:', error)
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: Date.now() }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={styles.modalContentTouchable}
        >
          <Animated.View
            style={[
              styles.modalContent,
              {
                transform: [
                  { translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) },
                  { scale: scaleAnim }
                ]
              }
            ]}
          >
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X size={20} color="#666" />
          </TouchableOpacity>

          <ScrollView
            style={styles.messagesContainer}
            contentContainerStyle={[styles.messagesContent, showCenteredIntro && styles.messagesContentCentered]}
          >
            {showCenteredIntro ? (
              <Text style={styles.introText}>{INTRO_TEXT}</Text>
            ) : (
              <>
                {messages.map((msg, index) => (
                  <View
                    key={index}
                    style={[
                      styles.message,
                      msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                    ]}
                  >
                    <Text style={[
                      styles.messageText,
                      msg.role === 'user' ? styles.userMessageText : styles.assistantMessageText
                    ]}>
                      {msg.content}
                    </Text>
                  </View>
                ))}
                {isLoading && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#4285F4" />
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Ask Doodle anything..."
              placeholderTextColor="#999"
              onSubmitEditing={handleSearch}
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
        </TouchableOpacity>
      </TouchableOpacity>
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
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  modalContentTouchable: {
    marginBottom: 20,
    marginRight: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: 400,
    height: 500,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    ...(typeof document !== 'undefined' && { cursor: 'pointer' }),
  },
  closeButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
  },
  messagesContainer: {
    flex: 1,
    padding: 24,
    paddingTop: 52,
    backgroundColor: '#ffffff',
  },
  messagesContent: {
    paddingBottom: 16,
  },
  messagesContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  introText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'center',
  },
  message: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    maxWidth: '85%',
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

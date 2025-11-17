import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { X, Send, MessageCircle } from 'lucide-react';

// Simple web scroll container
const ScrollContainer = ({ children, ...props }) => (
  <div 
    style={{
      flex: 1,
      overflowY: 'auto',
      padding: 16,
      minHeight: 0,
      height: '300px',
      maxHeight: '300px',
      border: '2px solid red',
      borderRadius: 8,
      backgroundColor: '#f9f9f9',
    }}
    {...props}
  >
    {children}
  </div>
);

// Icon component for consistency
const Icon = ({ name, size = 16, color = '#37352f' }) => {
  const icons = {
    x: X,
    send: Send,
    messageCircle: MessageCircle,
  };
  
  const IconComponent = icons[name] || X;
  return <IconComponent size={size} color={color} />;
};

export default function AIChatModal({ 
  visible, 
  onClose, 
  title, 
  subtitle,
  onSendMessage,
  messages = [],
  isLoading = false,
  placeholder = "Type your message..."
}) {
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    
    const message = inputText.trim();
    setInputText('');
    
    if (onSendMessage) {
      await onSendMessage(message);
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    
    return (
      <View key={index} style={[
        styles.messageContainer,
        isUser ? styles.userMessage : styles.aiMessage
      ]}>
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.aiBubble
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userText : styles.aiText
          ]}>
            {message.content}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {new Date(message.timestamp || Date.now()).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Icon name="messageCircle" size={20} color="#38B6FF" />
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="x" size={20} />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            Messages: {messages.length} | Container height: 300px
          </div>
          <ScrollContainer 
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="messageCircle" size={48} color="#e1e1e1" />
                <Text style={styles.emptyStateText}>
                  Start a conversation to get personalized recommendations
                </Text>
              </View>
            ) : (
              <>
                {messages.map(renderMessage)}
                {/* Force scrolling with test content */}
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={`test-${i}`} style={{ 
                    padding: 8, 
                    margin: 4, 
                    backgroundColor: '#f0f0f0', 
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#666'
                  }}>
                    Test message {i + 1} to force scrolling
                  </div>
                ))}
              </>
            )}
            
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#38B6FF" />
                <Text style={styles.loadingText}>AI is thinking...</Text>
              </View>
            )}
          </ScrollContainer>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={placeholder}
              placeholderTextColor="#787774"
              multiline
              maxLength={1000}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              <Icon 
                name="send" 
                size={16} 
                color={(!inputText.trim() || isLoading) ? "#787774" : "#ffffff"} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '90%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subtitle: {
    fontSize: 14,
    color: '#787774',
    marginTop: 2,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  closeButton: {
    padding: 4,
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
    overflow: 'auto',
    minHeight: 0,
  },
  messagesContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#787774',
    textAlign: 'center',
    marginTop: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  messageContainer: {
    marginBottom: 16,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  aiMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#38B6FF',
  },
  aiBubble: {
    backgroundColor: '#f1f3f4',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userText: {
    color: '#ffffff',
  },
  aiText: {
    color: '#37352f',
  },
  messageTime: {
    fontSize: 12,
    color: '#787774',
    marginTop: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#787774',
    marginLeft: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    backgroundColor: '#ffffff',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  sendButton: {
    backgroundColor: '#38B6FF',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#e1e1e1',
  },
}); 
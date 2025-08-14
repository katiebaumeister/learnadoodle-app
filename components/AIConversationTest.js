import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { AIConversationService } from '../lib/aiConversationService.js';
import { supabase } from '../lib/supabase.js';

export default function AIConversationTest() {
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [familyId, setFamilyId] = useState('');

  const addResult = (message, success = true) => {
    setTestResults(prev => [...prev, {
      message,
      success,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const getFamilyId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addResult('❌ No authenticated user found', false);
        return null;
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();
      
      if (!profile?.family_id) {
        addResult('❌ No family_id found for user', false);
        return null;
      }
      
      setFamilyId(profile.family_id);
      addResult(`✅ Found family_id: ${profile.family_id}`);
      return profile.family_id;
    } catch (error) {
      addResult(`❌ Error getting family_id: ${error.message}`, false);
      return null;
    }
  };

  const testCreateConversation = async () => {
    setLoading(true);
    try {
      const fid = await getFamilyId();
      if (!fid) return;

      const conversationId = await AIConversationService.createConversation(
        fid,
        'test',
        'Test Conversation'
      );
      
      addResult(`✅ Created conversation: ${conversationId}`);
      return conversationId;
    } catch (error) {
      addResult(`❌ Error creating conversation: ${error.message}`, false);
    } finally {
      setLoading(false);
    }
  };

  const testAddMessage = async () => {
    setLoading(true);
    try {
      const fid = await getFamilyId();
      if (!fid) return;

      // Create conversation first
      const conversationId = await AIConversationService.createConversation(
        fid,
        'test',
        'Test Conversation'
      );
      
      // Add user message
      const userMessageId = await AIConversationService.addMessage(
        conversationId,
        'user',
        'Hello, this is a test message!'
      );
      
      addResult(`✅ Added user message: ${userMessageId}`);
      
      // Add assistant message
      const assistantMessageId = await AIConversationService.addMessage(
        conversationId,
        'assistant',
        'Hello! I received your test message.'
      );
      
      addResult(`✅ Added assistant message: ${assistantMessageId}`);
      
      return conversationId;
    } catch (error) {
      addResult(`❌ Error adding message: ${error.message}`, false);
    } finally {
      setLoading(false);
    }
  };

  const testGetConversation = async () => {
    setLoading(true);
    try {
      const fid = await getFamilyId();
      if (!fid) return;

      // Create conversation and add messages first
      const conversationId = await testAddMessage();
      if (!conversationId) return;

      // Get the conversation
      const conversation = await AIConversationService.getConversation(conversationId);
      
      addResult(`✅ Retrieved conversation with ${conversation.ai_messages?.length || 0} messages`);
      addResult(`📝 Conversation type: ${conversation.conversation_type}`);
      addResult(`📝 Title: ${conversation.title}`);
      
    } catch (error) {
      addResult(`❌ Error getting conversation: ${error.message}`, false);
    } finally {
      setLoading(false);
    }
  };

  const testRecordAction = async () => {
    setLoading(true);
    try {
      const fid = await getFamilyId();
      if (!fid) return;

      // Create conversation first
      const conversationId = await AIConversationService.createConversation(
        fid,
        'test',
        'Test Conversation'
      );
      
      // Record an action
      const actionId = await AIConversationService.recordAction(
        conversationId,
        'test_action',
        { testData: 'This is test action data' },
        'completed'
      );
      
      addResult(`✅ Recorded action: ${actionId}`);
      
    } catch (error) {
      addResult(`❌ Error recording action: ${error.message}`, false);
    } finally {
      setLoading(false);
    }
  };

  const testGetHistory = async () => {
    setLoading(true);
    try {
      const fid = await getFamilyId();
      if (!fid) return;

      // Create some test conversations first
      await testAddMessage();
      await testAddMessage();

      // Get conversation history
      const history = await AIConversationService.getConversationHistory(fid, 'test', 10);
      
      addResult(`✅ Retrieved ${history.length} conversations from history`);
      
      history.forEach((conv, index) => {
        addResult(`📝 Conversation ${index + 1}: ${conv.title} (${conv.ai_messages?.length || 0} messages)`);
      });
      
    } catch (error) {
      addResult(`❌ Error getting history: ${error.message}`, false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Conversation Service Test</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.button} 
          onPress={testCreateConversation}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Create Conversation</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={testAddMessage}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Add Message</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={testGetConversation}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Get Conversation</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={testRecordAction}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Record Action</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={testGetHistory}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Get History</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={clearResults}
        >
          <Text style={styles.buttonText}>Clear Results</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.resultsContainer}>
        <Text style={styles.resultsTitle}>Test Results:</Text>
        <ScrollView style={styles.resultsList}>
          {testResults.map((result, index) => (
            <Text key={index} style={[styles.resultText, result.success ? styles.successText : styles.errorText]}>
              [{result.timestamp}] {result.message}
            </Text>
          ))}
        </ScrollView>
      </View>

      {familyId && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>Family ID: {familyId}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  buttonContainer: {
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#38B6FF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#B799D6',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  resultsList: {
    flex: 1,
  },
  resultText: {
    fontSize: 14,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
  successText: {
    color: '#28a745',
  },
  errorText: {
    color: '#dc3545',
  },
  infoContainer: {
    backgroundColor: '#e9ecef',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
  },
}); 
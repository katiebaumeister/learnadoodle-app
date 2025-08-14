import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { processSyllabusWithAI } from '../lib/aiProcessor.js';

export default function OpenAITest({ onClose }) {
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  const testSyllabus = `
Unit 1: Introduction to Algebra
- Variables and expressions
- Order of operations
- Combining like terms

Unit 2: Solving Equations
- One-step equations
- Two-step equations
- Multi-step equations
`;

  const runTest = async () => {
    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      console.log('Testing OpenAI API key...');
      
      const result = await processSyllabusWithAI(testSyllabus, 1);
      
      console.log('✅ OpenAI API key is working!');
      console.log('Result:', result);
      
      setTestResult(result);
      
    } catch (error) {
      console.error('❌ OpenAI API key test failed:');
      console.error(error.message);
      
      let errorMessage = error.message;
      
      if (error.message.includes('401')) {
        errorMessage = 'API key is invalid or expired. Please check your OpenAI API key.';
      } else if (error.message.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.';
      } else if (error.message.includes('@env')) {
        errorMessage = 'Environment variable not found. Please check your .env file.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>OpenAI API Test</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          This test will verify that your OpenAI API key is working correctly.
        </Text>

        <TouchableOpacity
          style={[styles.testButton, isLoading && styles.testButtonDisabled]}
          onPress={runTest}
          disabled={isLoading}
        >
          <Text style={styles.testButtonText}>
            {isLoading ? 'Testing...' : 'Test OpenAI API Key'}
          </Text>
        </TouchableOpacity>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>❌ Test Failed</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {testResult && (
          <View style={styles.successContainer}>
            <Text style={styles.successTitle}>✅ Test Successful!</Text>
            <Text style={styles.successText}>
              Your OpenAI API key is working correctly.
            </Text>
            <Text style={styles.resultLabel}>Processed Syllabus:</Text>
            <Text style={styles.resultText}>{testResult.course_outline}</Text>
            <Text style={styles.resultLabel}>Unit Start:</Text>
            <Text style={styles.resultText}>{testResult.unit_start}</Text>
          </View>
        )}

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>Setup Instructions:</Text>
          <Text style={styles.instructionsText}>
            1. Get your API key from{' '}
            <Text style={styles.link}>https://platform.openai.com/api-keys</Text>
          </Text>
          <Text style={styles.instructionsText}>
            2. Add it to your .env file as: OPENAI_API_KEY=sk-your-key-here
          </Text>
          <Text style={styles.instructionsText}>
            3. Restart your development server
          </Text>
          <Text style={styles.instructionsText}>
            4. Run this test again
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 18,
    color: '#787774',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    fontSize: 14,
    color: '#787774',
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  testButton: {
    backgroundColor: '#38B6FF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  testButtonDisabled: {
    backgroundColor: '#e1e1e1',
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  successContainer: {
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  successText: {
    fontSize: 14,
    color: '#16a34a',
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
    marginTop: 12,
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resultText: {
    fontSize: 12,
    color: '#787774',
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 4,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  instructions: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  instructionsText: {
    fontSize: 14,
    color: '#787774',
    lineHeight: 20,
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  link: {
    color: '#38B6FF',
    textDecorationLine: 'underline',
  },
}); 
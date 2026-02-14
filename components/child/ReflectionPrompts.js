/**
 * Reflection Prompts Component
 * 
 * Shows after assignment submission:
 * - "How did it feel?" (emoji scale)
 * - "What did you learn?" (1 line)
 * - "What would you do differently?" (optional)
 * 
 * Stores in assignment_comments with comment_type='reflection'
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, ActivityIndicator } from 'react-native';
import { Smile, Frown, Meh, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

const EMOJI_OPTIONS = [
  { id: 'great', emoji: '😊', label: 'Great!', value: 5 },
  { id: 'good', emoji: '🙂', label: 'Good', value: 4 },
  { id: 'okay', emoji: '😐', label: 'Okay', value: 3 },
  { id: 'hard', emoji: '😕', label: 'Hard', value: 2 },
  { id: 'very_hard', emoji: '😟', label: 'Very hard', value: 1 },
];

export default function ReflectionPrompts({ assignment, childId, familyId, onComplete }) {
  const [feeling, setFeeling] = useState(null);
  const [learned, setLearned] = useState('');
  const [different, setDifferent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!feeling) {
      toast.push('Please select how it felt', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Combine reflection into one comment
      const reflectionText = [
        `How it felt: ${EMOJI_OPTIONS.find(e => e.id === feeling)?.label || feeling}`,
        learned.trim() && `What I learned: ${learned.trim()}`,
        different.trim() && `What I'd do differently: ${different.trim()}`,
      ].filter(Boolean).join('\n\n');

      // Store in assignment_comments
      await supabase.from('assignment_comments').insert({
        assignment_id: assignment.id,
        family_id: familyId,
        author_id: user.id,
        comment_text: reflectionText,
        comment_type: 'reflection',
        is_internal: false,
      });

      // Also store feeling rating in assignment metadata if needed
      // Could add reflection_rating column or store in JSONB metadata

      toast.push('Reflection saved!', 'success');
      
      if (onComplete) {
        onComplete({ feeling, learned, different });
      }
    } catch (error) {
      console.error('[ReflectionPrompts] Error:', error);
      toast.push('Failed to save reflection', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (onComplete) {
      onComplete(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How did it go?</Text>
      
      {/* Feeling Scale */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>How did it feel?</Text>
        <View style={styles.emojiRow}>
          {EMOJI_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.emojiButton,
                feeling === option.id && styles.emojiButtonSelected,
              ]}
              onPress={() => setFeeling(option.id)}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.emoji}>{option.emoji}</Text>
              <Text
                style={[
                  styles.emojiLabel,
                  feeling === option.id && styles.emojiLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* What did you learn? */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>What did you learn?</Text>
        <TextInput
          style={styles.input}
          placeholder="One thing you learned..."
          placeholderTextColor="#9ca3af"
          value={learned}
          onChangeText={setLearned}
          maxLength={200}
          editable={!submitting}
        />
      </View>

      {/* What would you do differently? */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>What would you do differently? (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="If you did this again..."
          placeholderTextColor="#9ca3af"
          value={different}
          onChangeText={setDifferent}
          maxLength={200}
          editable={!submitting}
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={submitting}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, (!feeling || submitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!feeling || submitting}
          {...(Platform.OS === 'web' && { cursor: (!feeling || submitting) ? 'not-allowed' : 'pointer' })}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Send size={16} color="#ffffff" />
              <Text style={styles.submitButtonText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  emojiButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emojiButtonSelected: {
    backgroundColor: '#ede9fe',
    borderColor: '#887DEE',
  },
  emoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  emojiLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emojiLabelSelected: {
    color: '#887DEE',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  skipButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#887DEE',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

/**
 * Quick Review Modal
 * Allows parents to log how a child felt about a material
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { linkMaterialToChild, updateMaterialChildStatus } from '../../lib/services/materialsClient';

const EMOTIONS = [
  { value: 'loved', label: 'Loved', emoji: '❤️' },
  { value: 'liked', label: 'Liked', emoji: '👍' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'bored', label: 'Bored', emoji: '😴' },
  { value: 'overwhelmed', label: 'Overwhelmed', emoji: '😰' },
  { value: 'frustrated', label: 'Frustrated', emoji: '😤' },
];

const PACING_OPTIONS = [
  { value: 'too_fast', label: 'Too Fast' },
  { value: 'just_right', label: 'Just Right' },
  { value: 'too_slow', label: 'Too Slow' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'too_easy', label: 'Too Easy' },
  { value: 'appropriate', label: 'Appropriate' },
  { value: 'too_hard', label: 'Too Hard' },
];

export default function QuickReviewModal({
  visible,
  onClose,
  onSaved,
  materialId,
  childId,
  familyId,
  eventId = null,
  materialTitle = '',
  childName = '',
}) {
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [pacingFit, setPacingFit] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      // Reset form when modal opens
      setRating(null);
      setEmotion(null);
      setPacingFit(null);
      setDifficulty(null);
      setNotes('');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!materialId || !childId || !familyId) {
      return;
    }

    setLoading(true);
    try {
      // Update material with review fields (single review per material)
      const { updateMaterial } = await import('../../lib/services/materialsClient');
      
      const reviewUpdates = {
        review_child_id: childId,
        review_rating: rating || null,
        review_emotion: emotion || null,
        review_pacing_fit: pacingFit || null,
        review_difficulty: difficulty || null,
        review_notes: notes.trim() || null,
        review_updated_at: new Date().toISOString(),
      };

      await updateMaterial(materialId, reviewUpdates);

      // Update material-child link status to 'completed' if rating is positive
      if (rating && rating >= 4) {
        await updateMaterialChildStatus(materialId, childId, 'completed', {
          finished_at: new Date().toISOString().split('T')[0],
        });
      } else {
        // Ensure link exists
        await linkMaterialToChild(materialId, childId, familyId, 'in_use');
      }

      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (error) {
      alert('Failed to save review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>How did {childName || 'they'} feel about this?</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Material Info */}
            {materialTitle && (
              <View style={styles.materialInfo}>
                <Text style={styles.materialTitle}>{materialTitle}</Text>
              </View>
            )}

            {/* Rating */}
            <View style={styles.section}>
              <Text style={styles.label}>Rating (1-5)</Text>
              <View style={styles.ratingContainer}>
                {[1, 2, 3, 4, 5].map(num => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.ratingButton,
                      rating === num && styles.ratingButtonActive
                    ]}
                    onPress={() => setRating(rating === num ? null : num)}
                  >
                    <Text style={[
                      styles.ratingText,
                      rating === num && styles.ratingTextActive
                    ]}>
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Emotion */}
            <View style={styles.section}>
              <Text style={styles.label}>Emotional Response</Text>
              <View style={styles.emotionContainer}>
                {EMOTIONS.map(em => (
                  <TouchableOpacity
                    key={em.value}
                    style={[
                      styles.emotionButton,
                      emotion === em.value && styles.emotionButtonActive
                    ]}
                    onPress={() => setEmotion(emotion === em.value ? null : em.value)}
                  >
                    <Text style={styles.emotionEmoji}>{em.emoji}</Text>
                    <Text style={[
                      styles.emotionLabel,
                      emotion === em.value && styles.emotionLabelActive
                    ]}>
                      {em.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pacing */}
            <View style={styles.section}>
              <Text style={styles.label}>Pacing Fit</Text>
              <View style={styles.pillsContainer}>
                {PACING_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.pill,
                      pacingFit === opt.value && styles.pillActive
                    ]}
                    onPress={() => setPacingFit(pacingFit === opt.value ? null : opt.value)}
                  >
                    <Text style={[
                      styles.pillText,
                      pacingFit === opt.value && styles.pillTextActive
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Difficulty */}
            <View style={styles.section}>
              <Text style={styles.label}>Difficulty Level</Text>
              <View style={styles.pillsContainer}>
                {DIFFICULTY_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.pill,
                      difficulty === opt.value && styles.pillActive
                    ]}
                    onPress={() => setDifficulty(difficulty === opt.value ? null : opt.value)}
                  >
                    <Text style={[
                      styles.pillText,
                      difficulty === opt.value && styles.pillTextActive
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                multiline
                numberOfLines={3}
                placeholder="Any additional thoughts..."
                value={notes}
                onChangeText={setNotes}
                placeholderTextColor={colors.muted}
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Review</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  materialInfo: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  materialTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  ratingTextActive: {
    color: colors.accent,
  },
  emotionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emotionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  emotionButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  emotionEmoji: {
    fontSize: 20,
  },
  emotionLabel: {
    fontSize: 14,
    color: colors.text,
  },
  emotionLabelActive: {
    color: colors.accent,
    fontWeight: '500',
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  pillText: {
    fontSize: 14,
    color: colors.text,
  },
  pillTextActive: {
    color: colors.accent,
    fontWeight: '500',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
});


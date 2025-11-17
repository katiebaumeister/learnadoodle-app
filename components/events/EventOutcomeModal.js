/**
 * Event Outcome Modal
 * Allows parents to add reflection/outcome reporting for completed events
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
import { X, Sparkles, Plus } from 'lucide-react';
import { colors } from '../../theme/colors';
import { completeEvent, saveOutcome, getEventTags } from '../../lib/services/attendanceClient';

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'Pass', 'Fail'];

export default function EventOutcomeModal({
  visible,
  event,
  onClose,
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [rating, setRating] = useState(null);
  const [grade, setGrade] = useState(null);
  const [note, setNote] = useState('');
  const [strengths, setStrengths] = useState([]);
  const [struggles, setStruggles] = useState([]);
  const [newStrength, setNewStrength] = useState('');
  const [newStruggle, setNewStruggle] = useState('');

  useEffect(() => {
    if (visible && event) {
      // Reset form when modal opens
      setRating(null);
      setGrade(null);
      setNote('');
      setStrengths([]);
      setStruggles([]);
      setNewStrength('');
      setNewStruggle('');
    }
  }, [visible, event]);

  const handleSuggestTags = async () => {
    if (!event?.id) return;
    
    setSuggestingTags(true);
    try {
      const result = await getEventTags(event.id);
      if (result.data) {
        const suggested = result.data.suggested_strengths || [];
        const suggestedStruggles = result.data.suggested_struggles || [];
        
        // Merge with existing (avoid duplicates)
        setStrengths(prev => {
          const combined = [...prev, ...suggested];
          return [...new Set(combined)];
        });
        setStruggles(prev => {
          const combined = [...prev, ...suggestedStruggles];
          return [...new Set(combined)];
        });
        
        if (Platform.OS === 'web') {
          console.log('AI suggestions added');
        }
      }
    } catch (error) {
      console.error('[EventOutcomeModal] Error getting tags:', error);
      if (Platform.OS === 'web') {
        alert('Failed to get AI suggestions');
      }
    } finally {
      setSuggestingTags(false);
    }
  };

  const addStrength = () => {
    if (newStrength.trim() && !strengths.includes(newStrength.trim())) {
      setStrengths([...strengths, newStrength.trim()]);
      setNewStrength('');
    }
  };

  const removeStrength = (tag) => {
    setStrengths(strengths.filter(s => s !== tag));
  };

  const addStruggle = () => {
    if (newStruggle.trim() && !struggles.includes(newStruggle.trim())) {
      setStruggles([...struggles, newStruggle.trim()]);
      setNewStruggle('');
    }
  };

  const removeStruggle = (tag) => {
    setStruggles(struggles.filter(s => s !== tag));
  };

  const handleSave = async () => {
    if (!event?.id) return;
    
    setLoading(true);
    try {
      // Ensure event is marked as done first
      if (event.status !== 'done') {
        const completeResult = await completeEvent(event.id);
        if (completeResult.error) {
          throw new Error(completeResult.error.message || 'Failed to complete event');
        }
      }
      
      // Save outcome
      const outcomeResult = await saveOutcome(event.id, {
        rating,
        grade,
        note,
        strengths,
        struggles,
      });
      
      if (outcomeResult.error) {
        throw new Error(outcomeResult.error.message || 'Failed to save outcome');
      }
      
      if (Platform.OS === 'web') {
        console.log('Outcome saved');
      }
      if (onSaved) {
        onSaved(outcomeResult.data);
      }
      onClose();
    } catch (error) {
      console.error('[EventOutcomeModal] Error saving:', error);
      if (Platform.OS === 'web') {
        alert(error.message || 'Failed to save outcome');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !event) return null;

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
            <Text style={styles.title}>How did this go?</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Event Info */}
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>{event.title || 'Untitled Event'}</Text>
              {event.subject && (
                <Text style={styles.eventSubject}>
                  {typeof event.subject === 'string' ? event.subject : event.subject?.name}
                </Text>
              )}
            </View>

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

            {/* Grade */}
            <View style={styles.section}>
              <Text style={styles.label}>Grade (optional)</Text>
              <View style={styles.gradeContainer}>
                {GRADES.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.gradeButton,
                      grade === g && styles.gradeButtonActive
                    ]}
                    onPress={() => setGrade(grade === g ? null : g)}
                  >
                    <Text style={[
                      styles.gradeText,
                      grade === g && styles.gradeTextActive
                    ]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Note */}
            <View style={styles.section}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.textInput}
                multiline
                numberOfLines={4}
                placeholder="How did this session go? Any observations?"
                placeholderTextColor={colors.muted}
                value={note}
                onChangeText={setNote}
              />
            </View>

            {/* Strengths */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.label}>Strengths</Text>
                <TouchableOpacity
                  onPress={handleSuggestTags}
                  disabled={suggestingTags}
                  style={styles.aiButton}
                >
                  {suggestingTags ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <>
                      <Sparkles size={14} color={colors.accent} />
                      <Text style={styles.aiButtonText}>Suggest</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              
              {/* Chips */}
              <View style={styles.chipsContainer}>
                {strengths.map((tag, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.chip}
                    onPress={() => removeStrength(tag)}
                  >
                    <Text style={styles.chipText}>{tag}</Text>
                    <X size={12} color={colors.text} />
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Add new */}
              <View style={styles.addChipContainer}>
                <TextInput
                  style={styles.chipInput}
                  placeholder="Add strength..."
                  placeholderTextColor={colors.muted}
                  value={newStrength}
                  onChangeText={setNewStrength}
                  onSubmitEditing={addStrength}
                />
                <TouchableOpacity onPress={addStrength} style={styles.addButton}>
                  <Plus size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Struggles */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.label}>Struggles</Text>
              </View>
              
              {/* Chips */}
              <View style={styles.chipsContainer}>
                {struggles.map((tag, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.chip, styles.chipStruggle]}
                    onPress={() => removeStruggle(tag)}
                  >
                    <Text style={styles.chipText}>{tag}</Text>
                    <X size={12} color={colors.text} />
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Add new */}
              <View style={styles.addChipContainer}>
                <TextInput
                  style={styles.chipInput}
                  placeholder="Add struggle..."
                  placeholderTextColor={colors.muted}
                  value={newStruggle}
                  onChangeText={setNewStruggle}
                  onSubmitEditing={addStruggle}
                />
                <TouchableOpacity onPress={addStruggle} style={styles.addButton}>
                  <Plus size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
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
    backgroundColor: colors.bg,
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
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
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
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
  eventInfo: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  eventSubject: {
    fontSize: 14,
    color: colors.muted,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '20',
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.muted,
  },
  ratingTextActive: {
    color: colors.accent,
  },
  gradeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gradeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  gradeButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '20',
  },
  gradeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
  },
  gradeTextActive: {
    color: colors.accent,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.greenSoft || '#d1fae5',
    borderWidth: 1,
    borderColor: colors.greenBold || '#10b981',
  },
  chipStruggle: {
    backgroundColor: colors.amberSoft || '#fef3c7',
    borderColor: colors.amberBold || '#f59e0b',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  addChipContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  chipInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: colors.text,
  },
  addButton: {
    padding: 8,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.accent + '20',
  },
  aiButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accent,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});


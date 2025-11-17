/**
 * Pack Week Modal
 * Part of Phase 2 - AI Parent Assistant
 * Shows suggested event placement for a week
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
} from 'react-native';
import { X, Package, Calendar, Info } from 'lucide-react';
import { colors } from '../../theme/colors';
import { packWeek } from '../../lib/services/aiClient';

export default function PackWeekModal({
  visible,
  familyId,
  children = [],
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [weekStart, setWeekStart] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);

  useEffect(() => {
    if (visible) {
      // Default to next Monday
      const nextMonday = new Date();
      const dayOfWeek = nextMonday.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      
      setWeekStart(nextMonday.toISOString().split('T')[0]);
      setResult(null);
      setSelectedChildIds([]);
    }
  }, [visible]);

  const toggleChild = (childId) => {
    setSelectedChildIds(prev => {
      if (prev.includes(childId)) {
        return prev.filter(id => id !== childId);
      } else {
        return [...prev, childId];
      }
    });
  };

  const handlePack = async () => {
    if (!weekStart) {
      if (Platform.OS === 'web') {
        alert('Please select a week start date');
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await packWeek(
        weekStart,
        selectedChildIds.length > 0 ? selectedChildIds : null
      );
      
      if (error) {
        console.error('[PackWeekModal] Error:', error);
        if (Platform.OS === 'web') {
          alert(`Failed to pack week: ${error.message || error}`);
        }
        return;
      }

      if (data) {
        setResult(data);
        // Refresh calendar after successful pack
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      }
    } catch (err) {
      console.error('[PackWeekModal] Exception:', err);
      if (Platform.OS === 'web') {
        alert(`Error: ${err.message || 'Unknown error'}`);
      }
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
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Package size={20} color={colors.accent} />
              <Text style={styles.title}>Pack Week</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.infoBox}>
              <Info size={16} color={colors.accent} />
              <Text style={styles.infoText}>
                AI will suggest optimal event placement for the selected week based on your year plans and availability.
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Week Start (Monday)</Text>
              <TextInput
                style={styles.dateInput}
                value={weekStart}
                onChangeText={setWeekStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
              />
            </View>

            {children.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Children (optional - leave empty for all)</Text>
                <View style={styles.childrenList}>
                  {children.map(child => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childChip,
                        selectedChildIds.includes(child.id) && styles.childChipSelected
                      ]}
                      onPress={() => toggleChild(child.id)}
                    >
                      <Text style={[
                        styles.childChipText,
                        selectedChildIds.includes(child.id) && styles.childChipTextSelected
                      ]}>
                        {child.first_name || child.name || 'Unknown'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.packButton, loading && styles.packButtonDisabled]}
              onPress={handlePack}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.accentContrast} />
              ) : (
                <>
                  <Package size={16} color={colors.accentContrast} />
                  <Text style={styles.packButtonText}>Pack Week</Text>
                </>
              )}
            </TouchableOpacity>

            {result && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultTitle}>Result</Text>
                {result.notes && (
                  <Text style={styles.resultNotes}>{result.notes}</Text>
                )}
                {result.events && result.events.length > 0 ? (
                  <View style={styles.eventsList}>
                    {result.events.map((event, idx) => (
                      <View key={idx} style={styles.eventItem}>
                        <Text style={styles.eventTitle}>{event.title || 'Event'}</Text>
                        <Text style={styles.eventDetails}>
                          {event.start ? new Date(event.start).toLocaleString() : 'TBD'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noEventsText}>No events suggested yet. This feature is coming soon!</Text>
                )}
              </View>
            )}
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
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: 12,
    width: Platform.OS === 'web' ? 600 : '90%',
    maxHeight: '80%',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.bgSubtle,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  childrenList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  childChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childChipText: {
    fontSize: 13,
    color: colors.text,
  },
  childChipTextSelected: {
    color: colors.accentContrast,
    fontWeight: '600',
  },
  packButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  packButtonDisabled: {
    opacity: 0.6,
  },
  packButtonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  resultNotes: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  eventsList: {
    gap: 8,
  },
  eventItem: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 12,
    color: colors.muted,
  },
  noEventsText: {
    fontSize: 14,
    color: colors.muted,
    fontStyle: 'italic',
  },
});


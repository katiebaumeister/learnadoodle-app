/**
 * Summarize Progress Modal
 * Part of Phase 2 - AI Parent Assistant
 * Shows progress summary for a date range
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
import { X, FileText, Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';
import { summarizeProgress } from '../../lib/services/aiClient';

export default function SummarizeProgressModal({
  visible,
  familyId,
  onClose,
  onComplete, // Optional callback with proposedChanges (usually empty for summaries)
  description = "Generate a comprehensive summary of learning activities completed during a specific time period.",
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (visible) {
      // Default to last 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      setRangeStart(startDate.toISOString().split('T')[0]);
      setRangeEnd(endDate.toISOString().split('T')[0]);
      setSummary(null);
      setHasStarted(false);
      setLoading(false);
    }
  }, [visible]);

  const handleGenerate = async () => {
    if (!rangeStart || !rangeEnd) {
      if (Platform.OS === 'web') {
        alert('Please select both start and end dates');
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await summarizeProgress(rangeStart, rangeEnd);
      
      if (error) {
        if (Platform.OS === 'web') {
          alert(`Failed to generate summary: ${error.message || error}`);
        }
        return;
      }

      if (data && data.summary) {
        setSummary(data.summary);
        
        // SummarizeProgress typically doesn't return proposedChanges, but check anyway
        const proposedChanges = data.proposed_changes || data.changes || [];
        
        // Call onComplete if provided (even if no changes, to signal completion)
        if (onComplete) {
          onComplete({ proposedChanges, summary: data.summary, result: data });
        }
      }
    } catch (err) {
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
            <View style={styles.headerContent}>
              <View style={styles.iconCircleGray}>
                <FileText size={20} color="#6B7280" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Summarize progress</Text>
                <Text style={styles.subtitle}>
                  Generate a summary of learning activities completed during a specific time period.
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {!hasStarted && !loading && (
              <>
                <View style={styles.startSection}>
                  <View style={styles.explanationCardGray}>
                    <Text style={styles.explanationCardTitle}>What you'll get</Text>
                    <Text style={styles.explanationCardItem}>Detailed progress report</Text>
                    <Text style={styles.explanationCardItem}>Completion rates by subject</Text>
                    <Text style={styles.explanationCardItem}>Time spent learning</Text>
                    <Text style={styles.explanationCardItem}>Highlights and achievements</Text>
                  </View>
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.inputCardLabel}>Date range</Text>
                  <View style={styles.dateRow}>
                    <View style={styles.dateInputGroup}>
                      <Text style={styles.dateInputLabel}>Start date</Text>
                      <TextInput
                        style={styles.dateInput}
                        value={rangeStart}
                        onChangeText={setRangeStart}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                    <View style={styles.dateInputGroup}>
                      <Text style={styles.dateInputLabel}>End date</Text>
                      <TextInput
                        style={styles.dateInput}
                        value={rangeEnd}
                        onChangeText={setRangeEnd}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  </View>
                  <View style={styles.quickPicksRow}>
                    <TouchableOpacity
                      style={styles.quickPickButton}
                      onPress={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(start.getDate() - 7);
                        setRangeStart(start.toISOString().split('T')[0]);
                        setRangeEnd(end.toISOString().split('T')[0]);
                      }}
                    >
                      <Text style={styles.quickPickText}>Last week</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickPickButton}
                      onPress={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(start.getDate() - 30);
                        setRangeStart(start.toISOString().split('T')[0]);
                        setRangeEnd(end.toISOString().split('T')[0]);
                      }}
                    >
                      <Text style={styles.quickPickText}>Last month</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickPickButton}
                      onPress={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setMonth(start.getMonth() - 3);
                        setRangeStart(start.toISOString().split('T')[0]);
                        setRangeEnd(end.toISOString().split('T')[0]);
                      }}
                    >
                      <Text style={styles.quickPickText}>This term</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[
                      styles.startButton,
                      styles.startButtonGray,
                      (!rangeStart || !rangeEnd) && styles.startButtonDisabled
                    ]}
                    onPress={() => {
                      if (rangeStart && rangeEnd) {
                        setHasStarted(true);
                        handleGenerate();
                      }
                    }}
                    disabled={!rangeStart || !rangeEnd || loading}
                  >
                    <Text style={styles.startButtonText}>Generate summary</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onClose}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>📊 Analyzing Your Progress...</Text>
                <Text style={styles.loadingSubtext}>This may take 20-30 seconds</Text>
              </View>
            )}

            {summary && (
              <View style={styles.summaryContainer}>
                <Text style={styles.summaryTitle}>Summary</Text>
                <Text style={styles.summaryText}>{summary}</Text>
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
    borderRadius: 16,
    width: Platform.OS === 'web' ? 600 : '90%',
    maxHeight: '85%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 24,
    paddingBottom: 20,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  iconCircleGray: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 0,
  },
  summaryContainer: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    whiteSpace: 'pre-wrap',
  },
  startSection: {
    padding: 24,
    paddingTop: 0,
    gap: 16,
  },
  explanationCardGray: {
    backgroundColor: '#F7F8FC',
    borderRadius: 16,
    padding: 20,
  },
  explanationCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  explanationCardItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 8,
  },
  inputCard: {
    backgroundColor: '#F7F8FC',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  inputCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#ffffff',
  },
  quickPicksRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickPickButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  quickPickText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  startButton: {
    flex: 1,
    backgroundColor: '#6B7280',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonGray: {
    backgroundColor: '#6B7280',
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: colors.muted,
  },
});


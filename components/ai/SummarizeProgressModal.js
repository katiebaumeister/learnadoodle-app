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
}) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  useEffect(() => {
    if (visible) {
      // Default to last 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      setRangeStart(startDate.toISOString().split('T')[0]);
      setRangeEnd(endDate.toISOString().split('T')[0]);
      setSummary(null);
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
        console.error('[SummarizeProgressModal] Error:', error);
        if (Platform.OS === 'web') {
          alert(`Failed to generate summary: ${error.message || error}`);
        }
        return;
      }

      if (data && data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('[SummarizeProgressModal] Exception:', err);
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
              <FileText size={20} color={colors.accent} />
              <Text style={styles.title}>Progress Summary</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.dateRange}>
              <View style={styles.dateInputGroup}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput
                  style={styles.dateInput}
                  value={rangeStart}
                  onChangeText={setRangeStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.label}>End Date</Text>
                <TextInput
                  style={styles.dateInput}
                  value={rangeEnd}
                  onChangeText={setRangeEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.generateButton, loading && styles.generateButtonDisabled]}
              onPress={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.accentContrast} />
              ) : (
                <>
                  <Calendar size={16} color={colors.accentContrast} />
                  <Text style={styles.generateButtonText}>Generate Summary</Text>
                </>
              )}
            </TouchableOpacity>

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
  dateRange: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateInputGroup: {
    flex: 1,
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
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '600',
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
});


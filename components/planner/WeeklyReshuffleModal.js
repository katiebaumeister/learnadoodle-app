/**
 * Weekly Reshuffle Modal
 * AI-suggested weekly schedule reshuffling
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { X, RefreshCw, CheckCircle, AlertCircle, Clock, Sparkles } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

const API_BASE = typeof window !== 'undefined' 
  ? (process.env.REACT_APP_API_URL || window.location.origin)
  : '';

export default function WeeklyReshuffleModal({
  visible,
  onClose,
  familyId,
  childIds = [],
  weekStart,
  onApply,
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (visible && familyId && childIds.length > 0 && weekStart) {
      loadSuggestions();
    }
  }, [visible, familyId, childIds, weekStart]);

  const loadSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const response = await fetch(`${API_BASE}/api/ai/weekly-reshuffle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          family_id: familyId,
          child_ids: childIds,
          week_start: weekStart instanceof Date 
            ? weekStart.toISOString().split('T')[0] 
            : weekStart,
          week_end: weekEnd.toISOString().split('T')[0],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setSuggestions(data);
    } catch (err) {
      console.error('[WeeklyReshuffleModal] Error:', err);
      setError(err.message || 'Failed to generate reshuffle suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!suggestions || !suggestions.moves || suggestions.moves.length === 0) return;

    setApplying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${API_BASE}/api/ai/apply-reshuffle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          family_id: familyId,
          moves: suggestions.moves,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      if (onApply) {
        onApply();
      }
      onClose();
    } catch (err) {
      console.error('[WeeklyReshuffleModal] Error applying:', err);
      setError(err.message || 'Failed to apply reshuffle');
    } finally {
      setApplying(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Sparkles size={20} color={colors.accent || '#3b82f6'} />
              <Text style={styles.title}>Weekly Reshuffle Suggestions</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent || '#3b82f6'} />
              <Text style={styles.loadingText}>Analyzing schedule and generating suggestions...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={24} color={colors.redBold || '#dc2626'} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={loadSuggestions} style={styles.retryButton}>
                <RefreshCw size={16} color={colors.accent || '#3b82f6'} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : suggestions ? (
            <ScrollView style={styles.content}>
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>AI Analysis</Text>
                <Text style={styles.summaryText}>{suggestions.rationale || 'Schedule optimization suggestions'}</Text>
                {suggestions.benefits && suggestions.benefits.length > 0 && (
                  <View style={styles.benefitsList}>
                    {suggestions.benefits.map((benefit, idx) => (
                      <View key={idx} style={styles.benefitItem}>
                        <CheckCircle size={16} color={colors.greenBold || '#10b981'} />
                        <Text style={styles.benefitText}>{benefit}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {suggestions.moves && suggestions.moves.length > 0 ? (
                <View style={styles.movesSection}>
                  <Text style={styles.sectionTitle}>
                    Proposed Changes ({suggestions.moves.length})
                  </Text>
                  {suggestions.moves.map((move, idx) => (
                    <View key={idx} style={styles.moveCard}>
                      <View style={styles.moveHeader}>
                        <Text style={styles.moveTitle}>{move.title || 'Event'}</Text>
                        <View style={styles.moveReason}>
                          <AlertCircle size={14} color={colors.muted || '#6b7280'} />
                          <Text style={styles.moveReasonText}>{move.reason}</Text>
                        </View>
                      </View>
                      <View style={styles.moveDetails}>
                        <View style={styles.moveDetail}>
                          <Text style={styles.moveDetailLabel}>From:</Text>
                          <View style={styles.moveDetailValue}>
                            <Clock size={14} color={colors.muted || '#6b7280'} />
                            <Text style={styles.moveDetailText}>
                              {formatDate(move.current_start)} at {formatTime(move.current_start)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.moveArrow}>
                          <Text style={styles.moveArrowText}>→</Text>
                        </View>
                        <View style={styles.moveDetail}>
                          <Text style={styles.moveDetailLabel}>To:</Text>
                          <View style={styles.moveDetailValue}>
                            <Clock size={14} color={colors.accent || '#3b82f6'} />
                            <Text style={[styles.moveDetailText, styles.moveDetailTextNew]}>
                              {formatDate(move.proposed_start)} at {formatTime(move.proposed_start)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <CheckCircle size={48} color={colors.greenBold || '#10b981'} />
                  <Text style={styles.emptyText}>No reshuffling needed!</Text>
                  <Text style={styles.emptySubtext}>Your schedule is already well-optimized.</Text>
                </View>
              )}
            </ScrollView>
          ) : null}

          {suggestions && suggestions.moves && suggestions.moves.length > 0 && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={applying}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyButton, applying && styles.applyButtonDisabled]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <CheckCircle size={16} color="#ffffff" />
                    <Text style={styles.applyText}>Apply Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
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
    maxWidth: 700,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  closeButton: {
    padding: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted || '#6b7280',
    textAlign: 'center',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.redBold || '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  summary: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: colors.text || '#111827',
    lineHeight: 20,
    marginBottom: 12,
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 13,
    color: colors.text || '#111827',
    flex: 1,
  },
  movesSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 12,
  },
  moveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  moveHeader: {
    marginBottom: 12,
  },
  moveTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 6,
  },
  moveReason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moveReasonText: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    flex: 1,
  },
  moveDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moveDetail: {
    flex: 1,
  },
  moveDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted || '#6b7280',
    marginBottom: 4,
  },
  moveDetailValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moveDetailText: {
    fontSize: 13,
    color: colors.text || '#111827',
  },
  moveDetailTextNew: {
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
  },
  moveArrow: {
    paddingHorizontal: 8,
  },
  moveArrowText: {
    fontSize: 18,
    color: colors.muted || '#6b7280',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.muted || '#6b7280',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted || '#6b7280',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 8,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});


import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { BookOpen, Calendar, Clock, Check, X, Sparkles, Edit2 } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import PlanReviewTable from '../syllabus/PlanReviewTable';
import { suggestPlan, acceptPlan } from '../../lib/apiClient';

export default function SyllabusViewer({ syllabusId, onClose, onSuggestPlan, onAcceptPlan }) {
  const [syllabus, setSyllabus] = useState(null);
  const [sections, setSections] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [showReviewTable, setShowReviewTable] = useState(false);

  useEffect(() => {
    if (syllabusId) {
      loadSyllabus();
    }
  }, [syllabusId]);

  const loadSyllabus = async () => {
    try {
      setLoading(true);
      
      // Fetch syllabus
      const { data: syllabusData, error: syllabusError } = await supabase
        .from('syllabi')
        .select('*')
        .eq('id', syllabusId)
        .single();

      if (syllabusError) throw syllabusError;
      setSyllabus(syllabusData);

      // Fetch sections
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('syllabus_sections')
        .select('*')
        .eq('syllabus_id', syllabusId)
        .order('position');

      if (sectionsError) throw sectionsError;
      setSections(sectionsData || []);

      // Load existing suggestions
      const { data: suggestionsData, error: suggestionsError } = await supabase
        .from('plan_suggestions')
        .select('*')
        .eq('source_syllabus_id', syllabusId)
        .eq('status', 'suggested')
        .order('target_day');

      if (!suggestionsError) {
        setSuggestions(suggestionsData || []);
      }

    } catch (err) {
      console.error('Error loading syllabus:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestPlan = async () => {
    try {
      setLoading(true);
      const { data, error } = await suggestPlan(syllabusId);
      
      if (error) {
        console.error('Error generating suggestions:', error);
        Alert.alert('Error', 'Failed to generate plan suggestions');
        return;
      }
      
      if (data?.items) {
        setReviewItems(data.items);
        setShowReviewTable(true);
      } else if (data?.suggestions) {
        // Legacy format
        setSuggestions(data.suggestions || []);
        setShowSuggestModal(true);
      }
    } catch (err) {
      console.error('Error generating suggestions:', err);
      Alert.alert('Error', 'Failed to generate plan suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptPlan = async (items) => {
    try {
      setLoading(true);
      
      // If items provided from PlanReviewTable, use those
      const itemsToAccept = items || suggestions.map(s => ({
        id: s.id,
        estimated_minutes: s.estimated_minutes,
        target_day: s.target_day,
        is_flexible: s.is_flexible,
      }));
      
      const { data, error } = await acceptPlan({
        syllabusId,
        items: itemsToAccept,
      });
      
      if (error) {
        console.error('Error accepting plan:', error);
        Alert.alert('Error', 'Failed to accept plan');
        return;
      }
      
      onAcceptPlan?.(data.events || []);
      setShowReviewTable(false);
      setShowSuggestModal(false);
      loadSyllabus(); // Reload to refresh suggestions
    } catch (err) {
      console.error('Error accepting plan:', err);
      Alert.alert('Error', 'Failed to accept plan');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading syllabus...</Text>
      </View>
    );
  }

  if (!syllabus) {
    return (
      <View style={styles.container}>
        <Text>Syllabus not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BookOpen size={20} color={colors.text} />
          <Text style={styles.title}>{syllabus.title}</Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <X size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Left: Outline */}
        <ScrollView style={styles.outline}>
          {sections.map((section) => (
            <TouchableOpacity
              key={section.id}
              style={[
                styles.outlineItem,
                selectedSection?.id === section.id && styles.outlineItemSelected
              ]}
              onPress={() => setSelectedSection(section)}
            >
              <Text style={styles.outlineItemTitle}>{section.heading}</Text>
              <Text style={styles.outlineItemMeta}>
                {section.section_type} • {section.estimated_minutes || '?'} min
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Right: Detail Pane */}
        <View style={styles.detailPane}>
          {selectedSection ? (
            <ScrollView>
              <Text style={styles.detailTitle}>{selectedSection.heading}</Text>
              <View style={styles.detailMeta}>
                <View style={styles.metaItem}>
                  <Clock size={14} color={colors.muted} />
                  <Text style={styles.metaText}>
                    {selectedSection.estimated_minutes || 'Not set'} minutes
                  </Text>
                </View>
                {selectedSection.suggested_due_ts && (
                  <View style={styles.metaItem}>
                    <Calendar size={14} color={colors.muted} />
                    <Text style={styles.metaText}>
                      Due: {new Date(selectedSection.suggested_due_ts).toLocaleDateString()}
                    </Text>
                  </View>
                )}
              </View>
              {selectedSection.notes && (
                <Text style={styles.detailNotes}>{selectedSection.notes}</Text>
              )}
            </ScrollView>
          ) : (
            <View style={styles.emptyDetail}>
              <Text style={styles.emptyText}>Select a section to view details</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {suggestions.length === 0 ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSuggestPlan}
              >
                <Sparkles size={16} color={colors.accentContrast} />
                <Text style={styles.primaryButtonText}>Suggest Plan</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setShowSuggestModal(true)}
                >
                  <Edit2 size={16} color={colors.accent} />
                  <Text style={styles.secondaryButtonText}>Review ({suggestions.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleAcceptPlan}
                >
                  <Check size={16} color={colors.accentContrast} />
                  <Text style={styles.primaryButtonText}>Accept Plan</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Plan Review Table Modal */}
      {showReviewTable && (
        <Modal
          visible={showReviewTable}
          transparent
          animationType="slide"
          onRequestClose={() => setShowReviewTable(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <PlanReviewTable
                items={reviewItems}
                onAccept={handleAcceptPlan}
                onCancel={() => setShowReviewTable(false)}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Suggestions Review Modal (Legacy) */}
      <Modal
        visible={showSuggestModal && !showReviewTable}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSuggestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Review Suggestions</Text>
              <TouchableOpacity onPress={() => setShowSuggestModal(false)}>
                <X size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.suggestionsList}>
              {suggestions.map((suggestion) => (
                <View key={suggestion.id} style={styles.suggestionItem}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                    <TouchableOpacity
                      onPress={() => setEditingSuggestion(suggestion)}
                    >
                      <Edit2 size={14} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.suggestionMeta}>
                    <Text style={styles.suggestionMetaText}>
                      {suggestion.estimated_minutes || 30} min • {suggestion.target_day ? new Date(suggestion.target_day).toLocaleDateString() : 'No date'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowSuggestModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleAcceptPlan}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Accept All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '90%',
    maxWidth: 900,
    maxHeight: '80%',
    ...shadows.large,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  outline: {
    width: 250,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  outlineItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  outlineItemSelected: {
    backgroundColor: colors.accentSoft,
  },
  outlineItemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  outlineItemMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  detailPane: {
    flex: 1,
    padding: 16,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  detailMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
  },
  detailNotes: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  emptyDetail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  suggestionsList: {
    padding: 16,
  },
  suggestionItem: {
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  suggestionMeta: {
    marginTop: 4,
  },
  suggestionMetaText: {
    fontSize: 12,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  modalButtonTextPrimary: {
    color: colors.accentContrast,
  },
});


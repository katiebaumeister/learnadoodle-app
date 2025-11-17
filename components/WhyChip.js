import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * WhyChip - Explains how a specific day's availability was computed
 * Shows which rules added/removed time and the final effective blocks
 */
const WhyChip = ({ childId, date, familyId, style }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadExplanation = async () => {
    if (data) {
      setOpen(!open);
      return;
    }

    try {
      setLoading(true);
      const { data: res, error } = await supabase.rpc('explain_day_availability', {
        p_child: childId,
        p_date: date,
        p_family: familyId,
      });

      if (error) throw error;
      setData(res);
      setOpen(true);
    } catch (error) {
      console.error('Error loading explanation:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSummary = () => {
    if (loading) return 'Loading...';
    if (!data) return 'Why?';
    
    const model = data.model === 'add-remove' ? 'Add-Remove' : 'Cascade';
    const blocks = data.effective?.length || 0;
    return `${model} • ${blocks > 0 ? `${blocks} block(s)` : 'OFF'}`;
  };

  return (
    <>
      <TouchableOpacity
        onPress={loadExplanation}
        style={[styles.chip, style]}
        disabled={loading}
      >
        <Text style={styles.chipText}>{getSummary()}</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView>
              <Text style={styles.modalTitle}>How this day was computed</Text>
              
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Model: {data?.model}</Text>
              </View>

              {data?.rules && data.rules.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Rules Applied:</Text>
                  {data.rules.map((rule, i) => (
                    <View key={i} style={styles.ruleRow}>
                      <Text style={[
                        styles.ruleKind,
                        rule.kind === 'off' ? styles.ruleOff : styles.ruleTeach
                      ]}>
                        {rule.kind === 'off' ? '− Off' : '+ Teach'} ({rule.scope})
                      </Text>
                      <Text style={styles.ruleTime}>
                        {rule.span.start}–{rule.span.end}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {data?.overrides && (
                <View style={styles.section}>
                  {data.overrides.off?.length > 0 && (
                    <Text style={styles.overrideOff}>Overrides removed time</Text>
                  )}
                  {data.overrides.teach?.length > 0 && (
                    <Text style={styles.overrideTeach}>Overrides added time</Text>
                  )}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Effective Availability:</Text>
                {data?.effective && data.effective.length > 0 ? (
                  data.effective.map((block, i) => (
                    <Text key={i} style={styles.effectiveBlock}>
                      {block.start}–{block.end}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.effectiveOff}>OFF</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setOpen(false)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    backgroundColor: '#ffffff',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  section: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ruleKind: {
    fontSize: 11,
    fontWeight: '600',
  },
  ruleOff: {
    color: '#dc2626',
  },
  ruleTeach: {
    color: '#16a34a',
  },
  ruleTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  overrideOff: {
    fontSize: 11,
    color: '#dc2626',
    marginBottom: 4,
  },
  overrideTeach: {
    fontSize: 11,
    color: '#16a34a',
    marginBottom: 4,
  },
  effectiveBlock: {
    fontSize: 11,
    color: '#111827',
    marginBottom: 4,
  },
  effectiveOff: {
    fontSize: 11,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  closeButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default WhyChip;


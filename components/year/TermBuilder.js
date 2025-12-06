/**
 * TermBuilder Component
 * Allows users to configure academic terms (semesters, quarters, trimesters, custom)
 * for year plans
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Calendar, ChevronDown } from 'lucide-react';
import { colors } from '../../theme/colors';

const TERM_TYPES = [
  { value: 'none', label: 'No terms (year-round)', autoGenerate: false },
  { value: 'semester', label: 'Semesters (2 terms)', autoGenerate: true, count: 2 },
  { value: 'quarter', label: 'Quarters (4 terms)', autoGenerate: true, count: 4 },
  { value: 'trimester', label: 'Trimesters (3 terms)', autoGenerate: true, count: 3 },
  { value: 'custom', label: 'Custom terms', autoGenerate: false },
];

export default function TermBuilder({
  startDate,
  endDate,
  termType = 'none',
  onTermTypeChange,
  customTerms = [],
  onCustomTermsChange,
}) {
  const [expanded, setExpanded] = useState(termType !== 'none');
  const [showCustomEditor, setShowCustomEditor] = useState(termType === 'custom');

  useEffect(() => {
    setShowCustomEditor(termType === 'custom');
    setExpanded(termType !== 'none');
  }, [termType]);

  const handleTermTypeSelect = (type) => {
    onTermTypeChange(type);
    if (type === 'custom') {
      setShowCustomEditor(true);
    }
  };

  const addCustomTerm = () => {
    if (!startDate || !endDate) return;
    
    const newTerm = {
      id: Date.now().toString(),
      name: `Term ${customTerms.length + 1}`,
      startDate: startDate,
      endDate: endDate,
    };
    
    onCustomTermsChange([...customTerms, newTerm]);
  };

  const removeCustomTerm = (termId) => {
    onCustomTermsChange(customTerms.filter(t => t.id !== termId));
  };

  const updateCustomTerm = (termId, field, value) => {
    onCustomTermsChange(customTerms.map(term => 
      term.id === termId ? { ...term, [field]: value } : term
    ));
  };

  const canAutoGenerate = () => {
    const selected = TERM_TYPES.find(t => t.value === termType);
    return selected?.autoGenerate && startDate && endDate;
  };

  const getTermPreview = () => {
    if (termType === 'none') return null;
    
    const selected = TERM_TYPES.find(t => t.value === termType);
    if (!selected || !selected.autoGenerate) return null;
    
    if (!startDate || !endDate) {
      return <Text style={styles.previewText}>Set start and end dates to see term preview</Text>;
    }

    const daysTotal = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
    const daysPerTerm = Math.floor(daysTotal / selected.count);

    return (
      <View style={styles.preview}>
        <Text style={styles.previewTitle}>Auto-generated terms:</Text>
        {Array.from({ length: selected.count }, (_, i) => {
          const termStart = new Date(startDate);
          termStart.setDate(termStart.getDate() + (i * daysPerTerm));
          const termEnd = new Date(termStart);
          if (i === selected.count - 1) {
            termEnd.setTime(new Date(endDate).getTime());
          } else {
            termEnd.setDate(termEnd.getDate() + daysPerTerm - 1);
          }
          
          return (
            <View key={i} style={styles.previewTerm}>
              <Text style={styles.previewTermName}>
                {selected.value === 'semester' ? `Semester ${i + 1}` :
                 selected.value === 'quarter' ? `Quarter ${i + 1}` :
                 `Trimester ${i + 1}`}
              </Text>
              <Text style={styles.previewTermDates}>
                {termStart.toLocaleDateString()} - {termEnd.toLocaleDateString()}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.title}>Academic Terms</Text>
        <ChevronDown 
          size={20} 
          color={colors.text} 
          style={[styles.chevron, expanded && styles.chevronExpanded]}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          <Text style={styles.description}>
            Divide your year into terms for better organization and progress tracking.
          </Text>

          <View style={styles.termTypeGrid}>
            {TERM_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.termTypeOption,
                  termType === type.value && styles.termTypeOptionSelected,
                ]}
                onPress={() => handleTermTypeSelect(type.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.termTypeText,
                    termType === type.value && styles.termTypeTextSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {canAutoGenerate() && getTermPreview()}

          {showCustomEditor && (
            <View style={styles.customTerms}>
              <View style={styles.customTermsHeader}>
                <Text style={styles.customTermsTitle}>Custom Terms</Text>
                <TouchableOpacity
                  style={styles.addTermButton}
                  onPress={addCustomTerm}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addTermButtonText}>+ Add Term</Text>
                </TouchableOpacity>
              </View>

              {customTerms.length === 0 ? (
                <Text style={styles.emptyText}>No custom terms defined yet</Text>
              ) : (
                <ScrollView style={styles.customTermsList}>
                  {customTerms.map((term) => (
                    <View key={term.id} style={styles.customTermItem}>
                      <TextInput
                        style={styles.customTermName}
                        value={term.name}
                        onChangeText={(value) => updateCustomTerm(term.id, 'name', value)}
                        placeholder="Term name"
                        placeholderTextColor={colors.muted}
                      />
                      <View style={styles.customTermDates}>
                        <TextInput
                          style={[styles.dateInput, { flex: 1 }]}
                          value={term.startDate}
                          onChangeText={(value) => updateCustomTerm(term.id, 'startDate', value)}
                          placeholder="Start (YYYY-MM-DD)"
                          placeholderTextColor={colors.muted}
                        />
                        <Text style={styles.dateSeparator}>to</Text>
                        <TextInput
                          style={[styles.dateInput, { flex: 1 }]}
                          value={term.endDate}
                          onChangeText={(value) => updateCustomTerm(term.id, 'endDate', value)}
                          placeholder="End (YYYY-MM-DD)"
                          placeholderTextColor={colors.muted}
                        />
                        <TouchableOpacity
                          style={styles.removeTermButton}
                          onPress={() => removeCustomTerm(term.id)}
                        >
                          <Text style={styles.removeTermButtonText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  content: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
    lineHeight: 20,
  },
  termTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  termTypeOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  termTypeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || '#e3f2fd',
  },
  termTypeText: {
    fontSize: 14,
    color: colors.text,
  },
  termTypeTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  preview: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  previewTerm: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewTermName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  previewTermDates: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  previewText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
  customTerms: {
    marginTop: 16,
  },
  customTermsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customTermsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  addTermButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  addTermButtonText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  customTermsList: {
    maxHeight: 300,
  },
  customTermItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customTermName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    padding: 8,
    backgroundColor: colors.bg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customTermDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    padding: 8,
    backgroundColor: colors.bg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 13,
    color: colors.text,
  },
  dateSeparator: {
    fontSize: 13,
    color: colors.muted,
  },
  removeTermButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  removeTermButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
});


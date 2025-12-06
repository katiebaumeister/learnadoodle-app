import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, ActivityIndicator, Platform } from 'react-native';
import { X, Save, BookOpen, Clock, FileText, Table, Plus as PlusIcon, Trash2 } from 'lucide-react';
import { colors } from '../../theme/colors';
import { createLessonTemplate } from '../../lib/services/templatesClient';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';
import StandardsSearchModal from '../standards/StandardsSearchModal';

export default function CreateLessonTemplateModal({ 
  isOpen, 
  onClose,
  onSuccess,
  familyId,
  defaultSubjectId = null,
}) {
  const [title, setTitle] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState(defaultSubjectId);
  const [defaultObjectives, setDefaultObjectives] = useState('');
  const [defaultMaterials, setDefaultMaterials] = useState('');
  const [defaultSteps, setDefaultSteps] = useState('');
  const [defaultDuration, setDefaultDuration] = useState('');
  const [linkedStandards, setLinkedStandards] = useState([]);
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [templateType, setTemplateType] = useState('standard'); // 'standard' or 'table'
  const [tableColumns, setTableColumns] = useState(['Column 1', 'Column 2']);
  const [tableRows, setTableRows] = useState(['Row 1', 'Row 2']);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [pacing, setPacing] = useState('normal');
  const toast = useToast();
  
  const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const PACING_OPTIONS = [
    { value: 'fast', label: 'Fast (25% faster)' },
    { value: 'normal', label: 'Normal' },
    { value: 'slow', label: 'Slow (50% slower)' },
    { value: 'flexible', label: 'Flexible' },
  ];

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setSelectedSubjectId(defaultSubjectId);
      setDefaultObjectives('');
      setDefaultMaterials('');
      setDefaultSteps('');
      setDefaultDuration('');
      setLinkedStandards([]);
      setTemplateType('standard');
      setTableColumns(['Column 1', 'Column 2']);
      setTableRows(['Row 1', 'Row 2']);
      setGradeLevels([]);
      setPacing('normal');
      loadSubjects();
    }
  }, [isOpen, defaultSubjectId]);

  const loadSubjects = async () => {
    if (!familyId) return;
    
    try {
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      setAvailableSubjects(subjectsData || []);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.push('Template title is required', 'error');
      return;
    }

    setLoading(true);
    try {
      const duration = defaultDuration ? parseInt(defaultDuration, 10) : null;
      if (defaultDuration && (isNaN(duration) || duration <= 0)) {
        toast.push('Duration must be a positive number', 'error');
        setLoading(false);
        return;
      }

      // Build rich_text structure for table templates
      let richText = {};
      if (templateType === 'table') {
        richText = {
          type: 'table',
          columns: tableColumns,
          rows: tableRows,
          data: tableRows.reduce((acc, row, rowIdx) => {
            acc[row] = tableColumns.reduce((colAcc, col) => {
              colAcc[col] = ''; // Empty cells that will be filled when template is applied
              return colAcc;
            }, {});
            return acc;
          }, {}),
        };
      }

      const { data, error } = await createLessonTemplate({
        title: title.trim(),
        subjectId: selectedSubjectId || null,
        defaultObjectives: defaultObjectives.trim() || null,
        defaultMaterials: defaultMaterials.trim() || null,
        defaultSteps: defaultSteps.trim() || null,
        defaultDuration: duration,
        linkedStandards: linkedStandards.map(s => s.id || s),
        defaultRichText: templateType === 'table' ? richText : null,
        gradeLevels: gradeLevels.length > 0 ? gradeLevels : null,
        pacing: pacing !== 'normal' ? pacing : null,
      });

      if (error) throw error;

      toast.push('Template created successfully!', 'success');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error creating template:', error);
      toast.push('Failed to create template', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAttachStandards = (standards) => {
    setLinkedStandards(standards);
    setShowStandardsModal(false);
  };

  const removeStandard = (standardId) => {
    setLinkedStandards(linkedStandards.filter(s => (s.id || s) !== standardId));
  };

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Save size={20} color={colors.accent} />
              <Text style={styles.title}>Create Lesson Template</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Template Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Template Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Math Review Lesson"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>

            {/* Template Type */}
            <View style={styles.field}>
              <Text style={styles.label}>Template Type</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    templateType === 'standard' && styles.typeButtonActive
                  ]}
                  onPress={() => setTemplateType('standard')}
                >
                  <FileText size={16} color={templateType === 'standard' ? '#ffffff' : colors.muted} />
                  <Text style={[
                    styles.typeButtonText,
                    templateType === 'standard' && styles.typeButtonTextActive
                  ]}>
                    Standard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    templateType === 'table' && styles.typeButtonActive
                  ]}
                  onPress={() => setTemplateType('table')}
                >
                  <Table size={16} color={templateType === 'table' ? '#ffffff' : colors.muted} />
                  <Text style={[
                    styles.typeButtonText,
                    templateType === 'table' && styles.typeButtonTextActive
                  ]}>
                    Table Template
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Subject */}
            <View style={styles.field}>
              <Text style={styles.label}>Subject (Optional)</Text>
              <View style={styles.subjectSelector}>
                <TouchableOpacity
                  style={styles.subjectButton}
                  onPress={() => {
                    // Show subject picker
                    if (availableSubjects.length > 0) {
                      // For now, just toggle through subjects or show a simple picker
                      // In a full implementation, you'd use a proper picker component
                    }
                  }}
                >
                  <BookOpen size={16} color={colors.muted} />
                  <Text style={styles.subjectButtonText}>
                    {selectedSubjectId 
                      ? availableSubjects.find(s => s.id === selectedSubjectId)?.name || 'Select subject...'
                      : 'None (All Subjects)'}
                  </Text>
                </TouchableOpacity>
                {selectedSubjectId && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setSelectedSubjectId(null)}
                  >
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              {availableSubjects.length > 0 && (
                <View style={styles.subjectChips}>
                  {availableSubjects.map(subject => (
                    <TouchableOpacity
                      key={subject.id}
                      style={[
                        styles.subjectChip,
                        selectedSubjectId === subject.id && styles.subjectChipSelected
                      ]}
                      onPress={() => setSelectedSubjectId(
                        selectedSubjectId === subject.id ? null : subject.id
                      )}
                    >
                      <Text style={[
                        styles.subjectChipText,
                        selectedSubjectId === subject.id && styles.subjectChipTextSelected
                      ]}>
                        {subject.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Table Configuration */}
            {templateType === 'table' && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Table Columns</Text>
                  <Text style={styles.hint}>Define column headers for your table</Text>
                  {tableColumns.map((col, idx) => (
                    <View key={idx} style={styles.tableItemRow}>
                      <TextInput
                        style={[styles.input, styles.tableItemInput]}
                        placeholder={`Column ${idx + 1}`}
                        value={col}
                        onChangeText={(text) => {
                          const newCols = [...tableColumns];
                          newCols[idx] = text;
                          setTableColumns(newCols);
                        }}
                      />
                      {tableColumns.length > 1 && (
                        <TouchableOpacity
                          style={styles.removeItemButton}
                          onPress={() => {
                            setTableColumns(tableColumns.filter((_, i) => i !== idx));
                          }}
                        >
                          <Trash2 size={16} color={colors.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={() => setTableColumns([...tableColumns, `Column ${tableColumns.length + 1}`])}
                  >
                    <PlusIcon size={16} color={colors.accent} />
                    <Text style={styles.addItemButtonText}>Add Column</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Table Rows</Text>
                  <Text style={styles.hint}>Define row labels (leftmost column)</Text>
                  {tableRows.map((row, idx) => (
                    <View key={idx} style={styles.tableItemRow}>
                      <TextInput
                        style={[styles.input, styles.tableItemInput]}
                        placeholder={`Row ${idx + 1}`}
                        value={row}
                        onChangeText={(text) => {
                          const newRows = [...tableRows];
                          newRows[idx] = text;
                          setTableRows(newRows);
                        }}
                      />
                      {tableRows.length > 1 && (
                        <TouchableOpacity
                          style={styles.removeItemButton}
                          onPress={() => {
                            setTableRows(tableRows.filter((_, i) => i !== idx));
                          }}
                        >
                          <Trash2 size={16} color={colors.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={() => setTableRows([...tableRows, `Row ${tableRows.length + 1}`])}
                  >
                    <PlusIcon size={16} color={colors.accent} />
                    <Text style={styles.addItemButtonText}>Add Row</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    This template will create a table with {tableColumns.length} column{tableColumns.length !== 1 ? 's' : ''} and {tableRows.length} row{tableRows.length !== 1 ? 's' : ''}. 
                    When applied to a lesson, the table cells will be empty and ready to fill in.
                  </Text>
                </View>
              </>
            )}

            {/* Default Objectives */}
            {templateType === 'standard' && (
              <View style={styles.field}>
                <Text style={styles.label}>Default Objectives</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What will students learn in this lesson?"
                  value={defaultObjectives}
                  onChangeText={setDefaultObjectives}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

            {/* Default Materials */}
            {templateType === 'standard' && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Default Materials</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="What materials are needed?"
                    value={defaultMaterials}
                    onChangeText={setDefaultMaterials}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                {/* Default Steps */}
                <View style={styles.field}>
                  <Text style={styles.label}>Default Steps</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Outline the lesson steps..."
                    value={defaultSteps}
                    onChangeText={setDefaultSteps}
                    multiline
                    numberOfLines={4}
                  />
                </View>
              </>
            )}

            {/* Default Duration */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Clock size={16} color={colors.muted} />
                <Text style={styles.label}>Default Duration (minutes)</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g., 45"
                value={defaultDuration}
                onChangeText={setDefaultDuration}
                keyboardType="numeric"
              />
            </View>

            {/* Grade Levels (Smart Template) */}
            <View style={styles.field}>
              <Text style={styles.label}>Grade Levels (Optional)</Text>
              <Text style={styles.hint}>Select grade levels this template is designed for</Text>
              <View style={styles.gradeChips}>
                {GRADE_OPTIONS.map(grade => (
                  <TouchableOpacity
                    key={grade}
                    style={[
                      styles.gradeChip,
                      gradeLevels.includes(grade) && styles.gradeChipSelected
                    ]}
                    onPress={() => {
                      if (gradeLevels.includes(grade)) {
                        setGradeLevels(gradeLevels.filter(g => g !== grade));
                      } else {
                        setGradeLevels([...gradeLevels, grade]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.gradeChipText,
                      gradeLevels.includes(grade) && styles.gradeChipTextSelected
                    ]}>
                      {grade === 'K' ? 'K' : `Grade ${grade}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pacing (Smart Template) */}
            <View style={styles.field}>
              <Text style={styles.label}>Pacing (Optional)</Text>
              <Text style={styles.hint}>How fast should lessons using this template progress?</Text>
              <View style={styles.pacingOptions}>
                {PACING_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.pacingOption,
                      pacing === option.value && styles.pacingOptionActive
                    ]}
                    onPress={() => setPacing(option.value)}
                  >
                    <Text style={[
                      styles.pacingOptionText,
                      pacing === option.value && styles.pacingOptionTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Linked Standards */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <FileText size={16} color={colors.muted} />
                <Text style={styles.label}>Linked Standards</Text>
              </View>
              <TouchableOpacity
                style={styles.attachStandardsButton}
                onPress={() => setShowStandardsModal(true)}
              >
                <Text style={styles.attachStandardsButtonText}>
                  {linkedStandards.length > 0 
                    ? `${linkedStandards.length} standard${linkedStandards.length > 1 ? 's' : ''} attached`
                    : 'Attach Standards'}
                </Text>
              </TouchableOpacity>
              {linkedStandards.length > 0 && (
                <View style={styles.standardsList}>
                  {linkedStandards.map(standard => (
                    <View key={standard.id || standard} style={styles.standardChip}>
                      <Text style={styles.standardChipText}>
                        {standard.standard_code || standard.code || 'Standard'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeStandard(standard.id || standard)}
                        style={styles.removeStandardButton}
                      >
                        <X size={14} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Create Template</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Standards Search Modal */}
      <StandardsSearchModal
        visible={showStandardsModal}
        onClose={() => setShowStandardsModal(false)}
        onSelect={handleAttachStandards}
        subjectId={selectedSubjectId}
        initialSelected={linkedStandards}
      />
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
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    maxHeight: Platform.OS === 'web' ? 500 : 400,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  subjectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  subjectButtonText: {
    fontSize: 14,
    color: '#374151',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  subjectChipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: colors.accent,
  },
  subjectChipText: {
    fontSize: 13,
    color: '#374151',
  },
  subjectChipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  attachStandardsButton: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  attachStandardsButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
  standardsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  standardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  standardChipText: {
    fontSize: 12,
    color: '#3730a3',
    fontWeight: '500',
  },
  removeStandardButton: {
    padding: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  tableItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tableItemInput: {
    flex: 1,
  },
  removeItemButton: {
    padding: 8,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: colors.accent + '40',
    marginTop: 4,
  },
  addItemButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
    color: '#0369a1',
    lineHeight: 18,
  },
  gradeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  gradeChipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: colors.accent,
  },
  gradeChipText: {
    fontSize: 13,
    color: '#374151',
  },
  gradeChipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  pacingOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pacingOption: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  pacingOptionActive: {
    backgroundColor: '#dbeafe',
    borderColor: colors.accent,
  },
  pacingOptionText: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
  },
  pacingOptionTextActive: {
    color: '#1e40af',
    fontWeight: '600',
  },
});


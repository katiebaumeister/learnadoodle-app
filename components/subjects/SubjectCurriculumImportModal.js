/**
 * Import input step for generate / upload / paste — always hands off to ManualCurriculumBuilderModal.
 * Part of the canonical subject units editor; do not build a parallel import UI.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { X, Sparkles } from 'lucide-react';
import { useToast } from '../Toast';
import ManualCurriculumBuilderModal from '../ManualCurriculumBuilderModal';
import EventAttachmentsField from '../create/shared/EventAttachmentsField';
import AddMaterialModal from '../materials/AddMaterialModal';
import {
  parsePlainTextStream,
  generateCurriculumDraftStream,
} from '../../lib/services/curriculumClient';
import { manualDraftFromGeneratedDraft } from '../../lib/subjectCurriculumImport';
import { consumePendingMagicExtractPaste } from '../../lib/planYearRetirement';
import { useModalStackElevation } from '../hooks/useModalStackElevation';

const ACCENT = '#9ECFFB';

const INPUT_TITLES = {
  generate: 'Generate curriculum',
  upload: 'Upload material',
  paste_plain: 'Paste plain text',
};

export default function SubjectCurriculumImportModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  assignedChildIds = [],
  replaceExisting = false,
  initialMethod = null,
  academicYearId = null,
  initialMaterialId = null,
  autoContinueOnOpen = false,
}) {
  const toast = useToast();
  const overlayRef = React.useRef(null);
  useModalStackElevation(overlayRef, visible, 10002);

  const subjectId = subject?.id || null;
  const subjectName = subject?.name?.trim() || 'Subject';
  const method = initialMethod;

  const [rawText, setRawText] = useState('');
  const [generateNotes, setGenerateNotes] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [materialReloadKey, setMaterialReloadKey] = useState(0);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [working, setWorking] = useState(false);
  const [editorDraft, setEditorDraft] = useState(null);
  const [editorKey, setEditorKey] = useState(0);
  const autoContinueStartedRef = useRef(false);

  const reset = useCallback(() => {
    setRawText('');
    setGenerateNotes('');
    setSelectedMaterialId(null);
    setMaterialReloadKey(0);
    setShowAddMaterial(false);
    setStatusText('');
    setWorking(false);
    setEditorDraft(null);
    autoContinueStartedRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const openDraftEditor = useCallback((draft) => {
    const mapped = manualDraftFromGeneratedDraft(draft);
    if (!mapped?.units?.length) {
      toast.push('No units were found. Try different input.', 'error');
      return;
    }
    setEditorDraft(mapped);
    setEditorKey((k) => k + 1);
    setStatusText('');
    setWorking(false);
  }, [toast]);

  const handleParse = async () => {
    if (!familyId || !subjectId || !rawText.trim()) return;
    setWorking(true);
    setStatusText('Parsing…');
    try {
      const { data, error } = await parsePlainTextStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          raw_text: rawText.trim(),
          source_title: `${subjectName} import`,
        },
        { onDelta: () => {} },
      );
      if (error || !data) throw error || new Error('Parse failed');
      openDraftEditor(data);
    } catch (err) {
      toast.push(err?.message || 'Could not parse text', 'error');
      setWorking(false);
      setStatusText('');
    }
  };

  const handleUploadParse = useCallback(async () => {
    if (!familyId || !subjectId || !selectedMaterialId) return;
    setWorking(true);
    setStatusText('Extracting units from material…');
    try {
      const { data, error } = await parsePlainTextStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          raw_text: '',
          material_id: selectedMaterialId,
          source_title: `${subjectName} import`,
        },
        { onDelta: () => {} },
      );
      if (error || !data) throw error || new Error('Parse failed');
      openDraftEditor(data);
    } catch (err) {
      toast.push(err?.message || 'Could not extract units from material', 'error');
      setWorking(false);
      setStatusText('');
    }
  }, [familyId, subjectId, selectedMaterialId, subjectName, openDraftEditor, toast]);

  const handleGenerate = async () => {
    if (!familyId || !subjectId) return;
    setWorking(true);
    setStatusText('Generating curriculum…');
    try {
      const { data, error } = await generateCurriculumDraftStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          child_ids: assignedChildIds,
          generation_scope: generateNotes.trim() || `Build units and lessons for ${subjectName}.`,
          duration_mode: 'multi_unit_course',
          include_assessments: true,
          include_projects: true,
          include_materials: false,
          include_pacing: false,
        },
        {
          onStatus: (text) => setStatusText(text || 'Generating…'),
        },
      );
      if (error || !data) throw error || new Error('Generate failed');
      openDraftEditor(data);
    } catch (err) {
      toast.push(err?.message || 'Could not generate curriculum', 'error');
      setWorking(false);
      setStatusText('');
    }
  };

  const handleEditorSaved = useCallback(() => {
    onSaved?.();
    handleClose();
  }, [onSaved, handleClose]);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    if (method === 'upload' && initialMaterialId) {
      setSelectedMaterialId(String(initialMaterialId));
    }
    const pendingPaste = consumePendingMagicExtractPaste();
    if (pendingPaste && method === 'paste_plain') {
      setRawText(pendingPaste);
    }
  }, [visible, method, initialMaterialId, reset]);

  useEffect(() => {
    if (!visible || !autoContinueOnOpen || method !== 'upload' || !selectedMaterialId) return;
    if (autoContinueStartedRef.current || working || editorDraft) return;
    autoContinueStartedRef.current = true;
    handleUploadParse();
  }, [visible, autoContinueOnOpen, method, selectedMaterialId, working, editorDraft, handleUploadParse]);

  const inputTitle = useMemo(
    () => INPUT_TITLES[method] || 'Add units',
    [method],
  );

  const canSubmit = useMemo(() => {
    if (working) return false;
    if (method === 'generate') return true;
    if (method === 'upload') return !!selectedMaterialId;
    return !!rawText.trim();
  }, [working, method, selectedMaterialId, rawText]);

  const handlePrimaryAction = () => {
    if (method === 'generate') handleGenerate();
    else if (method === 'upload') handleUploadParse();
    else handleParse();
  };

  if (!visible) return null;

  if (editorDraft) {
    return (
      <ManualCurriculumBuilderModal
        key={editorKey}
        visible
        onClose={handleClose}
        onSaved={handleEditorSaved}
        familyId={familyId}
        subjectId={subjectId}
        subjectName={subjectName}
        initialDraft={editorDraft}
        replaceExisting={replaceExisting}
        createCalendarEvents={false}
        academicYearId={academicYearId}
      />
    );
  }

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
        <View ref={overlayRef} style={styles.overlay} collapsable={false}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={styles.shell}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{inputTitle}</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeCircle}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {method === 'generate' ? (
                <>
                  <Text style={styles.intro}>
                    Describe what this course should cover. We will generate units and lessons you can edit before saving.
                  </Text>
                  <Text style={styles.label}>Course description</Text>
                  <TextInput
                    value={generateNotes}
                    onChangeText={setGenerateNotes}
                    placeholder={`e.g. 6th grade ${subjectName}, 12 weeks, include projects`}
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={8}
                    style={[styles.input, styles.textArea]}
                    editable={!working}
                    {...(Platform.OS === 'web' && { cursor: 'text' })}
                  />
                </>
              ) : null}

              {method === 'upload' ? (
                <EventAttachmentsField
                  key={materialReloadKey}
                  familyId={familyId}
                  selectedMaterialId={selectedMaterialId}
                  onMaterialChange={setSelectedMaterialId}
                  onAddNew={() => setShowAddMaterial(true)}
                  label="Material"
                  placeholder="Select material…"
                />
              ) : null}

              {method === 'paste_plain' ? (
                <>
                  <Text style={styles.label}>Units and lessons</Text>
                  <TextInput
                    value={rawText}
                    onChangeText={setRawText}
                    placeholder={'Unit 1: Fractions\nIntro to fractions\nAdding fractions'}
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={12}
                    style={[styles.input, styles.textAreaLarge]}
                    editable={!working}
                    {...(Platform.OS === 'web' && { cursor: 'text' })}
                  />
                </>
              ) : null}

              {statusText ? (
                <View style={styles.statusRow}>
                  {working ? <ActivityIndicator size="small" color={ACCENT} /> : null}
                  <Text style={styles.statusText}>{statusText}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
                disabled={working}
                {...(Platform.OS === 'web' && { cursor: working ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, (!canSubmit || working) && styles.saveButtonDisabled]}
                onPress={handlePrimaryAction}
                disabled={!canSubmit || working}
                {...(Platform.OS === 'web' && { cursor: !canSubmit || working ? 'not-allowed' : 'pointer' })}
              >
                {working ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={styles.saveInner}>
                    <Sparkles size={14} color="#FFFFFF" />
                    <Text style={styles.saveText}>
                      {method === 'generate' ? 'Generate' : 'Continue'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showAddMaterial ? (
        <AddMaterialModal
          visible
          familyId={familyId}
          onClose={() => setShowAddMaterial(false)}
          onSaved={(material) => {
            if (material?.id) setSelectedMaterialId(material.id);
            setShowAddMaterial(false);
            setMaterialReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && { zIndex: 10002 }),
  },
  shell: {
    width: '100%',
    maxWidth: 860,
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 30px 60px rgba(0, 0, 0, 0.12), 0 10px 30px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 36,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    paddingRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5EAF1',
    backgroundColor: '#FFFFFF',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 36,
    paddingBottom: 20,
  },
  intro: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 180,
    textAlignVertical: 'top',
  },
  textAreaLarge: {
    minHeight: 240,
    textAlignVertical: 'top',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  statusText: {
    fontSize: 13,
    color: '#64748B',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 24 : 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    minHeight: 50,
    minWidth: 120,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.65 },
  saveInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

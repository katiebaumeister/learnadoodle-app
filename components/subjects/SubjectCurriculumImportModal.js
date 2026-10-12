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
import { X, Sparkles, ChevronLeft } from 'lucide-react';
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
import { buildSubjectCurriculumPlanningContext } from '../../lib/subjectCurriculumPlanningContext';
import { useModalStackElevation } from '../hooks/useModalStackElevation';

const ACCENT = '#9ECFFB';

const INPUT_TITLES = {
  generate: 'Generate curriculum',
  upload: 'Upload material',
  paste_plain: 'Paste plain text',
  unified: 'Create classwork',
};

function looksLikeOutline(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.includes('\n')) return true;
  return /\bunit\s*\d|\blesson\s*\d|^[-*•]/i.test(value);
}

export default function SubjectCurriculumImportModal({
  visible,
  onClose,
  onBack = null,
  onSaved,
  familyId,
  subject,
  assignedChildIds = [],
  replaceExisting = false,
  hasExistingContent = false,
  initialMethod = null,
  academicYearId = null,
  initialMaterialId = null,
  initialNotes = '',
  autoContinueOnOpen = false,
  headerTitle = null,
  detectDates = false,
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
  const [planningCtx, setPlanningCtx] = useState(null);
  const [scheduleSummary, setScheduleSummary] = useState(null);
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
    setPlanningCtx(null);
    setScheduleSummary(null);
    autoContinueStartedRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const handleBack = useCallback(() => {
    if (typeof onBack === 'function') {
      reset();
      onBack();
      return;
    }
    handleClose();
  }, [onBack, reset, handleClose]);

  const showBack = typeof onBack === 'function';

  const loadPlanningContext = useCallback(async () => {
    const ctx = await buildSubjectCurriculumPlanningContext({
      familyId,
      subject,
      academicYearId,
    });
    setPlanningCtx(ctx);
    setScheduleSummary(ctx?.scheduleSummary || null);
    return ctx;
  }, [familyId, subject, academicYearId]);

  useEffect(() => {
    if (!visible || !familyId || !subjectId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await loadPlanningContext();
        if (cancelled) return;
        setPlanningCtx(ctx);
        setScheduleSummary(ctx?.scheduleSummary || null);
      } catch (_) {
        if (!cancelled) {
          setPlanningCtx(null);
          setScheduleSummary(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, subjectId, loadPlanningContext]);

  const introCopy = useMemo(() => {
    const scheduleBit = scheduleSummary
      ? ` Fits your subject schedule: ${scheduleSummary}.`
      : '';
    const persistBit = (hasExistingContent || replaceExisting)
      ? ' Review before saving, previously saved units and lessons will be overridden.'
      : ' This creates a draft only. Nothing is saved until you review and press Save. Your subject has no saved units yet, so this won’t overwrite anything.';

    if (method === 'unified') {
      return 'Add a description and/or attach a syllabus (PDF, Word, text, or image). We will draft units and lessons sized to your saved school year schedule so you can edit before saving.';
    }
    if (method === 'generate') {
      return `Describe what this course should cover. We will generate units and lessons sized to your saved school year schedule so you can edit before saving.${scheduleBit}${persistBit}`;
    }
    if (method === 'paste_plain') {
      return `Paste a plain-text outline of units and lessons. Structured outlines keep their units and nested lessons; looser text is expanded into a multi-unit draft sized to your lesson days and times.${scheduleBit}${persistBit}`;
    }
    return `Select or upload a syllabus to generate.${persistBit}`;
  }, [method, scheduleSummary, hasExistingContent, replaceExisting]);

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

  // Generate + paste can size to the school-year schedule. Upload/Create from syllabus
  // must stay extractive from the material — do not invent a subject-themed outline.
  const parsePayloadExtras = useCallback(async ({ expandStructure = false } = {}) => {
    if (!expandStructure) {
      return {
        allow_structure_expansion: false,
        detect_dates: detectDates === true,
      };
    }
    const ctx = planningCtx || await loadPlanningContext();
    return {
      planning_context: ctx?.planning_context || null,
      lesson_count_target: ctx?.lesson_count_target || null,
      typical_lesson_minutes: ctx?.typical_lesson_minutes || null,
      special_instructions: ctx?.special_instructions || null,
      allow_structure_expansion: true,
      detect_dates: detectDates === true,
    };
  }, [planningCtx, loadPlanningContext, detectDates]);

  const handleParse = async (textOverride = null) => {
    const text = String(textOverride ?? rawText ?? '').trim();
    if (!familyId || !subjectId || !text) return;
    setWorking(true);
    setStatusText('Parsing with your subject schedule…');
    try {
      const extras = await parsePayloadExtras({ expandStructure: true });
      const { data, error } = await parsePlainTextStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          raw_text: text,
          source_title: `${subjectName} import`,
          ...extras,
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
    setStatusText('Reading material (PDF, Word, text, or image)…');
    try {
      const extras = await parsePayloadExtras({ expandStructure: false });
      const { data, error } = await parsePlainTextStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          raw_text: '',
          material_id: selectedMaterialId,
          source_title: `${subjectName} import`,
          ...extras,
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
  }, [familyId, subjectId, selectedMaterialId, subjectName, openDraftEditor, toast, parsePayloadExtras]);

  const handleGenerate = async (notesOverride = null) => {
    if (!familyId || !subjectId) return;
    setWorking(true);
    setStatusText('Generating curriculum for your schedule…');
    try {
      const ctx = planningCtx || await loadPlanningContext();
      const scope = String(notesOverride ?? generateNotes ?? '').trim()
        || `Build units and lessons for ${subjectName}.`;
      const { data, error } = await generateCurriculumDraftStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          child_ids: assignedChildIds,
          generation_scope: scope,
          planning_context: ctx?.planning_context || null,
          duration_mode: ctx?.duration_mode || 'multi_unit_course',
          lesson_count_target: ctx?.lesson_count_target || null,
          typical_lesson_minutes: ctx?.typical_lesson_minutes || null,
          special_instructions: ctx?.special_instructions || null,
          include_assessments: true,
          include_projects: true,
          include_materials: false,
          include_pacing: true,
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

  const handleUnifiedSubmit = async () => {
    const text = String(generateNotes || rawText || '').trim();
    if (selectedMaterialId) {
      await handleUploadParse();
      return;
    }
    if (!text) return;
    if (looksLikeOutline(text)) {
      await handleParse(text);
      return;
    }
    await handleGenerate(text);
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
    if (initialMaterialId && (method === 'upload' || method === 'unified')) {
      setSelectedMaterialId(String(initialMaterialId));
    }
    const seedNotes = typeof initialNotes === 'string' ? initialNotes.trim() : '';
    if (seedNotes && method === 'unified') {
      setGenerateNotes(seedNotes);
      setRawText(seedNotes);
    }
    const pendingPaste = consumePendingMagicExtractPaste();
    if (pendingPaste && (method === 'paste_plain' || method === 'unified')) {
      setRawText(pendingPaste);
      if (method === 'unified') setGenerateNotes(pendingPaste);
    }
  }, [visible, method, initialMaterialId, initialNotes, reset]);

  useEffect(() => {
    if (!visible || !autoContinueOnOpen || working || editorDraft) return;
    if (autoContinueStartedRef.current) return;
    if (method === 'upload' && selectedMaterialId) {
      autoContinueStartedRef.current = true;
      handleUploadParse();
      return;
    }
    if (method === 'unified' && (selectedMaterialId || String(generateNotes || rawText || '').trim())) {
      autoContinueStartedRef.current = true;
      handleUnifiedSubmit();
    }
  }, [
    visible,
    autoContinueOnOpen,
    method,
    selectedMaterialId,
    generateNotes,
    rawText,
    working,
    editorDraft,
    handleUploadParse,
  ]);

  const inputTitle = useMemo(
    () => (headerTitle && String(headerTitle).trim()) || INPUT_TITLES[method] || 'Add units',
    [headerTitle, method],
  );

  const canSubmit = useMemo(() => {
    if (working) return false;
    if (method === 'unified') {
      return Boolean(selectedMaterialId || String(generateNotes || rawText || '').trim());
    }
    if (method === 'generate') return true;
    if (method === 'upload') return !!selectedMaterialId;
    return !!rawText.trim();
  }, [working, method, selectedMaterialId, rawText, generateNotes]);

  const handlePrimaryAction = () => {
    if (method === 'unified') handleUnifiedSubmit();
    else if (method === 'generate') handleGenerate();
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
        autoAssignToLearningDays={detectDates === true}
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
              {method === 'unified' ? (
                <>
                  <Text style={styles.intro}>{introCopy}</Text>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    value={generateNotes}
                    onChangeText={(value) => {
                      setGenerateNotes(value);
                      setRawText(value);
                    }}
                    placeholder={`e.g. 6th grade ${subjectName}, 12 weeks, include projects — or paste a unit outline`}
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={10}
                    scrollEnabled
                    style={[styles.input, styles.textAreaLarge]}
                    editable={!working}
                    {...(Platform.OS === 'web' && { cursor: 'text' })}
                  />
                  <EventAttachmentsField
                    key={materialReloadKey}
                    familyId={familyId}
                    selectedMaterialId={selectedMaterialId}
                    onMaterialChange={setSelectedMaterialId}
                    onAddNew={() => setShowAddMaterial(true)}
                    label="Material (optional)"
                    placeholder="Select or upload…"
                  />
                </>
              ) : null}

              {method === 'generate' ? (
                <>
                  <Text style={styles.intro}>{introCopy}</Text>
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
                <>
                  <Text style={styles.intro}>{introCopy}</Text>
                  <EventAttachmentsField
                    key={materialReloadKey}
                    familyId={familyId}
                    selectedMaterialId={selectedMaterialId}
                    onMaterialChange={setSelectedMaterialId}
                    onAddNew={() => setShowAddMaterial(true)}
                    label="Material"
                    placeholder="Select material…"
                  />
                </>
              ) : null}

              {method === 'paste_plain' ? (
                <>
                  <Text style={styles.intro}>{introCopy}</Text>
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
                style={showBack ? styles.backButton : styles.cancelButton}
                onPress={handleBack}
                disabled={working}
                {...(Platform.OS === 'web' && { cursor: working ? 'not-allowed' : 'pointer' })}
              >
                {showBack ? (
                  <>
                    <ChevronLeft size={20} color="#374151" strokeWidth={2.4} />
                    <Text style={styles.backText}>Back</Text>
                  </>
                ) : (
                  <Text style={styles.cancelText}>Cancel</Text>
                )}
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
                      {method === 'generate' || method === 'unified' ? 'Generate' : 'Continue'}
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
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  backButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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

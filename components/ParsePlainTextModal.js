/**
 * Parse Plain Text / Import & extract modal.
 * Extract structure from pasted syllabus/outline — no generation. Two-step: paste → extract → review → save.
 * Raw text is preserved in syllabus_imports; canonical curriculum_units/curriculum_lessons saved on commit.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { X, FileText, ChevronDown, ChevronUp, Save, AlertTriangle } from 'lucide-react';
import { STRINGS } from '../lib/i18n/strings';
import { parsePlainTextStream, commitParsedDraft } from '../lib/services/curriculumClient';
import { buildImportStreamPreviewDisplay } from '../lib/parseStreamHumanPreview';
import { useToast } from './Toast';
import { useModalStackElevation } from './hooks/useModalStackElevation';

const s = (path) => {
  const parts = path.split('.');
  let v = STRINGS;
  for (const p of parts) {
    v = v?.[p];
  }
  return typeof v === 'string' ? v : path;
};

const SOURCE_TYPES = [
  { value: 'auto_detect', labelKey: 'sourceTypeAuto' },
  { value: 'syllabus', labelKey: 'sourceTypeSyllabus' },
  { value: 'lesson_list', labelKey: 'sourceTypeLessonList' },
  { value: 'pacing_guide', labelKey: 'sourceTypePacingGuide' },
  { value: 'weekly_plan', labelKey: 'sourceTypeWeeklyPlan' },
  { value: 'course_outline', labelKey: 'sourceTypeCourseOutline' },
];

const PARSE_MODES = [
  { value: 'auto_detect', labelKey: 'parseModeAuto' },
  { value: 'unit_based', labelKey: 'parseModeUnitBased' },
  { value: 'lesson_based', labelKey: 'parseModeLessonBased' },
  { value: 'week_based', labelKey: 'parseModeWeekBased' },
  { value: 'date_based', labelKey: 'parseModeDateBased' },
];

export default function ParsePlainTextModal({
  visible,
  onClose,
  subjectId,
  subjectName,
  familyId,
  childIds = [],
  onSaved,
}) {
  const toast = useToast();
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible, 10002);
  const [step, setStep] = useState('form');
  const [parsing, setParsing] = useState(false);
  const [parseStreamPreview, setParseStreamPreview] = useState('');
  const [error, setError] = useState(null);
  const [rawText, setRawText] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceType, setSourceType] = useState('auto_detect');
  const [parseMode, setParseMode] = useState('auto_detect');
  const [detectDates, setDetectDates] = useState(true);
  const [preserveHeadings, setPreserveHeadings] = useState(true);
  const [ignorePolicyText, setIgnorePolicyText] = useState(true);
  const [extractAssignments, setExtractAssignments] = useState(true);
  const [extractAssessments, setExtractAssessments] = useState(true);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [draft, setDraft] = useState(null);
  const [expandedUnitIndex, setExpandedUnitIndex] = useState(0);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);

  const resetForm = useCallback(() => {
    setStep('form');
    setDraft(null);
    setError(null);
    setParsing(false);
    setExpandedUnitIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose?.();
  }, [onClose, resetForm]);

  const handleExtract = useCallback(async () => {
    if (!subjectId || !familyId || !subjectName) {
      setError('Subject and family context required.');
      return;
    }
    const text = (rawText || '').trim();
    if (!text) {
      setError(s('courseStructure.importExtract.noContent'));
      return;
    }
    setError(null);
    setParsing(true);
    setParseStreamPreview('');
    let streamed = '';
    try {
      const { data, error: err } = await parsePlainTextStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          raw_text: text,
          source_title: sourceTitle.trim() || null,
          source_type: sourceType === 'auto_detect' ? null : sourceType,
          parse_mode: parseMode === 'auto_detect' ? null : parseMode,
          detect_dates: detectDates,
          preserve_source_headings: preserveHeadings,
          ignore_policy_text: ignorePolicyText,
          extract_assignments: extractAssignments,
          extract_assessments: extractAssessments,
          special_instructions: specialInstructions.trim() || null,
        },
        {
          onDelta: (chunk) => {
            streamed += chunk;
            setParseStreamPreview(buildImportStreamPreviewDisplay(streamed));
          },
        }
      );
      if (err || !data) {
        setError(err?.message || s('courseStructure.importExtract.errorParse'));
        return;
      }
      setRawText(data.raw_text || rawText);
      setDraft(data);
      setStep('draft');
      setExpandedUnitIndex(0);
    } finally {
      setParseStreamPreview('');
      setParsing(false);
    }
  }, [
    subjectId,
    familyId,
    subjectName,
    rawText,
    sourceTitle,
    sourceType,
    parseMode,
    detectDates,
    preserveHeadings,
    ignorePolicyText,
    extractAssignments,
    extractAssessments,
    specialInstructions,
  ]);

  const updateDraftUnit = useCallback((unitIndex, field, value) => {
    setDraft((prev) => {
      if (!prev?.units) return prev;
      const units = [...prev.units];
      if (!units[unitIndex]) return prev;
      units[unitIndex] = { ...units[unitIndex], [field]: value };
      return { ...prev, units };
    });
  }, []);

  const updateDraftLesson = useCallback((unitIndex, lessonIndex, field, value) => {
    setDraft((prev) => {
      if (!prev?.units) return prev;
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons) return prev;
      const lessons = [...u.lessons];
      if (!lessons[lessonIndex]) return prev;
      lessons[lessonIndex] = { ...lessons[lessonIndex], [field]: value };
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft || !subjectId || !familyId || !subjectName) return;
    setStep('saving');
    setError(null);
    try {
      const { data, error: err } = await commitParsedDraft({
        subject_id: subjectId,
        family_id: familyId,
        subject_name: subjectName,
        draft,
      });
      if (err || !data) {
        setError(err?.message || s('courseStructure.importExtract.errorSave'));
        setStep('draft');
        return;
      }
      toast?.push(s('courseStructure.importExtract.saveSuccess'), 'success');
      onSaved?.();
      setTimeout(() => handleClose(), 1500);
    } catch (e) {
      setError(e?.message || s('courseStructure.importExtract.errorSave'));
      setStep('draft');
    }
  }, [draft, subjectId, familyId, subjectName, onSaved, toast, handleClose]);

  if (!visible) return null;

  const isFormStep = step === 'form';
  const isDraftStep = step === 'draft' || step === 'saving';
  const isSaveSuccess = step === 'save_success';
  const warnings = draft?.parser_warnings || [];
  const unassigned = draft?.unassigned_items || [];
  const ignored = draft?.ignored_items || [];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View ref={overlayRef} style={styles.overlay} collapsable={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlayInner}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FileText size={22} color="#475569" />
              <Text style={styles.title}>{s('courseStructure.importExtract.title')}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <Text style={styles.errorDismiss}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {isFormStep ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.helper}>{s('courseStructure.importExtract.helper')}</Text>
              <View style={styles.formGroup}>
                {!parsing ? (
                  <>
                    <Text style={styles.label}>{s('courseStructure.importExtract.pasteLabel')}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={rawText}
                      onChangeText={setRawText}
                      placeholder={s('courseStructure.importExtract.pastePlaceholder')}
                      placeholderTextColor="#9ca3af"
                      multiline
                      numberOfLines={10}
                      textAlignVertical="top"
                      editable
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>{s('courseStructure.importExtract.streamAssistantLabel')}</Text>
                    <View
                      style={[
                        styles.input,
                        styles.textArea,
                        {
                          padding: 14,
                          backgroundColor: '#f8fafc',
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                        },
                      ]}
                    >
                      <ScrollView
                        style={{ maxHeight: 132 }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                      >
                        <Text style={{ fontSize: 15, lineHeight: 22, color: '#0f172a' }}>
                          {parseStreamPreview ? parseStreamPreview : s('courseStructure.importExtract.streamWaiting')}
                        </Text>
                      </ScrollView>
                    </View>
                  </>
                )}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.importExtract.sourceTitleLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={sourceTitle}
                  onChangeText={setSourceTitle}
                  placeholder={s('courseStructure.importExtract.sourceTitlePlaceholder')}
                  placeholderTextColor="#9ca3af"
                  editable={!parsing}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.importExtract.sourceTypeLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={styles.chipRow}>
                    {SOURCE_TYPES.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.chip, sourceType === opt.value && styles.chipSelected]}
                        onPress={() => setSourceType(opt.value)}
                        disabled={parsing}
                      >
                        <Text style={[styles.chipText, sourceType === opt.value && styles.chipTextSelected]}>
                          {s(`courseStructure.importExtract.${opt.labelKey}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.importExtract.parseModeLabel')}</Text>
                <View style={styles.chipRow}>
                  {PARSE_MODES.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, parseMode === opt.value && styles.chipSelected]}
                      onPress={() => setParseMode(opt.value)}
                      disabled={parsing}
                    >
                      <Text style={[styles.chipText, parseMode === opt.value && styles.chipTextSelected]}>
                        {s(`courseStructure.importExtract.${opt.labelKey}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.importExtract.detectDates')}</Text>
                <Switch value={detectDates} onValueChange={setDetectDates} disabled={parsing} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.importExtract.preserveHeadings')}</Text>
                <Switch value={preserveHeadings} onValueChange={setPreserveHeadings} disabled={parsing} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.importExtract.ignorePolicyText')}</Text>
                <Switch value={ignorePolicyText} onValueChange={setIgnorePolicyText} disabled={parsing} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.importExtract.extractAssignments')}</Text>
                <Switch value={extractAssignments} onValueChange={setExtractAssignments} disabled={parsing} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.importExtract.extractAssessments')}</Text>
                <Switch value={extractAssessments} onValueChange={setExtractAssessments} disabled={parsing} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.importExtract.specialInstructionsLabel')}</Text>
                <TextInput
                  style={[styles.input, styles.textAreaSmall]}
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  placeholder={s('courseStructure.importExtract.specialInstructionsPlaceholder')}
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!parsing}
                />
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.primaryButton, parsing && styles.primaryButtonDisabled]}
                  onPress={handleExtract}
                  disabled={parsing}
                >
                  {parsing ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>{s('courseStructure.importExtract.extracting')}</Text>
                    </>
                  ) : (
                    <Text style={styles.primaryButtonText}>{s('courseStructure.importExtract.extractButton')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewTitle}>{s('courseStructure.importExtract.reviewTitle')}</Text>
                <Text style={styles.reviewSubtitle}>{s('courseStructure.importExtract.reviewSubtitle')}</Text>
              </View>
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {warnings.length > 0 && (
                  <View style={styles.warningsBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <AlertTriangle size={18} color="#d97706" />
                      <Text style={styles.warningsTitle}>{s('courseStructure.importExtract.warnings')}</Text>
                    </View>
                    {warnings.map((w, i) => (
                      <Text key={i} style={styles.warningItem}>{w}</Text>
                    ))}
                  </View>
                )}
                {unassigned.length > 0 && (
                  <View style={styles.collapsible}>
                    <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setShowUnassigned(!showUnassigned)}>
                      {showUnassigned ? <ChevronUp size={18} color="#6b7280" /> : <ChevronDown size={18} color="#6b7280" />}
                      <Text style={styles.collapsibleTitle}>{s('courseStructure.importExtract.unassignedItems')}</Text>
                      <Text style={styles.collapsibleCount}>{unassigned.length}</Text>
                    </TouchableOpacity>
                    {showUnassigned && (
                      <View style={styles.collapsibleBody}>
                        {unassigned.map((item, i) => (
                          <Text key={i} style={styles.unassignedRaw}>{(item.raw_text || item.title || '').slice(0, 120)}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                {ignored.length > 0 && (
                  <View style={styles.collapsible}>
                    <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setShowIgnored(!showIgnored)}>
                      {showIgnored ? <ChevronUp size={18} color="#6b7280" /> : <ChevronDown size={18} color="#6b7280" />}
                      <Text style={styles.collapsibleTitle}>{s('courseStructure.importExtract.ignoredItems')}</Text>
                      <Text style={styles.collapsibleCount}>{ignored.length}</Text>
                    </TouchableOpacity>
                    {showIgnored && (
                      <View style={styles.collapsibleBody}>
                        {ignored.map((item, i) => (
                          <Text key={i} style={styles.ignoredRaw}>
                            {(typeof item === 'object' ? item.raw_text : item)?.slice(0, 100)} — {(typeof item === 'object' ? item.reason : '') || 'ignored'}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                {(draft?.units || []).map((unit, uIdx) => (
                  <View key={unit.temp_id || uIdx} style={styles.unitCard}>
                    <TouchableOpacity
                      style={styles.unitHeader}
                      onPress={() => setExpandedUnitIndex(expandedUnitIndex === uIdx ? -1 : uIdx)}
                      activeOpacity={0.8}
                    >
                      {expandedUnitIndex === uIdx ? <ChevronUp size={20} color="#6b7280" /> : <ChevronDown size={20} color="#6b7280" />}
                      <Text style={styles.unitHeaderTitle}>{unit.title || `Unit ${uIdx + 1}`}</Text>
                    </TouchableOpacity>
                    {expandedUnitIndex === uIdx && (
                      <View style={styles.unitBody}>
                        <View style={styles.formGroup}>
                          <Text style={styles.label}>Unit title</Text>
                          <TextInput
                            style={styles.input}
                            value={unit.title}
                            onChangeText={(v) => updateDraftUnit(uIdx, 'title', v)}
                            editable={step === 'draft'}
                          />
                        </View>
                        {(unit.lessons || []).map((lesson, lIdx) => (
                          <View key={lesson.temp_id || lIdx} style={styles.lessonRow}>
                            <Text style={styles.lessonIndex}>{lIdx + 1}.</Text>
                            <View style={{ flex: 1 }}>
                              <TextInput
                                style={[styles.input, styles.lessonTitleInput, { marginBottom: 6 }]}
                                value={lesson.title}
                                onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'title', v)}
                                editable={step === 'draft'}
                              />
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={[styles.smallLabel, { fontSize: 11, color: '#6b7280' }]}>Reference date:</Text>
                                {Platform.OS === 'web' ? (
                                  <input
                                    type="date"
                                    value={lesson.reference_date || lesson.suggested_date || lesson.date_text || ''}
                                    onChange={(e) => updateDraftLesson(uIdx, lIdx, 'reference_date', e.target.value || null)}
                                    disabled={step !== 'draft'}
                                    style={{
                                      flex: 1,
                                      maxWidth: 140,
                                      padding: '6px',
                                      borderRadius: '6px',
                                      border: '1px solid #d1d5db',
                                      fontSize: '12px',
                                      backgroundColor: step === 'draft' ? '#fff' : '#f3f4f6',
                                    }}
                                  />
                                ) : (
                                  <TextInput
                                    style={[styles.input, { flex: 1, maxWidth: 140, paddingVertical: 6, fontSize: 12 }]}
                                    value={lesson.reference_date || lesson.suggested_date || lesson.date_text || ''}
                                    onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'reference_date', v || null)}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor="#9ca3af"
                                    editable={step === 'draft'}
                                  />
                                )}
                                <Text style={[styles.smallLabel, { fontSize: 10, color: '#9ca3af' }]}>Connects to planner</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
              <View style={styles.footer}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => { setStep('form'); setDraft(null); }}>
                  <Text style={styles.secondaryButtonText}>{s('courseStructure.importExtract.backToForm')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, step === 'saving' && styles.primaryButtonDisabled]}
                  onPress={handleSave}
                  disabled={step === 'saving' || !(draft?.units?.length > 0)}
                >
                  {step === 'saving' ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>{s('courseStructure.importExtract.saving')}</Text>
                    </>
                  ) : (
                    <>
                      <Save size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>{s('courseStructure.importExtract.saveExtracted')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' && { zIndex: 10002 }) },
  overlayInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 16, maxWidth: 560, width: '100%', maxHeight: '90%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 18, fontWeight: '600', color: '#111827' },
  helper: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca' },
  errorText: { fontSize: 14, color: '#b91c1c', flex: 1 },
  errorDismiss: { fontSize: 14, color: '#5b21b6', fontWeight: '500' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 24 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#fff' },
  textArea: { minHeight: 160 },
  textAreaSmall: { minHeight: 56 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipSelected: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#0369a1', fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  switchLabel: { fontSize: 14, color: '#374151' },
  actions: { marginTop: 8 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0ea5e9', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  secondaryButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
  secondaryButtonText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  reviewHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  reviewTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  reviewSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  warningsBox: { marginBottom: 16, padding: 12, backgroundColor: '#fffbeb', borderRadius: 8, borderWidth: 1, borderColor: '#fcd34d' },
  warningsTitle: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  warningItem: { fontSize: 13, color: '#78350f', marginTop: 4 },
  collapsible: { marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', gap: 8 },
  collapsibleTitle: { fontSize: 14, fontWeight: '500', color: '#374151', flex: 1 },
  collapsibleCount: { fontSize: 13, color: '#6b7280' },
  collapsibleBody: { padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  unassignedRaw: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  ignoredRaw: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  unitCard: { marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' },
  unitHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', gap: 8 },
  unitHeaderTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  unitBody: { padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lessonIndex: { fontSize: 14, color: '#6b7280', minWidth: 24 },
  lessonTitleInput: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12 },
});

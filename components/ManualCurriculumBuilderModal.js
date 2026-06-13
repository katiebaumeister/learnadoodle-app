/**
 * Manual Curriculum Builder (Add unit manually).
 * No AI; draft is built and edited entirely on the frontend, then committed via commit-manual-draft.
 * Saves to canonical curriculum_units and curriculum_lessons (source_type=manual).
 * Future scheduling can consume these lessons to fill plan slots or create events.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  KeyboardAvoidingView,
} from 'react-native';
import { X, Plus, Trash2, ChevronUp, ChevronDown, Sparkles, List } from 'lucide-react';
import { STRINGS } from '../lib/i18n/strings';
import { commitManualDraft, fetchSubjectCurriculumEventsStructure } from '../lib/services/curriculumClient';
import { draftFromCurriculumStructure } from '../lib/subjectUnitsEditorDraft';
import { useToast } from './Toast';
import { useModalStackElevation } from './hooks/useModalStackElevation';

const s = (path) => {
  const parts = path.split('.');
  let v = STRINGS;
  for (const p of parts) v = v?.[p];
  return typeof v === 'string' ? v : path;
};

const LESSON_TYPES = ['lesson', 'project', 'exam', 'assignment', 'activity'];

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const emptyUnit = (seq = 1) => ({
  temp_id: tempId(),
  title: `Unit ${seq}`,
  description: null,
  sequence_index: seq,
  inferred: false,
  lessons: [],
});

const emptyLesson = (seq = 1, type = 'lesson') => ({
  temp_id: tempId(),
  title: type === 'assignment' ? `Assignment ${seq}` : `Lesson ${seq}`,
  objective: null,
  notes: null,
  sequence_index: seq,
  minutes_est: 60,
  modality: null,
  lesson_type: type,
  materials: null,
  is_placeholder: false,
  cadence_metadata: null,
  reference_date: null, // Optional date from reference syllabus (YYYY-MM-DD)
});

export default function ManualCurriculumBuilderModal({
  visible,
  onClose,
  subjectId,
  subjectName,
  familyId,
  onSaved,
  loadExisting = false,
  academicYearId = null,
  replaceExisting = false,
  createCalendarEvents = false,
  headerTitle = null,
}) {
  const toast = useToast();
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible, 10002);
  const [draft, setDraft] = useState({ title: null, units: [emptyUnit(1)] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedUnitIndex, setExpandedUnitIndex] = useState(0);
  const [loadedExisting, setLoadedExisting] = useState(false);

  const resetDraft = useCallback(() => {
    setDraft({ title: null, units: [emptyUnit(1)] });
    setError(null);
    setExpandedUnitIndex(0);
    setLoadedExisting(false);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    if (!loadExisting || !familyId || !subjectId) {
      resetDraft();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await fetchSubjectCurriculumEventsStructure(
          familyId,
          subjectId,
          academicYearId
        );
        if (cancelled) return;
        if (fetchError) {
          resetDraft();
          return;
        }
        const mapped = draftFromCurriculumStructure(data);
        if (mapped?.units?.length) {
          setDraft(mapped);
          setExpandedUnitIndex(0);
          setLoadedExisting(true);
        } else {
          resetDraft();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, loadExisting, familyId, subjectId, academicYearId, resetDraft]);

  const handleClose = useCallback(() => {
    resetDraft();
    onClose?.();
  }, [onClose, resetDraft]);

  const addUnit = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      units: [...prev.units, emptyUnit(prev.units.length + 1)],
    }));
    setExpandedUnitIndex(draft.units.length);
  }, [draft.units.length]);

  const updateUnit = useCallback((unitIndex, field, value) => {
    setDraft((prev) => {
      const units = [...prev.units];
      if (!units[unitIndex]) return prev;
      units[unitIndex] = { ...units[unitIndex], [field]: value };
      return { ...prev, units };
    });
  }, []);

  const deleteUnit = useCallback((unitIndex) => {
    setDraft((prev) => {
      if (prev.units.length <= 1) return prev;
      const units = prev.units.filter((_, i) => i !== unitIndex);
      return { ...prev, units };
    });
    setExpandedUnitIndex((i) => (i >= unitIndex && i > 0 ? i - 1 : i));
  }, []);

  const addLesson = useCallback((unitIndex, lessonType = 'lesson') => {
    setDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u) return prev;
      const lessons = [...(u.lessons || [])];
      const seq = lessons.length + 1;
      lessons.push(emptyLesson(seq, lessonType));
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, []);

  const updateLesson = useCallback((unitIndex, lessonIndex, field, value) => {
    setDraft((prev) => {
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

  const deleteLesson = useCallback((unitIndex, lessonIndex) => {
    setDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons || u.lessons.length <= 1) return prev;
      const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, []);

  const moveLesson = useCallback((unitIndex, lessonIndex, dir) => {
    setDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons) return prev;
      const lessons = [...u.lessons];
      const j = lessonIndex + dir;
      if (j < 0 || j >= lessons.length) return prev;
      [lessons[lessonIndex], lessons[j]] = [lessons[j], lessons[lessonIndex]];
      lessons.forEach((le, i) => { le.sequence_index = i + 1; });
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!subjectId || !familyId || !subjectName) return;
    const hasUnits = draft.units?.length > 0;
    const allHaveLessons = draft.units?.every((u) => u.lessons?.length > 0);
    const allTitles = draft.units?.every((u) => (u.title || '').trim());
    const allLessonTitles = draft.units?.every((u) => u.lessons?.every((l) => (l.title || '').trim()));
    if (!hasUnits || !allHaveLessons || !allTitles || !allLessonTitles) {
      setError(s('courseStructure.manualBuilder.unitNeedsLesson'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        subject_id: subjectId,
        family_id: familyId,
        subject_name: subjectName,
        builder_mode: 'rich_units',
        draft: {
          title: draft.title,
          units: draft.units.map((u, i) => ({
            temp_id: u.temp_id,
            title: (u.title || '').trim() || `Unit ${i + 1}`,
            description: (u.description || '').trim() || null,
            sequence_index: i + 1,
            inferred: !!u.inferred,
            lessons: (u.lessons || []).map((le, j) => {
              const cadence = le.cadence_metadata || {};
              if (le.reference_date) {
                cadence.reference_date = le.reference_date;
              }
              return {
                temp_id: le.temp_id,
                title: (le.title || '').trim() || `Lesson ${j + 1}`,
                objective: (le.objective || '').trim() || null,
                notes: (le.notes || '').trim() || null,
                sequence_index: j + 1,
              minutes_est: le.minutes_est ?? 60,
              modality: le.modality || null,
              lesson_type: (le.lesson_type === 'exam' ? 'assessment' : le.lesson_type) || 'lesson',
              materials: le.materials || null,
                is_placeholder: !!le.is_placeholder,
                cadence_metadata: Object.keys(cadence).length > 0 ? cadence : null,
              };
            }),
          })),
        },
        replace_existing: replaceExisting || loadedExisting,
        create_calendar_events: createCalendarEvents,
      };
      if (academicYearId) {
        payload.academic_year_id = academicYearId;
      }
      const { data, err } = await commitManualDraft(payload);
      if (err || !data) {
        setError(err?.message || s('courseStructure.manualBuilder.errorSave'));
        return;
      }
      toast?.push(s('courseStructure.manualBuilder.saveSuccess'), 'success');
      onSaved?.();
      setTimeout(handleClose, 1200);
    } catch (e) {
      setError(e?.message || s('courseStructure.manualBuilder.errorSave'));
    } finally {
      setSaving(false);
    }
  }, [draft, subjectId, familyId, subjectName, onSaved, toast, handleClose, replaceExisting, loadedExisting, createCalendarEvents, academicYearId]);

  const displayTitle = headerTitle
    || (loadedExisting ? `Edit units — ${subjectName || 'Subject'}` : s('courseStructure.manualBuilder.title'));

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View ref={overlayRef} style={styles.overlay} collapsable={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlayInner}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <List size={22} color="#475569" />
              <Text style={styles.title}>{displayTitle}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#6BB3E8" />
              <Text style={styles.loadingText}>Loading units…</Text>
            </View>
          ) : null}
          {!loading && error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}><Text style={styles.errorDismiss}>Dismiss</Text></TouchableOpacity>
            </View>
          ) : null}

          {!loading ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={{ padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#bae6fd' }}>
              <Text style={{ fontSize: 12, color: '#0369a1', lineHeight: 16 }}>
                <Text style={{ fontWeight: '600' }}>Tip:</Text> Add optional reference dates from your syllabus to see how units correlate to your planner.
              </Text>
            </View>
              {(draft.units || []).map((unit, uIdx) => (
                <View key={unit.temp_id || uIdx} style={styles.unitCard}>
                  <View style={styles.unitHeader}>
                    <TouchableOpacity onPress={() => setExpandedUnitIndex(expandedUnitIndex === uIdx ? -1 : uIdx)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Text style={styles.unitHeaderTitle}>{unit.title || `Unit ${uIdx + 1}`}</Text>
                      <Text style={styles.lessonCount}>({(unit.lessons || []).length})</Text>
                    </TouchableOpacity>
                    {draft.units.length > 1 && (
                      <TouchableOpacity onPress={() => deleteUnit(uIdx)}><Trash2 size={18} color="#ef4444" /></TouchableOpacity>
                    )}
                  </View>
                  {expandedUnitIndex === uIdx && (
                    <View style={styles.unitBody}>
                      <View style={styles.formGroup}>
                        <Text style={styles.label}>{s('courseStructure.manualBuilder.unitTitle')}</Text>
                        <TextInput style={styles.input} value={unit.title} onChangeText={(v) => updateUnit(uIdx, 'title', v)} />
                      </View>
                      <View style={styles.formGroup}>
                        <Text style={styles.label}>{s('courseStructure.manualBuilder.unitDescription')}</Text>
                        <TextInput style={[styles.input, styles.textAreaSmall]} value={unit.description || ''} onChangeText={(v) => updateUnit(uIdx, 'description', v)} multiline numberOfLines={2} />
                      </View>
                      <View style={styles.lessonActions}>
                        <TouchableOpacity style={styles.smallButton} onPress={() => addLesson(uIdx, 'lesson')}>
                          <Plus size={14} color="#0ea5e9" /><Text style={styles.smallButtonText}>Break it down further</Text>
                        </TouchableOpacity>
                      </View>
                      {(unit.lessons || []).map((lesson, lIdx) => (
                        <View key={lesson.temp_id || lIdx} style={styles.lessonRow}>
                          <View style={styles.lessonMain}>
                            <TextInput style={[styles.input, styles.lessonTitleInput]} value={lesson.title} onChangeText={(v) => updateLesson(uIdx, lIdx, 'title', v)} placeholder={s('courseStructure.manualBuilder.lessonTitle')} placeholderTextColor="#9ca3af" />
                            <View style={styles.lessonMeta}>
                              <View>
                                <Text style={styles.smallLabel}>Duration (min)</Text>
                                <TextInput style={[styles.input, { width: 70 }]} value={String(lesson.minutes_est ?? 60)} onChangeText={(v) => updateLesson(uIdx, lIdx, 'minutes_est', v ? parseInt(v, 10) : null)} keyboardType="number-pad" placeholder="Min" placeholderTextColor="#9ca3af" />
                              </View>
                              <View>
                                <Text style={styles.smallLabel}>Reference date (optional)</Text>
                                {Platform.OS === 'web' ? (
                                  <input
                                    type="date"
                                    value={lesson.reference_date || ''}
                                    onChange={(e) => updateLesson(uIdx, lIdx, 'reference_date', e.target.value || null)}
                                    style={{
                                      width: 120,
                                      padding: '8px',
                                      borderRadius: '8px',
                                      border: '1px solid #d1d5db',
                                      fontSize: '14px',
                                      backgroundColor: '#fff',
                                    }}
                                  />
                                ) : (
                                  <TextInput
                                    style={[styles.input, { width: 120 }]}
                                    value={lesson.reference_date || ''}
                                    onChangeText={(v) => updateLesson(uIdx, lIdx, 'reference_date', v || null)}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor="#9ca3af"
                                  />
                                )}
                                <Text style={[styles.smallLabel, { fontSize: 10, color: '#9ca3af', marginTop: 2 }]}>From syllabus; connects to planner</Text>
                              </View>
                              <View style={styles.typeWrap}>
                                <Text style={styles.smallLabel}>{s('courseStructure.manualBuilder.lessonType')}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                  <View style={styles.chipRow}>
                                    {LESSON_TYPES.map((t) => (
                                      <TouchableOpacity key={t} style={[styles.miniChip, (lesson.lesson_type || 'lesson') === t && styles.chipSelected]} onPress={() => updateLesson(uIdx, lIdx, 'lesson_type', t)}>
                                        <Text style={[styles.miniChipText, (lesson.lesson_type || 'lesson') === t && styles.chipTextSelected]}>{t}</Text>
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                </ScrollView>
                              </View>
                            </View>
                          </View>
                          <View style={styles.lessonActionsRow}>
                            <TouchableOpacity onPress={() => moveLesson(uIdx, lIdx, -1)} disabled={lIdx === 0}><ChevronUp size={18} color={lIdx === 0 ? '#ccc' : '#6b7280'} /></TouchableOpacity>
                            <TouchableOpacity onPress={() => moveLesson(uIdx, lIdx, 1)} disabled={lIdx === (unit.lessons?.length || 0) - 1}><ChevronDown size={18} color={lIdx === (unit.lessons?.length || 0) - 1 ? '#ccc' : '#6b7280'} /></TouchableOpacity>
                            {unit.lessons?.length > 1 && <TouchableOpacity onPress={() => deleteLesson(uIdx, lIdx)}><Trash2 size={16} color="#ef4444" /></TouchableOpacity>}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            <TouchableOpacity style={styles.addUnitButton} onPress={addUnit}>
              <Plus size={18} color="#0ea5e9" />
              <Text style={styles.addUnitButtonText}>{s('courseStructure.manualBuilder.addUnit')}</Text>
            </TouchableOpacity>
            </ScrollView>
          ) : null}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving || loading || !draft.units?.length || !draft.units.every((u) => u.lessons?.length > 0)}
            >
              {saving ? (
                <><ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /><Text style={styles.primaryButtonText}>{s('courseStructure.manualBuilder.saving')}</Text></>
              ) : (
                <><Sparkles size={16} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.primaryButtonText}>{s('courseStructure.manualBuilder.saveCurriculum')}</Text></>
              )}
            </TouchableOpacity>
          </View>
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
  errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca' },
  errorText: { fontSize: 14, color: '#b91c1c', flex: 1 },
  errorDismiss: { fontSize: 14, color: '#5b21b6', fontWeight: '500' },
  modeSection: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modeLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 12 },
  modeCard: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  modeCardSelected: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  modeCardTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  modeCardTitleSelected: { color: '#0369a1' },
  modeCardDesc: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 24 },
  formGroup: { marginBottom: 16 },
  formRow: { flexDirection: 'row', gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  smallLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#fff' },
  textAreaSmall: { minHeight: 56 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipSelected: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#0369a1', fontWeight: '500' },
  miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#f3f4f6' },
  miniChipText: { fontSize: 12, color: '#374151' },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6BB3E8', paddingHorizontal: 18, borderRadius: 16 },
  primaryButtonDisabled: { backgroundColor: '#B7BFCD' },
  primaryButtonText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  secondaryButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignSelf: 'flex-start', marginBottom: 12 },
  secondaryButtonText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  addUnitButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd', borderStyle: 'dashed', marginBottom: 16 },
  addUnitButtonText: { fontSize: 14, color: '#0369a1', fontWeight: '500' },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#f0f9ff', marginRight: 8 },
  smallButtonText: { fontSize: 13, color: '#0369a1' },
  unitCard: { marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' },
  unitHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb' },
  unitHeaderTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  lessonCount: { fontSize: 13, color: '#6b7280' },
  unitBody: { padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  lessonActions: { flexDirection: 'row', marginBottom: 12 },
  lessonRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  lessonMain: { flex: 1 },
  lessonTitleInput: { marginBottom: 6 },
  lessonMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeWrap: { flex: 1 },
  lessonActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12 },
  loadingWrap: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748B' },
});

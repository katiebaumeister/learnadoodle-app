/**
 * Generate Curriculum Modal
 * AI-generated curriculum from scratch: form → generate draft → review/edit → save.
 * Does not schedule lessons to calendar; only persists curriculum_units and curriculum_lessons.
 * Scheduling integration can hook into saved curriculum later.
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
import { X, BookOpen, ChevronDown, ChevronUp, Plus, Trash2, Save } from 'lucide-react';
import { STRINGS } from '../lib/i18n/strings';
import { generateCurriculumDraft, commitGeneratedDraft } from '../lib/services/curriculumClient';
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

const DURATION_OPTIONS = [
  { value: 'single_unit', labelKey: 'durationSingleUnit' },
  { value: 'multi_unit_course', labelKey: 'durationMultiUnit' },
  { value: 'semester', labelKey: 'durationSemester' },
  { value: 'full_year', labelKey: 'durationFullYear' },
  { value: 'custom_weeks', labelKey: 'durationCustomWeeks' },
];

const LEARNER_STAGE_OPTIONS = ['K–2', '3–5', '6–8', '9–12', 'Custom'];
const MODALITY_OPTIONS = ['reading', 'video', 'hands_on', 'discussion', 'practice', 'quiz', 'project'];
const LESSON_TYPE_OPTIONS = ['lesson', 'project', 'assessment', 'review', 'fieldwork', 'activity'];

export default function GenerateCurriculumModal({
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

  // Step: 'form' | 'draft' | 'saving' | 'save_success'
  const [step, setStep] = useState('form');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [generationScope, setGenerationScope] = useState('');
  const [learnerStage, setLearnerStage] = useState('');
  const [durationMode, setDurationMode] = useState('multi_unit_course');
  const [customWeeks, setCustomWeeks] = useState('');
  const [lessonCountTarget, setLessonCountTarget] = useState('');
  const [typicalLessonMinutes, setTypicalLessonMinutes] = useState('45');
  const [educationalStyle, setEducationalStyle] = useState('');
  const [rigorLevel, setRigorLevel] = useState('standard');
  const [includeAssessments, setIncludeAssessments] = useState(true);
  const [includeProjects, setIncludeProjects] = useState(true);
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [includePacing, setIncludePacing] = useState(true);
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Draft state (after generation); editable
  const [draft, setDraft] = useState(null);
  const [expandedUnitIndex, setExpandedUnitIndex] = useState(0);

  const resetForm = useCallback(() => {
    setStep('form');
    setDraft(null);
    setError(null);
    setGenerating(false);
    setExpandedUnitIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose?.();
  }, [onClose, resetForm]);

  const handleGenerate = useCallback(async () => {
    if (!subjectId || !familyId || !subjectName) {
      setError('Subject and family context required.');
      return;
    }
    const scope = (generationScope || '').trim();
    if (!scope) {
      setError('Please enter a scope or course goal.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const { data, error: err } = await generateCurriculumDraft({
        subject_id: subjectId,
        family_id: familyId,
        subject_name: subjectName,
        child_ids: childIds?.length ? childIds : null,
        learner_stage: learnerStage.trim() || null,
        generation_scope: scope,
        duration_mode: durationMode,
        custom_weeks: customWeeks ? parseInt(customWeeks, 10) : null,
        lesson_count_target: lessonCountTarget ? parseInt(lessonCountTarget, 10) : null,
        typical_lesson_minutes: typicalLessonMinutes ? parseInt(typicalLessonMinutes, 10) : null,
        educational_style: educationalStyle.trim() || null,
        rigor_level: rigorLevel,
        include_assessments: includeAssessments,
        include_projects: includeProjects,
        include_materials: includeMaterials,
        include_pacing: includePacing,
        special_instructions: specialInstructions.trim() || null,
      });
      if (err || !data) {
        setError(err?.message || s('courseStructure.generateCurriculum.errorGenerate'));
        return;
      }
      setDraft(data);
      setStep('draft');
      setExpandedUnitIndex(0);
    } finally {
      setGenerating(false);
    }
  }, [
    subjectId,
    familyId,
    subjectName,
    childIds,
    generationScope,
    learnerStage,
    durationMode,
    customWeeks,
    lessonCountTarget,
    typicalLessonMinutes,
    educationalStyle,
    rigorLevel,
    includeAssessments,
    includeProjects,
    includeMaterials,
    includePacing,
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

  const deleteDraftLesson = useCallback((unitIndex, lessonIndex) => {
    setDraft((prev) => {
      if (!prev?.units) return prev;
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons) return prev;
      const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
      if (lessons.length === 0) return prev;
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, []);

  const addDraftLesson = useCallback((unitIndex) => {
    setDraft((prev) => {
      if (!prev?.units) return prev;
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u) return prev;
      const lessons = [...(u.lessons || [])];
      const newLesson = {
        temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: 'New lesson',
        objective: null,
        notes: null,
        sequence_index: lessons.length + 1,
        minutes_est: 60,
        modality: 'practice',
        lesson_type: 'lesson',
        materials: [],
        assessment_idea: null,
        pacing_suggestion: null,
        difficulty: 'standard',
      };
      lessons.push(newLesson);
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, []);

  const deleteDraftUnit = useCallback((unitIndex) => {
    setDraft((prev) => {
      if (!prev?.units || prev.units.length <= 1) return prev;
      const units = prev.units.filter((_, i) => i !== unitIndex);
      return { ...prev, units };
    });
    setExpandedUnitIndex((i) => (i >= unitIndex && i > 0 ? i - 1 : i));
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft || !subjectId || !familyId || !subjectName) return;
    setStep('saving');
    setError(null);
    try {
      const { data, error: err } = await commitGeneratedDraft({
        subject_id: subjectId,
        family_id: familyId,
        subject_name: subjectName,
        draft,
      });
      if (err || !data) {
        setError(err?.message || s('courseStructure.generateCurriculum.errorSave'));
        setStep('draft');
        return;
      }
      setStep('save_success');
      toast?.push(s('courseStructure.generateCurriculum.saveSuccess'), 'success');
      onSaved?.();
      setTimeout(() => handleClose(), 1500);
    } catch (e) {
      setError(e?.message || s('courseStructure.generateCurriculum.errorSave'));
      setStep('draft');
    }
  }, [draft, subjectId, familyId, subjectName, onSaved, toast, handleClose]);

  if (!visible) return null;

  const isFormStep = step === 'form';
  const isDraftStep = step === 'draft' || step === 'saving';
  const isSaveSuccess = step === 'save_success';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View ref={overlayRef} style={styles.overlay} collapsable={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlayInner}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleClose}
          />
          <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BookOpen size={22} color="#5b21b6" />
              <Text style={styles.title}>{s('courseStructure.generateCurriculum.title')}</Text>
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

          {isSaveSuccess ? (
            <View style={styles.successBlock}>
              <Text style={styles.successText}>{s('courseStructure.generateCurriculum.saveSuccess')}</Text>
              <Text style={styles.successSub}>You can close this window.</Text>
            </View>
          ) : isFormStep ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.generateCurriculum.scopeLabel')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={generationScope}
                  onChangeText={setGenerationScope}
                  placeholder={s('courseStructure.generateCurriculum.scopePlaceholder')}
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!generating}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.generateCurriculum.learnerStageLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={learnerStage}
                  onChangeText={setLearnerStage}
                  placeholder={s('courseStructure.generateCurriculum.learnerStageOptions')}
                  placeholderTextColor="#9ca3af"
                  editable={!generating}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.generateCurriculum.durationLabel')}</Text>
                <View style={styles.chipRow}>
                  {DURATION_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, durationMode === opt.value && styles.chipSelected]}
                      onPress={() => setDurationMode(opt.value)}
                      disabled={generating}
                    >
                      <Text style={[styles.chipText, durationMode === opt.value && styles.chipTextSelected]}>
                        {s(`courseStructure.generateCurriculum.${opt.labelKey}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {durationMode === 'custom_weeks' && (
                  <TextInput
                    style={[styles.input, { marginTop: 8, width: 80 }]}
                    value={customWeeks}
                    onChangeText={setCustomWeeks}
                    placeholder={s('courseStructure.generateCurriculum.customWeeksPlaceholder')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                    editable={!generating}
                  />
                )}
              </View>
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{s('courseStructure.generateCurriculum.lessonCountLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={lessonCountTarget}
                    onChangeText={setLessonCountTarget}
                    placeholder={s('courseStructure.generateCurriculum.lessonCountPlaceholder')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                    editable={!generating}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{s('courseStructure.generateCurriculum.lessonMinutesLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={typicalLessonMinutes}
                    onChangeText={setTypicalLessonMinutes}
                    placeholder={s('courseStructure.generateCurriculum.lessonMinutesPlaceholder')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                    editable={!generating}
                  />
                </View>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.generateCurriculum.styleLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={educationalStyle}
                  onChangeText={setEducationalStyle}
                  placeholder={s('courseStructure.generateCurriculum.stylePlaceholder')}
                  placeholderTextColor="#9ca3af"
                  editable={!generating}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.generateCurriculum.rigorLabel')}</Text>
                <View style={styles.chipRow}>
                  {['gentle', 'standard', 'advanced'].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, rigorLevel === r && styles.chipSelected]}
                      onPress={() => setRigorLevel(r)}
                      disabled={generating}
                    >
                      <Text style={[styles.chipText, rigorLevel === r && styles.chipTextSelected]}>
                        {s(`courseStructure.generateCurriculum.rigor${r.charAt(0).toUpperCase() + r.slice(1)}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.generateCurriculum.includeAssessments')}</Text>
                <Switch value={includeAssessments} onValueChange={setIncludeAssessments} disabled={generating} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.generateCurriculum.includeProjects')}</Text>
                <Switch value={includeProjects} onValueChange={setIncludeProjects} disabled={generating} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.generateCurriculum.includeMaterials')}</Text>
                <Switch value={includeMaterials} onValueChange={setIncludeMaterials} disabled={generating} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{s('courseStructure.generateCurriculum.includePacing')}</Text>
                <Switch value={includePacing} onValueChange={setIncludePacing} disabled={generating} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{s('courseStructure.generateCurriculum.specialInstructionsLabel')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  placeholder={s('courseStructure.generateCurriculum.specialInstructionsPlaceholder')}
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!generating}
                />
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.primaryButton, generating && styles.primaryButtonDisabled]}
                  onPress={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>{s('courseStructure.generateCurriculum.generating')}</Text>
                    </>
                  ) : (
                    <Text style={styles.primaryButtonText}>{s('courseStructure.generateCurriculum.generateButton')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewTitle}>{s('courseStructure.generateCurriculum.reviewTitle')}</Text>
                <Text style={styles.reviewSubtitle}>{s('courseStructure.generateCurriculum.reviewSubtitle')}</Text>
              </View>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                {draft?.course_title && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>{s('courseStructure.generateCurriculum.courseTitle')}</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.course_title}
                      onChangeText={(v) => setDraft((p) => (p ? { ...p, course_title: v } : p))}
                      editable={step === 'draft'}
                    />
                  </View>
                )}
                {draft?.units?.map((unit, uIdx) => (
                  <View key={unit.temp_id || uIdx} style={styles.unitCard}>
                    <TouchableOpacity
                      style={styles.unitHeader}
                      onPress={() => setExpandedUnitIndex(expandedUnitIndex === uIdx ? -1 : uIdx)}
                      activeOpacity={0.8}
                    >
                      {expandedUnitIndex === uIdx ? (
                        <ChevronUp size={20} color="#6b7280" />
                      ) : (
                        <ChevronDown size={20} color="#6b7280" />
                      )}
                      <Text style={styles.unitHeaderTitle}>
                        {unit.title || `Unit ${uIdx + 1}`}
                      </Text>
                      {draft.units.length > 1 && step === 'draft' && (
                        <TouchableOpacity
                          onPress={() => deleteDraftUnit(uIdx)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ marginLeft: 'auto' }}
                        >
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                    {expandedUnitIndex === uIdx && (
                      <View style={styles.unitBody}>
                        <View style={styles.formGroup}>
                          <Text style={styles.label}>{s('courseStructure.generateCurriculum.unitTitle')}</Text>
                          <TextInput
                            style={styles.input}
                            value={unit.title}
                            onChangeText={(v) => updateDraftUnit(uIdx, 'title', v)}
                            editable={step === 'draft'}
                          />
                        </View>
                        {unit.description != null && (
                          <View style={styles.formGroup}>
                            <Text style={styles.label}>{s('courseStructure.generateCurriculum.unitDescription')}</Text>
                            <TextInput
                              style={[styles.input, styles.textArea]}
                              value={unit.description || ''}
                              onChangeText={(v) => updateDraftUnit(uIdx, 'description', v)}
                              multiline
                              numberOfLines={2}
                              textAlignVertical="top"
                              editable={step === 'draft'}
                            />
                          </View>
                        )}
                        {(unit.lessons || []).map((lesson, lIdx) => (
                          <View key={lesson.temp_id || lIdx} style={styles.lessonCard}>
                            <View style={styles.lessonRow}>
                              <Text style={styles.lessonIndex}>{lIdx + 1}.</Text>
                              <TextInput
                                style={[styles.input, styles.lessonTitleInput]}
                                value={lesson.title}
                                onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'title', v)}
                                placeholder="Lesson title"
                                placeholderTextColor="#9ca3af"
                                editable={step === 'draft'}
                              />
                              {step === 'draft' && (unit.lessons?.length ?? 0) > 1 && (
                                <TouchableOpacity onPress={() => deleteDraftLesson(uIdx, lIdx)}>
                                  <Trash2 size={16} color="#ef4444" />
                                </TouchableOpacity>
                              )}
                            </View>
                            <View style={styles.formGroup}>
                              <Text style={styles.smallLabel}>{s('courseStructure.generateCurriculum.objective')}</Text>
                              <TextInput
                                style={[styles.input, styles.textAreaSmall]}
                                value={lesson.objective || ''}
                                onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'objective', v)}
                                multiline
                                numberOfLines={2}
                                textAlignVertical="top"
                                editable={step === 'draft'}
                              />
                            </View>
                            <View style={styles.lessonMetaRow}>
                              <View style={styles.lessonMeta}>
                                <Text style={styles.smallLabel}>{s('courseStructure.generateCurriculum.minutes')}</Text>
                                <TextInput
                                  style={[styles.input, { width: 56 }]}
                                  value={String(lesson.minutes_est ?? 60)}
                                  onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'minutes_est', v ? parseInt(v, 10) : null)}
                                  keyboardType="number-pad"
                                  editable={step === 'draft'}
                                />
                              </View>
                              <View style={styles.lessonMeta}>
                                <Text style={styles.smallLabel}>{s('courseStructure.generateCurriculum.modality')}</Text>
                                <TextInput
                                  style={[styles.input, { minWidth: 90 }]}
                                  value={lesson.modality || ''}
                                  onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'modality', v)}
                                  placeholder="e.g. practice"
                                  placeholderTextColor="#9ca3af"
                                  editable={step === 'draft'}
                                />
                              </View>
                              <View style={styles.lessonMeta}>
                                <Text style={styles.smallLabel}>{s('courseStructure.generateCurriculum.lessonType')}</Text>
                                <TextInput
                                  style={[styles.input, { minWidth: 90 }]}
                                  value={lesson.lesson_type || ''}
                                  onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'lesson_type', v)}
                                  placeholder="lesson"
                                  placeholderTextColor="#9ca3af"
                                  editable={step === 'draft'}
                                />
                              </View>
                            </View>
                            {lesson.assessment_idea != null && (
                              <View style={styles.formGroup}>
                                <Text style={styles.smallLabel}>{s('courseStructure.generateCurriculum.assessmentIdea')}</Text>
                                <TextInput
                                  style={[styles.input, styles.textAreaSmall]}
                                  value={lesson.assessment_idea || ''}
                                  onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'assessment_idea', v)}
                                  multiline
                                  numberOfLines={1}
                                  editable={step === 'draft'}
                                />
                              </View>
                            )}
                          </View>
                        ))}
                        {step === 'draft' && (
                          <TouchableOpacity style={styles.addLessonButton} onPress={() => addDraftLesson(uIdx)}>
                            <Plus size={18} color="#5b21b6" />
                            <Text style={styles.addLessonText}>{s('courseStructure.generateCurriculum.addLesson')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
              <View style={styles.footer}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => { setStep('form'); setDraft(null); }}>
                  <Text style={styles.secondaryButtonText}>{s('courseStructure.generateCurriculum.backToForm')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, step === 'saving' && styles.primaryButtonDisabled]}
                  onPress={handleSave}
                  disabled={step === 'saving'}
                >
                  {step === 'saving' ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>{s('courseStructure.generateCurriculum.saving')}</Text>
                    </>
                  ) : (
                    <>
                      <Save size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>{s('courseStructure.generateCurriculum.saveCurriculum')}</Text>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    ...(Platform.OS === 'web' && { zIndex: 10002 }),
  },
  overlayInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxWidth: 560,
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
  },
  errorText: { fontSize: 14, color: '#b91c1c', flex: 1 },
  errorDismiss: { fontSize: 14, color: '#5b21b6', fontWeight: '500' },
  successBlock: {
    padding: 32,
    alignItems: 'center',
  },
  successText: { fontSize: 16, fontWeight: '600', color: '#059669' },
  successSub: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 24 },
  formGroup: { marginBottom: 16 },
  formRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  smallLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
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
  textArea: { minHeight: 72 },
  textAreaSmall: { minHeight: 48 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: { backgroundColor: '#ede9fe', borderColor: '#5b21b6' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#5b21b6', fontWeight: '500' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  switchLabel: { fontSize: 14, color: '#374151' },
  actions: { marginTop: 8 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5b21b6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  reviewHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  reviewTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  reviewSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  unitCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
  },
  unitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    gap: 8,
  },
  unitHeaderTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  unitBody: { padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  lessonCard: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lessonIndex: { fontSize: 14, color: '#6b7280', minWidth: 24 },
  lessonTitleInput: { flex: 1 },
  lessonMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  lessonMeta: {},
  addLessonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c4b5fd',
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  addLessonText: { fontSize: 14, color: '#5b21b6', fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
});

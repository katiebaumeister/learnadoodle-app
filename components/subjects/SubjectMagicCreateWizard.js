/**
 * Step-through for subject magic Create CTAs:
 * 1) purpose → 2) dates → 3) compose (text + material) →
 *    subject plan: curriculum import/builder |
 *    assignment / lesson: create modals with prefilled content.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { X, Sparkles, ChevronLeft } from 'lucide-react';
import { useModalStackElevation } from '../hooks/useModalStackElevation';
import EventAttachmentsField from '../create/shared/EventAttachmentsField';
import AddMaterialModal from '../materials/AddMaterialModal';

const ACCENT = '#9ECFFB';

const PURPOSES = [
  {
    id: 'subject_plan',
    title: 'Full subject plan',
    subtitle: 'Draft units and lessons for this subject',
  },
  {
    id: 'assignment',
    title: 'Assignment',
    subtitle: 'Create one assignment (quiz, project, homework, etc.)',
  },
  {
    id: 'lesson',
    title: 'Single lesson',
    subtitle: 'Create single learning day',
  },
];

const DATE_OPTIONS = [
  {
    id: 'without_dates',
    title: 'Without dates',
    subtitle: 'Add to subject’s classwork, schedule later',
  },
  {
    id: 'with_dates',
    title: 'With dates',
    subtitle: 'Apply dates from source or fill dates using subject settings and openings in schedule',
  },
];

function ChoiceRow({ title, subtitle, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.choiceTextCol}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {subtitle ? <Text style={styles.choiceSubtitle}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function composePlaceholder(purpose, subjectName) {
  const subj = subjectName || 'this subject';
  if (purpose === 'assignment') {
    return `Describe the assignment for ${subj}, or paste an outline. You can also attach a material.`;
  }
  if (purpose === 'lesson') {
    return `Describe the learning day for ${subj}, or paste an outline. You can also attach a material.`;
  }
  return `e.g. 6th grade ${subj}, 12 weeks, include projects — or paste a unit outline. Attach a syllabus if you have one.`;
}

function composeTitle(purpose) {
  if (purpose === 'assignment') return 'Create assignment';
  if (purpose === 'lesson') return 'Create learning day';
  return 'Create classwork';
}

export default function SubjectMagicCreateWizard({
  visible,
  onClose,
  onContinue,
  onChatCompleted: _onChatCompleted,
  subjectName = 'Subject',
  familyId = null,
  subjectId = null,
  academicYearId: _academicYearId = null,
  childIds: _childIds = [],
  /** When returning from import, reopen on compose with prior choices. */
  resumeAt = null,
}) {
  const overlayRef = React.useRef(null);
  useModalStackElevation(overlayRef, visible, 10002);

  const [step, setStep] = useState(() => (
    Number.isFinite(resumeAt?.step) ? resumeAt.step : 0
  ));
  const [purpose, setPurpose] = useState(() => resumeAt?.purpose || 'subject_plan');
  const [datesMode, setDatesMode] = useState(() => (
    resumeAt?.withDates === true ? 'with_dates' : 'without_dates'
  ));
  const [notes, setNotes] = useState(() => (
    typeof resumeAt?.notes === 'string' ? resumeAt.notes : ''
  ));
  const [selectedMaterialId, setSelectedMaterialId] = useState(() => (
    resumeAt?.materialId != null ? String(resumeAt.materialId) : null
  ));
  const [materialReloadKey, setMaterialReloadKey] = useState(0);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep(0);
    setPurpose('subject_plan');
    setDatesMode('without_dates');
    setNotes('');
    setSelectedMaterialId(null);
    setMaterialReloadKey(0);
    setShowAddMaterial(false);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const inCompose = step === 2;

  const stepMeta = useMemo(() => {
    if (step === 0) return { title: 'What do you want to create?' };
    if (step === 1) return { title: 'Dates' };
    return { title: composeTitle(purpose) };
  }, [step, purpose]);

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(purpose);
    if (step === 1) return Boolean(datesMode);
    if (step === 2) {
      return Boolean(String(notes || '').trim() || selectedMaterialId);
    }
    return false;
  }, [step, purpose, datesMode, notes, selectedMaterialId]);

  const handlePrimary = async () => {
    if (!canContinue || submitting) return;
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    const withDates = datesMode === 'with_dates';
    setSubmitting(true);
    try {
      await Promise.resolve(onContinue?.({
        purpose,
        withDates,
        notes: String(notes || '').trim(),
        materialId: selectedMaterialId ? String(selectedMaterialId) : null,
      }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
        <View ref={overlayRef} style={styles.overlay} collapsable={false}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={[styles.shell, inCompose && styles.shellCompose]}>
            <View style={styles.header}>
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
              <Text style={styles.stepTitle}>{stepMeta.title}</Text>
              <View style={styles.stepDots}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === step && styles.dotActive,
                      i < step && styles.dotDone,
                    ]}
                  />
                ))}
              </View>

              {step === 0
                ? PURPOSES.map((opt) => (
                  <ChoiceRow
                    key={opt.id}
                    title={opt.title}
                    subtitle={opt.subtitle}
                    selected={purpose === opt.id}
                    onPress={() => setPurpose(opt.id)}
                  />
                ))
                : null}

              {step === 1
                ? DATE_OPTIONS.map((opt) => (
                  <ChoiceRow
                    key={opt.id}
                    title={opt.title}
                    subtitle={opt.subtitle}
                    selected={datesMode === opt.id}
                    onPress={() => setDatesMode(opt.id)}
                  />
                ))
                : null}

              {step === 2 ? (
                <View style={styles.composeBlock}>
                  <Text style={styles.intro}>
                    Add a description and/or attach a material (PDF, Word, text, or image). We&apos;ll draft from what you provide so you can review before saving.
                  </Text>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={composePlaceholder(purpose, subjectName)}
                    placeholderTextColor="#9ca3af"
                    multiline
                    scrollEnabled
                    editable={!submitting}
                    style={styles.textArea}
                    textAlignVertical="top"
                    {...(Platform.OS === 'web' && {
                      cursor: 'text',
                      outlineStyle: 'none',
                    })}
                  />
                  {familyId ? (
                    <View style={styles.attachBlock}>
                      <EventAttachmentsField
                        key={materialReloadKey}
                        familyId={familyId}
                        selectedMaterialId={selectedMaterialId}
                        onMaterialChange={setSelectedMaterialId}
                        onAddNew={() => setShowAddMaterial(true)}
                        label="Material (optional)"
                        labelStyle={styles.label}
                        placeholder="Select or upload…"
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {step > 0 ? (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={submitting}
                  {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
                >
                  <ChevronLeft size={20} color="#374151" strokeWidth={2.4} />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleClose}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.saveButton, (!canContinue || submitting) && styles.saveButtonDisabled]}
                onPress={handlePrimary}
                disabled={!canContinue || submitting}
                {...(Platform.OS === 'web' && {
                  cursor: canContinue && !submitting ? 'pointer' : 'default',
                })}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={styles.saveInner}>
                    {step === 2 ? <Sparkles size={18} color="#FFFFFF" /> : null}
                    <Text style={styles.saveText}>
                      {step === 2 ? 'Submit' : 'Next'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showAddMaterial && familyId ? (
        <AddMaterialModal
          visible
          familyId={familyId}
          defaultSubjectId={subjectId}
          onClose={() => setShowAddMaterial(false)}
          onSaved={(material) => {
            if (material?.id) setSelectedMaterialId(String(material.id));
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
    maxWidth: 640,
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 30px 60px rgba(0, 0, 0, 0.12), 0 10px 30px rgba(0, 0, 0, 0.08)',
    }),
  },
  shellCompose: {
    maxWidth: 720,
    minHeight: Platform.OS === 'web' ? '72vh' : undefined,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 0,
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
  stepDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: ACCENT,
    width: 20,
  },
  dotDone: {
    backgroundColor: '#93C5FD',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    paddingBottom: 16,
    gap: 10,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  composeBlock: {
    gap: 10,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginTop: 4,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  textArea: {
    minHeight: 220,
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      resize: 'vertical',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }),
  },
  attachBlock: {
    marginTop: 8,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
  },
  choiceSelected: {
    borderColor: ACCENT,
    backgroundColor: '#F0F8FF',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioSelected: {
    borderColor: '#3B82F6',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  choiceTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  choiceTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  choiceSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 22 : 18,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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

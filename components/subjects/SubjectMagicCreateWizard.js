/**
 * Step-through for subject magic Create CTAs:
 * 1) purpose → 2) dates → 3) source method →
 *    subject plan: import modal | assignment/lesson: in-modal chat stream.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import { X, Sparkles, ChevronLeft } from 'lucide-react';
import { useModalStackElevation } from '../hooks/useModalStackElevation';
import SubjectMagicCreateChat from './SubjectMagicCreateChat';

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

const SOURCE_METHODS = [
  {
    id: 'generate',
    title: 'Generate from prompt',
    subtitle: 'Invents units/lessons from a description (schedule-aware)',
  },
  {
    id: 'upload',
    title: 'Create from doc',
    subtitle: 'Extract from a syllabus or material in your library',
  },
  {
    id: 'paste_plain',
    title: 'Paste plain text',
    subtitle: 'Parse a pasted outline (can expand loose goals)',
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

function buildSeedPrompt({ purpose, withDates, sourceMethod, subjectName }) {
  const subj = subjectName || 'this subject';
  const datesBit = withDates
    ? ' Include dates when possible.'
    : ' Do not schedule dates yet — add to classwork unscheduled.';
  if (purpose === 'assignment') {
    if (sourceMethod === 'upload') {
      return `Create an assignment for ${subj} from a material I attach or select.${datesBit}`;
    }
    if (sourceMethod === 'paste_plain') {
      return `Create an assignment for ${subj} from this outline I'll paste next.${datesBit}`;
    }
    return `Create an assignment for ${subj}.${datesBit}`;
  }
  if (purpose === 'lesson') {
    if (sourceMethod === 'upload') {
      return `Create a single learning day for ${subj} from a material I attach or select.${datesBit}`;
    }
    if (sourceMethod === 'paste_plain') {
      return `Create a single learning day for ${subj} from this outline I'll paste next.${datesBit}`;
    }
    return `Create a single learning day for ${subj}.${datesBit}`;
  }
  return null;
}

export default function SubjectMagicCreateWizard({
  visible,
  onClose,
  onContinue,
  onChatCompleted,
  subjectName = 'Subject',
  familyId = null,
  subjectId = null,
  academicYearId = null,
  childIds = [],
}) {
  const overlayRef = React.useRef(null);
  useModalStackElevation(overlayRef, visible, 10002);

  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState('subject_plan');
  const [datesMode, setDatesMode] = useState('without_dates');
  const [sourceMethod, setSourceMethod] = useState('upload');
  const [chatSeed, setChatSeed] = useState(null);

  const reset = useCallback(() => {
    setStep(0);
    setPurpose('subject_plan');
    setDatesMode('without_dates');
    setSourceMethod('upload');
    setChatSeed(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const inChat = step === 3;

  const stepMeta = useMemo(() => {
    if (step === 0) return { title: 'What do you want to create?' };
    if (step === 1) return { title: 'Dates' };
    if (step === 2) return { title: 'How should we create it?' };
    return {
      title: purpose === 'assignment' ? 'Create assignment' : 'Create learning day',
    };
  }, [step, purpose]);

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(purpose);
    if (step === 1) return Boolean(datesMode);
    if (step === 2) return Boolean(sourceMethod);
    return false;
  }, [step, purpose, datesMode, sourceMethod]);

  const handlePrimary = () => {
    if (!canContinue) return;
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    const withDates = datesMode === 'with_dates';
    if (purpose === 'assignment' || purpose === 'lesson') {
      setChatSeed(buildSeedPrompt({
        purpose,
        withDates,
        sourceMethod,
        subjectName,
      }));
      setStep(3);
      return;
    }
    onContinue?.({
      purpose,
      withDates,
      sourceMethod,
    });
    reset();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View ref={overlayRef} style={styles.overlay} collapsable={false}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.shell, inChat && styles.shellChat]}>
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

          {inChat ? (
            <View style={styles.chatBody}>
              <Text style={styles.stepTitle}>{stepMeta.title}</Text>
              <View style={styles.stepDots}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.dot, styles.dotDone]} />
                ))}
              </View>
              {familyId && subjectId && chatSeed ? (
                <SubjectMagicCreateChat
                  familyId={familyId}
                  subjectId={subjectId}
                  subjectName={subjectName}
                  academicYearId={academicYearId}
                  childIds={childIds}
                  purpose={purpose}
                  withDates={datesMode === 'with_dates'}
                  sourceMethod={sourceMethod}
                  seedPrompt={chatSeed}
                  onDone={(result) => {
                    onChatCompleted?.(result);
                    handleClose();
                  }}
                />
              ) : null}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    setChatSeed(null);
                    setStep(2);
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <ChevronLeft size={18} color="#374151" />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.stepTitle}>{stepMeta.title}</Text>
                <View style={styles.stepDots}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
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

                {step === 2
                  ? SOURCE_METHODS.map((opt) => (
                    <ChoiceRow
                      key={opt.id}
                      title={opt.title}
                      subtitle={opt.subtitle}
                      selected={sourceMethod === opt.id}
                      onPress={() => setSourceMethod(opt.id)}
                    />
                  ))
                  : null}
              </ScrollView>

              <View style={styles.footer}>
                {step > 0 ? (
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setStep((s) => Math.max(0, s - 1))}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <ChevronLeft size={18} color="#374151" />
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
                  style={[styles.saveButton, !canContinue && styles.saveButtonDisabled]}
                  onPress={handlePrimary}
                  disabled={!canContinue}
                  {...(Platform.OS === 'web' && { cursor: canContinue ? 'pointer' : 'default' })}
                >
                  <View style={styles.saveInner}>
                    {step === 2 ? <Sparkles size={18} color="#FFFFFF" /> : null}
                    <Text style={styles.saveText}>{step === 2 ? 'Continue' : 'Next'}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
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
  shellChat: {
    maxWidth: 720,
    minHeight: Platform.OS === 'web' ? '70vh' : undefined,
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 28,
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  backText: {
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

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Platform,
  StyleSheet,
} from 'react-native';
import {
  isWorkProducingEventType,
  normalizeWorkEventType,
  normalizeQuizQuestions,
  parseWorkSpec,
  showsLearningGradingSwitches,
} from '../../lib/workEventHelpers';

function LearningWorkSwitch({
  label,
  labelLines = null,
  value,
  onValueChange,
  readOnly = false,
  inLearningSection = false,
  inLearningSectionRow = false,
  isFirstInLearningSection = false,
}) {
  const labelStyle = [
    styles.label,
    styles.switchLabelStacked,
    inLearningSection && styles.learningSectionLabel,
  ];
  const stackedLines = Array.isArray(labelLines)
    ? labelLines.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

  return (
    <View
      style={[
        styles.switchRowStack,
        inLearningSection && !inLearningSectionRow && (isFirstInLearningSection
          ? styles.learningSectionSwitchRow
          : styles.learningSectionSwitchRowFollow),
        inLearningSection && inLearningSectionRow && styles.learningSectionSwitchCell,
      ]}
    >
      {stackedLines.length > 0 ? (
        <View style={styles.switchLabelLines}>
          {stackedLines.map((line) => (
            <Text key={line} style={[labelStyle, styles.switchLabelLine]}>
              {line}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={labelStyle}>
          {label}
        </Text>
      )}
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={readOnly}
        trackColor={{ false: '#E5E7EB', true: '#AECBFA' }}
        thumbColor={value ? '#45A29E' : '#f9fafb'}
      />
    </View>
  );
}

export function GradedField({
  workSpec,
  eventType,
  onChange,
  readOnly = false,
  inLearningSection = false,
}) {
  if (!isWorkProducingEventType(eventType)) return null;

  const normalizedType = normalizeWorkEventType(eventType);
  const spec = parseWorkSpec(workSpec, normalizedType);
  const patch = (partial) => onChange?.({ ...spec, ...partial });

  return (
    <LearningWorkSwitch
      label="Graded"
      value={spec.graded !== false}
      onValueChange={(value) => patch({ graded: value })}
      readOnly={readOnly}
      inLearningSection={inLearningSection}
      isFirstInLearningSection={inLearningSection}
    />
  );
}

export function RequireFinalDeliverableField({
  workSpec,
  eventType,
  onChange,
  readOnly = false,
  inLearningSection = false,
}) {
  if (!isWorkProducingEventType(eventType)) return null;

  const normalizedType = normalizeWorkEventType(eventType);
  const spec = parseWorkSpec(workSpec, normalizedType);
  const patch = (partial) => onChange?.({ ...spec, ...partial });

  return (
    <LearningWorkSwitch
      label="Submission"
      value={!!spec.require_final_deliverable}
      onValueChange={(value) => patch({ require_final_deliverable: value })}
      readOnly={readOnly}
      inLearningSection={inLearningSection}
      isFirstInLearningSection={false}
    />
  );
}

/** Graded + Submission side-by-side in Learning details accordion. */
export function LearningGradingSwitchesRow({
  workSpec,
  eventType,
  onChange,
  readOnly = false,
}) {
  if (!showsLearningGradingSwitches(eventType)) return null;

  const normalizedType = normalizeWorkEventType(eventType) || eventType;
  const spec = parseWorkSpec(workSpec, normalizedType);
  const patch = (partial) => onChange?.({ ...spec, ...partial });

  return (
    <View style={styles.learningSectionSwitchesRow}>
      <LearningWorkSwitch
        label="Graded"
        value={spec.graded !== false}
        onValueChange={(value) => patch({ graded: value })}
        readOnly={readOnly}
        inLearningSection
        inLearningSectionRow
      />
      <LearningWorkSwitch
        label="Submission"
        value={!!spec.require_final_deliverable}
        onValueChange={(value) => patch({ require_final_deliverable: value })}
        readOnly={readOnly}
        inLearningSection
        inLearningSectionRow
      />
    </View>
  );
}

function MethodChip({ label, active, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
      {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Submission method chips in Learning details — visible when Submission is on. */
export function LearningSubmissionMethodsField({
  workSpec,
  eventType,
  onChange,
  readOnly = false,
}) {
  if (!showsLearningGradingSwitches(eventType)) return null;

  const normalizedType = normalizeWorkEventType(eventType) || eventType;
  const spec = parseWorkSpec(workSpec, normalizedType);
  if (!spec.require_final_deliverable) return null;

  const patch = (partial) => onChange?.({ ...spec, ...partial });
  const patchMethods = (key, value) => {
    const nextMethods = {
      ...spec.submission_methods,
      [key]: value,
    };
    const partial = { submission_methods: nextMethods };
    if (key === 'quiz' && value && normalizeQuizQuestions(spec).length === 0) {
      partial.quiz_questions = [{ id: `q_${Date.now().toString(36)}`, prompt: '' }];
    }
    patch(partial);
  };

  return (
    <View style={styles.learningSectionSubmissionMethods}>
      <Text style={styles.learningSubmissionLabel}>Submission methods</Text>
      <View style={styles.chipRow}>
        <MethodChip label="Text response" active={!!spec.submission_methods?.text} onPress={() => patchMethods('text', !spec.submission_methods?.text)} disabled={readOnly} />
        <MethodChip label="File upload" active={!!spec.submission_methods?.file} onPress={() => patchMethods('file', !spec.submission_methods?.file)} disabled={readOnly} />
        <MethodChip label="Photo" active={!!spec.submission_methods?.photo} onPress={() => patchMethods('photo', !spec.submission_methods?.photo)} disabled={readOnly} />
        <MethodChip label="Link" active={!!spec.submission_methods?.link} onPress={() => patchMethods('link', !spec.submission_methods?.link)} disabled={readOnly} />
        <MethodChip label="Quiz / questions" active={!!spec.submission_methods?.quiz} onPress={() => patchMethods('quiz', !spec.submission_methods?.quiz)} disabled={readOnly} />
        <MethodChip label="Parent check-off" active={!!spec.submission_methods?.parent_checkoff} onPress={() => patchMethods('parent_checkoff', !spec.submission_methods?.parent_checkoff)} disabled={readOnly} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  learningSectionSubmissionMethods: {
    width: '100%',
    marginTop: 8,
    alignSelf: 'stretch',
  },
  learningSubmissionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  chipDisabled: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  switchRowStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 14,
  },
  switchLabelStacked: {
    marginBottom: 0,
  },
  switchLabelLines: {
    gap: 0,
  },
  switchLabelLine: {
    marginBottom: 0,
    lineHeight: 15,
  },
  learningSectionSwitchRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F6',
    width: '100%',
    maxWidth: 180,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      gridColumn: '1 / -1',
    }),
  },
  learningSectionSwitchRowFollow: {
    marginTop: 8,
    width: '100%',
    maxWidth: 180,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      gridColumn: '1 / -1',
    }),
  },
  learningSectionSwitchesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 28,
    marginTop: 0,
    marginLeft: 20,
    paddingTop: 0,
    borderTopWidth: 0,
    width: 'auto',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      gridColumn: '3 / -1',
      justifySelf: 'end',
      marginLeft: 0,
      paddingLeft: 16,
    }),
  },
  learningSectionSwitchCell: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
    width: 'auto',
    maxWidth: 120,
    flexShrink: 0,
  },
  learningSectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 0,
  },
});

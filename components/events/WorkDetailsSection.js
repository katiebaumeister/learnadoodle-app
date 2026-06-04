import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  Platform,
  StyleSheet,
} from 'react-native';
import { ModalSectionCard } from '../ui/ModalSectionCard';
import { FileText } from 'lucide-react';
import {
  EFFORT_PRESETS,
  isWorkProducingEventType,
  normalizeWorkEventType,
  parseWorkSpec,
} from '../../lib/workEventHelpers';

export function RequireFinalDeliverableField({
  workSpec,
  eventType,
  onChange,
  readOnly = false,
}) {
  const normalizedType = normalizeWorkEventType(eventType);
  if (normalizedType !== 'Project') return null;

  const spec = parseWorkSpec(workSpec, normalizedType);
  const patch = (partial) => onChange?.({ ...spec, ...partial });

  return (
    <View style={styles.switchRow}>
      <Text style={styles.label}>Require final deliverable</Text>
      <Switch
        value={!!spec.require_final_deliverable}
        onValueChange={(value) => patch({ require_final_deliverable: value })}
        disabled={readOnly}
        trackColor={{ false: '#E5E7EB', true: '#AECBFA' }}
        thumbColor={spec.require_final_deliverable ? '#45A29E' : '#f9fafb'}
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

export default function WorkDetailsSection({
  eventType,
  workSpec,
  onChange,
  readOnly = false,
  suggestedStartPreview = null,
}) {
  const normalizedType = normalizeWorkEventType(eventType);
  if (!isWorkProducingEventType(normalizedType)) return null;

  const spec = parseWorkSpec(workSpec, normalizedType);
  const patch = (partial) => onChange?.({ ...spec, ...partial });
  const patchMethods = (key, value) => {
    patch({
      submission_methods: {
        ...spec.submission_methods,
        [key]: value,
      },
    });
  };
  const patchExam = (key, value) => {
    patch({
      exam_modes: {
        ...spec.exam_modes,
        [key]: value,
      },
    });
  };

  return (
    <ModalSectionCard
      Icon={FileText}
      title="Work Details"
      subtitle="Instructions, submission, and grading"
      expanded
      onPress={() => {}}
      accent="#7C9CBF"
      hideChevron
    >
      <View style={styles.sectionBody}>
        <Text style={styles.label}>Instructions</Text>
        <TextInput
          value={spec.instructions || ''}
          onChangeText={(text) => patch({ instructions: text })}
          placeholder="What should the student do?"
          placeholderTextColor="#9CA3AF"
          multiline
          editable={!readOnly}
          style={[styles.textArea, readOnly && styles.readOnlyField]}
        />

        <Text style={[styles.label, styles.labelSpaced]}>Submission methods</Text>
        <View style={styles.chipRow}>
          <MethodChip label="Text response" active={!!spec.submission_methods?.text} onPress={() => patchMethods('text', !spec.submission_methods?.text)} disabled={readOnly} />
          <MethodChip label="File upload" active={!!spec.submission_methods?.file} onPress={() => patchMethods('file', !spec.submission_methods?.file)} disabled={readOnly} />
          <MethodChip label="Photo" active={!!spec.submission_methods?.photo} onPress={() => patchMethods('photo', !spec.submission_methods?.photo)} disabled={readOnly} />
          <MethodChip label="Link" active={!!spec.submission_methods?.link} onPress={() => patchMethods('link', !spec.submission_methods?.link)} disabled={readOnly} />
          <MethodChip label="Parent check-off" active={!!spec.submission_methods?.parent_checkoff} onPress={() => patchMethods('parent_checkoff', !spec.submission_methods?.parent_checkoff)} disabled={readOnly} />
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Estimated effort</Text>
        <View style={styles.chipRow}>
          {EFFORT_PRESETS.map((preset) => {
            const active = Number(spec.estimated_effort_minutes) === preset.minutes;
            return (
              <MethodChip
                key={preset.minutes}
                label={preset.label}
                active={active}
                onPress={() => patch({ estimated_effort_minutes: preset.minutes })}
                disabled={readOnly}
              />
            );
          })}
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Suggested start</Text>
        <View style={styles.chipRow}>
          <MethodChip
            label="Auto"
            active={spec.suggested_start_mode !== 'custom'}
            onPress={() => patch({ suggested_start_mode: 'auto', suggested_start_date: null })}
            disabled={readOnly}
          />
          <MethodChip
            label="Custom"
            active={spec.suggested_start_mode === 'custom'}
            onPress={() => patch({ suggested_start_mode: 'custom' })}
            disabled={readOnly}
          />
        </View>
        {spec.suggested_start_mode === 'custom' ? (
          <TextInput
            value={spec.suggested_start_date || ''}
            onChangeText={(text) => patch({ suggested_start_date: text.slice(0, 10) })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            editable={!readOnly}
            style={[styles.input, readOnly && styles.readOnlyField]}
          />
        ) : suggestedStartPreview ? (
          <Text style={styles.hint}>Suggested: {suggestedStartPreview}</Text>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Graded</Text>
          <Switch
            value={spec.graded !== false}
            onValueChange={(value) => patch({ graded: value })}
            disabled={readOnly}
            trackColor={{ false: '#E5E7EB', true: '#AECBFA' }}
            thumbColor={spec.graded !== false ? '#45A29E' : '#f9fafb'}
          />
        </View>

        {normalizedType === 'Project' ? (
          <>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Allow progress updates</Text>
              <Switch
                value={!!spec.allow_progress_updates}
                onValueChange={(value) => patch({ allow_progress_updates: value })}
                disabled={readOnly}
                trackColor={{ false: '#E5E7EB', true: '#AECBFA' }}
                thumbColor={spec.allow_progress_updates ? '#45A29E' : '#f9fafb'}
              />
            </View>
          </>
        ) : null}

        {normalizedType === 'Exam' ? (
          <>
            <Text style={[styles.label, styles.labelSpaced]}>Exam submission</Text>
            <View style={styles.chipRow}>
              <MethodChip label="Parent-entered score" active={!!spec.exam_modes?.parent_score} onPress={() => patchExam('parent_score', !spec.exam_modes?.parent_score)} disabled={readOnly} />
              <MethodChip label="Question/Answer" active={!!spec.exam_modes?.question_answer} onPress={() => patchExam('question_answer', !spec.exam_modes?.question_answer)} disabled={readOnly} />
              <MethodChip label="File upload" active={!!spec.exam_modes?.file_upload} onPress={() => patchExam('file_upload', !spec.exam_modes?.file_upload)} disabled={readOnly} />
            </View>
          </>
        ) : null}
      </View>
    </ModalSectionCard>
  );
}

const styles = StyleSheet.create({
  sectionBody: {
    paddingTop: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  labelSpaced: {
    marginTop: 14,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 88,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  readOnlyField: {
    backgroundColor: '#F9FAFB',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    borderColor: '#85C4F2',
    backgroundColor: '#F0F8FF',
  },
  chipDisabled: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#0369A1',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B',
  },
});

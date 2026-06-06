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
import {
  isWorkProducingEventType,
  normalizeWorkEventType,
  parseWorkSpec,
} from '../../lib/workEventHelpers';
import { LearningSubmissionMethodsField } from './WorkDetailsSection';
import QuizQuestionsEditor from './QuizQuestionsEditor';

function WorkSwitch({ label, value, onValueChange, readOnly }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
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

/**
 * Parent-facing Student Work block for Assignment / Project / Exam create & edit.
 */
export default function StudentWorkSection({
  workSpec,
  eventType,
  onChange,
  readOnly = false,
  inputStyle = null,
  labelStyle = null,
}) {
  if (!isWorkProducingEventType(eventType)) return null;

  const normalizedType = normalizeWorkEventType(eventType);
  const spec = parseWorkSpec(workSpec, normalizedType);
  const patch = (partial) => onChange?.({ ...spec, ...partial });
  const startMode = String(spec.suggested_start_mode || 'auto').toLowerCase();
  const customStart = String(spec.suggested_start_date || '').slice(0, 10);

  return (
    <View style={styles.wrap}>
      <WorkSwitch
        label="Ask student to submit work"
        value={!!spec.require_final_deliverable}
        onValueChange={(value) => patch({ require_final_deliverable: value })}
        readOnly={readOnly}
      />

      {spec.require_final_deliverable ? (
        <>
          <LearningSubmissionMethodsField
            workSpec={spec}
            eventType={eventType}
            onChange={onChange}
            readOnly={readOnly}
          />

          {!!spec.submission_methods?.quiz ? (
            <QuizQuestionsEditor
              workSpec={spec}
              onChange={onChange}
              readOnly={readOnly}
              inputStyle={inputStyle}
              labelStyle={labelStyle}
            />
          ) : null}

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, labelStyle]}>Instructions for student</Text>
            <TextInput
              style={[styles.textArea, inputStyle]}
              value={String(spec.instructions || '')}
              onChangeText={(text) => patch({ instructions: text })}
              placeholder="What should the student do and submit?"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!readOnly}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, labelStyle]}>Start work by (optional)</Text>
            <View style={styles.startByRow}>
              <TouchableOpacity
                style={[styles.modeChip, startMode !== 'custom' && styles.modeChipActive]}
                onPress={() => patch({ suggested_start_mode: 'auto', suggested_start_date: null })}
                disabled={readOnly}
                {...(Platform.OS === 'web' && { cursor: readOnly ? 'default' : 'pointer' })}
              >
                <Text style={[styles.modeChipText, startMode !== 'custom' && styles.modeChipTextActive]}>
                  Auto
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, startMode === 'custom' && styles.modeChipActive]}
                onPress={() => patch({
                  suggested_start_mode: 'custom',
                  suggested_start_date: customStart || null,
                })}
                disabled={readOnly}
                {...(Platform.OS === 'web' && { cursor: readOnly ? 'default' : 'pointer' })}
              >
                <Text style={[styles.modeChipText, startMode === 'custom' && styles.modeChipTextActive]}>
                  Pick date
                </Text>
              </TouchableOpacity>
            </View>
            {startMode === 'custom' ? (
              <TextInput
                style={[styles.input, inputStyle]}
                value={customStart}
                onChangeText={(text) => patch({
                  suggested_start_mode: 'custom',
                  suggested_start_date: String(text || '').slice(0, 10) || null,
                })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                editable={!readOnly}
              />
            ) : (
              <Text style={styles.helpText}>Calculated from due date and estimated effort.</Text>
            )}
          </View>

          <WorkSwitch
            label="Graded"
            value={spec.graded !== false}
            onValueChange={(value) => patch({ graded: value })}
            readOnly={readOnly}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    width: '100%',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  textArea: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  startByRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  modeChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modeChipTextActive: {
    color: '#1D4ED8',
  },
  helpText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});

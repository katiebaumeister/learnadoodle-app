import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { Check, Plus, Trash2 } from 'lucide-react';
import {
  defaultMultipleChoiceQuestion,
  defaultOptionLabel,
  isDefaultOptionLabel,
  newQuizOptionId,
  normalizeMultipleChoice,
} from '../../../lib/studentResponseTypes';

export default function MultipleChoiceEditor({
  value,
  onChange,
  readOnly = false,
  label = 'Question',
  showAnswerKey = true,
}) {
  const question = normalizeMultipleChoice(value || defaultMultipleChoiceQuestion());

  const patch = (partial) => onChange?.({ ...question, ...partial });

  const updateOption = (optionId, text) => {
    patch({
      options: question.options.map((row) => (
        row.id === optionId ? { ...row, text } : row
      )),
    });
  };

  const addOption = () => {
    const id = newQuizOptionId('mc');
    patch({
      options: [...question.options, { id, text: '' }],
    });
  };

  const removeOption = (optionId) => {
    const nextOptions = question.options.filter((row) => row.id !== optionId);
    if (nextOptions.length < 2) return;
    patch({
      options: nextOptions,
      correct_option_id: question.correct_option_id === optionId ? null : question.correct_option_id,
    });
  };

  const toggleCorrect = (optionId) => {
    patch({
      correct_option_id: question.correct_option_id === optionId ? null : optionId,
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.promptInput}
        value={question.prompt}
        onChangeText={(text) => patch({ prompt: text })}
        placeholder="Question prompt"
        placeholderTextColor="#94A3B8"
        editable={!readOnly}
        multiline
      />

      {showAnswerKey ? (
        <Text style={styles.answerKeyLabel}>Answer key — select the correct option</Text>
      ) : null}

      <View style={styles.optionsList}>
        {question.options.map((option, index) => {
          const isCorrect = question.correct_option_id === option.id;
          return (
            <View key={option.id} style={[styles.optionRow, isCorrect && styles.optionRowCorrect]}>
              {!readOnly && showAnswerKey ? (
                <TouchableOpacity
                  onPress={() => toggleCorrect(option.id)}
                  style={[styles.correctToggle, isCorrect && styles.correctToggleActive]}
                  accessibilityLabel={`Mark option ${index + 1} as correct`}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  {isCorrect ? <Check size={14} color="#047857" strokeWidth={2.5} /> : null}
                </TouchableOpacity>
              ) : (
                <View style={styles.optionBullet} />
              )}
              <TextInput
                style={styles.optionInput}
                value={isDefaultOptionLabel(option.text, index) ? '' : option.text}
                onChangeText={(text) => updateOption(option.id, text)}
                onFocus={() => {
                  if (isDefaultOptionLabel(option.text, index)) {
                    updateOption(option.id, '');
                  }
                }}
                placeholder={defaultOptionLabel(index)}
                placeholderTextColor="#94A3B8"
                editable={!readOnly}
              />
              {!readOnly && question.options.length > 2 ? (
                <TouchableOpacity
                  onPress={() => removeOption(option.id)}
                  style={styles.removeButton}
                  accessibilityLabel="Remove option"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Trash2 size={15} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>

      {!readOnly ? (
        <TouchableOpacity
          onPress={addOption}
          style={styles.addOptionButton}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={14} color="#0369A1" />
          <Text style={styles.addOptionText}>Add option</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  promptInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  answerKeyLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  optionRowCorrect: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  correctToggle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  correctToggleActive: {
    borderColor: '#86EFAC',
    backgroundColor: '#DCFCE7',
  },
  optionBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 8,
  },
  optionInput: {
    flex: 1,
    minHeight: 36,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 4,
  },
  removeButton: {
    padding: 4,
  },
  addOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  addOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0369A1',
  },
});

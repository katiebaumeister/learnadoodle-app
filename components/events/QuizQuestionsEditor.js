import React, { useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { Plus, Trash2 } from 'lucide-react';
import { normalizeQuizQuestions } from '../../lib/workEventHelpers';
import {
  defaultStructuredQuestion,
  newQuizOptionId,
} from '../../lib/studentResponseTypes';
import MultipleChoiceEditor from '../create/assignment/MultipleChoiceEditor';

const QUESTION_TYPE_OPTIONS = [
  { id: 'short_answer', label: 'Text entry' },
  { id: 'multiple_choice', label: 'Multiple choice' },
];

function defaultOptionsForQuestion(questionId) {
  const o1 = newQuizOptionId(questionId);
  const o2 = newQuizOptionId(questionId);
  return [
    { id: o1, text: '' },
    { id: o2, text: '' },
  ];
}

/**
 * Structured Q&A editor — short-answer and multiple-choice questions with answer keys.
 */
export default function QuizQuestionsEditor({
  workSpec,
  onChange,
  readOnly = false,
  inputStyle = null,
  labelStyle = null,
}) {
  const questions = normalizeQuizQuestions(workSpec);
  const totalQuestionPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
    [questions],
  );

  const patchQuestions = (nextQuestions) => {
    onChange?.({
      ...workSpec,
      quiz_questions: nextQuestions,
    });
  };

  const addQuestion = () => {
    patchQuestions([...questions, defaultStructuredQuestion()]);
  };

  const updateQuestion = (id, partial) => {
    patchQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...partial } : q)),
    );
  };

  const removeQuestion = (id) => {
    patchQuestions(questions.filter((q) => q.id !== id));
  };

  const setQuestionType = (id, questionType) => {
    const question = questions.find((row) => row.id === id);
    if (!question) return;
    if (questionType === 'multiple_choice') {
      updateQuestion(id, {
        question_type: 'multiple_choice',
        options: question.options?.length ? question.options : defaultOptionsForQuestion(id),
        correct_option_id: question.correct_option_id || null,
      });
      return;
    }
    updateQuestion(id, {
      question_type: 'short_answer',
      options: [],
      correct_option_id: null,
    });
  };

  const setQuestionPoints = (id, text) => {
    const digits = String(text || '').replace(/[^\d]/g, '');
    updateQuestion(id, { points: digits === '' ? null : Number(digits) });
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, labelStyle]}>Questions</Text>
      {questions.length === 0 ? (
        <Text style={styles.emptyText}>Add at least one question for students to answer.</Text>
      ) : null}

      {questions.map((q, index) => (
        <View key={q.id} style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionNumber}>Question {index + 1}</Text>
            <View style={styles.questionHeaderActions}>
              {!readOnly ? (
                <View style={styles.pointsField}>
                  <TextInput
                    style={styles.pointsInput}
                    value={q.points != null ? String(q.points) : ''}
                    onChangeText={(text) => setQuestionPoints(q.id, text)}
                    placeholder=""
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    editable={!readOnly}
                    accessibilityLabel={`Points for question ${index + 1}`}
                  />
                  <Text style={styles.pointsSlash}>/</Text>
                  <Text style={styles.pointsTotal}>{totalQuestionPoints}</Text>
                </View>
              ) : (
                <Text style={styles.pointsReadonly}>
                  {q.points != null ? q.points : '—'} / {totalQuestionPoints}
                </Text>
              )}
              {!readOnly && questions.length > 1 ? (
                <TouchableOpacity
                  onPress={() => removeQuestion(q.id)}
                  style={styles.removeQuestionButton}
                  accessibilityLabel="Remove question"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Trash2 size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.typeRow}>
            {QUESTION_TYPE_OPTIONS.map((option) => {
              const active = (q.question_type || 'short_answer') === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => !readOnly && setQuestionType(q.id, option.id)}
                  disabled={readOnly}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                  {...(Platform.OS === 'web' && { cursor: readOnly ? 'default' : 'pointer' })}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {q.question_type === 'multiple_choice' ? (
            <MultipleChoiceEditor
              value={{
                prompt: q.prompt,
                options: q.options,
                correct_option_id: q.correct_option_id,
              }}
              onChange={(next) => updateQuestion(q.id, {
                prompt: next.prompt,
                options: next.options,
                correct_option_id: next.correct_option_id,
              })}
              readOnly={readOnly}
              label="Prompt"
              showAnswerKey
            />
          ) : (
            <TextInput
              style={[styles.input, inputStyle]}
              value={String(q.prompt || '')}
              onChangeText={(text) => updateQuestion(q.id, { prompt: text })}
              placeholder="Question prompt"
              placeholderTextColor="#94A3B8"
              editable={!readOnly}
              multiline
            />
          )}
        </View>
      ))}

      {!readOnly ? (
        <TouchableOpacity
          onPress={addQuestion}
          style={styles.addButton}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={14} color="#0369A1" />
          <Text style={styles.addButtonText}>Add question</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  questionCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 10,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  questionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  questionNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  pointsField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pointsInput: {
    width: 32,
    minHeight: 24,
    padding: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'right',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  pointsSlash: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginHorizontal: 2,
  },
  pointsTotal: {
    minWidth: 20,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'left',
  },
  pointsReadonly: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  removeQuestionButton: {
    padding: 4,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  typeChipActive: {
    borderColor: '#9ECFFB',
    backgroundColor: 'rgba(158, 207, 251, 0.25)',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  typeChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
  },
  input: {
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0369A1',
  },
});

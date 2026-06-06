import React from 'react';
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

function newQuestionId() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Parent editor for short-answer quiz questions stored on work_spec.quiz_questions.
 */
export default function QuizQuestionsEditor({
  workSpec,
  onChange,
  readOnly = false,
  inputStyle = null,
  labelStyle = null,
}) {
  const questions = normalizeQuizQuestions(workSpec);

  const patchQuestions = (nextQuestions) => {
    onChange?.({
      ...workSpec,
      quiz_questions: nextQuestions,
    });
  };

  const addQuestion = () => {
    patchQuestions([
      ...questions,
      { id: newQuestionId(), prompt: '' },
    ]);
  };

  const updateQuestion = (id, prompt) => {
    patchQuestions(
      questions.map((q) => (q.id === id ? { ...q, prompt } : q))
    );
  };

  const removeQuestion = (id) => {
    patchQuestions(questions.filter((q) => q.id !== id));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, labelStyle]}>Questions</Text>
      {questions.length === 0 ? (
        <Text style={styles.emptyText}>Add at least one question for the student to answer.</Text>
      ) : null}
      {questions.map((q, index) => (
        <View key={q.id} style={styles.questionRow}>
          <Text style={styles.questionNumber}>{index + 1}.</Text>
          <TextInput
            style={[styles.input, inputStyle]}
            value={String(q.prompt || '')}
            onChangeText={(text) => updateQuestion(q.id, text)}
            placeholder="Question prompt"
            placeholderTextColor="#94A3B8"
            editable={!readOnly}
            multiline
          />
          {!readOnly ? (
            <TouchableOpacity
              onPress={() => removeQuestion(q.id)}
              style={styles.removeButton}
              accessibilityLabel="Remove question"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Trash2 size={16} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
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
    gap: 8,
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
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  questionNumber: {
    marginTop: 10,
    width: 18,
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  removeButton: {
    marginTop: 8,
    padding: 6,
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

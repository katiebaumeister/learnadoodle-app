import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  parseStudentResponseType,
  buildWorkSpecForStudentResponseType,
} from '../../../lib/studentResponseTypes';
import StudentResponseTypeField from './StudentResponseTypeField';
import QuizQuestionsEditor from '../../events/QuizQuestionsEditor';

export default function StudentResponseSection({ workSpec, onChange, error = null }) {
  const responseType = parseStudentResponseType(workSpec?.student_response_type);

  const handleTypeChange = (nextType) => {
    onChange?.(buildWorkSpecForStudentResponseType(nextType, workSpec));
  };

  return (
    <View style={styles.wrap}>
      <StudentResponseTypeField
        value={workSpec?.student_response_type}
        onChange={handleTypeChange}
        required
        error={error}
      />

      {responseType === 'attachment' ? (
        <Text style={styles.hint}>Students upload a file as their submission.</Text>
      ) : null}

      {responseType === 'structured_qa' ? (
        <View style={styles.panel}>
          <QuizQuestionsEditor workSpec={workSpec} onChange={onChange} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    width: '100%',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94A3B8',
    marginBottom: 4,
  },
  panel: {
    marginTop: 4,
  },
});

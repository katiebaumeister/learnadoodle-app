import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check } from 'lucide-react';
import { colors } from '../../theme/colors';

/**
 * MasteryPicker Component
 * 3-color toggle picker for mastery levels
 */
export default function MasteryPicker({
  studentId,
  standardId,
  lessonId,
  currentMastery = null,
  onUpdate,
}) {
  const [selected, setSelected] = useState(currentMastery || 'not_attempted');

  const levels = [
    { value: 'mastered', label: 'Mastered', color: colors.greenBold },
    { value: 'developing', label: 'Developing', color: colors.yellowBold },
    { value: 'needs_work', label: 'Needs Work', color: colors.orangeBold },
  ];

  const handleSelect = async (level) => {
    setSelected(level);
    if (onUpdate) {
      await onUpdate({
        student_id: studentId,
        standard_id: standardId,
        lesson_id: lessonId,
        mastery_level: level,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Mastery Level:</Text>
      <View style={styles.picker}>
        {levels.map(level => (
          <TouchableOpacity
            key={level.value}
            style={[
              styles.option,
              selected === level.value && { backgroundColor: level.color, borderColor: level.color },
            ]}
            onPress={() => handleSelect(level.value)}
          >
            {selected === level.value && (
              <Check size={16} color={selected === level.value ? '#fff' : level.color} />
            )}
            <Text
              style={[
                styles.optionText,
                selected === level.value && styles.optionTextSelected,
              ]}
            >
              {level.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  picker: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 4,
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});


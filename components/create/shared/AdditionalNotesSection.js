import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { createModalStyles as styles, PLACEHOLDER } from './createModalStyles';

export default function AdditionalNotesSection({
  value,
  onChangeText,
  placeholder = 'Anything else to remember',
  label = 'Additional notes (optional)',
}) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        value={value}
        onChangeText={onChangeText}
        style={[styles.fieldInput, styles.notesPlainInput]}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

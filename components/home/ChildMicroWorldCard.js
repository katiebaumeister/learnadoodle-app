/**
 * Child Micro-World Card
 * Co-Star style skinny card showing what each child is experiencing
 * Emotional, personal, light — not metrics
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function ChildMicroWorldCard({ 
  childName,
  message,
  isLast = false
}) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.childName}>{childName}</Text>
        <Text style={styles.message}>"{message}"</Text>
      </View>
      {!isLast && <View style={styles.divider} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  content: {
    paddingVertical: 10,
  },
  childName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 0,
  },
});


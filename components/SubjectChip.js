import React from 'react';
import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { getSubjectAccent } from '../theme/designTokens';

export default function SubjectChip({ type = 'core', label, style, onPress, ...props }) {
  const accent = getSubjectAccent(type);
  const displayLabel = label || (typeof type === 'string' ? capitalize(type) : 'Subject');

  return (
    <Pressable
      style={({ pressed, focused }) => [
        styles.base,
        {
          backgroundColor: accent.soft,
          borderColor: accent.bold,
          opacity: pressed ? 0.9 : 1,
        },
        focused && Platform.OS === 'web' ? styles.focused : null,
        style,
      ]}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={displayLabel}
      {...props}
    >
      <Text style={[styles.label, { color: accent.bold }]}>{displayLabel}</Text>
    </Pressable>
  );
}

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '160ms',
  },
  focused: {
    boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.22)',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});


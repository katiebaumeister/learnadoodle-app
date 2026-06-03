import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { X } from 'lucide-react';

export default function MessagesPaneCloseButton({ onPress, accessibilityLabel = 'Close messages' }) {
  if (typeof onPress !== 'function') return null;
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <X size={18} color="#64748B" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

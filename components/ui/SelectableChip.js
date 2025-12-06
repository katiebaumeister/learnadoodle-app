import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

/**
 * SelectableChip Component
 * Reusable chip component for selection UI
 */
export default function SelectableChip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  disabled = false,
  style,
  ...props
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      {...(Platform.OS === 'web' && {
        cursor: disabled ? 'not-allowed' : 'pointer',
      })}
      {...props}
    >
      {Icon && (
        <Icon 
          size={14} 
          color={selected ? '#4338ca' : '#6b7280'} 
          style={styles.icon}
        />
      )}
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  chipSelected: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: -2,
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  labelSelected: {
    color: '#4338ca',
  },
});


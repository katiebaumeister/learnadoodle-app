import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { createModalStyles as styles } from './createModalStyles';

export function ChipOptionGroup({ options, value, onChange, disabled = false }) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <TouchableOpacity
            key={option.id}
            onPress={() => !disabled && onChange?.(option.id)}
            disabled={disabled}
            style={[
              styles.dropdownOption,
              styles.assigneePill,
              active && styles.dropdownOptionActive,
            ]}
            {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
          >
            <Text
              style={[
                styles.dropdownOptionText,
                styles.assigneePillText,
                active && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function RadioOptionGroup({ options, value, onChange, disabled = false }) {
  return (
    <View style={styles.radioGroup}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <TouchableOpacity
            key={option.id}
            style={styles.radioRow}
            onPress={() => !disabled && onChange?.(option.id)}
            disabled={disabled}
            {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
          >
            <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
              {active ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.radioLabel}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

export function SectionHeading({ children }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

export function CheckboxRow({ label, checked, onChange, disabled = false }) {
  return (
    <TouchableOpacity
      style={styles.checkboxRow}
      onPress={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
    >
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

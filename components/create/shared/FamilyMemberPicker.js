import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { createModalStyles as styles } from './createModalStyles';

function ChipRow({ children, style }) {
  return <View style={[styles.chipRow, style]}>{children}</View>;
}

export default function FamilyMemberPicker({
  familyMembers = [],
  selectedIds = [],
  onChange,
  error = null,
  label = 'Choose one or more family members',
  required = true,
}) {
  const members = Array.isArray(familyMembers) ? familyMembers : [];

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <ChipRow>
        {members.map((m) => {
          const isSelected = selectedIds.some((id) => String(id) === String(m.id));
          return (
            <TouchableOpacity
              key={String(m.id)}
              onPress={() => {
                if (isSelected) {
                  onChange(selectedIds.filter((id) => String(id) !== String(m.id)));
                } else {
                  onChange([...selectedIds, m.id]);
                }
              }}
              style={[
                styles.dropdownOption,
                styles.assigneePill,
                isSelected && styles.dropdownOptionActive,
              ]}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  styles.assigneePillText,
                  isSelected && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                ]}
              >
                {m.name || m.first_name || 'Student'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ChipRow>
      {error ? <Text style={styles.errorTextSmall}>{error}</Text> : null}
    </View>
  );
}

export function resolveDefaultAssigneeIds({ defaultChildIds, defaultChildId, familyMembers }) {
  if (Array.isArray(defaultChildIds) && defaultChildIds.length > 0) return defaultChildIds;
  if (defaultChildId) return [defaultChildId];
  const allChildIds = (Array.isArray(familyMembers) ? familyMembers : [])
    .map((m) => m?.id)
    .filter(Boolean);
  // Only auto-select when there is exactly one child; otherwise leave unselected.
  return allChildIds.length === 1 ? allChildIds : [];
}

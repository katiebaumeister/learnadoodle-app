import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COMMON_LABELS } from '../lib/toolTypes';

export default function ChipsBar({
  childrenList = [],
  activeChildIds = [],
  onToggleChild,
  activeLabels = [],
  onToggleLabel,
}) {
  return (
    <View style={styles.container}>
      {/* Child Chips */}
      {childrenList.length > 0 && (
        <View style={styles.chipGroup}>
          {childrenList.map((child) => {
            const isActive = activeChildIds.includes(child.id);
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => onToggleChild?.(child.id)}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {child.first_name || child.name || 'Unknown'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Label Chips */}
      <View style={styles.chipGroup}>
        {COMMON_LABELS.map((label) => {
          const isActive = activeLabels.includes(label);
          return (
            <TouchableOpacity
              key={label}
              style={[styles.chip, styles.labelChip, isActive && styles.chipActive]}
              onPress={() => onToggleLabel?.(label)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                #{label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  labelChip: {
    backgroundColor: '#f9fafb',
  },
  chipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#1e40af',
  },
});


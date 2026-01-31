import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus, Calendar, Award, BookOpen, GraduationCap, UserPlus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const QUICK_ADD_OPTIONS = [
  { key: 'event', label: 'Event', icon: Calendar, color: colors.blueBold },
  { key: 'grade', label: 'Grade', icon: Award, color: colors.greenBold },
  { key: 'material', label: 'Material', icon: BookOpen, color: colors.violetBold },
  { key: 'subject', label: 'Subject', icon: GraduationCap, color: colors.indigoBold },
  { key: 'child', label: 'Child', icon: UserPlus, color: colors.orangeBold },
];

export default function QuickAddCard({
  onAddEvent,
  onAddGrade,
  onAddMaterial,
  onAddSubject,
  onAddChild,
}) {
  const handlePress = (key) => {
    switch (key) {
      case 'event':
        onAddEvent?.();
        break;
      case 'grade':
        onAddGrade?.();
        break;
      case 'material':
        onAddMaterial?.();
        break;
      case 'subject':
        onAddSubject?.();
        break;
      case 'child':
        onAddChild?.();
        break;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconContainer}>
          <Plus size={16} color={colors.accent} strokeWidth={2.5} />
        </View>
        <Text style={styles.title}>Quick Add</Text>
      </View>
      
      <View style={styles.optionsGrid}>
        {QUICK_ADD_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <TouchableOpacity
              key={option.key}
              style={styles.optionButton}
              onPress={() => handlePress(option.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIconContainer, { backgroundColor: `${option.color}15` }]}>
                <Icon size={18} color={option.color} strokeWidth={2} />
              </View>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${colors.accent}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  optionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

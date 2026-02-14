/**
 * QuickAddRow
 * 
 * Horizontal row of quick add buttons for parent home screen.
 * Replaces the floating QuickAddDock with an inline row.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Calendar, GraduationCap, BookOpen, Globe, UserPlus, Plus } from 'lucide-react';
import { colors } from '../../theme/colors';

const QUICK_ADD_OPTIONS = [
  { key: 'event', label: 'Event', icon: Calendar },
  { key: 'grade', label: 'Grade', icon: GraduationCap },
  { key: 'material', label: 'Material', icon: BookOpen },
  { key: 'subject', label: 'Subject', icon: Globe },
  { key: 'child', label: 'Child', icon: UserPlus },
];

export default function QuickAddRow({
  onAddEvent,
  onAddGrade,
  onAddMaterial,
  onAddSubject,
  onAddChild,
}) {
  const actions = {
    event: onAddEvent,
    grade: onAddGrade,
    material: onAddMaterial,
    subject: onAddSubject,
    child: onAddChild,
  };

  return (
    <View style={styles.container}>
      {QUICK_ADD_OPTIONS.map((option, index) => {
        const Icon = option.icon;
        const onPress = actions[option.key];
        const isFirst = index === 0;
        
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.button, isFirst && styles.buttonPrimary]}
            onPress={onPress}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={[styles.iconContainer, isFirst && styles.iconContainerPrimary]}>
              <Icon size={18} color={isFirst ? colors.white : colors.primary} />
            </View>
            <Text style={[styles.label, isFirst && styles.labelPrimary]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
        borderColor: colors.primary,
      },
    }),
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      '&:hover': {
        backgroundColor: colors.primaryHover,
        borderColor: colors.primaryHover,
        transform: 'translateY(-1px)',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  iconContainerPrimary: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  labelPrimary: {
    color: colors.white,
    fontWeight: '600',
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

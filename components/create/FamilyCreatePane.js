import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { Activity, GraduationCap, Users, BookOpen } from 'lucide-react';
import MessagesPaneCloseButton from '../messages/MessagesPaneCloseButton';

const CREATE_OPTIONS = [
  {
    id: 'event',
    label: 'New event',
    description: 'Schedule a lesson, exam, or activity',
    icon: Activity,
    iconBg: 'rgba(99, 102, 241, 0.12)',
    iconBorder: 'rgba(99, 102, 241, 0.35)',
    iconColor: '#4F46E5',
  },
  {
    id: 'subject',
    label: 'New subject',
    description: 'Add a course for your school year',
    icon: GraduationCap,
    iconBg: 'rgba(16, 185, 129, 0.12)',
    iconBorder: 'rgba(16, 185, 129, 0.35)',
    iconColor: '#059669',
  },
  {
    id: 'child',
    label: 'New child',
    description: 'Add a student to your family',
    icon: Users,
    iconBg: 'rgba(236, 72, 153, 0.12)',
    iconBorder: 'rgba(236, 72, 153, 0.35)',
    iconColor: '#DB2777',
  },
  {
    id: 'material',
    label: 'New material',
    description: 'Add a book, link, or resource',
    icon: BookOpen,
    iconBg: 'rgba(245, 158, 11, 0.12)',
    iconBorder: 'rgba(245, 158, 11, 0.35)',
    iconColor: '#D97706',
  },
];

export default function FamilyCreatePane({
  placement = 'left',
  onClosePane = null,
  onSelectOption = null,
  disabledOptions = {},
}) {
  const showPaneClose = placement === 'left' && typeof onClosePane === 'function';

  return (
    <View style={[
      styles.container,
      styles.containerFlex,
      placement === 'left' ? styles.containerLeft : styles.containerRight,
    ]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Create</Text>
        {showPaneClose ? (
          <MessagesPaneCloseButton
            onPress={onClosePane}
            accessibilityLabel="Close create panel"
          />
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Create new</Text>
        {CREATE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const disabled = Boolean(disabledOptions[option.id]);
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.optionRow, disabled && styles.optionRowDisabled]}
              onPress={() => {
                if (disabled) return;
                onSelectOption?.(option.id);
              }}
              disabled={disabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled }}
              {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
            >
              <View style={[
                styles.optionIconWrap,
                {
                  backgroundColor: option.iconBg,
                  borderColor: option.iconBorder,
                },
              ]}>
                <Icon size={20} color={disabled ? '#94A3B8' : option.iconColor} />
              </View>
              <View style={styles.optionBody}>
                <Text style={[styles.optionLabel, disabled && styles.optionLabelDisabled]}>
                  {option.label}
                </Text>
                <Text style={[styles.optionDescription, disabled && styles.optionDescriptionDisabled]}>
                  {option.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  containerFlex: {
    flex: 1,
    minHeight: 0,
  },
  containerLeft: {
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  containerRight: {
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionRowDisabled: {
    opacity: 0.45,
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  optionLabelDisabled: {
    color: '#94A3B8',
  },
  optionDescription: {
    fontSize: 13,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  optionDescriptionDisabled: {
    color: '#CBD5E1',
  },
});

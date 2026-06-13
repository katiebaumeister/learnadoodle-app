import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { Calendar, BookOpen, Smile, Upload, FileText, GraduationCap } from 'lucide-react';
import MessagesPaneCloseButton from '../messages/MessagesPaneCloseButton';

/** Match AppModalShell hero icons on add modals (TaskCreateModal, AddSubjectModal, etc.) */
const CREATE_ICON_STYLE = {
  iconBg: '#F0F8FF',
  iconBorder: 'rgba(158, 207, 251, 0.45)',
  iconColor: '#9ECFFB',
};

const CREATE_SECTIONS = [
  {
    options: [
      { id: 'calendar_event', label: 'Calendar Event', icon: Calendar, ...CREATE_ICON_STYLE },
      { id: 'assignment', label: 'Assignment', icon: FileText, ...CREATE_ICON_STYLE },
    ],
  },
  {
    options: [
      { id: 'subject', label: 'New Subject', icon: BookOpen, ...CREATE_ICON_STYLE },
      { id: 'child', label: 'New Child', icon: Smile, ...CREATE_ICON_STYLE },
    ],
  },
  {
    options: [
      { id: 'material', label: 'Upload Resource', icon: Upload, ...CREATE_ICON_STYLE },
    ],
  },
];

export default function FamilyCreatePane({
  placement = 'left',
  onClosePane = null,
  onSelectOption = null,
  disabledOptions = {},
}) {
  const showPaneClose = placement === 'left' && typeof onClosePane === 'function';

  const renderOption = (option) => {
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
          <Icon size={26} color={disabled ? '#94A3B8' : option.iconColor} />
        </View>
        <Text style={[styles.optionLabel, disabled && styles.optionLabelDisabled]}>
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  };

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
        {CREATE_SECTIONS.map((section, sectionIndex) => (
          <View key={`section-${sectionIndex}`}>
            {sectionIndex > 0 ? <View style={styles.sectionDivider} /> : null}
            {section.options.map((option) => renderOption(option))}
          </View>
        ))}
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
  containerLeft: {},
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
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
    marginHorizontal: 16,
    marginVertical: 8,
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
    flexShrink: 0,
  },
  optionLabel: {
    flex: 1,
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
});

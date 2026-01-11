import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Menu, ChevronLeft, ChevronRight, Search, HelpCircle, Settings, Calendar, CheckSquare, ChevronDown } from 'lucide-react';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../theme/pastelDesignTokens';

export default function GoogleCalendarTopBar({ 
  currentDateRange = 'Nov - Dec 2025',
  viewMode = 'Week',
  onToday,
  onPrev,
  onNext,
  onViewChange,
  onMenuPress,
  onSearchPress,
  onSettingsPress,
  onProfilePress,
  user
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [showDateRangeDropdown, setShowDateRangeDropdown] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: tokens.surface, borderBottomColor: tokens.border }]}>
      {/* Left Section */}
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onMenuPress || (() => {})}
        >
          <Menu size={20} color={tokens.text} />
        </TouchableOpacity>

        <View style={styles.logoSection}>
          <View style={[styles.logoIcon, { backgroundColor: '#4285F4' }]}>
            <Text style={styles.logoNumber}>6</Text>
          </View>
          <Text style={[styles.logoText, { color: tokens.text }]}>Calendar</Text>
        </View>

        <TouchableOpacity
          style={[styles.todayButton, { borderColor: tokens.border, backgroundColor: tokens.bg }]}
          onPress={onToday || (() => {})}
        >
          <Text style={[styles.todayButtonText, { color: tokens.text }]}>Today</Text>
        </TouchableOpacity>

        <View style={styles.navigationArrows}>
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={onPrev || (() => {})}
          >
            <ChevronLeft size={20} color={tokens.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={onNext || (() => {})}
          >
            <ChevronRight size={20} color={tokens.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.dateRangeButton}
          onPress={() => setShowDateRangeDropdown(!showDateRangeDropdown)}
        >
          <Text style={[styles.dateRangeText, { color: tokens.text }]}>{currentDateRange}</Text>
          <ChevronDown size={16} color={tokens.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Right Section */}
      <View style={styles.rightSection}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onSearchPress || (() => {})}
        >
          <Search size={20} color={tokens.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {}}
        >
          <HelpCircle size={20} color={tokens.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onSettingsPress || (() => {})}
        >
          <View style={styles.settingsButton}>
            <Settings size={20} color={tokens.text} />
            <View style={[styles.settingsDot, { backgroundColor: '#4285F4' }]} />
          </View>
        </TouchableOpacity>

        {/* View Selector */}
        <View style={styles.viewSelector}>
          <TouchableOpacity
            style={[styles.viewButton, { backgroundColor: tokens.accentSoft }]}
            onPress={() => setShowViewDropdown(!showViewDropdown)}
          >
            <Text style={[styles.viewButtonText, { color: tokens.text }]}>{viewMode}</Text>
            <ChevronDown size={14} color={tokens.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Calendar/Tasks Toggle */}
        <View style={[styles.toggleGroup, { borderColor: tokens.border }]}>
          <TouchableOpacity
            style={[styles.toggleButton, styles.toggleButtonLeft, { backgroundColor: tokens.accentSoft }]}
          >
            <Calendar size={16} color={tokens.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, styles.toggleButtonRight, { backgroundColor: tokens.bg }]}
          >
            <CheckSquare size={16} color={tokens.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Profile */}
        <TouchableOpacity
          style={[styles.profileButton, { backgroundColor: tokens.accentSoft }]}
          onPress={onProfilePress || (() => {})}
        >
          <Text style={[styles.profileInitial, { color: tokens.accent }]}>
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    height: 64,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }),
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconButton: {
    padding: spacing.xs,
    borderRadius: radius.md,
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0,
  },
  todayButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  navigationArrows: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  arrowButton: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    minHeight: 36,
  },
  dateRangeText: {
    fontSize: 14,
    fontWeight: '400',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsButton: {
    position: 'relative',
  },
  settingsDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  viewSelector: {
    marginLeft: spacing.sm,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    minHeight: 36,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggleGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  toggleButton: {
    padding: spacing.xs,
    minWidth: 40,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonLeft: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.1)',
  },
  toggleButtonRight: {
    // No border
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  profileInitial: {
    fontSize: 14,
    fontWeight: '600',
  },
});

















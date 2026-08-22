import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ACCENT_TEXT } from '../create/shared/createModalStyles';
import { getWorkspaceCapabilities } from '../../lib/planningMode';

const ALL_TABS = [
  { id: 'bulletin', label: 'Bulletin Board' },
  { id: 'classwork', label: 'Classwork' },
  { id: 'materials', label: 'Materials' },
  { id: 'grades', label: 'Grades' },
  { id: 'attendance', label: 'Attendance' },
];

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export default function SubjectClassroomTabs({
  activeTab = 'bulletin',
  onChange,
  planningMode = null,
  featureSettings = null,
  studentSelfManagedNoParent = false,
}) {
  const tabs = useMemo(() => {
    const caps = getWorkspaceCapabilities({
      familyApproach: planningMode,
      featureSettings,
      studentSelfManagedNoParent,
    });
    return ALL_TABS.filter((tab) => {
      if (tab.id === 'materials' && !caps.showMaterials) return false;
      if (tab.id === 'grades' && !caps.showGrades) return false;
      if (tab.id === 'attendance' && !caps.showAttendance) return false;
      return true;
    });
  }, [planningMode, featureSettings, studentSelfManagedNoParent]);

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange?.(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
    }),
  },
  tab: {
    paddingTop: 0,
    paddingBottom: 10,
    paddingHorizontal: 16,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    maxWidth: '100%',
    ...(Platform.OS === 'web' && {
      transition: 'border-color 0.15s ease, color 0.15s ease',
    }),
  },
  tabActive: {
    borderBottomColor: ACCENT_TEXT,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: -0.1,
    ...LEAGUE_FONT,
  },
  labelActive: {
    color: ACCENT_TEXT,
  },
});

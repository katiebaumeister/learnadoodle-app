import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const TABS = [
  { id: 'bulletin', label: 'Bulletin Board' },
  { id: 'classwork', label: 'Classwork' },
  { id: 'grades', label: 'Grades' },
];

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export default function SubjectClassroomTabs({
  activeTab = 'bulletin',
  onChange,
  bulletinCaption = null,
  classworkCaption = null,
  gradesCaption = null,
}) {
  const captions = {
    bulletin: bulletinCaption,
    classwork: classworkCaption,
    grades: gradesCaption,
  };

  return (
    <View style={styles.row}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tile, active && styles.tileActive]}
            onPress={() => onChange?.(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.label}>{tab.label}</Text>
            {captions[tab.id] ? (
              <Text style={styles.caption} numberOfLines={2}>
                {captions[tab.id]}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginBottom: 8,
    width: '100%',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
    }),
  },
  tile: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    gap: 4,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  tileActive: {
    backgroundColor: '#F1F5F9',
    borderColor: 'rgba(148, 163, 184, 0.32)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
    }),
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: -0.2,
    ...LEAGUE_FONT,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: '#64748B',
    ...LEAGUE_FONT,
  },
});

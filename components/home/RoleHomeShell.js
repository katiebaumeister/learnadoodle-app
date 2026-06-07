/**
 * RoleHomeShell
 * 
 * Shared responsive layout shell for all role-based home screens.
 * Provides consistent grid layout: full-width hero + 2-column main/rail on desktop.
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

export default function RoleHomeShell({ main, rail }) {
  return (
    <View style={styles.container}>
      {/* Responsive grid */}
      <View style={styles.gridContainer}>
        {/* Left: Main column (full width when no rail) */}
        <View style={[styles.leftSection, !rail && styles.leftSectionFullWidth]}>
          {main}
        </View>

        {/* Right rail (desktop only) - spans full height */}
        {rail && (
          <View style={styles.railColumn}>
            {rail}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    backgroundColor: '#F8F9FA',
    ...(Platform.OS === 'web' && {
      maxWidth: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 24,
    }),
    ...(Platform.OS !== 'web' && {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
    }),
  },
  gridContainer: {
    flexDirection: 'column',
    flex: 1,
    gap: 14,
    ...(Platform.OS === 'web' && {
      flexDirection: 'row',
      alignItems: 'stretch',
      display: 'flex',
      minHeight: 0,
      gap: 14,
    }),
  },
  leftSection: {
    flex: 1,
    backgroundColor: 'transparent',
    gap: 12,
    ...(Platform.OS === 'web' && {
      flex: 2.55,
      minWidth: 0,
      maxWidth: 'calc(71.2% - 7px)',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      alignSelf: 'stretch',
    }),
  },
  leftSectionFullWidth: {
    ...(Platform.OS === 'web' && {
      maxWidth: '100%',
    }),
  },
  railColumn: {
    ...(Platform.OS === 'web' && {
      flex: 1,
      minWidth: 236,
      maxWidth: 'calc(28.8% - 7px)',
      minHeight: 0,
      height: '100%',
      alignSelf: 'stretch',
      display: 'flex',
      flexDirection: 'column',
    }),
  },
});

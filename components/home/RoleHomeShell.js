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
    width: '100%',
    /* Match main app surface so gutters / column gap aren’t blue-gray */
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 36,
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
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      flex: 2.55,
      minWidth: 0,
      maxWidth: 'calc(71.2% - 7px)',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      alignSelf: 'stretch',
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(15, 23, 42, 0.08)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
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
      display: 'flex',
      flexDirection: 'column',
      alignSelf: 'stretch',
    }),
  },
});

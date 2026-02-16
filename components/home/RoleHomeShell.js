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
        {/* Left: Main column */}
        <View style={styles.leftSection}>
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
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      alignSelf: 'center',
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 40,
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
    gap: 16,
    ...(Platform.OS === 'web' && {
      flexDirection: 'row',
      alignItems: 'stretch',
      display: 'flex',
      minHeight: 0,
      gap: 16,
    }),
  },
  leftSection: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      flex: 2,
      minWidth: 0,
      maxWidth: 'calc(66.666% - 8px)',
      display: 'flex',
      flexDirection: 'column',
      alignSelf: 'stretch',
    }),
  },
  railColumn: {
    ...(Platform.OS === 'web' && {
      flex: 1,
      minWidth: 280,
      maxWidth: 'calc(33.333% - 8px)',
      display: 'flex',
      flexDirection: 'column',
      alignSelf: 'stretch',
    }),
  },
});

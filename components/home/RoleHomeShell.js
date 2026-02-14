/**
 * RoleHomeShell
 * 
 * Shared responsive layout shell for all role-based home screens.
 * Provides consistent grid layout: full-width hero + 2-column main/rail on desktop.
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import HomeHeroCard from './HomeHeroCard';

export default function RoleHomeShell({ heroProps, main, rail }) {
  return (
    <View style={styles.container}>
      {/* Top: Full-width hero */}
      {heroProps && (
        <View style={styles.heroContainer}>
          <HomeHeroCard {...heroProps} />
        </View>
      )}

      {/* Below: Responsive grid */}
      <View style={styles.gridContainer}>
        {/* Main column */}
        <View style={styles.mainColumn}>
          {main}
        </View>

        {/* Right rail (desktop only) */}
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
  heroContainer: {
    marginBottom: 24,
    ...(Platform.OS !== 'web' && {
      marginBottom: 20,
    }),
  },
  gridContainer: {
    flexDirection: 'column',
    ...(Platform.OS === 'web' && {
      flexDirection: 'row',
      alignItems: 'flex-start',
      display: 'flex',
    }),
  },
  mainColumn: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      flex: 2,
      minWidth: 0,
      marginRight: 24,
      maxWidth: 'calc(66.666% - 12px)',
    }),
  },
  railColumn: {
    ...(Platform.OS === 'web' && {
      flex: 1,
      minWidth: 280,
      maxWidth: 'calc(33.333% - 12px)',
    }),
  },
});

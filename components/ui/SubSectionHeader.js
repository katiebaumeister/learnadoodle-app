/**
 * SubSectionHeader Component
 * Smaller header for subsections within a section
 * 
 * Usage:
 * <SubSectionHeader title="Subsection Title" />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function SubSectionHeader({ 
  title, 
  subtitle,
  showDivider = false,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {showDivider && <View style={styles.divider} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20, // mt-5
    marginBottom: 12, // mb-3
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14, // text-sm
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
    marginBottom: 4, // mb-1
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 8, // mt-2
  },
});


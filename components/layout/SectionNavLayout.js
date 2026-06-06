import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import SecondaryNavShell from './SecondaryNavShell';

export default function SectionNavLayout({
  title,
  sections,
  activeSection,
  onSectionChange,
  children,
}) {
  return (
    <View style={styles.root}>
      <SecondaryNavShell
        title={title}
        sections={sections}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      minHeight: '100%',
    }),
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
});

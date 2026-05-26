/**
 * One-step welcome for child + tutor (no planner walkthrough).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';

const formatSectionList = (sections) => {
  if (!Array.isArray(sections) || sections.length === 0) return 'Home';
  if (sections.length === 1) return sections[0];
  if (sections.length === 2) return `${sections[0]} and ${sections[1]}`;
  return `${sections.slice(0, -1).join(', ')}, and ${sections[sections.length - 1]}`;
};

const buildBodyText = (sectionsInput) => {
  const sections = (Array.isArray(sectionsInput) ? sectionsInput : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const uniqueSections = [...new Set(sections)];
  if (uniqueSections.length === 0) {
    return 'Use Home to stay on track with your learning.';
  }
  const listLabel = formatSectionList(uniqueSections);
  return `Use ${listLabel} to stay on track with your learning.`;
};

export default function LearnerQuickStartModal({ visible, onGotIt, onSkip, visibleSections = [] }) {
  const bodyText = buildBodyText(visibleSections);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome to Learnadoodle</Text>
          <Text style={styles.body}>
            {bodyText}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={onSkip} style={styles.skip} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={styles.skipText}>{"Don't show again"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onGotIt} style={styles.primary} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={styles.primaryText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    maxWidth: 420,
    width: '100%',
    ...(Platform.OS === 'web' && { boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }),
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  body: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 20,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skip: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  primary: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

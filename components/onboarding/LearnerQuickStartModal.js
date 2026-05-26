/**
 * One-step welcome for child + tutor (no planner walkthrough).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import { Check } from 'lucide-react';

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

export default function LearnerQuickStartModal({ visible, onGotIt, visibleSections = [] }) {
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
            <TouchableOpacity onPress={onGotIt} style={styles.primary} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Check size={16} color="#FFFFFF" strokeWidth={3} />
              <Text style={styles.primaryText}>GOT IT!</Text>
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
    justifyContent: 'flex-end',
    gap: 12,
  },
  primary: {
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});

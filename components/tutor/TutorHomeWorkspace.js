/**
 * Tutor home — same structural pattern as parent/child (hero + main + right rail),
 * copy and actions tuned for guidance, not administration.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import RoleHomeShell from '../home/RoleHomeShell';
import TutorHomeRightRail from './TutorHomeRightRail';
import { colors } from '../../theme/colors';

export default function TutorHomeWorkspace({ familyId, onNavigate }) {
  const openEvent = (eventId) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && eventId) {
      window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: String(eventId) } }));
    }
  };

  const main = (
    <View style={styles.main}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Tutor workspace</Text>
        <Text style={styles.heroTitle}>Support, don’t own the plan</Text>
        <Text style={styles.heroSub}>
          See who needs a response, what students are working on, and what’s coming up — without full family
          administration.
        </Text>
      </View>
      <View style={styles.hintBox}>
        <Text style={styles.hintText}>
          Planner opens in view-first mode. Use notes and suggestions; parents keep scheduling authority.
        </Text>
      </View>
    </View>
  );

  const rail = (
    <TutorHomeRightRail
      familyId={familyId}
      onOpenEvent={openEvent}
      onOpenPlanner={() => onNavigate?.('planner')}
    />
  );

  return <RoleHomeShell main={main} rail={rail} />;
}

const styles = StyleSheet.create({
  main: {
    padding: 20,
    gap: 16,
  },
  hero: {
    gap: 8,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  hintBox: {
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.12)',
  },
  hintText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
});

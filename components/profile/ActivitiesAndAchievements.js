import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing } from '../../theme/pastelDesignTokens';
import ExtracurricularLog from './ExtracurricularLog';
import VolunteerHours from './VolunteerHours';

export default function ActivitiesAndAchievements({ childId, familyId }) {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <ExtracurricularLog childId={childId} familyId={familyId} />
      </View>
      <View style={styles.section}>
        <VolunteerHours childId={childId} familyId={familyId} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing['3xl'],
  },
  section: {
    gap: spacing.md,
  },
});



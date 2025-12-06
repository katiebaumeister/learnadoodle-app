import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * ProficiencyBar Component
 * Displays a segmented bar showing mastery distribution
 * 
 * @param {number} mastered - Count of mastered standards
 * @param {number} developing - Count of developing standards
 * @param {number} needs_work - Count of needs_work standards
 * @param {number} not_attempted - Count of not_attempted standards
 */
export default function ProficiencyBar({
  mastered = 0,
  developing = 0,
  needs_work = 0,
  not_attempted = 0,
}) {
  const total = mastered + developing + needs_work + not_attempted;
  
  const percentages = total > 0 ? {
    mastered: (mastered / total) * 100,
    developing: (developing / total) * 100,
    needs_work: (needs_work / total) * 100,
    not_attempted: (not_attempted / total) * 100,
  } : { mastered: 0, developing: 0, needs_work: 0, not_attempted: 0 };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {percentages.mastered > 0 && (
          <View 
            style={[
              styles.segment, 
              styles.mastered, 
              { width: `${percentages.mastered}%` }
            ]} 
          />
        )}
        {percentages.developing > 0 && (
          <View 
            style={[
              styles.segment, 
              styles.developing, 
              { width: `${percentages.developing}%` }
            ]} 
          />
        )}
        {percentages.needs_work > 0 && (
          <View 
            style={[
              styles.segment, 
              styles.needsWork, 
              { width: `${percentages.needs_work}%` }
            ]} 
          />
        )}
        {percentages.not_attempted > 0 && (
          <View 
            style={[
              styles.segment, 
              styles.notAttempted, 
              { width: `${percentages.not_attempted}%` }
            ]} 
          />
        )}
      </View>
      <View style={styles.counts}>
        <Text style={styles.countText}>
          {mastered}M {developing}D {needs_work}N {not_attempted}NA
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 8,
  },
  bar: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  segment: {
    height: '100%',
  },
  mastered: {
    backgroundColor: colors.greenBold,
  },
  developing: {
    backgroundColor: colors.yellowBold,
  },
  needsWork: {
    backgroundColor: colors.orangeBold,
  },
  notAttempted: {
    backgroundColor: colors.muted,
  },
  counts: {
    marginTop: 4,
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
});


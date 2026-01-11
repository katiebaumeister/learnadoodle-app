/**
 * Learning Biography Component
 * Auto-generates a learning biography based on student data
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { designTokens } from '../../../theme/designTokens';
import { colors } from '../../../theme/colors';

export default function LearningBiography({ childId, childName }) {

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.comingSoonContainer}>
        <Text style={styles.comingSoonText}>Coming Soon</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
  comingSoonText: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
    color: colors.muted,
  },
});


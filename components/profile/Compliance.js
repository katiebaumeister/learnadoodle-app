import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { designTokens } from '../../theme/designTokens';
import { colors } from '../../theme/colors';

export default function Compliance({ childId, familyId }) {
  return (
    <View style={styles.container}>
      <Text style={styles.comingSoonText}>Coming Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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

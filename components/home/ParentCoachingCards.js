/**
 * Parent Coaching Cards
 * Co-Star style - 3 cards max showing what parent can do today
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function ParentCoachingCards({ 
  suggestions = []
}) {
  // Limit to 3 suggestions max
  const displaySuggestions = suggestions.slice(0, 3);
  
  if (displaySuggestions.length === 0) return null;
  
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Here's what you can do today</Text>
      <View style={styles.divider} />
      <View style={styles.bulletsList}>
        {displaySuggestions.map((suggestion, index) => (
          <View key={index} style={styles.bulletItem}>
            <Text style={styles.bulletText}>• {suggestion.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  bulletsList: {
    gap: 6,
  },
  bulletItem: {
    paddingVertical: 2,
  },
  bulletText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
});


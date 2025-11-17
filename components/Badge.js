import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { rainbow } from '../theme/colors';

/**
 * Badge/Chip component with soft rainbow colors
 * Used for categories, tags, status indicators
 */
export default function Badge({ 
  color = 'blue', 
  children, 
  style 
}) {
  const colorMap = {
    red: { bg: rainbow.red.soft, fg: rainbow.red.bold },
    orange: { bg: rainbow.orange.soft, fg: rainbow.orange.bold },
    yellow: { bg: rainbow.yellow.soft, fg: rainbow.yellow.bold },
    green: { bg: rainbow.green.soft, fg: rainbow.green.bold },
    blue: { bg: rainbow.blue.soft, fg: rainbow.blue.bold },
    indigo: { bg: rainbow.indigo.soft, fg: rainbow.indigo.bold },
    violet: { bg: rainbow.violet.soft, fg: rainbow.violet.bold },
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.badgeText, { color: colors.fg }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e6e7eb',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
});


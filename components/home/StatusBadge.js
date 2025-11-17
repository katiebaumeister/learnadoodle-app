import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function StatusBadge({ status = 'unknown' }) {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'teach':
        return {
          bg: colors.greenSoft,
          text: colors.greenBold,
          label: 'Teach'
        };
      case 'off':
        return {
          bg: colors.panel,
          text: colors.muted,
          label: 'Off'
        };
      case 'partial':
        return {
          bg: colors.yellowSoft,
          text: colors.yellowBold,
          label: 'Partial'
        };
      default:
        return {
          bg: colors.panel,
          text: colors.muted,
          label: 'Unknown'
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.text }]}>
      <Text style={[styles.text, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react';

/**
 * Compact subject dashboard strip — surfaces actionable items without re-enabling
 * full Assignments / Grades / Attendance / Units sections.
 */
export default function SubjectNeedsAttentionStrip({ items = [] }) {
  if (!items.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Needs attention</Text>
        <Text style={styles.allClear}>All caught up for this subject.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Needs attention</Text>
      <View style={styles.list}>
        {items.map((item) => {
          const RowWrapper = item.onPress ? TouchableOpacity : View;
          return (
            <RowWrapper
              key={item.key}
              style={styles.row}
              onPress={item.onPress}
              disabled={!item.onPress}
              accessibilityRole={item.onPress ? 'button' : undefined}
              accessibilityLabel={item.text}
              {...(Platform.OS === 'web' && item.onPress ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.bullet}>•</Text>
              <Text style={[styles.rowText, item.emphasis && styles.rowTextEmphasis]} numberOfLines={2}>
                {item.text}
              </Text>
              {item.onPress ? <ChevronRight size={16} color="#94A3B8" /> : null}
            </RowWrapper>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    padding: 16,
    marginBottom: 20,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  allClear: {
    fontSize: 14,
    color: '#A16207',
    lineHeight: 20,
  },
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 158, 11, 0.15)',
  },
  bullet: {
    fontSize: 16,
    color: '#D97706',
    lineHeight: 20,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
  rowTextEmphasis: {
    fontWeight: '600',
  },
});

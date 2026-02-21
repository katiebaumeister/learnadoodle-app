import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react';

export default function ExceptionsPanel({ items = [], onItemPress }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Needs attention</Text>
      <View style={styles.list}>
        {items.slice(0, 10).map((item, i) => (
          <TouchableOpacity
            key={item.id || i}
            style={styles.row}
            onPress={() => onItemPress && onItemPress(item)}
          >
            <AlertCircle size={16} color="#D97706" style={styles.icon} />
            <View style={styles.content}>
              <Text style={styles.primary}>
                {item.dateLabel} — {item.childName}
              </Text>
              <Text style={styles.secondary}>{item.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      {items.length > 10 && (
        <Text style={styles.more}>+{items.length - 10} more</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 12,
  },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: { marginRight: 8, marginTop: 2 },
  content: { flex: 1 },
  primary: { fontSize: 13, fontWeight: '500', color: '#111827' },
  secondary: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  more: { fontSize: 12, color: '#6B7280', marginTop: 8 },
});

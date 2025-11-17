import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';
import { formatDate } from '../../lib/apiClient';

export default function FlexibleList({ items, onDragStart, onAutoPlace, onDelete }) {
  if (!items || items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No flexible tasks</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <View key={item.id} style={styles.item}>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>{item.title || 'Untitled Task'}</Text>
            <View style={styles.itemMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Flexible</Text>
                {item.estimated_minutes && (
                  <>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Clock size={12} color={colors.muted} />
                    <Text style={styles.metaValue}>{item.estimated_minutes}m</Text>
                  </>
                )}
                {item.due_ts && (
                  <>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Calendar size={12} color={colors.muted} />
                    <Text style={styles.metaValue}>Due {formatDate(item.due_ts)}</Text>
                  </>
                )}
              </View>
            </View>
            {item.notes && (
              <Text style={styles.itemNotes} numberOfLines={2}>
                {item.notes}
              </Text>
            )}
          </View>
          <View style={styles.itemActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onAutoPlace?.(item)}
            >
              <Text style={styles.actionButtonText}>Auto-place</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => onDelete?.(item.id)}
            >
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  item: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  itemMeta: {
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  metaSeparator: {
    fontSize: 12,
    color: colors.muted,
  },
  metaValue: {
    fontSize: 12,
    color: colors.muted,
  },
  itemNotes: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  deleteButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteButtonText: {
    color: colors.text,
  },
});


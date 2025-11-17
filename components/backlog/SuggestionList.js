import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, Calendar, Sparkles } from 'lucide-react';
import { colors } from '../../theme/colors';
import { formatDate } from '../../lib/apiClient';

export default function SuggestionList({ items, onAccept, onDismiss }) {
  if (!items || items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No suggestions</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <View key={item.id} style={styles.item}>
          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <Sparkles size={14} color={colors.primary} />
              <Text style={styles.itemTitle}>{item.title || 'Untitled Lesson'}</Text>
            </View>
            <View style={styles.itemMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Lesson {item.section_position || 'N/A'}</Text>
                {item.estimated_minutes && (
                  <>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Clock size={12} color={colors.muted} />
                    <Text style={styles.metaValue}>{item.estimated_minutes}m</Text>
                  </>
                )}
                {item.suggested_start_ts && (
                  <>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Calendar size={12} color={colors.muted} />
                    <Text style={styles.metaValue}>Suggest {formatDate(item.suggested_start_ts)}</Text>
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
              style={styles.acceptButton}
              onPress={() => onAccept?.(item)}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={() => onDismiss?.(item.id)}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
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
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
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
  acceptButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
});


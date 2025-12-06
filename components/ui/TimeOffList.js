import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Edit, Trash2 } from 'lucide-react';

/**
 * TimeOffList Component
 * List of time off entries with edit/delete actions
 */
export default function TimeOffList({
  timeOffs = [],
  onEdit,
  onDelete,
}) {
  const formatDateRange = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: startDate.getFullYear() !== endDate.getFullYear() ? 'numeric' : undefined });
    
    if (startStr === endStr) {
      return startStr;
    }
    
    return `${startStr} - ${endStr}`;
  };

  if (timeOffs.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No time off scheduled</Text>
        <Text style={styles.emptySubtext}>Add breaks, holidays, or travel periods above</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {timeOffs.map((timeOff) => (
        <View key={timeOff.id} style={styles.item}>
          <View style={styles.itemLeft}>
            <View style={[styles.itemStripe, { backgroundColor: '#7c8cff' }]} />
            <View style={styles.itemContent}>
              <Text style={styles.itemDateRange}>
                {formatDateRange(timeOff.starts_on || timeOff.start, timeOff.ends_on || timeOff.end)}
              </Text>
              {timeOff.reason && (
                <Text style={styles.itemReason}>{timeOff.reason}</Text>
              )}
            </View>
          </View>
          <View style={styles.itemActions}>
            {onEdit && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onEdit(timeOff)}
                activeOpacity={0.7}
              >
                <Edit size={16} color="#6b7280" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onDelete(timeOff)}
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    }),
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemStripe: {
    width: 4,
    height: '100%',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 4,
  },
  itemDateRange: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  itemReason: {
    fontSize: 12,
    color: '#6b7280',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 12,
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      ':hover': {
        backgroundColor: '#f3f4f6',
      },
    }),
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

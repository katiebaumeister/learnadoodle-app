import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronRight } from 'lucide-react';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

export default function BacklogCard({
  backlogItems = [],
  backlogCount = 0,
  children = [],
  onViewBacklog,
}) {
  const getChildName = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    return child?.first_name || child?.name || 'Unknown';
  };

  const getChildColor = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    if (!child) return '#94A3B8';
    return getChildColorFromAvatar(child.avatar);
  };

  // Ensure count and items are in sync
  const actualItemCount = backlogItems && backlogItems.length > 0 ? backlogItems.length : 0;
  // If count is 0, don't show items even if array has items (data inconsistency)
  // If count > 0 but no items, show empty state
  // If count > 0 and items exist, show items
  const shouldShowItems = backlogCount > 0 && actualItemCount > 0;
  const displayCount = backlogCount;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <View 
      style={[
        styles.container,
        Platform.OS === 'web' && isHovered && styles.containerHovered
      ]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      })}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Backlog</Text>
          <Text style={styles.subtitle}>{displayCount} waiting</Text>
        </View>
        {onViewBacklog && (
          <TouchableOpacity
            style={styles.viewLink}
            onPress={onViewBacklog}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.viewLinkText}>View backlog</Text>
            <ChevronRight size={16} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      {shouldShowItems ? (
        <View style={styles.itemsList}>
          {backlogItems.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.child_id && (
                  <View style={[styles.itemPill, { backgroundColor: getChildColor(item.child_id) + '20' }]}>
                    <Text style={[styles.itemPillText, { color: getChildColor(item.child_id) }]}>
                      {getChildName(item.child_id)}
                    </Text>
                  </View>
                )}
                {item.due_time && (
                  <Text style={styles.itemDue}>{item.due_time}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nothing waiting—nice.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
    } : {
      elevation: 2,
    }),
  },
  containerHovered: {
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -1 }],
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  viewLinkText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemsList: {
    gap: 12,
  },
  itemRow: {
    paddingVertical: 8,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemPill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  itemPillText: {
    fontSize: 11,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemDue: {
    fontSize: 12,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

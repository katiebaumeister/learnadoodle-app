import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * CollapsibleCard Component
 * Reusable collapsible card with smooth animations
 */
export default function CollapsibleCard({
  title,
  description,
  isOpen,
  onToggle,
  children,
  summary,
  rightContent,
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        activeOpacity={0.7}
        {...(Platform.OS === 'web' && {
          cursor: 'pointer',
        })}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{title}</Text>
          {description && <Text style={styles.description}>{description}</Text>}
        </View>
        <View style={styles.headerRight}>
          {rightContent}
          {isOpen ? (
            <ChevronUp size={20} color="#64748b" />
          ) : (
            <ChevronDown size={20} color="#64748b" />
          )}
        </View>
      </TouchableOpacity>

      {/* Summary when collapsed */}
      {!isOpen && summary && (
        <View style={styles.summary}>
          {summary}
        </View>
      )}

      {/* Content when expanded */}
      {isOpen && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.3s ease-in-out',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.2s ease',
      ':hover': {
        backgroundColor: '#fafafa',
      },
    }),
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summary: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Calendar, Check, Link as LinkIcon } from 'lucide-react';

/**
 * CalendarTile Component
 * Tile card for calendar integration (Google, Apple, etc.)
 */
export default function CalendarTile({
  title,
  subtitle,
  icon: Icon = Calendar,
  iconColor = '#6b7280',
  connected = false,
  connectedLabel,
  primaryButtonLabel,
  primaryButtonOnPress,
  secondaryButtonLabel,
  secondaryButtonOnPress,
  children,
}) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
          <Icon size={24} color={iconColor} />
        </View>
        <View style={styles.tileInfo}>
          <View style={styles.tileTitleRow}>
            <Text style={styles.tileTitle}>{title}</Text>
            {connected && (
              <View style={styles.connectedBadge}>
                <Check size={14} color="#10b981" />
                <Text style={styles.connectedText}>{connectedLabel || 'Connected'}</Text>
              </View>
            )}
          </View>
          <Text style={styles.tileSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {children}

      {/* Action buttons */}
      <View style={styles.tileActions}>
        {primaryButtonOnPress && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={primaryButtonOnPress}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>
              {primaryButtonLabel || 'Connect'}
            </Text>
          </TouchableOpacity>
        )}
        {secondaryButtonOnPress && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={secondaryButtonOnPress}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>
              {secondaryButtonLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    gap: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
      ':hover': {
        borderColor: '#d1d5db',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  tileHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileInfo: {
    flex: 1,
  },
  tileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tileTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.3,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#d1fae5',
    borderRadius: 6,
  },
  connectedText: {
    fontSize: 11,
    color: '#065f46',
    fontWeight: '600',
  },
  tileSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  tileActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#7c8cff',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#6c7bf3',
      },
    }),
  },
  primaryButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#f9fafb',
      },
    }),
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});

/**
 * SectionHeader Component
 * Standardized section header for grouping content
 * 
 * Usage:
 * <SectionHeader title="Section Title" icon={Calendar} />
 * <SectionHeader title="Section Title" subtitle="Optional subtitle" actions={[...]} />
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../../theme/colors';

export default function SectionHeader({ 
  title, 
  subtitle,
  icon: Icon,
  iconColor = colors.indigo,
  actions = [],
  showDivider = false,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleSection}>
          {Icon && (
            <Icon size={20} color={iconColor} style={styles.icon} />
          )}
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        
        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.actionButton}
                onPress={action.onPress}
                disabled={action.disabled}
              >
                {action.icon && (
                  <action.icon size={16} color={colors.indigo} />
                )}
                {action.label && (
                  <Text style={styles.actionText}>{action.label}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      
      {showDivider && <View style={styles.divider} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16, // mb-4
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16, // gap-4
  },
  titleSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // gap-3
    minWidth: 0,
  },
  icon: {
    flexShrink: 0,
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18, // text-lg
    fontWeight: '600',
    color: colors.text,
    lineHeight: 24,
    marginBottom: 4, // mb-1
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8, // gap-2
    alignItems: 'center',
    flexShrink: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // gap-1.5
    paddingHorizontal: 12, // px-3
    paddingVertical: 6, // py-1.5
    borderRadius: 6, // rounded-md
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: colors.panel,
      },
    }),
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.indigo,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 12, // mt-3
  },
});


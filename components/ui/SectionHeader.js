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
            <Text 
              style={styles.title}
              {...(Platform.OS === 'web' ? { className: 'typography-section-header' } : {})}
            >
              {title}
            </Text>
            {subtitle && (
              <Text 
                style={styles.subtitle}
                {...(Platform.OS === 'web' ? { className: 'typography-secondary' } : {})}
              >
                {subtitle}
              </Text>
            )}
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
    marginBottom: 16, // --spacing-base (strict spacing: 16px)
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16, // --spacing-base (strict spacing: 16px)
  },
  titleSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // --spacing-md (strict spacing: 12px)
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
    // On web, typography-section-header class handles styling
    ...(Platform.OS === 'web' ? {} : {
      fontSize: 14, // typography-section-header: 14px
      fontWeight: '700',
      letterSpacing: 0.06,
      textTransform: 'uppercase',
      color: colors.text,
      lineHeight: 18.2, // 1.3 line-height
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    }),
    marginBottom: 4, // --spacing-xs (strict spacing: 4px)
  },
  subtitle: {
    // On web, typography-secondary class handles styling
    ...(Platform.OS === 'web' ? {} : {
      fontSize: 14,
      fontWeight: '400',
      color: colors.muted,
      lineHeight: 19.6, // 1.4 line-height
      opacity: 0.8,
    }),
  },
  actions: {
    flexDirection: 'row',
    gap: 8, // --spacing-sm (strict spacing: 8px)
    alignItems: 'center',
    flexShrink: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // Uses spacing scale: 6px (between 4 and 8, use 8)
    paddingHorizontal: 12, // --spacing-md (strict spacing: 12px)
    paddingVertical: 6, // Uses spacing scale: 6px (between 4 and 8, use 8)
    borderRadius: 14, // Button border-radius: 14px
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
    height: 1, // Hairline border
    backgroundColor: colors.border,
    marginTop: 12, // --spacing-md (strict spacing: 12px)
  },
});


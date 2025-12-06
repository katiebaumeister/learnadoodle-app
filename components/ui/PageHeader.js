/**
 * PageHeader Component
 * Standardized page header with title, subtitle, breadcrumbs, and actions
 * 
 * Usage:
 * <PageHeader
 *   title="Page Title"
 *   subtitle="Optional subtitle"
 *   breadcrumbs={[{ label: 'Home', onPress: () => {} }]}
 *   actions={[{ label: 'Action', icon: Plus, onPress: () => {}, primary: true }]}
 * />
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, shadows } from '../../theme/colors';

export default function PageHeader({ 
  title, 
  subtitle, 
  actions = [],
  showBreadcrumbs = false,
  breadcrumbs = [],
  icon: Icon,
  iconColor = colors.indigo,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.titleSection}>
        {showBreadcrumbs && breadcrumbs.length > 0 && (
          <View style={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                <TouchableOpacity onPress={crumb.onPress}>
                  <Text style={styles.breadcrumbText}>{crumb.label}</Text>
                </TouchableOpacity>
                {index < breadcrumbs.length - 1 && (
                  <Text style={styles.breadcrumbSeparator}>/</Text>
                )}
              </React.Fragment>
            ))}
          </View>
        )}
        <View style={styles.titleRow}>
          {Icon && <Icon size={24} color={iconColor} style={styles.titleIcon} />}
          <View style={styles.titleTextContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      </View>
      
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.actionButton,
                action.primary && styles.actionButtonPrimary,
                action.secondary && styles.actionButtonSecondary,
                action.disabled && styles.actionButtonDisabled,
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
            >
              {action.icon && (
                <action.icon 
                  size={16} 
                  color={action.primary ? colors.white : colors.text} 
                />
              )}
              <Text style={[
                styles.actionButtonText,
                action.primary && styles.actionButtonTextPrimary,
                action.secondary && styles.actionButtonTextSecondary,
              ]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24, // px-6
    paddingTop: 24, // pt-6
    paddingBottom: 16, // pb-4
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }),
  },
  titleSection: {
    flex: 1,
    minWidth: 0, // Allows text to truncate
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8, // mb-2
    gap: 8, // gap-2
  },
  breadcrumbText: {
    fontSize: 13,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      ':hover': {
        color: colors.text,
      },
    }),
  },
  breadcrumbSeparator: {
    fontSize: 13,
    color: colors.border,
    marginHorizontal: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // gap-3
  },
  titleIcon: {
    flexShrink: 0,
  },
  titleTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 24, // text-2xl
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4, // mb-1
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 8, // gap-2
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 16, // ml-4
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, // px-4
    paddingVertical: 8, // py-2
    borderRadius: 8, // rounded-lg
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 6, // gap-1.5
    ...shadows.sm,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: colors.panel,
      },
    }),
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...(Platform.OS === 'web' && {
      ':hover': {
        backgroundColor: colors.blueBold,
      },
    }),
  },
  actionButtonSecondary: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
  },
  actionButtonDisabled: {
    opacity: 0.5,
    ...(Platform.OS === 'web' && {
      cursor: 'not-allowed',
    }),
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  actionButtonTextPrimary: {
    color: colors.white,
  },
  actionButtonTextSecondary: {
    color: colors.muted,
  },
});


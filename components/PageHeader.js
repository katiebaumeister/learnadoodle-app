import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, shadows } from '../theme/colors';

/**
 * Reusable page header component with contextual actions
 * Used across different pages to provide consistent header styling
 * and quick actions
 */
export default function PageHeader({ 
  title, 
  subtitle, 
  actions = [],
  showBreadcrumbs = false,
  breadcrumbs = []
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
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.actionButton,
                action.primary && styles.actionButtonPrimary,
                action.secondary && styles.actionButtonSecondary
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
            >
              {action.icon && <action.icon size={16} color={action.primary ? '#ffffff' : '#374151'} />}
              <Text style={[
                styles.actionButtonText,
                action.primary && styles.actionButtonTextPrimary,
                action.secondary && styles.actionButtonTextSecondary
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
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  titleSection: {
    flex: 1,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  breadcrumbText: {
    fontSize: 13,
    color: colors.muted,
  },
  breadcrumbSeparator: {
    fontSize: 13,
    color: colors.border,
    marginHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 6,
    ...shadows.sm,
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionButtonSecondary: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  actionButtonTextPrimary: {
    color: colors.accentContrast,
  },
  actionButtonTextSecondary: {
    color: colors.muted,
  },
});


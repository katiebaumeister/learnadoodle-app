/**
 * EmptyState Component
 * Standardized empty state for when there's no content
 * 
 * Usage:
 * <EmptyState
 *   icon={Inbox}
 *   title="No items found"
 *   description="Get started by adding your first item"
 *   action={{ label: 'Add Item', onPress: () => {} }}
 * />
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../../theme/colors';

export default function EmptyState({ 
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'default', // 'default' | 'large' | 'small'
}) {
  const sizeConfig = {
    default: { iconSize: 48, padding: 60, titleSize: 16 },
    large: { iconSize: 64, padding: 80, titleSize: 18 },
    small: { iconSize: 32, padding: 40, titleSize: 14 },
  };
  
  const config = sizeConfig[size];
  
  return (
    <View style={[styles.container, { paddingVertical: config.padding }]}>
      {Icon && (
        <View style={styles.iconContainer}>
          <Icon size={config.iconSize} color={colors.muted} />
        </View>
      )}
      
      {title && (
        <Text style={[styles.title, { fontSize: config.titleSize }]}>
          {title}
        </Text>
      )}
      
      {description && (
        <Text style={styles.description}>
          {description}
        </Text>
      )}
      
      {(action || secondaryAction) && (
        <View style={styles.actions}>
          {action && (
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={action.onPress}
            >
              {action.icon && (
                <action.icon size={16} color={colors.white} style={styles.actionIcon} />
              )}
              <Text style={styles.primaryActionText}>{action.label}</Text>
            </TouchableOpacity>
          )}
          
          {secondaryAction && (
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={secondaryAction.onPress}
            >
              {secondaryAction.icon && (
                <secondaryAction.icon size={16} color={colors.indigo} style={styles.actionIcon} />
              )}
              <Text style={styles.secondaryActionText}>{secondaryAction.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24, // px-6
    minHeight: 200,
  },
  iconContainer: {
    marginBottom: 16, // mb-4
    opacity: 0.6,
  },
  title: {
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4, // mb-1
    textAlign: 'center',
    lineHeight: 24,
  },
  description: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 400,
    marginBottom: 24, // mb-6
  },
  actions: {
    flexDirection: 'row',
    gap: 12, // gap-3
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, // px-4
    paddingVertical: 10, // py-2.5
    borderRadius: 8, // rounded-lg
    backgroundColor: colors.indigo,
    gap: 6, // gap-1.5
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: colors.blueBold,
      },
    }),
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, // px-4
    paddingVertical: 10, // py-2.5
    borderRadius: 8, // rounded-lg
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6, // gap-1.5
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.indigo,
  },
  actionIcon: {
    flexShrink: 0,
  },
});


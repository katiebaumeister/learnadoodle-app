import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, HelpCircle, User } from 'lucide-react';
import { Breadcrumb } from './ui/Breadcrumb';
import { colors } from '../theme/colors';
import { designTokens } from '../theme/designTokens';

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 16,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  logoImage: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  breadcrumb: {
    paddingHorizontal: 8,
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designTokens.softAccents.core,
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});

export default function TopBar({
  breadcrumbs,
  rightExtras,
  onLogoPress,
  onHelpPress,
  onNotificationsPress,
  onAvatarPress,
  user,
}) {
  const showBreadcrumbs = breadcrumbs?.length > 1;
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <TouchableOpacity
          style={styles.logoButton}
          accessibilityRole="button"
          accessibilityLabel="Learnadoodle home"
          onPress={onLogoPress}
        >
          <Image source={require('../assets/icon.png')} style={styles.logoImage} />
        </TouchableOpacity>
        {showBreadcrumbs ? (
          <Breadcrumb items={breadcrumbs} style={styles.breadcrumb} />
        ) : null}
      </View>

      <View style={styles.right}>
        {rightExtras ? <View>{rightExtras}</View> : null}
        <TouchableOpacity
          style={styles.helpLink}
          onPress={onHelpPress}
          accessibilityRole="button"
          accessibilityLabel="Help and documentation"
        >
          <HelpCircle size={18} color={colors.muted} />
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onNotificationsPress}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={18} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={onAvatarPress}
          accessibilityRole="button"
          accessibilityLabel="Account and settings"
        >
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
          ) : (
            <User size={18} color={colors.muted} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

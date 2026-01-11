import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Bell, HelpCircle, User, Search } from 'lucide-react';
import { Breadcrumb } from './ui/Breadcrumb';
import { colors } from '../theme/colors';
import { designTokens } from '../theme/designTokens';

// Helper to validate if avatar is a valid URL (not just a UUID)
const isValidAvatarUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  
  // Check if it's just a UUID (invalid URL format)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return false; // It's just a UUID, not a valid URL
  }
  
  // Valid URLs must start with http://, https://, or data:
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:');
};

const styles = StyleSheet.create({
  bar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 16,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
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
    height: 32, // Increased height for zoomed in view
    width: 150, // Reduced to fit full logo without right cropping
    overflow: 'hidden',
    borderRadius: 6,
    justifyContent: 'center',
  },
  logoImage: {
    width: 150, // Reduced to fit within button
    height: 45, // Slightly reduced height
    borderRadius: 12,
    marginTop: -12, // Crop top significantly
    marginBottom: -12, // Crop bottom significantly
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  iconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designTokens.softAccents.core,
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});

export default function TopBar({
  breadcrumbs,
  rightExtras,
  onLogoPress,
  onSearchPress,
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
          <Image 
            source={require('../assets/learnadoodle-logo.png')} 
            style={styles.logoImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
        {showBreadcrumbs ? (
          <Breadcrumb items={breadcrumbs} style={styles.breadcrumb} />
        ) : null}
      </View>

      <View style={styles.right}>
        {rightExtras ? <View>{rightExtras}</View> : null}
        {onSearchPress && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onSearchPress}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Search size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.helpLink}
          onPress={onHelpPress}
          accessibilityRole="button"
          accessibilityLabel="Help and documentation"
        >
          <HelpCircle size={16} color={colors.muted} />
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onNotificationsPress}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={16} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={onAvatarPress}
          accessibilityRole="button"
          accessibilityLabel="Account and settings"
        >
          {user?.avatar && isValidAvatarUrl(user.avatar) ? (
            <Image 
              source={{ uri: user.avatar }} 
              style={styles.avatarImage}
              onError={(e) => {
                // Suppress 404 errors for missing avatars - they're harmless
                if (Platform.OS === 'web' && e.nativeEvent) {
                  e.preventDefault?.();
                }
              }}
            />
          ) : (
            <User size={16} color={colors.muted} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

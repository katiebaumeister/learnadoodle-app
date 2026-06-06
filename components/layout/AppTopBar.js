import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { UserCircle, Settings, LogOut } from 'lucide-react';
import StableImage from '../ui/StableImage';
import Dropdown from '../ui/Dropdown';
import { FAVICON_ASSET } from '../../assets/imageAssetMap';

function formatUserRole(role) {
  switch (role) {
    case 'parent':
      return 'Parent';
    case 'tutor':
      return 'Tutor';
    case 'child':
    case 'student':
      return 'Student';
    default:
      return role
        ? String(role).charAt(0).toUpperCase() + String(role).slice(1)
        : 'User';
  }
}

export default function AppTopBar({
  onLogoPress,
  onOpenSettings,
  onLogOut,
  userName,
  userEmail,
  userRole,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const profileButtonRef = useRef(null);

  const displayName = (userName || userEmail || 'Account').trim();
  const roleLabel = formatUserRole(userRole);

  const handleOpenSettings = useCallback(() => {
    setMenuOpen(false);
    onOpenSettings?.();
  }, [onOpenSettings]);

  const handleLogOut = useCallback(() => {
    setMenuOpen(false);
    onLogOut?.();
  }, [onLogOut]);

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.logoButton}
        onPress={onLogoPress}
        accessibilityRole="button"
        accessibilityLabel="Learnadoodle home"
        activeOpacity={0.8}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <StableImage
          source={FAVICON_ASSET}
          resizeMode="cover"
          imageStyle={styles.logo}
          fadeDuration={0}
        />
      </TouchableOpacity>

      <View style={styles.spacer} />

      <TouchableOpacity
        ref={profileButtonRef}
        style={[styles.profileButton, menuOpen && styles.profileButtonActive]}
        onPress={() => setMenuOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        accessibilityState={{ expanded: menuOpen }}
        activeOpacity={0.8}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <UserCircle size={22} color="rgba(15, 23, 42, 0.55)" strokeWidth={2} />
      </TouchableOpacity>

      <Dropdown
        visible={menuOpen}
        triggerRef={profileButtonRef}
        onClose={() => setMenuOpen(false)}
        placement="bottom-end"
        width={240}
        offset={8}
      >
        <View style={styles.menuHeader}>
          <Text style={styles.menuName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.menuRole}>{roleLabel}</Text>
        </View>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Settings size={16} color="rgba(15, 23, 42, 0.75)" />
          <Text style={styles.menuItemText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, styles.menuItemLast]}
          onPress={handleLogOut}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <LogOut size={16} color="rgba(15, 23, 42, 0.75)" />
          <Text style={styles.menuItemText}>Log out</Text>
        </TouchableOpacity>
      </Dropdown>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      flexShrink: 0,
      zIndex: 200,
    }),
  },
  logoButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  logo: {
    width: 36,
    height: 36,
    transform: [{ scale: 1.15 }],
  },
  spacer: {
    flex: 1,
  },
  profileButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  profileButtonActive: {
    backgroundColor: '#FAFAFA',
  },
  menuHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
  },
  menuName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  menuRole: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.55)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.16)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    }),
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

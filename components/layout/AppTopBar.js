import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import { UserCircle, Settings, LogOut, Sparkles } from 'lucide-react';
import Dropdown from '../ui/Dropdown';

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

const AppTopBar = forwardRef(function AppTopBar(
  {
    onOpenAskAI,
    onOpenSettings,
    onLogOut,
    userName,
    userEmail,
    userRole,
    doodleDisabled = false,
  },
  ref
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const profileButtonRef = useRef(null);
  const inputRef = useRef(null);

  const displayName = (userName || userEmail || 'Account').trim();
  const roleLabel = formatUserRole(userRole);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus?.();
    },
  }));

  const submitQuery = useCallback(
    (rawValue) => {
      if (doodleDisabled) return;
      const trimmed = String(rawValue ?? query ?? '').trim();
      setQuery('');
      if (trimmed) {
        onOpenAskAI?.({ prompt: trimmed, autoSubmit: true });
      } else {
        onOpenAskAI?.();
      }
    },
    [doodleDisabled, onOpenAskAI, query]
  );

  const handleOpenSettings = useCallback(() => {
    setMenuOpen(false);
    onOpenSettings?.();
  }, [onOpenSettings]);

  const handleLogOut = useCallback(() => {
    setMenuOpen(false);
    onLogOut?.();
  }, [onLogOut]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || doodleDisabled) return;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doodleDisabled]);

  return (
    <View style={styles.bar}>
      <View style={styles.searchCenter}>
        <View
          style={[
            styles.searchBar,
            doodleDisabled && styles.searchBarDisabled,
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              if (doodleDisabled) return;
              onOpenAskAI?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Open Doodle chat"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            {...(Platform.OS === 'web' && { cursor: doodleDisabled ? 'not-allowed' : 'pointer' })}
          >
            <Sparkles size={16} color="#8B5CF6" strokeWidth={2} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Ask Learnadoodle anything..."
            placeholderTextColor="rgba(15, 23, 42, 0.45)"
            editable={!doodleDisabled}
            returnKeyType="send"
            onSubmitEditing={() => submitQuery()}
            accessibilityLabel="Ask Doodle"
            accessibilityHint="Type a question and press enter to chat with Doodle"
            {...(Platform.OS === 'web' && {
              cursor: doodleDisabled ? 'not-allowed' : 'text',
            })}
          />
        </View>
      </View>

      <View style={styles.profileWrap}>
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
    </View>
  );
});

export default AppTopBar;

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      flexShrink: 0,
      zIndex: 200,
    }),
  },
  searchCenter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 52,
  },
  searchBar: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    }),
  },
  searchBarDisabled: {
    opacity: 0.55,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      borderWidth: 0,
    }),
  },
  profileWrap: {
    position: 'absolute',
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  profileButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
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

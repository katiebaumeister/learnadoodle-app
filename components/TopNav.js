import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput, Image } from 'react-native';
import { Search, UserCircle, Palette, Moon, Sun, Contrast } from 'lucide-react';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { getModeTokens, spacing, radius } from '../theme/pastelDesignTokens';
import { sensoryModes } from '../theme/pastelDesignTokens';

const avatarSources = {
  prof1: require('../assets/prof1.png'),
  prof2: require('../assets/prof2.png'),
  prof3: require('../assets/prof3.png'),
  prof4: require('../assets/prof4.png'),
  prof5: require('../assets/prof5.png'),
  prof6: require('../assets/prof6.png'),
  prof7: require('../assets/prof7.png'),
  prof8: require('../assets/prof8.png'),
  prof9: require('../assets/prof9.png'),
  prof10: require('../assets/prof10.png'),
};

const resolveAvatarSource = (avatarKey) => {
  if (!avatarKey) {
    return avatarSources.prof1;
  }
  const normalized = String(avatarKey)
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return avatarSources[normalized] || avatarSources.prof1;
};

const SENSORY_MODE_ICONS = {
  pastel: Palette,
  low: Moon,
  contrast: Contrast,
};

export default function TopNav({
  pageTitle,
  pageIcon: PageIcon,
  onSearch,
  onAvatarPress,
  user,
  showSearch = true,
}) {
  const { mode, setMode } = useSensoryMode();
  const { openSearch } = useGlobalSearch();
  const tokens = getModeTokens(mode);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (onSearch) {
      onSearch(searchQuery);
    } else {
      openSearch();
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
  };

  const navStyles = {
    backgroundColor: tokens.surface,
    borderBottomColor: tokens.border,
    ...(Platform.OS === 'web' 
      ? { 
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
          position: 'sticky',
          top: 0,
        }
      : {
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
          position: 'relative',
        }
    ),
  };

  return (
    <View style={[styles.container, navStyles]}>
      {/* Left: Page Title */}
      <View style={styles.leftSection}>
        {PageIcon && (
          <PageIcon size={20} color={tokens.accent} style={styles.pageIcon} />
        )}
        <Text style={[styles.pageTitle, { color: tokens.text }]}>
          {pageTitle || 'Learnadoodle'}
        </Text>
      </View>

      {/* Middle: Search Bar */}
      {showSearch && (
        <View style={styles.middleSection}>
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: tokens.bgSubtle,
                borderColor: tokens.border,
                ...(Platform.OS === 'web' && {
                  transition: 'border-color 150ms ease',
                }),
              },
            ]}
          >
            <Search size={16} color={tokens.iconMuted} style={styles.searchIcon} />
            {Platform.OS === 'web' ? (
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                style={{
                  flex: 1,
                  fontSize: 14,
                  borderWidth: 0,
                  outline: 'none',
                  outlineStyle: 'none',
                  color: tokens.text,
                  backgroundColor: 'transparent',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <TextInput
                placeholder="Search..."
                placeholderTextColor={tokens.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                style={[
                  styles.searchInput,
                  {
                    color: tokens.text,
                  },
                ]}
              />
            )}
          </View>
        </View>
      )}

      {/* Right: Sensory Mode Selector & User Avatar */}
      <View style={styles.rightSection}>
        {/* Sensory Mode Chip Selector */}
        <View 
          style={[
            styles.modeChipContainer,
            {
              backgroundColor: tokens.bgSubtle,
              borderColor: tokens.border,
            },
          ]}
        >
          {Object.entries(sensoryModes).map(([key, modeConfig]) => {
            const Icon = SENSORY_MODE_ICONS[key] || Palette;
            const isActive = mode === key;
            
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.modeChip,
                  isActive && styles.modeChipActive,
                  {
                    backgroundColor: isActive ? tokens.accentSoft : tokens.bgSubtle,
                    borderColor: isActive ? tokens.border : tokens.border,
                  },
                  Platform.OS === 'web' && {
                    transition: 'all 150ms ease',
                    cursor: 'pointer',
                  },
                ]}
                onPress={() => handleModeChange(key)}
                accessibilityRole="button"
                accessibilityLabel={modeConfig.name}
                accessibilityState={{ selected: isActive }}
              >
                <View
                  style={[
                    styles.modeChipIconContainer,
                    isActive && {
                      backgroundColor: tokens.surface,
                      borderWidth: 1,
                      borderColor: tokens.border,
                    },
                    Platform.OS === 'web' && {
                      transition: 'all 150ms ease',
                    },
                  ]}
                >
                  <Icon 
                    size={18} 
                    color={isActive ? tokens.accent : tokens.iconMuted} 
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* User Avatar */}
        {user && (
          <TouchableOpacity
            onPress={onAvatarPress}
            style={[
              styles.avatarButton,
              Platform.OS === 'web' && {
                cursor: 'pointer',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Account and settings"
          >
            {user.avatar_url ? (
              <Image
                source={{ uri: user.avatar_url }}
                style={[styles.avatar, { borderColor: tokens.border }]}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { borderColor: tokens.border, backgroundColor: tokens.accentSoft }]}>
                <UserCircle size={20} color={tokens.accent} />
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    zIndex: 100,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 0,
    minWidth: 200,
  },
  pageIcon: {
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  middleSection: {
    flex: 1,
    maxWidth: 600,
    paddingHorizontal: spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    borderWidth: 0,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 0,
  },
  modeChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modeChipActive: {
    // Active state handled inline
  },
  modeChipIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    // Web-specific styles applied inline
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});


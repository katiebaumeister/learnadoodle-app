import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, ScrollView } from 'react-native';
import { Plus, Home, CalendarDays, Search, Compass, FileText, BookOpen, Brain, UserCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../theme/pastelDesignTokens';
import FeedbackChip from './FeedbackChip';
import { safeImageUri } from '../lib/safeImageUri';

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

const CHILD_SECTIONS = [
  { key: 'affirmation', label: 'Affirmation' },
  { key: 'updates', label: 'Updates' },
  { key: 'growth', label: 'Growth' },
  { key: 'complete-profile', label: 'Complete Profile' },
];

export default function GeistSidebar({
  topActive,
  onSelectTop,
  childrenList = [],
  activeChildId,
  activeChildSection = 'affirmation',
  onSelectChild,
  onSelectChildSection,
  onOpenNew,
  onOpenSearch,
  onAvatarPress,
  user,
  userRole = 'parent',
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [expandedChildren, setExpandedChildren] = useState(new Set());
  const [hoveredItem, setHoveredItem] = useState(null);

  // Auto-expand active child
  useEffect(() => {
    if (activeChildId && !expandedChildren.has(activeChildId)) {
      setExpandedChildren(new Set([...expandedChildren, activeChildId]));
    }
  }, [activeChildId]);

  const handleNewPress = useCallback(
    (event) => {
      if (Platform.OS === 'web' && event?.currentTarget?.getBoundingClientRect) {
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenNew?.({
          x: rect.right + window.scrollX,
          y: rect.top + rect.height / 2 + window.scrollY,
          height: rect.height,
        });
        return;
      }
      onOpenNew?.();
    },
    [onOpenNew]
  );

  const topNavItems = useMemo(
    () => {
      const allItems = [
        { key: 'home', label: 'Home', icon: Home },
        { key: 'planner', label: 'Planner', icon: CalendarDays },
        { key: 'materials', label: 'Library', icon: BookOpen },
        { key: 'intelligence', label: 'Intelligence', icon: Brain },
        { key: 'profile', label: 'Family', icon: UserCircle },
        // { key: 'records', label: 'Records', icon: FileText }, // Archived - records screen removed
        // { key: 'explore', label: 'Explore', icon: Compass }, // Archived - explore page removed
      ];

      if (userRole === 'child') {
        return allItems.filter(item => item.key === 'home');
      } else if (userRole === 'tutor') {
        return allItems.filter(item => item.key !== 'records' && item.key !== 'explore');
      } else {
        // Parents see everything except archived items
        return allItems.filter(item => item.key !== 'records' && item.key !== 'explore');
      }
    },
    [userRole]
  );

  // Helper to validate if avatar_url is a valid URL (not just a UUID)
  const isValidAvatarUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    // Check if it's a valid URL (starts with http/https/data) or is a known avatar key
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // If it's just a UUID without http/https, it's invalid
    if (uuidPattern.test(url.trim())) return false;
    // Valid if it starts with http/https/data or is a known avatar key
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || 
           Object.keys(avatarSources).includes(url.toLowerCase().replace(/\.(png|jpg|jpeg|webp|gif)$/i, ''));
  };

  const renderChildAvatar = (child) => {
    const avatarUri = safeImageUri(child.avatar_url || child.avatar);
    if (avatarUri) {
      return (
        <Image 
          source={{ uri: avatarUri }} 
          style={styles.childAvatar}
          onError={(e) => {
            if (Platform.OS === 'web' && e.nativeEvent) {
              e.preventDefault?.();
            }
          }}
        />
      );
    }
    const source = resolveAvatarSource(child.avatar);
    return <Image source={source} style={styles.childAvatar} />;
  };

  const toggleChildExpanded = (childId) => {
    const newExpanded = new Set(expandedChildren);
    if (newExpanded.has(childId)) {
      newExpanded.delete(childId);
    } else {
      newExpanded.add(childId);
      onSelectChild?.(childId);
    }
    setExpandedChildren(newExpanded);
  };

  const sidebarStyles = Platform.OS === 'web' ? {
    // On web, let CSS glass class handle background
    borderRightColor: 'var(--stroke)',
  } : {
    backgroundColor: tokens.bg,
    borderRightColor: tokens.border,
  };

  // Apply glass class on web
  const containerClassName = Platform.OS === 'web' ? 'glass sidebarWash' : undefined;

  return (
    <View 
      style={[styles.container, sidebarStyles]}
      {...(Platform.OS === 'web' && containerClassName ? { className: containerClassName } : {})}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <TouchableOpacity
          onPress={onAvatarPress}
          accessibilityRole="button"
          accessibilityLabel="Account and settings"
          disabled={!onAvatarPress}
          style={styles.brandHeader}
        >
          <Text style={[styles.brandHeading, { color: tokens.text }]}>Learnadoodle</Text>
        </TouchableOpacity>

        {/* Main Navigation */}
        <View style={styles.sectionGroup}>
          {topNavItems.map((item) => {
            const Icon = item.icon;
            const active = topActive === item.key;
            const hovered = hoveredItem === `nav-${item.key}`;
            
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.navItem,
                  active && { backgroundColor: tokens.accentSoft },
                  hovered && !active && { backgroundColor: tokens.bgSubtle },
                ]}
                onPress={() => onSelectTop?.(item.key)}
                onMouseEnter={() => Platform.OS === 'web' && setHoveredItem(`nav-${item.key}`)}
                onMouseLeave={() => Platform.OS === 'web' && setHoveredItem(null)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                {active && <View style={[styles.accentBar, { backgroundColor: tokens.accent }]} />}
                <Icon 
                  size={18} 
                  color={active ? tokens.accent : tokens.iconMuted} 
                  style={styles.navIcon}
                />
                <Text 
                  style={[
                    styles.navLabel,
                    { color: active ? tokens.accent : tokens.textSecondary },
                    active && styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Utility Zone - Bottom */}
        <View style={[styles.utilityZone, { borderTopColor: tokens.border }]}>
          {onOpenNew && userRole !== 'child' ? (
            <TouchableOpacity
              style={[
                styles.navItem,
                hoveredItem === 'new' && { backgroundColor: tokens.bgSubtle },
              ]}
              onPress={handleNewPress}
              onMouseEnter={() => Platform.OS === 'web' && setHoveredItem('new')}
              onMouseLeave={() => Platform.OS === 'web' && setHoveredItem(null)}
              accessibilityRole="button"
              accessibilityLabel="Create new item"
            >
              <Plus size={18} color={tokens.iconMuted} />
              <Text style={[styles.navLabel, { color: tokens.textSecondary }]}>New</Text>
            </TouchableOpacity>
          ) : null}

          {onOpenSearch ? (
            <TouchableOpacity
              style={[
                styles.navItem,
                hoveredItem === 'search' && { backgroundColor: tokens.bgSubtle },
              ]}
              onPress={onOpenSearch}
              onMouseEnter={() => Platform.OS === 'web' && setHoveredItem('search')}
              onMouseLeave={() => Platform.OS === 'web' && setHoveredItem(null)}
              accessibilityRole="button"
              accessibilityLabel="Open search"
            >
              <Search size={18} color={tokens.iconMuted} />
              <Text style={[styles.navLabel, { color: tokens.textSecondary }]}>Search</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      
      {/* Feedback Chip at Bottom of Sidebar */}
      <View style={styles.feedbackContainer}>
        <FeedbackChip />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 256,
    borderRightWidth: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth,
    flex: 1,
    ...(Platform.OS === 'web' ? { minHeight: '100vh', position: 'sticky', top: 0, height: '100vh' } : {}),
    display: 'flex',
    flexDirection: 'column',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  brandHeader: {
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
  },
  brandHeading: {
    fontSize: 18,
    fontWeight: '700',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'background-color 150ms ease',
    }),
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: spacing.xs,
    bottom: spacing.xs,
    width: 3,
    borderRadius: radius.xs,
  },
  navIcon: {
    flexShrink: 0,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  navLabelActive: {
    fontWeight: '600',
  },
  sectionGroup: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginVertical: spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  familyGroup: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  childBlock: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'background-color 150ms ease',
    }),
  },
  chevron: {
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      transition: 'transform 200ms ease',
    }),
  },
  childAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    flexShrink: 0,
  },
  childInfo: {
    flex: 1,
    gap: 2,
  },
  childLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  childLabelActive: {
    fontWeight: '600',
  },
  childSubLabel: {
    fontSize: 12,
  },
  childSections: {
    flexDirection: 'column',
    gap: spacing.xs,
    paddingLeft: spacing['3xl'],
    paddingTop: spacing.xs,
  },
  childSectionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 150ms ease',
    }),
  },
  childSectionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  utilityZone: {
    marginTop: 'auto',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  feedbackContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});


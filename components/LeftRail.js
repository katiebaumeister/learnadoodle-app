import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Plus, Home, CalendarDays, Compass, FileText, BookOpen, Brain, UserCircle, Settings, MessageSquare, Users } from 'lucide-react';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import StableImage from './ui/StableImage';
import { safeImageUri } from '../lib/safeImageUri';
import { useOptionalFamilyUserControls } from '../contexts/FamilyUserControlsContext';

const COLLAPSE_STORAGE_KEY = 'ld.mainNavCollapsed';

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

const SIDEBAR_BRAND_LOGO = require('../assets/learnadoodle-logo.png');
const SIDEBAR_ICON_SOURCES = {
  home: require('../assets/home.png'),
  planner: require('../assets/planner.png'),
  family: require('../assets/family.png'),
  library: require('../assets/library.png'),
  subjects: require('../assets/subject.png'),
  more: require('../assets/more.png'),
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

const SIDEBAR_COLORS = {
  backgroundColor: '#F8F9FA',
  border: 'rgba(148, 163, 184, 0.24)',
  accent: '#4F46E5',
  accentSoft: 'rgba(79, 70, 229, 0.18)',
  accentSofter: 'rgba(79, 70, 229, 0.12)',
  activeTint: 'rgba(129, 193, 225, 0.12)',
  activeText: '#0F172A',
  avatar: 'rgba(148, 163, 184, 0.28)',
};

const CHILD_SECTIONS = [
  { key: 'affirmation', label: 'Affirmation' },
  { key: 'updates', label: 'Updates' },
  { key: 'growth', label: 'Growth' },
];

export default function LeftRail({
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
  onOpenSettings,
  onOpenFeedback,
  isCollapsed: isCollapsedProp,
}) {
  const [expandedChildren, setExpandedChildren] = useState(new Set());
  const [hoveredItem, setHoveredItem] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const familyUserControls = useOptionalFamilyUserControls();
  const effectivePermissions = familyUserControls.effectivePermissions || {};
  const moreButtonRef = useRef(null);
  const moreMenuTimeoutRef = useRef(null);
  
  // Use props if provided, otherwise default to expanded
  const isCollapsed = isCollapsedProp ?? false;
  
  // Handle closing menu with delay to allow moving to dropdown
  const handleMoreMenuClose = useCallback(() => {
    if (moreMenuTimeoutRef.current) {
      clearTimeout(moreMenuTimeoutRef.current);
    }
    moreMenuTimeoutRef.current = setTimeout(() => {
      setShowMoreMenu(false);
    }, 150); // Small delay to allow moving to dropdown
  }, []);
  
  const handleMoreMenuOpen = useCallback(() => {
    if (moreMenuTimeoutRef.current) {
      clearTimeout(moreMenuTimeoutRef.current);
      moreMenuTimeoutRef.current = null;
    }
    setShowMoreMenu(true);
  }, []);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (moreMenuTimeoutRef.current) {
        clearTimeout(moreMenuTimeoutRef.current);
      }
    };
  }, []);

  const renderStableSidebarImage = useCallback(({
    source,
    imageStyle,
    resizeMode = 'contain',
    placeholderStyle,
  }) => (
    <StableImage
      source={source}
      resizeMode={resizeMode}
      imageStyle={imageStyle}
      placeholderStyle={[styles.sidebarImagePlaceholder, placeholderStyle]}
      fadeDuration={0}
    />
  ), []);

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
        { key: 'subjects', label: 'Learning', icon: Brain },
        { key: 'materials', label: 'Materials', icon: BookOpen },
        { key: 'profile', label: 'Settings', icon: UserCircle },
        // { key: 'records', label: 'Records', icon: FileText }, // Archived - records screen removed
        // { key: 'explore', label: 'Explore', icon: Compass }, // Archived - explore page removed
        // { key: 'subjects', label: 'Learning', icon: null }, // Hidden from sidebar
      ];

      // Same sidebar structure for parent and child (exact same UI); content is child-scoped in WebContent
      if (userRole === 'child') {
        return allItems.filter((item) => {
          if (item.key === 'records' || item.key === 'explore' || item.key === 'profile') return false;
          if (item.key === 'planner' && effectivePermissions.canViewPlanner === false) return false;
          if (item.key === 'subjects' && effectivePermissions.canViewSubjects === false) return false;
          if (item.key === 'materials' && effectivePermissions.canViewLibrary === false) return false;
          return true;
        });
      } else if (userRole === 'tutor') {
        // Lean workspace: intervention + guidance — not family admin or full curriculum control.
        return [
          { key: 'home', label: 'Home', icon: Home },
          { key: 'tutor-students', label: 'My students', icon: Users },
          { key: 'planner', label: 'Planner', icon: CalendarDays },
          { key: 'materials', label: 'Materials', icon: BookOpen },
        ];
      } else {
        // Parents see everything except archived items
        return allItems.filter(item => item.key !== 'records' && item.key !== 'explore');
      }
    },
    [effectivePermissions.canViewLibrary, effectivePermissions.canViewPlanner, effectivePermissions.canViewSubjects, userRole]
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

  // Apply glass class on web
  const containerClassName = Platform.OS === 'web' ? 'glass sidebarWash' : undefined;

  return (
    <View 
      style={[styles.container, isCollapsed ? styles.collapsed : styles.expanded]}
      {...(Platform.OS === 'web' && containerClassName ? { className: containerClassName } : {})}
    >
      <View style={[styles.wrap, isCollapsed && styles.wrapCollapsed]}>
        {/* Top Icon - Only shown when expanded */}
        {!isCollapsed && (
          <View style={styles.topIconContainer}>
            <View style={styles.topIconWrapper}>
              {renderStableSidebarImage({
                imageKey: 'brandLogo',
                source: SIDEBAR_BRAND_LOGO,
                imageStyle: styles.topIcon,
                resizeMode: 'cover',
                placeholderStyle: styles.topIconPlaceholder,
              })}
            </View>
          </View>
        )}

        {/* When parent is viewing as a child, show "Back to my view" */}
        {!isCollapsed && userRole === 'parent' && activeChildId && childrenList?.length > 0 && (() => {
          const viewingChild = childrenList.find((c) => String(c.id) === String(activeChildId));
          const viewingName = viewingChild?.first_name || viewingChild?.name || 'Child';
          return (
            <View style={styles.viewingAsRow}>
              <Text style={styles.viewingAsLabel} numberOfLines={1}>Viewing as {viewingName}</Text>
              <TouchableOpacity
                style={styles.backToMyViewButton}
                onPress={() => onSelectTop?.('home')}
                activeOpacity={0.8}
              >
                <Text style={styles.backToMyViewText}>Back to my view</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Main menu section */}
        <View style={styles.sectionGroup}>
          {topNavItems.map((item) => {
            const Icon = item.icon;
            const active = topActive === item.key;
            const isHovered = hoveredItem === item.key && !active;
            const isHome = item.key === 'home';
            const isPlanner = item.key === 'planner';
            const isNew = item.key === 'new';
            const isLibrary = item.key === 'materials';
            const isSubjects = item.key === 'subjects';
            const isFamily = item.key === 'profile';
            const isIntelligence = item.key === 'intelligence';
            const isMore = item.key === 'more';
            return (
              <TouchableOpacity
                key={item.key}
                ref={isMore ? moreButtonRef : null}
                {...(Platform.OS === 'web' && isPlanner ? { nativeID: 'explorer-tour-sidebar-planner' } : {})}
                style={[
                  styles.navItem,
                  active && styles.navItemActive,
                  isHovered && styles.navItemHover,
                  isCollapsed && styles.navItemCollapsed,
                ]}
                onPress={() => {
                  if (isMore) {
                    if (Platform.OS === 'web') {
                      setShowMoreMenu(!showMoreMenu);
                    } else {
                      // On mobile, show menu on press
                      setShowMoreMenu(true);
                    }
                  } else {
                    onSelectTop?.(item.key);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                {...(Platform.OS === 'web' && {
                  onMouseEnter: () => {
                    if (isMore) {
                      handleMoreMenuOpen();
                    } else if (!active) {
                      setHoveredItem(item.key);
                    }
                  },
                  onMouseLeave: () => {
                    if (isMore) {
                      handleMoreMenuClose();
                    } else {
                      setHoveredItem(null);
                    }
                  },
                })}
              >
                <View style={styles.iconWrapper}>
                  {isHome ? (
                    <View style={styles.homeIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'home',
                        source: SIDEBAR_ICON_SOURCES.home,
                        imageStyle: styles.homeIcon,
                      })}
                    </View>
                  ) : isPlanner ? (
                    <View style={styles.plannerIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'planner',
                        source: SIDEBAR_ICON_SOURCES.planner,
                        imageStyle: styles.plannerIcon,
                      })}
                    </View>
                  ) : isNew ? (
                    <View style={styles.newIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'family',
                        source: SIDEBAR_ICON_SOURCES.family,
                        imageStyle: styles.newIcon,
                      })}
                    </View>
                  ) : isLibrary ? (
                    <View style={styles.libraryIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'library',
                        source: SIDEBAR_ICON_SOURCES.library,
                        imageStyle: styles.libraryIcon,
                      })}
                    </View>
                  ) : isSubjects ? (
                    <View style={styles.subjectsIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'subjects',
                        source: SIDEBAR_ICON_SOURCES.subjects,
                        imageStyle: styles.subjectsIcon,
                      })}
                    </View>
                  ) : isFamily ? (
                    <View style={styles.familyIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'family',
                        source: SIDEBAR_ICON_SOURCES.family,
                        imageStyle: styles.familyIcon,
                      })}
                    </View>
                  ) : isIntelligence ? (
                    <View style={styles.subjectsIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'subjects',
                        source: SIDEBAR_ICON_SOURCES.subjects,
                        imageStyle: styles.subjectsIcon,
                      })}
                    </View>
                  ) : isMore ? (
                    <View style={styles.moreIconContainer}>
                      {renderStableSidebarImage({
                        imageKey: 'more',
                        source: SIDEBAR_ICON_SOURCES.more,
                        imageStyle: styles.moreIcon,
                      })}
                    </View>
                  ) : (
                    Icon && <View style={styles.iconContainer}>
                      <Icon size={42} color={active ? SIDEBAR_COLORS.accent : 'rgba(15,23,42,0.6)'} />
                    </View>
                  )}
                </View>
                {!isCollapsed && (
                  <View style={styles.navLabelContainer}>
                    <Text style={[
                      styles.navLabel, 
                      active && styles.navLabelActive,
                      isHovered && styles.navLabelHover,
                    ]}>{item.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(Platform.OS === 'web' ? {} : { backgroundColor: SIDEBAR_COLORS.backgroundColor }),
    paddingVertical: 16,
    flex: 1,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
    overflow: 'hidden',
  },
  collapsed: {
    width: 76,
    paddingHorizontal: 8,
  },
  expanded: {
    width: 240, // Match sidebarContainer width
  },
  wrap: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    gap: 8,
    flex: 1,
  },
  wrapCollapsed: {
    paddingHorizontal: 8,
  },
  viewingAsRow: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  viewingAsLabel: {
    fontSize: 12,
    color: '#4f46e5',
    fontWeight: '600',
    marginBottom: 6,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  backToMyViewButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  backToMyViewText: {
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: '500',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  brandHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0, // Remove gap since iconWrapper has fixed width
    paddingVertical: 4,
    paddingHorizontal: 20,
    borderRadius: 0,
    marginHorizontal: 0,
    maxWidth: '100%',
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.15s ease',
      cursor: 'pointer',
    }),
  },
  navItemActive: {
    backgroundColor: SIDEBAR_COLORS.activeTint, // keep polish active tint
    borderRadius: 12,
    borderWidth: 0,
    paddingVertical: 4,
    paddingRight: 24,
    ...(Platform.OS === 'web' && {
      backgroundColor: '#FFFFFF',
    }),
  },
  navItemHover: {
    backgroundColor: 'transparent',
  },
  navItemCollapsed: {
    justifyContent: 'center',
  },
  navLabelContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    height: '100%',
    marginLeft: 12, // Fixed spacing from icon wrapper
  },
  navLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '800',
    textTransform: 'uppercase',
    lineHeight: 22, // Consistent line height for alignment
    includeFontPadding: false, // Remove extra padding for better alignment
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.011em', // Tighter, more editorial
      lineHeight: '22px',
    }),
  },
  navLabelActive: {
    color: SIDEBAR_COLORS.activeText,
    fontWeight: '800',
    textTransform: 'uppercase',
    lineHeight: 22, // Consistent line height for alignment
    includeFontPadding: false, // Remove extra padding for better alignment
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.011em',
      lineHeight: '22px',
    }),
  },
  navLabelHover: {
    color: '#374151',
  },
  sectionGroup: {
    flexDirection: 'column',
    gap: 0,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(56, 182, 255, 0.14)',
    alignSelf: 'stretch',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionLabelFirst: {
    marginTop: 0,
    paddingTop: 8,
  },
  topIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    marginHorizontal: -16,
    paddingLeft: 12,
    paddingRight: 0,
  },
  topIconWrapper: {
    width: 220, // Slightly smaller
    height: 36, // Slightly smaller
    overflow: 'hidden',
    borderRadius: 4,
  },
  topIcon: {
    width: 220, // Slightly smaller
    height: 72, // Slightly smaller
    marginTop: -12, // Crop top significantly
    marginBottom: -12, // Crop bottom significantly
    // No left/right margins - only crop top and bottom
  },
  topIconPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  settingsSection: {
    flexDirection: 'column',
    gap: 8,
  },
  familyGroup: {
    flexDirection: 'column',
    gap: 8,
  },
  childBlock: {
    flexDirection: 'column',
    gap: 8,
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  childItemActive: {
    backgroundColor: SIDEBAR_COLORS.accentSofter,
  },
  childItemCollapsed: {
    justifyContent: 'center',
  },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SIDEBAR_COLORS.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInfo: {
    flex: 1,
    gap: 2,
  },
  childLabel: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.75)',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childLabelActive: {
    color: SIDEBAR_COLORS.accent,
    fontWeight: '600',
  },
  childSubLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,1)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childSections: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 48,
    paddingTop: 4,
  },
  utilityZone: {
    marginTop: 'auto',
    paddingTop: 16,
    gap: 8,
  },
  childSectionButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SIDEBAR_COLORS.accentSofter,
  },
  childSectionButtonActive: {
    backgroundColor: SIDEBAR_COLORS.accentSoft,
  },
  childSectionLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.9)',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childSectionLabelActive: {
    color: SIDEBAR_COLORS.accent,
  },
  iconWrapper: {
    width: 52, // Fixed width - matches largest icon container (planner/library)
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarImagePlaceholder: {
    top: '13%',
    left: '13%',
    right: '13%',
    bottom: '13%',
    borderRadius: 10,
  },
  iconContainer: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIconContainer: {
    width: 52,
    height: 52,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIcon: {
    width: 50, // Slightly smaller than container to prevent cropping
    height: 50,
  },
  plannerIconContainer: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerIcon: {
    width: 46, // Slightly smaller than container to prevent cropping
    height: 46,
  },
  newIconContainer: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newIcon: {
    width: 46, // Slightly smaller than container to prevent cropping
    height: 46,
  },
  libraryIconContainer: {
    width: 54,
    height: 54,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryIcon: {
    width: 52, // Slightly smaller than container to prevent cropping
    height: 52,
  },
  subjectsIconContainer: {
    width: 54,
    height: 54,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectsIcon: {
    width: 80, // Larger to allow more cropping/zooming
    height: 80, // Larger to allow more cropping/zooming
    marginTop: -12, // Crop top more to zoom in
    marginBottom: -12, // Crop bottom more to zoom in
  },
  familyIconContainer: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyIcon: {
    width: 46, // Slightly smaller than container to prevent cropping
    height: 46,
  },
  intelligenceIconContainer: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intelligenceIcon: {
    width: 38, // Slightly smaller than container to prevent cropping
    height: 38,
  },
  moreIconContainer: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreIcon: {
    width: 38, // Slightly smaller than container to prevent cropping
    height: 38,
  },
});


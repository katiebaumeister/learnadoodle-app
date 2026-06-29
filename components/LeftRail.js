import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import StableImage from './ui/StableImage';
import { getSubjectsNavLabel } from '../lib/subjectsModeCopy';
import { safeImageUri } from '../lib/safeImageUri';
import { useOptionalFamilyUserControls } from '../contexts/FamilyUserControlsContext';
import {
  AVATAR_KEYS,
  LEARNADOODLE_LOGO_ASSET,
  resolveBundledAvatarSource,
} from '../assets/imageAssetMap';
import { MAIN_NAV_ICONS } from './layout/mainNavIcons';

const COLLAPSE_STORAGE_KEY = 'ld.mainNavCollapsed';
const SHOW_MATERIALS_IN_SIDEBAR = true;
const SHOW_SUBJECTS_CATALOG_IN_SIDEBAR = false;
const SHOW_RECORDS_IN_SIDEBAR = false;
const SHOW_CREATE_IN_SIDEBAR = false;

const SIDEBAR_BRAND_LOGO = LEARNADOODLE_LOGO_ASSET;
const NAV_ICON_SIZE = 22;
const ICON_RAIL_EXPANDED_WIDTH = 220;
/** Horizontal inset for permanent sidebar nav pills (matches footer padding). */
const PERMANENT_SIDEBAR_NAV_INSET = 28;
/** Cropped logo asset is 1536×340; height follows width via aspectRatio (fixed height caused empty space below). */
const SIDEBAR_BRAND_LOGO_ASPECT = 1392 / 400;
/** Symmetric bleed cancels nav inset so the wordmark spans the full sidebar width, centered. */
const SIDEBAR_BRAND_LOGO_BLEED = PERMANENT_SIDEBAR_NAV_INSET;

const resolveAvatarSource = (avatarKey) => {
  return resolveBundledAvatarSource(avatarKey);
};

const SIDEBAR_COLORS = {
  backgroundColor: '#F8F9FA',
  border: 'rgba(148, 163, 184, 0.24)',
  accent: '#4F46E5',
  accentSoft: 'rgba(79, 70, 229, 0.18)',
  accentSofter: 'rgba(79, 70, 229, 0.12)',
  /** Brand sky blue (#81C1E1) — matches Learning planning banner tint */
  activeTint: 'rgba(129, 193, 225, 0.12)',
  activeText: '#0F172A',
  avatar: 'rgba(148, 163, 184, 0.28)',
};

const NAV_ITEM_DEFS = {
  home: { key: 'home', label: 'Home', icon: MAIN_NAV_ICONS.home },
  messages: { key: 'messages', label: 'Messages', icon: MAIN_NAV_ICONS.messages },
  subjects: { key: 'subjects', label: 'Subjects', icon: MAIN_NAV_ICONS.subjects },
  materials: { key: 'materials', label: 'Materials', icon: MAIN_NAV_ICONS.materials },
  family: { key: 'family', label: 'Family', icon: MAIN_NAV_ICONS.family },
  planner: { key: 'planner', label: 'Planner', icon: MAIN_NAV_ICONS.planner },
  planningPreferences: {
    key: 'planning-preferences',
    label: 'School Year',
    icon: MAIN_NAV_ICONS.planningPreferences,
  },
  records: { key: 'records', label: 'Records', icon: MAIN_NAV_ICONS.records },
  profile: { key: 'profile', label: 'Settings', icon: MAIN_NAV_ICONS.profile },
  create: { key: 'create', label: 'Create', icon: MAIN_NAV_ICONS.create },
  learning: { key: 'learning', label: 'Subjects', icon: MAIN_NAV_ICONS.subjects },
  tutorStudents: { key: 'tutor-students', label: 'My students', icon: MAIN_NAV_ICONS.family },
};

const PARENT_NAV_BUCKET_KEYS = [
  ['home', 'messages'],
  ['planner', 'subjects', 'materials'],
  ['profile'],
];

const TUTOR_NAV_BUCKET_KEYS = [
  ['home', 'messages'],
  ['tutorStudents', 'planner'],
];

const CHILD_SECTIONS = [
  { key: 'affirmation', label: 'Affirmation' },
  { key: 'updates', label: 'Updates' },
  { key: 'growth', label: 'Growth' },
];

export default function LeftRail({
  topActive,
  messagesPaneOpen = false,
  createPaneOpen = false,
  onSelectTop,
  onExitChildView = null,
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
  hideBrandLogo = false,
  hideProfileNav = false,
  iconRailMode = false,
  permanentSidebar = false,
  familyPlanningMode = null,
  unreadMessagesCount = 0,
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
    shellStyle,
  }) => (
    <StableImage
      source={source}
      resizeMode={resizeMode}
      shellStyle={shellStyle}
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

  const shouldIncludeNavItem = useCallback((item) => {
    if (!item) return false;
    if (hideProfileNav && item.key === 'profile') return false;
    if (!SHOW_MATERIALS_IN_SIDEBAR && item.key === 'materials') return false;
    if (!SHOW_SUBJECTS_CATALOG_IN_SIDEBAR && item.key === 'learning') return false;
    if (!SHOW_RECORDS_IN_SIDEBAR && item.key === 'records') return false;
    if (!SHOW_CREATE_IN_SIDEBAR && item.key === 'create') return false;
    if ((userRole === 'child' || userRole === 'student') && item.key === 'planning-preferences') return false;
    if (item.key === 'planning-preferences' && effectivePermissions.canViewPlanner === false) return false;
    if ((userRole === 'child' || userRole === 'student') && item.key === 'create') return false;
    if ((userRole === 'child' || userRole === 'student') && item.key === 'family') return false;
    // Child experience is intentionally minimal: Home (checklist), Planner, Messages.
    // Subjects and Materials are hidden for child/student to reduce surface area.
    if ((userRole === 'child' || userRole === 'student')
      && (item.key === 'subjects' || item.key === 'learning' || item.key === 'materials')) return false;
    if (item.key === 'planner' && effectivePermissions.canViewPlanner === false) return false;
    if ((item.key === 'subjects' || item.key === 'learning') && effectivePermissions.canViewSubjects === false) return false;
    if (item.key === 'materials' && effectivePermissions.canViewLibrary === false) return false;
    if ((userRole === 'child' || userRole === 'student') && (item.key === 'records' || item.key === 'explore')) return false;
    return true;
  }, [
    effectivePermissions.canViewLibrary,
    effectivePermissions.canViewPlanner,
    effectivePermissions.canViewSubjects,
    hideProfileNav,
    userRole,
  ]);

  const navBuckets = useMemo(() => {
    const subjectsNavLabel = getSubjectsNavLabel(familyPlanningMode);
    const resolveBucket = (keys) => ({
      items: keys
        .map((key) => {
          const item = NAV_ITEM_DEFS[key];
          if (!item) return null;
          if (item.key === 'subjects') {
            return { ...item, label: subjectsNavLabel };
          }
          return item;
        })
        .filter((item) => shouldIncludeNavItem(item)),
    });

    let bucketKeys = PARENT_NAV_BUCKET_KEYS;
    if (userRole === 'tutor') {
      bucketKeys = SHOW_MATERIALS_IN_SIDEBAR
        ? [
            ['home', 'messages'],
            ['tutorStudents', 'planner', 'materials'],
          ]
        : TUTOR_NAV_BUCKET_KEYS;
    }
    if (SHOW_CREATE_IN_SIDEBAR) {
      bucketKeys = [...bucketKeys, ['create']];
    }

    return bucketKeys.map(resolveBucket).filter((bucket) => bucket.items.length > 0);
  }, [shouldIncludeNavItem, userRole, familyPlanningMode]);

  const showLabels = permanentSidebar || !isCollapsed;

  // Helper to validate if avatar_url is a valid URL (not just a UUID)
  const isValidAvatarUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    // Check if it's a valid URL (starts with http/https/data) or is a known avatar key
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // If it's just a UUID without http/https, it's invalid
    if (uuidPattern.test(url.trim())) return false;
    // Valid if it starts with http/https/data or is a known avatar key
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') ||
           AVATAR_KEYS.includes(url.toLowerCase().replace(/\.(png|jpg|jpeg|webp|gif)$/i, ''));
  };

  const renderChildAvatar = (child) => {
    const avatarRef = child.avatar_key || child.avatar || child.avatar_url;
    const avatarUri = safeImageUri(avatarRef);
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
    const source = resolveAvatarSource(avatarRef);
    return <Image source={source} style={styles.childAvatar} />;
  };

  // Apply glass class on web (not in permanent sidebar — solid background)
  const containerClassName = Platform.OS === 'web' && !iconRailMode && !permanentSidebar ? 'glass sidebarWash' : undefined;

  const renderNavItem = (item) => {
    const NavIcon = item.icon;
    const isCreate = item.key === 'create';
    const active = createPaneOpen
      ? isCreate
      : topActive === item.key;
    const isHovered = hoveredItem === item.key && !active;
    const isPlanner = item.key === 'planner';
    const isMore = item.key === 'more';
    const unreadBadgeCount = item.key === 'messages' ? Number(unreadMessagesCount) || 0 : 0;
    const showUnreadBadge = unreadBadgeCount > 0;
    const iconColor = active
      ? SIDEBAR_COLORS.activeText
      : isHovered
        ? '#374151'
        : 'rgba(15, 23, 42, 0.6)';
    const navContent = (
      <>
        <View
          style={[
            styles.iconWrapper,
            permanentSidebar && styles.iconWrapperPermanent,
            iconRailMode && !permanentSidebar && styles.iconRailIconColumn,
            iconRailMode && !permanentSidebar && isCollapsed && active && styles.iconRailIconColumnActive,
            iconRailMode && !permanentSidebar && isCollapsed && isHovered && styles.iconRailIconColumnHover,
          ]}
        >
          {NavIcon ? (
            <View style={styles.iconContainer}>
              <NavIcon
                size={NAV_ICON_SIZE}
                color={iconColor}
                strokeWidth={2}
              />
              {showUnreadBadge ? (
                <View style={styles.navUnreadBadge}>
                  <Text style={styles.navUnreadBadgeText} numberOfLines={1}>
                    {unreadBadgeCount > 9 ? '9+' : String(unreadBadgeCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {showLabels ? (
          <View style={[
            styles.navLabelContainer,
            permanentSidebar && styles.navLabelContainerPermanent,
            iconRailMode && !permanentSidebar && styles.navLabelContainerIconRail,
          ]}>
            <Text style={[
              styles.navLabel,
              active && styles.navLabelActive,
              isHovered && styles.navLabelHover,
            ]}>{item.label}</Text>
          </View>
        ) : null}
      </>
    );

    return (
      <TouchableOpacity
        key={item.key}
        ref={isMore ? moreButtonRef : null}
        {...(Platform.OS === 'web' && isPlanner ? { nativeID: 'explorer-tour-sidebar-planner' } : {})}
        style={[
          styles.navItem,
          permanentSidebar && styles.navItemPermanent,
          iconRailMode && !permanentSidebar && styles.navItemIconRail,
          iconRailMode && !permanentSidebar && isCollapsed && styles.navItemIconRailCollapsed,
          !iconRailMode && !permanentSidebar && isCollapsed && styles.navItemCollapsed,
          active && styles.navItemActive,
          permanentSidebar && active && styles.navItemPermanentActive,
          isHovered && !active && styles.navItemHover,
          iconRailMode && !permanentSidebar && isCollapsed && active && styles.navItemIconRailCollapsedActive,
          iconRailMode && !permanentSidebar && isCollapsed && isHovered && styles.navItemIconRailCollapsedHover,
        ]}
        onPress={() => {
          if (isMore) {
            if (Platform.OS === 'web') {
              setShowMoreMenu(!showMoreMenu);
            } else {
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
        {navContent}
      </TouchableOpacity>
    );
  };

  return (
    <View 
      style={[
        styles.container,
        permanentSidebar && styles.containerPermanent,
        iconRailMode && !permanentSidebar && styles.containerIconRail,
        isCollapsed && !permanentSidebar
          ? (iconRailMode ? styles.collapsedIconRail : styles.collapsed)
          : (iconRailMode && !permanentSidebar ? styles.expandedIconRail : styles.expanded),
      ]}
      {...(Platform.OS === 'web' && containerClassName ? { className: containerClassName } : {})}
    >
      <View style={[
        styles.wrap,
        permanentSidebar && styles.wrapPermanent,
        iconRailMode && !permanentSidebar && styles.wrapIconRail,
        !iconRailMode && !permanentSidebar && isCollapsed && styles.wrapCollapsed,
      ]}>
        {!hideBrandLogo && (
          <TouchableOpacity
            style={[styles.topIconContainer, permanentSidebar && styles.topIconContainerPermanent]}
            onPress={() => onSelectTop?.('home')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Learnadoodle home"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={[styles.topIconWrapper, permanentSidebar && styles.topIconWrapperPermanent]}>
              {renderStableSidebarImage({
                imageKey: 'brandLogo',
                source: SIDEBAR_BRAND_LOGO,
                shellStyle: permanentSidebar ? styles.topIconShellPermanent : styles.topIconShell,
                imageStyle: [styles.topIcon, permanentSidebar && styles.topIconPermanent],
                resizeMode: 'contain',
                placeholderStyle: styles.topIconPlaceholder,
              })}
            </View>
          </TouchableOpacity>
        )}

        {showLabels && userRole === 'parent' && activeChildId && childrenList?.length > 0 && (() => {
          const viewingChild = childrenList.find((c) => String(c.id) === String(activeChildId));
          if (!viewingChild) return null;
          const viewingName = viewingChild.first_name || viewingChild.name || 'Child';
          return (
            <View style={styles.viewingAsRow}>
              <Text style={styles.viewingAsLabel} numberOfLines={1}>Viewing as {viewingName}</Text>
              <TouchableOpacity
                style={styles.backToMyViewButton}
                onPress={() => {
                  if (typeof onExitChildView === 'function') {
                    onExitChildView();
                  } else {
                    onSelectTop?.('home');
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.backToMyViewText}>Back to my view</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        <View style={[styles.sectionGroup, permanentSidebar && styles.sectionGroupPermanent]}>
          {navBuckets.map((bucket, bucketIndex) => (
            <View key={`nav-bucket-${bucketIndex}`}>
              {bucketIndex > 0 ? <View style={styles.navBucketSpacer} /> : null}
              {bucket.items.map((item) => renderNavItem(item))}
            </View>
          ))}
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
    minHeight: Platform.OS === 'web' ? 0 : undefined,
    overflow: 'hidden',
  },
  containerPermanent: {
    paddingVertical: 0,
    backgroundColor: 'transparent',
    width: '100%',
    overflow: 'visible',
  },
  containerIconRail: {
    paddingVertical: 8,
    flex: 1,
    height: '100%',
    width: ICON_RAIL_EXPANDED_WIDTH,
    minWidth: ICON_RAIL_EXPANDED_WIDTH,
    backgroundColor: 'transparent',
    borderRightWidth: 0,
    overflow: 'visible',
  },
  collapsed: {
    width: 76,
    paddingHorizontal: 8,
  },
  collapsedIconRail: {
    width: '100%',
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  expanded: {
    width: 240,
  },
  expandedIconRail: {
    width: '100%',
  },
  wrap: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    gap: 8,
    flex: 1,
  },
  wrapPermanent: {
    paddingHorizontal: PERMANENT_SIDEBAR_NAV_INSET,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 0,
    flex: 1,
    minHeight: 0,
    overflow: 'visible',
  },
  wrapCollapsed: {
    paddingHorizontal: 8,
  },
  wrapIconRail: {
    paddingHorizontal: 0,
    paddingTop: 8,
    alignItems: 'stretch',
    width: '100%',
    flex: 1,
    minHeight: 0,
  },
  viewingAsRow: {
    marginBottom: 12,
    marginHorizontal: 0,
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
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.92)',
    flex: 1,
    letterSpacing: -0.3,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
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
  navItemPermanent: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 2,
    marginHorizontal: 0,
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
      transition: 'all 0.15s ease',
    }),
  },
  navItemPermanentActive: {
    backgroundColor: SIDEBAR_COLORS.activeTint,
    ...(Platform.OS === 'web' && {
      backgroundColor: '#FFFFFF',
    }),
  },
  navItemIconRail: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    minHeight: 36,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    borderRadius: 8,
    width: '100%',
    alignSelf: 'stretch',
  },
  navItemIconRailCollapsed: {
    width: 52,
    maxWidth: 52,
    alignSelf: 'flex-start',
  },
  navItemIconRailCollapsedActive: {
    backgroundColor: 'transparent',
  },
  navItemIconRailCollapsedHover: {
    backgroundColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: SIDEBAR_COLORS.activeTint,
    borderRadius: 12,
    borderWidth: 0,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    height: '100%',
    marginLeft: 8,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      minWidth: 0,
    }),
  },
  navLabelContainerPermanent: {
    marginLeft: 12,
    paddingRight: 4,
  },
  navLabelContainerIconRail: {
    flexShrink: 1,
    marginLeft: 0,
    paddingRight: 12,
  },
  navLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
    lineHeight: 22,
    includeFontPadding: false,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.011em',
      lineHeight: '22px',
      whiteSpace: 'nowrap',
    }),
  },
  navLabelActive: {
    color: SIDEBAR_COLORS.activeText,
    fontWeight: '600',
    lineHeight: 22,
    includeFontPadding: false,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.011em',
      lineHeight: '22px',
      whiteSpace: 'nowrap',
    }),
  },
  navLabelHover: {
    color: '#374151',
  },
  sectionGroup: {
    flexDirection: 'column',
    gap: 0,
    width: '100%',
    overflow: 'hidden',
  },
  sectionGroupPermanent: {
    overflow: 'visible',
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' && {
      width: '100%',
      boxSizing: 'border-box',
    }),
  },
  navBucketSpacer: {
    height: 10,
    marginTop: 6,
    marginBottom: 6,
  },
  iconWrapperPermanent: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  topIconContainerPermanent: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 4,
    marginHorizontal: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  topIconWrapper: {
    width: '100%',
    maxWidth: ICON_RAIL_EXPANDED_WIDTH,
    marginHorizontal: -SIDEBAR_BRAND_LOGO_BLEED,
    alignSelf: 'center',
    overflow: 'visible',
    borderRadius: 4,
  },
  topIconWrapperPermanent: {
    width: '100%',
    marginHorizontal: -SIDEBAR_BRAND_LOGO_BLEED,
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  topIconShell: {
    width: '100%',
    aspectRatio: SIDEBAR_BRAND_LOGO_ASPECT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIconShellPermanent: {
    width: '100%',
    aspectRatio: SIDEBAR_BRAND_LOGO_ASPECT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIcon: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' && {
      objectPosition: 'center center',
    }),
  },
  topIconPermanent: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' && {
      objectPosition: 'center center',
    }),
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
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRailIconColumn: {
    width: 52,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconRailIconColumnActive: {
    backgroundColor: SIDEBAR_COLORS.activeTint,
    ...(Platform.OS === 'web' && {
      backgroundColor: '#FFFFFF',
    }),
  },
  iconRailIconColumnHover: {
    backgroundColor: 'transparent',
  },
  sidebarImagePlaceholder: {
    top: '13%',
    left: '13%',
    right: '13%',
    bottom: '13%',
    borderRadius: 10,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navUnreadBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 0 0 2px #FFFFFF',
    }),
  },
  navUnreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});


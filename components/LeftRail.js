import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Plus, Home, CalendarDays, UserCircle, MessageCircle, Users, GraduationCap, Layers, Library, FileText } from 'lucide-react';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import StableImage from './ui/StableImage';
import { safeImageUri } from '../lib/safeImageUri';
import { useOptionalFamilyUserControls } from '../contexts/FamilyUserControlsContext';
import {
  AVATAR_KEYS,
  FAVICON_ASSET,
  resolveBundledAvatarSource,
} from '../assets/imageAssetMap';

const COLLAPSE_STORAGE_KEY = 'ld.mainNavCollapsed';
const SHOW_MATERIALS_IN_SIDEBAR = false;
const SHOW_SUBJECTS_CATALOG_IN_SIDEBAR = false;
const SHOW_CREATE_IN_SIDEBAR = false;

const SIDEBAR_BRAND_LOGO = FAVICON_ASSET;
const NAV_ICON_SIZE = 20;
const ICON_RAIL_EXPANDED_WIDTH = 220;

const resolveAvatarSource = (avatarKey) => {
  return resolveBundledAvatarSource(avatarKey);
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
        { key: 'subjects', label: 'Learning', icon: GraduationCap },
        { key: 'planner', label: 'Planner', icon: CalendarDays },
        { key: 'records', label: 'Records', icon: FileText },
        { key: 'family', label: 'Family settings', icon: Users },
        { key: 'messages', label: 'Messages', icon: MessageCircle },
        { key: 'learning', label: 'Subjects', icon: Layers },
        { key: 'create', label: 'Create', icon: Plus },
        { key: 'materials', label: 'Materials', icon: Library },
        { key: 'profile', label: 'Settings', icon: UserCircle },
      ].filter((item) => {
        if (hideProfileNav && item.key === 'profile') return false;
        if (!SHOW_MATERIALS_IN_SIDEBAR && item.key === 'materials') return false;
        if (!SHOW_SUBJECTS_CATALOG_IN_SIDEBAR && item.key === 'learning') return false;
        if (!SHOW_CREATE_IN_SIDEBAR && item.key === 'create') return false;
        if (permanentSidebar && item.key === 'create') return false;
        return true;
      });

      // Same sidebar structure for learner roles; content is child-scoped in WebContent
      if (userRole === 'child' || userRole === 'student') {
        return allItems.filter((item) => {
          if (item.key === 'records' || item.key === 'explore') return false;
          if (item.key === 'planner' && effectivePermissions.canViewPlanner === false) return false;
          if ((item.key === 'subjects' || item.key === 'learning') && effectivePermissions.canViewSubjects === false) return false;
          if (item.key === 'materials' && effectivePermissions.canViewLibrary === false) return false;
          return true;
        });
      } else if (userRole === 'tutor') {
        return [
          { key: 'home', label: 'Home', icon: Home },
          { key: 'tutor-students', label: 'My students', icon: Users },
          { key: 'planner', label: 'Planner', icon: CalendarDays },
          ...(SHOW_MATERIALS_IN_SIDEBAR ? [{ key: 'materials', label: 'Materials', icon: Library }] : []),
          { key: 'messages', label: 'Messages', icon: MessageCircle },
        ];
      } else {
        return allItems.filter((item) => item.key !== 'explore');
      }
    },
    [effectivePermissions.canViewLibrary, effectivePermissions.canViewPlanner, effectivePermissions.canViewSubjects, userRole, hideProfileNav, permanentSidebar]
  );

  const primaryNavItems = useMemo(
    () => topNavItems.filter((item) => item.key !== 'messages'),
    [topNavItems],
  );

  const messagesNavItem = useMemo(
    () => topNavItems.find((item) => item.key === 'messages') || null,
    [topNavItems],
  );

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
    const isMessages = item.key === 'messages';
    const isCreate = item.key === 'create';
    const active = messagesPaneOpen
      ? isMessages
      : createPaneOpen
        ? isCreate
        : topActive === item.key;
    const isHovered = hoveredItem === item.key && !active;
    const isPlanner = item.key === 'planner';
    const isMore = item.key === 'more';
    const iconColor = active
      ? SIDEBAR_COLORS.activeText
      : isHovered
        ? '#374151'
        : 'rgba(15, 23, 42, 0.55)';
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
          iconRailMode && !permanentSidebar && isCollapsed && active && styles.navItemIconRailCollapsedActive,
          isHovered && styles.navItemHover,
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
              permanentSidebar && styles.navLabelPermanent,
              active && styles.navLabelActive,
              permanentSidebar && active && styles.navLabelPermanentActive,
              isHovered && styles.navLabelHover,
            ]}>{item.label}</Text>
          </View>
        ) : null}
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
            <View style={styles.topIconWrapper}>
              {renderStableSidebarImage({
                imageKey: 'brandLogo',
                source: SIDEBAR_BRAND_LOGO,
                imageStyle: styles.topIcon,
                placeholderStyle: styles.topIconPlaceholder,
              })}
            </View>
            {permanentSidebar ? (
              <Text style={styles.brandHeading} numberOfLines={1}>Learnadoodle</Text>
            ) : null}
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

        <View style={styles.sectionGroup}>
          {(permanentSidebar ? primaryNavItems : topNavItems).map((item) => renderNavItem(item))}
          {permanentSidebar && messagesNavItem ? (
            <>
              <View style={styles.sidebarDivider} />
              {renderNavItem(messagesNavItem)}
            </>
          ) : null}
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
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
    flex: 1,
    minHeight: 0,
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
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.92)',
    flex: 1,
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
      transition: 'background-color 0.15s ease',
      cursor: 'pointer',
    }),
  },
  navItemPermanent: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 2,
  },
  navItemPermanentActive: {
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
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
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
  },
  navItemHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
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
    marginLeft: 10,
    paddingRight: 4,
  },
  navLabelContainerIconRail: {
    flexShrink: 1,
    marginLeft: 0,
    paddingRight: 12,
  },
  navLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    lineHeight: 18,
    includeFontPadding: false,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '0.02em',
      lineHeight: '18px',
      whiteSpace: 'nowrap',
    }),
  },
  navLabelPermanent: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'none',
    color: 'rgba(15, 23, 42, 0.78)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '0',
    }),
  },
  navLabelPermanentActive: {
    color: '#4F46E5',
    fontWeight: '600',
    textTransform: 'none',
  },
  navLabelActive: {
    color: SIDEBAR_COLORS.activeText,
    fontWeight: '700',
    textTransform: 'uppercase',
    lineHeight: 18,
    includeFontPadding: false,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '0.02em',
      lineHeight: '18px',
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
  sidebarDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
    marginVertical: 8,
    alignSelf: 'stretch',
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
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  topIconContainerPermanent: {
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 10,
  },
  topIconWrapper: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    borderRadius: 6,
  },
  topIcon: {
    width: 36,
    height: 36,
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
    backgroundColor: '#FAFAFA',
  },
  iconRailIconColumnHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
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
});


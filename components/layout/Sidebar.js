import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { PanelLeft } from 'lucide-react';
import LeftRail from '../LeftRail';

export const RAIL_ICON_WIDTH = 52;
export const RAIL_EXPANDED_WIDTH = 220;
const SIDEBAR_MODE_STORAGE_KEY = 'ld.sidebarControlMode';

const SIDEBAR_MODE_OPTIONS = [
  { key: 'expanded', label: 'Expanded' },
  { key: 'collapsed', label: 'Collapsed' },
  { key: 'expandOnHover', label: 'Expand on hover' },
];

function readStoredSidebarMode() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'expandOnHover';
  try {
    const raw = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
    if (raw === 'expanded' || raw === 'collapsed' || raw === 'expandOnHover') return raw;
  } catch (_) {
    /* ignore */
  }
  return 'expandOnHover';
}

function reservedWidthForMode(mode) {
  return mode === 'expanded' ? RAIL_EXPANDED_WIDTH : RAIL_ICON_WIDTH;
}

/**
 * Sidebar - Icon rail with configurable expand behavior (Supabase-style).
 * Defaults to expand-on-hover; pinned expanded mode reserves full rail width in the shell.
 */
export default function Sidebar({
  topActive,
  messagesPaneOpen = false,
  createPaneOpen = false,
  onSelectTop,
  childrenList = [],
  activeChildId,
  activeChildSection = 'affirmation',
  onSelectChild,
  onSelectChildSection,
  onExitChildView = null,
  onOpenNew,
  onOpenSearch,
  onAvatarPress,
  user,
  userRole = 'parent',
  onOpenSettings,
  onOpenFeedback,
  onReservedWidthChange = null,
}) {
  const [sidebarMode, setSidebarMode] = useState(readStoredSidebarMode);
  const [isHovered, setIsHovered] = useState(false);
  const [showControlMenu, setShowControlMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [hoveredMenuItem, setHoveredMenuItem] = useState(null);
  const controlButtonRef = useRef(null);
  const controlMenuRef = useRef(null);

  const isPinnedExpanded = sidebarMode === 'expanded';
  const isExpanded =
    isPinnedExpanded || (sidebarMode === 'expandOnHover' && isHovered);
  const isCollapsed = !isExpanded;

  useEffect(() => {
    onReservedWidthChange?.(reservedWidthForMode(sidebarMode));
  }, [sidebarMode, onReservedWidthChange]);

  const handleRailMouseEnter = useCallback(() => {
    if (sidebarMode === 'expandOnHover') {
      setIsHovered(true);
    }
  }, [sidebarMode]);

  const handleRailMouseLeave = useCallback(() => {
    if (sidebarMode === 'expandOnHover') {
      setIsHovered(false);
    }
  }, [sidebarMode]);

  const handleModeChange = useCallback((mode) => {
    setSidebarMode(mode);
    setShowControlMenu(false);
    setIsHovered(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, mode);
      } catch (_) {
        /* ignore */
      }
    }
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (Platform.OS !== 'web' || !controlButtonRef.current) return;
    const buttonNode = controlButtonRef.current._nativeNode || controlButtonRef.current;
    if (!buttonNode?.getBoundingClientRect) return;
    const rect = buttonNode.getBoundingClientRect();
    const menuNode = controlMenuRef.current?._nativeNode || controlMenuRef.current;
    const menuRect = menuNode?.getBoundingClientRect?.();
    const menuWidth = menuRect?.width || 172;
    const menuHeight = menuRect?.height || 108;
    const gap = 4;
    const viewportPadding = 8;

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - menuWidth - viewportPadding;
    }
    left = Math.max(viewportPadding, left);

    const top = Math.max(viewportPadding, rect.top - menuHeight - gap);

    setMenuPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!showControlMenu) return;
    updateMenuPosition();
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const rafId = requestAnimationFrame(() => updateMenuPosition());
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [showControlMenu, updateMenuPosition]);

  useEffect(() => {
    if (!showControlMenu || Platform.OS !== 'web') return;
    const handleClickOutside = (e) => {
      const buttonNode = controlButtonRef.current?._nativeNode || controlButtonRef.current;
      const menuNode = controlMenuRef.current?._nativeNode || controlMenuRef.current;
      if (
        buttonNode &&
        !buttonNode.contains(e.target) &&
        menuNode &&
        !menuNode.contains(e.target)
      ) {
        setShowControlMenu(false);
      }
    };
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showControlMenu]);

  return (
    <View style={styles.container}>
      <View
        style={styles.railColumn}
        {...(Platform.OS === 'web' && !isPinnedExpanded && {
          onMouseEnter: handleRailMouseEnter,
          onMouseLeave: handleRailMouseLeave,
        })}
      >
        <View
          style={[
            styles.railShell,
            !isPinnedExpanded && isExpanded && styles.railShellHoverExpanded,
          ]}
        >
          <View
            style={[
              styles.railOverlay,
              isPinnedExpanded && styles.railOverlayPinned,
              !isPinnedExpanded && isExpanded && styles.railOverlayExpanded,
            ]}
          >
            <LeftRail
              topActive={topActive}
              messagesPaneOpen={messagesPaneOpen}
              createPaneOpen={createPaneOpen}
              onSelectTop={onSelectTop}
              onExitChildView={onExitChildView}
              childrenList={childrenList}
              activeChildId={activeChildId}
              activeChildSection={activeChildSection}
              onSelectChild={onSelectChild}
              onSelectChildSection={onSelectChildSection}
              onOpenNew={onOpenNew}
              onOpenSearch={onOpenSearch}
              onAvatarPress={onAvatarPress}
              user={user}
              userRole={userRole}
              onOpenSettings={onOpenSettings}
              onOpenFeedback={onOpenFeedback}
              isCollapsed={isCollapsed}
              hideBrandLogo
              hideProfileNav
              iconRailMode
            />
          </View>
        </View>

        <View
          style={[
            styles.controlFooter,
            isPinnedExpanded && styles.controlFooterExpanded,
          ]}
        >
          <TouchableOpacity
            ref={controlButtonRef}
            style={[
              styles.controlButton,
              showControlMenu && styles.controlButtonActive,
            ]}
            onPress={() => {
              setShowControlMenu((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityLabel="Sidebar control"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <PanelLeft size={16} color="rgba(15, 23, 42, 0.55)" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {Platform.OS === 'web' && showControlMenu ? (
        <View
          ref={controlMenuRef}
          style={[
            styles.controlMenu,
            { top: menuPosition.top, left: menuPosition.left },
          ]}
        >
          <Text style={styles.controlMenuTitle}>Sidebar control</Text>
          <View style={styles.controlMenuDivider} />
          {SIDEBAR_MODE_OPTIONS.map((option) => {
            const isActive = sidebarMode === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.controlMenuItem,
                  isActive && styles.controlMenuItemActive,
                  hoveredMenuItem === option.key && styles.controlMenuItemHover,
                ]}
                onPress={() => handleModeChange(option.key)}
                {...(Platform.OS === 'web' && {
                  onMouseEnter: () => setHoveredMenuItem(option.key),
                  onMouseLeave: () => setHoveredMenuItem(null),
                  cursor: 'pointer',
                })}
              >
                <View style={styles.controlMenuItemLeading}>
                  {isActive ? <View style={styles.controlMenuBullet} /> : null}
                </View>
                <Text
                  style={[
                    styles.controlMenuText,
                    isActive && styles.controlMenuTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      minHeight: '100%',
      overflow: 'visible',
    }),
  },
  railColumn: {
    flex: 1,
    height: '100%',
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: 'rgba(148, 163, 184, 0.2)',
    ...(Platform.OS === 'web' && {
      overflow: 'visible',
    }),
  },
  railShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      overflow: 'visible',
    }),
  },
  railShellHoverExpanded: {
    ...(Platform.OS === 'web' && {
      overflow: 'visible',
      zIndex: 120,
    }),
  },
  railOverlay: {
    width: RAIL_ICON_WIDTH,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 1,
      transitionProperty: 'width, box-shadow',
      transitionDuration: '0.15s',
      transitionTimingFunction: 'ease',
    }),
  },
  railOverlayPinned: {
    position: 'relative',
    width: '100%',
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
    }),
  },
  railOverlayExpanded: {
    width: RAIL_EXPANDED_WIDTH,
    ...(Platform.OS === 'web' && {
      zIndex: 100,
      boxShadow: '4px 0 16px rgba(15, 23, 42, 0.12)',
    }),
  },
  controlFooter: {
    width: '100%',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      zIndex: 2,
    }),
  },
  controlFooterExpanded: {
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  controlButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    }),
  },
  controlButtonActive: {
    backgroundColor: '#FAFAFA',
  },
  controlMenu: {
    ...(Platform.OS === 'web'
      ? {
          position: 'fixed',
          backgroundColor: '#FFFFFF',
          borderRadius: 8,
          paddingVertical: 6,
          minWidth: 172,
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.24)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
          zIndex: 10000,
        }
      : {}),
  },
  controlMenuTitle: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  controlMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginBottom: 2,
  },
  controlMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    borderRadius: 5,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.15s ease',
    }),
  },
  controlMenuItemActive: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  controlMenuItemHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  controlMenuItemLeading: {
    width: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  controlMenuBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  controlMenuText: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.78)',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  controlMenuTextActive: {
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.92)',
  },
});

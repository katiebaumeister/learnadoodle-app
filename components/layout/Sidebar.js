import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, Linking } from 'react-native';
import { PanelLeftClose, PanelLeftOpen, Settings, Send, Search } from 'lucide-react';
import LeftRail from '../LeftRail';

/**
 * Sidebar - Wrapper around LeftRail with bottom chips
 * 
 * Structure:
 * - Top: Navigation items (from LeftRail)
 * - Bottom: Settings and Feedback chips (sticky)
 */
export default function Sidebar({
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
  onCollapsedChange,
}) {
  const [sidebarMode, setSidebarMode] = useState('expanded'); // 'expanded', 'collapsed'
  const [showCollapseMenu, setShowCollapseMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [hoveredMenuItem, setHoveredMenuItem] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  const collapseButtonRef = useRef(null);
  const collapseMenuRef = useRef(null);
  const hideMenuTimeoutRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const searchButtonRef = useRef(null);
  const feedbackButtonRef = useRef(null);
  const tooltipRef = useRef(null);

  // Determine if sidebar should be collapsed based on mode (no hover-to-expand)
  const isCollapsed = sidebarMode === 'collapsed';

  // Notify parent of collapsed state changes
  useEffect(() => {
    if (onCollapsedChange) {
      onCollapsedChange(isCollapsed);
    }
  }, [isCollapsed, onCollapsedChange]);

  const toggleCollapse = useCallback(() => {
    // When clicking collapse button, toggle between expanded and collapsed modes
    setSidebarMode(prev => prev === 'expanded' ? 'collapsed' : 'expanded');
    // Close the menu when toggling
    setShowCollapseMenu(false);
    if (hideMenuTimeoutRef.current) {
      clearTimeout(hideMenuTimeoutRef.current);
      hideMenuTimeoutRef.current = null;
    }
  }, []);

  const handleModeChange = useCallback((mode) => {
    setSidebarMode(mode);
    setShowCollapseMenu(false);
  }, []);

  // Helper to show menu (clears any pending hide)
  const showMenu = useCallback(() => {
    if (hideMenuTimeoutRef.current) {
      clearTimeout(hideMenuTimeoutRef.current);
      hideMenuTimeoutRef.current = null;
    }
    setShowCollapseMenu(true);
  }, []);

  // Helper to hide menu with delay (allows moving between button and menu)
  const hideMenu = useCallback(() => {
    if (hideMenuTimeoutRef.current) {
      clearTimeout(hideMenuTimeoutRef.current);
    }
    hideMenuTimeoutRef.current = setTimeout(() => {
      setShowCollapseMenu(false);
      hideMenuTimeoutRef.current = null;
    }, 150); // Small delay to allow mouse movement
  }, []);

  // Calculate menu position when it should be shown (right and up)
  useEffect(() => {
    if (showCollapseMenu && Platform.OS === 'web' && collapseButtonRef.current) {
      const updateMenuPosition = () => {
        if (collapseButtonRef.current) {
          const buttonNode = collapseButtonRef.current._nativeNode || collapseButtonRef.current;
          if (buttonNode && buttonNode.getBoundingClientRect) {
            const rect = buttonNode.getBoundingClientRect();
            // Menu dimensions (approximate)
            const menuWidth = 180;
            const menuHeight = 120; // Approximate height for 3 items + title
            // Position to the right and above the button
            setMenuPosition({
              top: rect.top + window.scrollY - menuHeight - 8, // Above with 8px gap
              left: rect.right + window.scrollX + 8, // To the right with 8px gap
            });
          }
        }
      };
      updateMenuPosition();
      window.addEventListener('scroll', updateMenuPosition, true);
      window.addEventListener('resize', updateMenuPosition);
      return () => {
        window.removeEventListener('scroll', updateMenuPosition, true);
        window.removeEventListener('resize', updateMenuPosition);
      };
    }
  }, [showCollapseMenu]);

  // Update tooltip transform for proper centering
  useEffect(() => {
    if (Platform.OS === 'web' && tooltip.visible && tooltipRef.current) {
      const tooltipNode = tooltipRef.current._nativeNode || tooltipRef.current;
      if (tooltipNode && tooltipNode.style) {
        tooltipNode.style.transform = 'translateX(-50%) translateY(-100%)';
      }
    }
  }, [tooltip.visible, tooltip.x, tooltip.y]);

  // Close menu when clicking outside
  useEffect(() => {
    if (showCollapseMenu && Platform.OS === 'web') {
      const handleClickOutside = (e) => {
        if (collapseButtonRef.current && collapseMenuRef.current) {
          const buttonNode = collapseButtonRef.current._nativeNode || collapseButtonRef.current;
          const menuNode = collapseMenuRef.current._nativeNode || collapseMenuRef.current;
          if (
            buttonNode &&
            !buttonNode.contains(e.target) &&
            menuNode &&
            !menuNode.contains(e.target)
          ) {
            setShowCollapseMenu(false);
            if (hideMenuTimeoutRef.current) {
              clearTimeout(hideMenuTimeoutRef.current);
              hideMenuTimeoutRef.current = null;
            }
          }
        }
      };
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true);
      }, 100);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [showCollapseMenu]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideMenuTimeoutRef.current) {
        clearTimeout(hideMenuTimeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Top: Navigation */}
      <View style={styles.navSection}>
        <LeftRail
          topActive={topActive}
          onSelectTop={onSelectTop}
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
        />
      </View>

      {/* Bottom: Settings, Feedback, and Collapse Button */}
      <View style={styles.collapseSection}>
        {/* Left Side: Settings, Feedback, and Search buttons - ARCHIVED */}
        {false && !isCollapsed && (
          <View style={styles.leftButtonsContainer}>
            {onOpenSettings && (
            <View style={styles.buttonWithTooltip}>
              <TouchableOpacity
                ref={settingsButtonRef}
                style={styles.settingsButton}
                onPress={onOpenSettings}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => {
                    if (settingsButtonRef.current) {
                      const node = settingsButtonRef.current._nativeNode || settingsButtonRef.current;
                      if (node && typeof node.getBoundingClientRect === 'function') {
                        const rect = node.getBoundingClientRect();
                        setTooltip({
                          visible: true,
                          text: 'Settings',
                          x: rect.left + rect.width / 2,
                          y: rect.top - 4,
                        });
                      }
                    }
                  },
                  onMouseLeave: () => setTooltip({ visible: false, text: '', x: 0, y: 0 }),
                })}
              >
                <Settings size={16} color="rgba(15,23,42,0.6)" />
              </TouchableOpacity>
            </View>
          )}
          
          {onOpenFeedback && (
            <View style={styles.buttonWithTooltip}>
              <TouchableOpacity
                ref={feedbackButtonRef}
                style={styles.feedbackButton}
                onPress={onOpenFeedback}
                accessibilityRole="button"
                accessibilityLabel="Feedback"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => {
                    if (feedbackButtonRef.current) {
                      const node = feedbackButtonRef.current._nativeNode || feedbackButtonRef.current;
                      if (node && typeof node.getBoundingClientRect === 'function') {
                        const rect = node.getBoundingClientRect();
                        setTooltip({
                          visible: true,
                          text: 'Feedback',
                          x: rect.left + rect.width / 2,
                          y: rect.top - 4,
                        });
                      }
                    }
                  },
                  onMouseLeave: () => setTooltip({ visible: false, text: '', x: 0, y: 0 }),
                })}
              >
                <Send size={16} color="rgba(15,23,42,0.6)" />
              </TouchableOpacity>
            </View>
          )}
          
          {onOpenSearch && (
            <View style={styles.buttonWithTooltip}>
              <TouchableOpacity
                ref={searchButtonRef}
                style={styles.searchButton}
                onPress={onOpenSearch}
                accessibilityRole="button"
                accessibilityLabel="Search"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => {
                    if (searchButtonRef.current) {
                      const node = searchButtonRef.current._nativeNode || searchButtonRef.current;
                      if (node && typeof node.getBoundingClientRect === 'function') {
                        const rect = node.getBoundingClientRect();
                        setTooltip({
                          visible: true,
                          text: 'Search',
                          x: rect.left + rect.width / 2,
                          y: rect.top - 4,
                        });
                      }
                    }
                  },
                  onMouseLeave: () => setTooltip({ visible: false, text: '', x: 0, y: 0 }),
                })}
              >
                <Search size={16} color="rgba(15,23,42,0.6)" />
              </TouchableOpacity>
            </View>
          )}
          </View>
        )}
        
        {/* Right Side: Collapse Button - ARCHIVED */}
        {false && (
          <View style={styles.collapseButtonWrapper}>
            <TouchableOpacity
              ref={collapseButtonRef}
              style={styles.collapseButton}
              onPress={toggleCollapse}
              accessibilityRole="button"
              accessibilityLabel={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
                onMouseEnter: showMenu,
                onMouseLeave: hideMenu,
              })}
            >
              {isCollapsed ? (
                <PanelLeftOpen size={16} color="rgba(15,23,42,0.6)" />
              ) : (
                <PanelLeftClose size={16} color="rgba(15,23,42,0.6)" />
              )}
            </TouchableOpacity>
            {Platform.OS === 'web' && showCollapseMenu && (
              <View 
                ref={collapseMenuRef}
                style={[
                  styles.collapseMenu,
                  {
                    top: menuPosition.top,
                    left: menuPosition.left,
                  },
                ]}
                onMouseEnter={showMenu}
                onMouseLeave={hideMenu}
              >
                <Text style={styles.collapseMenuTitle}>Sidebar control</Text>
                <TouchableOpacity
                  style={[
                    styles.collapseMenuItem,
                    sidebarMode === 'expanded' && styles.collapseMenuItemActive,
                    hoveredMenuItem === 'expanded' && styles.collapseMenuItemHover,
                  ]}
                  onPress={() => handleModeChange('expanded')}
                  {...(Platform.OS === 'web' && {
                    onMouseEnter: () => setHoveredMenuItem('expanded'),
                    onMouseLeave: () => setHoveredMenuItem(null),
                  })}
                >
                  <Text style={[
                    styles.collapseMenuText,
                    sidebarMode === 'expanded' && styles.collapseMenuTextActive,
                  ]}>Expanded</Text>
                  {sidebarMode === 'expanded' && <View style={styles.collapseMenuBullet} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.collapseMenuItem,
                    sidebarMode === 'collapsed' && styles.collapseMenuItemActive,
                    hoveredMenuItem === 'collapsed' && styles.collapseMenuItemHover,
                  ]}
                  onPress={() => handleModeChange('collapsed')}
                  {...(Platform.OS === 'web' && {
                    onMouseEnter: () => setHoveredMenuItem('collapsed'),
                    onMouseLeave: () => setHoveredMenuItem(null),
                  })}
                >
                  <Text style={[
                    styles.collapseMenuText,
                    sidebarMode === 'collapsed' && styles.collapseMenuTextActive,
                  ]}>Collapsed</Text>
                  {sidebarMode === 'collapsed' && <View style={styles.collapseMenuBullet} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.collapseMenuItem,
                    sidebarMode === 'expandOnHover' && styles.collapseMenuItemActive,
                    hoveredMenuItem === 'expandOnHover' && styles.collapseMenuItemHover,
                  ]}
                  onPress={() => handleModeChange('expandOnHover')}
                  {...(Platform.OS === 'web' && {
                    onMouseEnter: () => setHoveredMenuItem('expandOnHover'),
                    onMouseLeave: () => setHoveredMenuItem(null),
                  })}
                >
                  <Text style={[
                    styles.collapseMenuText,
                    sidebarMode === 'expandOnHover' && styles.collapseMenuTextActive,
                  ]}>Expand on hover</Text>
                  {sidebarMode === 'expandOnHover' && <View style={styles.collapseMenuBullet} />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
      
      {/* Tooltip */}
      {Platform.OS === 'web' && tooltip.visible && (
        <View
          ref={tooltipRef}
          style={[
            styles.tooltip,
            {
              left: tooltip.x,
              top: tooltip.y,
            },
            { pointerEvents: 'none' },
          ]}
        >
          <Text style={styles.tooltipText}>{tooltip.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  navSection: {
    flex: 1,
  },
  collapseSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      marginTop: 'auto',
    }),
  },
  leftButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingsButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  helpButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  searchButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  feedbackButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginBottom: 12,
  },
  ghostDivider: {
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  collapseButtonWrapper: {
    position: 'relative',
  },
  collapseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  collapseMenu: {
    ...(Platform.OS === 'web' ? {
      position: 'fixed',
      backgroundColor: '#FFFFFF',
      borderRadius: 8,
      paddingVertical: 8,
      minWidth: 180,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      zIndex: 10000, // High z-index to appear above center grid
    } : {
      position: 'absolute',
      bottom: '100%',
      left: 0,
      marginBottom: 8,
      backgroundColor: '#FFFFFF',
      borderRadius: 8,
      paddingVertical: 8,
      minWidth: 180,
      zIndex: 10000, // High z-index to appear above center grid
    }),
  },
  collapseMenuTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  collapseMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    }),
  },
  collapseMenuItemActive: {
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  collapseMenuItemHover: {
    backgroundColor: 'rgba(15,23,42,0.05)',
  },
  collapseMenuText: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.8)',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  collapseMenuTextActive: {
    fontWeight: '500',
    color: 'rgba(15,23,42,0.9)',
  },
  collapseMenuBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  buttonWithTooltip: {
    position: 'relative',
  },
  tooltip: {
    ...(Platform.OS === 'web' ? {
      position: 'fixed',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      zIndex: 100000,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    } : {}),
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

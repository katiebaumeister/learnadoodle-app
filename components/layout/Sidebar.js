import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { HelpCircle, Settings } from 'lucide-react';
import LeftRail from '../LeftRail';

export const RAIL_ICON_WIDTH = 52;
export const RAIL_EXPANDED_WIDTH = 220;
/** @deprecated Hover-expand removed; kept for any legacy imports */
export const RAIL_HOVER_EXPAND_OFFSET = 0;

const NAV_ICON_SIZE = 22;

/**
 * Sidebar — permanent expanded rail (full viewport height).
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
  onHoverOverlayChange = null,
}) {
  React.useEffect(() => {
    onReservedWidthChange?.(RAIL_EXPANDED_WIDTH);
  }, [onReservedWidthChange]);

  React.useEffect(() => {
    onHoverOverlayChange?.(false);
  }, [onHoverOverlayChange]);

  const renderFooterItem = (label, Icon, onPress, accessibilityLabel) => (
    <TouchableOpacity
      style={styles.footerNavItem}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={styles.footerIconWrap}>
        <Icon size={NAV_ICON_SIZE} color="rgba(15, 23, 42, 0.55)" strokeWidth={2} />
      </View>
      <Text style={styles.footerNavLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.rail}>
        <View style={styles.railBody}>
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
            isCollapsed={false}
            hideBrandLogo={false}
            hideProfileNav
            permanentSidebar
          />
        </View>

        <View style={styles.sidebarFooter}>
          {renderFooterItem('Help', HelpCircle, () => onOpenSettings?.('help'), 'Open help and FAQ')}
          {renderFooterItem('Settings', Settings, () => onOpenSettings?.('profile'), 'Open settings')}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  rail: {
    flex: 1,
    height: '100%',
    width: '100%',
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  railBody: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    overflow: 'hidden',
  },
  sidebarFooter: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#FFFFFF',
  },
  footerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  footerIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNavLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.78)',
    marginLeft: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

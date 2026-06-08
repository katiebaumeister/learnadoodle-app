import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import LeftRail from '../LeftRail';

export const RAIL_ICON_WIDTH = 52;
export const RAIL_EXPANDED_WIDTH = 220;
/** @deprecated Hover-expand removed; kept for any legacy imports */
export const RAIL_HOVER_EXPAND_OFFSET = 0;

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
    ...(Platform.OS === 'web' ? { overflow: 'visible' } : { overflow: 'hidden' }),
  },
});

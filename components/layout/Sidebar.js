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
  familyPlanningMode = null,
  featureSettings = null,
  studentSelfManagedNoParent = false,
  unreadMessagesCount = 0,
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
          permanentSidebar
          familyPlanningMode={familyPlanningMode}
          featureSettings={featureSettings}
          studentSelfManagedNoParent={studentSelfManagedNoParent}
          unreadMessagesCount={unreadMessagesCount}
        />
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
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
});

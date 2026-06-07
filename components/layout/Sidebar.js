import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus } from 'lucide-react';
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

        <View style={styles.createFooter}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => onSelectTop?.('create')}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Create"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.createButtonText}>Create</Text>
          </TouchableOpacity>
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
  createFooter: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)',
    }),
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

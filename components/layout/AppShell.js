import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Sidebar, { RAIL_EXPANDED_WIDTH } from './Sidebar';

/**
 * AppShell - Global layout wrapper
 *
 * Layout: permanent full-height sidebar | (top bar + main content column)
 */
export default function AppShell({
  sidebar,
  topBar = null,
  sectionNav = null,
  leftPane = null,
  children,
  onOpenSettings,
  onOpenFeedback,
  flushToEdge = false,
  disabled = false,
}) {
  const leftPaneWidth = leftPane?.width || 340;

  return (
    <View style={styles.appContainer}>
      <View
        style={styles.outerFrame}
        {...(Platform.OS === 'web' ? { className: 'glass-frame' } : {})}
      >
        <View style={styles.contentRow}>
          {sidebar ? (
            <View style={[styles.sidebarContainer, { width: RAIL_EXPANDED_WIDTH }]}>
              <Sidebar
                {...sidebar}
                onOpenSettings={onOpenSettings}
                onOpenFeedback={onOpenFeedback}
              />
            </View>
          ) : null}

          <View style={styles.rightColumn}>
            {topBar ? <View style={styles.topBarSlot}>{topBar}</View> : null}

            <View style={styles.bodyRow}>
              {leftPane?.content ? (
                <View
                  style={[
                    styles.leftPaneContainer,
                    leftPane.visible
                      ? [
                          styles.leftPaneContainerOpen,
                          {
                            width: leftPaneWidth,
                            maxWidth: leftPaneWidth,
                          },
                        ]
                      : styles.leftPaneContainerClosed,
                  ]}
                  {...(Platform.OS === 'web' && {
                    'aria-hidden': !leftPane.visible,
                  })}
                >
                  <View
                    style={[
                      styles.leftPaneInner,
                      { width: leftPaneWidth },
                      leftPane.visible ? styles.leftPaneInnerOpen : styles.leftPaneInnerClosed,
                    ]}
                    pointerEvents={leftPane.visible ? 'auto' : 'none'}
                  >
                    {leftPane.content}
                  </View>
                </View>
              ) : null}

              {sectionNav ? (
                <View style={styles.sectionNavContainer}>{sectionNav}</View>
              ) : null}

              <View
                style={[
                  styles.mainSurface,
                  styles.mainColumn,
                  leftPane?.content && styles.mainSurfaceWithLeftPane,
                  leftPane?.content && (leftPane.visible
                    ? styles.mainSurfaceLeftPaneOpen
                    : styles.mainSurfaceLeftPaneClosed),
                  flushToEdge && styles.mainSurfaceFlush,
                ]}
                {...(Platform.OS === 'web' ? { className: 'glass-surface' } : {})}
              >
                {disabled && (
                  <View style={[styles.setupBanner, { pointerEvents: 'box-none' }]}>
                    <Text style={styles.setupBannerText}>Finish setup to begin planning</Text>
                    <Text style={styles.setupBannerHint}>
                      Complete the quick setup above to use the planner, add events, and track progress.
                    </Text>
                  </View>
                )}
                <View style={styles.mainContentWrap}>
                  {disabled && (
                    <View
                      style={[styles.focusOverlay, { pointerEvents: 'auto' }]}
                      {...(Platform.OS === 'web' && {
                        tabIndex: 0,
                        'aria-hidden': false,
                        nativeID: 'onboarding-block-overlay',
                      })}
                    />
                  )}
                  <View
                    style={[
                      styles.contentInner,
                      disabled && styles.mainContentWrapDisabled,
                      { pointerEvents: disabled ? 'none' : 'auto' },
                    ]}
                    {...(disabled && Platform.OS === 'web' && { 'aria-hidden': true })}
                  >
                    {children}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    width: '100%',
    minHeight: Platform.OS === 'web' ? '100vh' : '100%',
    backgroundColor: '#F6F7FB',
  },
  outerFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F6F7FB',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  contentRow: {
    flexDirection: 'row',
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: '#F6F7FB',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  sidebarContainer: {
    flexShrink: 0,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      position: 'relative',
      zIndex: 100,
      minHeight: '100vh',
      height: '100%',
    }),
  },
  rightColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: 'column',
    backgroundColor: '#F6F7FB',
  },
  topBarSlot: {
    width: '100%',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      zIndex: 250,
    }),
  },
  bodyRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    minWidth: 0,
    backgroundColor: '#F6F7FB',
  },
  leftPaneContainer: {
    alignSelf: 'stretch',
    flexShrink: 0,
    marginTop: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      transitionProperty: 'width, max-width, opacity, margin-right',
      transitionDuration: '150ms',
      transitionTimingFunction: 'ease',
    }),
  },
  leftPaneContainerOpen: {
    opacity: 1,
    marginRight: 0,
    ...(Platform.OS === 'web' && {
      transform: [{ translateX: 0 }],
    }),
  },
  leftPaneInnerOpen: {
    opacity: 1,
    ...(Platform.OS === 'web' && {
      transform: [{ translateX: 0 }],
    }),
  },
  leftPaneInnerClosed: {
    opacity: 0,
    ...(Platform.OS === 'web' && {
      transform: [{ translateX: -10 }],
    }),
  },
  leftPaneContainerClosed: {
    width: 0,
    maxWidth: 0,
    opacity: 0,
    marginRight: 0,
    ...(Platform.OS === 'web' && {
      transform: [{ translateX: -12 }],
      transitionProperty: 'width, max-width, opacity, margin-right, transform',
      pointerEvents: 'none',
    }),
  },
  leftPaneInner: {
    flex: 1,
    height: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      transitionProperty: 'opacity, transform',
      transitionDuration: '300ms',
      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    }),
  },
  sectionNavContainer: {
    alignSelf: 'stretch',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      minHeight: '100%',
      height: '100%',
    }),
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  mainSurfaceWithLeftPane: {
    ...(Platform.OS === 'web' && {
      transitionProperty: 'margin-left, flex-grow',
      transitionDuration: '320ms',
      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    }),
  },
  mainSurfaceLeftPaneOpen: {
    marginLeft: 8,
  },
  mainSurfaceLeftPaneClosed: {
    marginLeft: 16,
  },
  mainSurface: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    marginTop: 16,
    marginRight: 16,
    marginBottom: 16,
    marginLeft: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
      minHeight: 'calc(100vh - 32px)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      zIndex: 0,
      scrollbarGutter: 'stable',
    }),
  },
  setupBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.15)',
    flexShrink: 0,
  },
  setupBannerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5B21B6',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  setupBannerHint: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  focusOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 5,
    backgroundColor: 'transparent',
  },
  mainContentWrap: {
    flex: 1,
    position: 'relative',
    ...(Platform.OS === 'web' && { minHeight: 0 }),
  },
  contentInner: {
    flex: 1,
    ...(Platform.OS === 'web' && { minHeight: 0 }),
  },
  mainContentWrapDisabled: {
    opacity: 0.85,
  },
  mainSurfaceFlush: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
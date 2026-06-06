import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Sidebar from './Sidebar';

/**
 * AppShell - Global layout wrapper with liquid glass styling
 * 
 * When disabled=true (onboarding incomplete): main content has pointer-events none
 * and a sticky "Finish setup to begin planning" banner is shown. OnboardingModal
 * is rendered by WebLayout and blocks until setup is complete.
 */
const RAIL_ICON_WIDTH = 52;

export default function AppShell({ 
  sidebar, 
  topBar = null,
  leftPane = null,
  children,
  onOpenSettings,
  onOpenFeedback,
  flushToEdge = false, // For planner: keeps border but removes padding inside
  disabled = false,   // When true, block interaction and show setup banner
}) {
  const leftPaneWidth = leftPane?.width || 340;

  return (
    <View style={styles.appContainer}>
      <View style={styles.outerFrame}>
        {topBar ? (
          <View style={styles.topBarSlot}>
            {topBar}
          </View>
        ) : null}
        <View style={styles.contentRow}>
          {/* Sidebar — fixed icon-rail slot; rail expands as overlay on hover */}
          {sidebar && (
            <View style={styles.sidebarContainer}>
              <Sidebar
                {...sidebar}
                onOpenSettings={onOpenSettings}
                onOpenFeedback={onOpenFeedback}
              />
            </View>
          )}

          {leftPane?.content ? (
            <View
              style={[
                styles.leftPaneContainer,
                leftPane.visible
                  ? [styles.leftPaneContainerOpen, { width: leftPaneWidth, maxWidth: leftPaneWidth }]
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

          {/* Main Content Surface */}
          <View 
            style={[
              styles.mainSurface,
              leftPane?.content && styles.mainSurfaceWithLeftPane,
              leftPane?.content && (leftPane.visible
                ? styles.mainSurfaceLeftPaneOpen
                : styles.mainSurfaceLeftPaneClosed),
              flushToEdge && styles.mainSurfaceFlush
            ]}
          >
            {disabled && (
              <View style={[styles.setupBanner, { pointerEvents: 'box-none' }]}>
                <Text style={styles.setupBannerText}>Finish setup to begin planning</Text>
                <Text style={styles.setupBannerHint}>Complete the quick setup above to use the planner, add events, and track progress.</Text>
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
                style={[styles.contentInner, disabled && styles.mainContentWrapDisabled, { pointerEvents: disabled ? 'none' : 'auto' }]}
                {...(disabled && Platform.OS === 'web' && { 'aria-hidden': true })}
              >
                {children}
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
    backgroundColor: '#FFFFFF',
  },
  outerFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  topBarSlot: {
    width: '100%',
    flexShrink: 0,
  },
  contentRow: {
    flexDirection: 'row',
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
    minHeight: 0,
  },
  sidebarContainer: {
    width: RAIL_ICON_WIDTH,
    flexShrink: 0,
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' && {
      position: 'relative',
      zIndex: 100,
    }),
  },
  leftPaneContainer: {
    alignSelf: 'stretch',
    flexShrink: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      transitionProperty: 'width, max-width, opacity, margin-right',
      transitionDuration: '320ms',
      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
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
  mainSurfaceWithLeftPane: {
    ...(Platform.OS === 'web' && {
      transitionProperty: 'margin-left, flex-grow',
      transitionDuration: '320ms',
      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    }),
  },
  mainSurfaceLeftPaneOpen: {
    marginLeft: 0,
  },
  mainSurfaceLeftPaneClosed: {
    marginLeft: 0,
  },
  mainSurface: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 0,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative', // Ensure stacking context
      zIndex: 0, // Below dropdown menu
      // Reserve space for scrollbar so centered content doesn’t look shifted vs top/bottom gutters
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
    // Keep border and borderRadius for liquid glass effect
    // Content inside will be flush to edges
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});







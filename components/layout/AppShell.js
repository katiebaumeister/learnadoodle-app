import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Sidebar from './Sidebar';

/**
 * AppShell - Global layout wrapper with liquid glass styling
 * 
 * When disabled=true (onboarding incomplete): main content has pointer-events none
 * and a sticky "Finish setup to begin planning" banner is shown. OnboardingModal
 * is rendered by WebLayout and blocks until setup is complete.
 */
export default function AppShell({ 
  sidebar, 
  children,
  onOpenSettings,
  onOpenFeedback,
  flushToEdge = false, // For planner: keeps border but removes padding inside
  disabled = false,   // When true, block interaction and show setup banner
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleCollapsedChange = (collapsed) => {
    setIsSidebarCollapsed(collapsed);
  };

  return (
    <View style={styles.appContainer}>
      <View 
        style={styles.outerFrame}
        {...(Platform.OS === 'web' ? { className: 'glass-frame' } : {})}
      >
        <View style={styles.contentRow}>
          {/* Sidebar */}
          {sidebar && (
            <View style={[
              styles.sidebarContainer,
              isSidebarCollapsed && styles.sidebarContainerCollapsed
            ]}>
              <Sidebar
                {...sidebar}
                onOpenSettings={onOpenSettings}
                onOpenFeedback={onOpenFeedback}
                onCollapsedChange={handleCollapsedChange}
              />
            </View>
          )}
          
          {/* Main Content Surface */}
          <View 
            style={[
              styles.mainSurface,
              flushToEdge && styles.mainSurfaceFlush
            ]}
            {...(Platform.OS === 'web' ? { className: 'glass-surface' } : {})}
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
    backgroundColor: '#F6F7FB', // App background
  },
  outerFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F6F7FB',
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    flex: 1,
    width: '100%',
    backgroundColor: '#F6F7FB',
  },
  sidebarContainer: {
    width: 240, // Desktop sidebar width (expanded)
    height: '100%',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
      transition: 'width 0.2s ease',
      position: 'relative', // Ensure stacking context
      zIndex: 1, // Above background but below dropdown menu
    }),
  },
  sidebarContainerCollapsed: {
    width: 76, // Collapsed sidebar width (matches LeftRail collapsed width)
    ...(Platform.OS === 'web' && {
      transition: 'width 0.2s ease',
    }),
  },
  mainSurface: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20, // --radius-md
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)', // --stroke
    margin: 16, // Gap between sidebar and surface
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
      minHeight: 'calc(100vh - 32px)', // Account for margin
      display: 'flex',
      flexDirection: 'column',
      position: 'relative', // Ensure stacking context
      zIndex: 0, // Below dropdown menu
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







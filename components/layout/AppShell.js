import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Sidebar from './Sidebar';

/**
 * AppShell - Global layout wrapper with liquid glass styling
 * 
 * Structure:
 * - Outer glass frame (rounded, with backdrop blur)
 * - Left sidebar (connected to frame)
 * - Center main surface (white, rounded, with border)
 * 
 * Design tokens:
 * - App background: #F6F7FB
 * - Surface white: #FFFFFF
 * - Glass border: rgba(15, 23, 42, 0.08)
 * - Glass highlight: rgba(255, 255, 255, 0.6)
 * - Blur: backdrop-filter: blur(14px)
 * - Radii: outer frame 24px, inner surface 20px
 */
export default function AppShell({ 
  sidebar, 
  children,
  onOpenSettings,
  onOpenFeedback,
  flushToEdge = false, // For planner: keeps border but removes padding inside
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
            {children}
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
  mainSurfaceFlush: {
    // Keep border and borderRadius for liquid glass effect
    // Content inside will be flush to edges
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});







import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

type Props = {
  left?: React.ReactNode;
  leftToolbar?: React.ReactNode;
  topBar?: React.ReactNode;
  intermediateBar?: React.ReactNode; // Bar between topBar and plannerToolbar
  plannerToolbar?: React.ReactNode; // Simple toolbar that spans from leftToolbar to right edge
  smartToolsToolbar?: React.ReactNode; // Smart Tools toolbar that appears below plannerToolbar
  children: React.ReactNode;
  fullWidth?: boolean; // If true, bypass mainInner padding/constraints
};

const LEFT_W = 200;
const RIGHT_W = 320;
const RIGHT_TOOLBAR_W = 200;
const TOPBAR_H = 52; // Match smart tools toolbar visual height (chips are ~38px with 12px container padding = ~52px effective)
const INTERMEDIATE_BAR_H = 40;

export default function LayoutShell({ left, leftToolbar, topBar, intermediateBar, plannerToolbar, smartToolsToolbar, children, fullWidth = false }: Props) {
  return (
    <View style={styles.root}>
      {topBar && (
        <View style={styles.topBarContainer}>
          {topBar}
        </View>
      )}
      <View style={styles.contentRow}>
        {left ? (
          <View style={styles.leftRail} accessibilityRole="navigation">
            {left}
          </View>
        ) : null}

        {leftToolbar ? <View style={styles.leftToolbar}>{leftToolbar}</View> : null}

        <View style={styles.mainWrap}>
          {intermediateBar && (
            <View style={styles.intermediateBar}>
              {intermediateBar}
            </View>
          )}
          {plannerToolbar && (
            <View style={styles.plannerToolbar}>
              {plannerToolbar}
            </View>
          )}
          {smartToolsToolbar && (
            <View style={styles.smartToolsToolbar}>
              {smartToolsToolbar}
            </View>
          )}
          {fullWidth ? (
            children
          ) : (
            <View style={styles.mainInner}>{children}</View>
          )}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'column',
    minHeight: '100vh' as any,
    width: '100%',
    backgroundColor: '#F6F7FB', // --bg (liquid glass base)
  },
  topBarContainer: {
    width: '100%',
    zIndex: 100,
    position: Platform.OS === 'web' ? ('sticky' as any) : 'relative',
    top: 0,
  },
  contentRow: {
    flexDirection: 'row',
    flex: 1,
    minHeight: Platform.OS === 'web' ? ('calc(100vh - 44px - 40px)' as any) : undefined,
    backgroundColor: '#F6F7FB', // --bg (liquid glass base)
  },
  leftRail: {
    width: LEFT_W,
    position: Platform.OS === 'web' ? ('sticky' as any) : 'relative',
    top: 0,
    height: Platform.OS === 'web' ? ('calc(100vh - 44px - 40px)' as any) : '100%',
  },
  mainWrap: {
    flex: 1,
    overflowY: Platform.OS === 'web' ? ('auto' as any) : undefined,
    overflowX: Platform.OS === 'web' ? ('visible' as any) : undefined,
    backgroundColor: '#F6F7FB', // --bg (liquid glass base)
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  intermediateBar: {
    width: '100%',
    height: INTERMEDIATE_BAR_H,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, // Hairline border
    borderBottomColor: 'rgba(17,24,39,.08)', // --stroke
    flexDirection: 'row',
    alignItems: 'center',
  },
  plannerToolbar: {
    width: '100%',
    height: TOPBAR_H,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  smartToolsToolbar: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, // Hairline border
    borderBottomColor: 'rgba(17,24,39,.08)', // --stroke
  },
  mainInner: {
    width: '100%',
    paddingHorizontal: 24, // --layout-page-padding (strict spacing: 24px)
    gap: 16, // --layout-card-gap (strict spacing: 16px)
  },
  leftToolbar: {
    width: RIGHT_TOOLBAR_W,
    backgroundColor: '#FAFAFA',
    borderRightWidth: 1, // Hairline border
    borderRightColor: 'rgba(17,24,39,.08)', // --stroke
    position: Platform.OS === 'web' ? ('sticky' as any) : 'relative',
    top: 0,
    minHeight: Platform.OS === 'web' ? ('calc(100vh - 44px - 40px)' as any) : '100%',
    height: Platform.OS === 'web' ? ('calc(100vh - 44px - 40px)' as any) : '100%',
  },
  rightToolbar: {
    width: RIGHT_TOOLBAR_W,
    backgroundColor: '#e5e7eb',
    position: Platform.OS === 'web' ? ('sticky' as any) : 'relative',
    top: 0,
    height: Platform.OS === 'web' ? ('calc(100vh - 44px)' as any) : '100%',
    alignItems: 'center',
  },
});



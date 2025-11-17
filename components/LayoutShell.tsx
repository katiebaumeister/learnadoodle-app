import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
  rightToolbar?: React.ReactNode;
  children: React.ReactNode;
  fullWidth?: boolean; // If true, bypass mainInner padding/constraints
};

const LEFT_W = 256;
const RIGHT_W = 320;
const RIGHT_TOOLBAR_W = 64;
const TOPBAR_H = 56;

export default function LayoutShell({ left, right, rightToolbar, children, fullWidth = false }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.leftRail} accessibilityRole="navigation">
        {left}
      </View>

      <View style={styles.mainWrap}>
        {fullWidth ? (
          children
        ) : (
          <View style={styles.mainInner}>{children}</View>
        )}
      </View>

      {right ? <View style={styles.rightRail}>{right}</View> : null}
      {rightToolbar ? <View style={styles.rightToolbar}>{rightToolbar}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    minHeight: '100vh' as any,
    width: '100%',
    backgroundColor: '#FAFBFC',
  },
  leftRail: {
    width: LEFT_W,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.06)',
    position: Platform.OS === 'web' ? ('sticky' as any) : 'relative',
    top: 0,
    height: '100vh' as any,
  },
  mainWrap: {
    flex: 1,
    overflowY: Platform.OS === 'web' ? ('auto' as any) : undefined,
    minHeight: Platform.OS === 'web' ? ('100vh' as any) : undefined,
    backgroundColor: '#FAFBFC',
    // paddingTop removed - TopBar is now rendered inside views that need it
  },
  mainInner: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 16,
  },
  rightRail: {
    width: RIGHT_W,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.06)',
    display: 'flex',
  },
  rightToolbar: {
    width: RIGHT_TOOLBAR_W,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FAFBFC',
    position: Platform.OS === 'web' ? ('sticky' as any) : 'relative',
    top: 0,
    height: '100vh' as any,
    alignItems: 'center',
  },
});



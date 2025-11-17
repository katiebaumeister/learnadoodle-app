import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme/colors';

export default function AppShell({ leftMenu, children }) {
  const childArray = React.Children.toArray(children);
  const hasHeader = childArray.length > 1;
  const header = hasHeader ? childArray[0] : null;
  const mainContent = hasHeader ? childArray.slice(1) : childArray;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {header}
      </View>
      <View style={styles.body}>
        <View style={[styles.leftRail, !leftMenu && styles.emptyRail]}>
          {leftMenu}
        </View>
        <View style={styles.mainArea}>
          <View style={styles.mainScroll}>
            {mainContent}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    minHeight: 0,
    maxHeight: 0,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bgSubtle,
  },
  leftRail: {
    minWidth: 60,
    borderRightWidth: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.bgSubtle,
  },
  emptyRail: {
    display: 'none',
  },
  mainArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mainScroll: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          overflowY: 'auto',
          height: '100vh',
        }
      : {}),
  },
});


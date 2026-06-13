import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react';

export default function AppModalShell({
  title,
  onClose,
  children,
  footer,
  contentContainerStyle,
  bodyStyle,
  shellStyle,
  footerStyle,
  titleRowStyle,
  scrollerStyle,
  disableShellScroll = false,
  maxWidth,
  // Legacy props — ignored after header streamlining
  mode: _mode,
  eyebrow: _eyebrow,
  accent: _accent,
  accentSoft: _accentSoft,
  HeroIcon: _HeroIcon,
}) {
  const ShellScroller = disableShellScroll ? View : ScrollView;
  const shellScrollerProps = disableShellScroll
    ? { style: [styles.scrollContentNoScroll, scrollerStyle] }
    : {
        style: [styles.scroll, scrollerStyle],
        contentContainerStyle: styles.scrollContent,
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled',
        nestedScrollEnabled: true,
      };
  const bodyStyles = [
    styles.body,
    disableShellScroll && styles.bodyNoOuterScroll,
    contentContainerStyle,
    bodyStyle,
  ];
  return (
    <View style={[styles.modal, shellStyle, maxWidth != null && { maxWidth }]}>
      <ShellScroller {...shellScrollerProps}>
        <View style={[styles.titleRow, titleRowStyle]}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={18} color="#64748B" strokeWidth={2.25} />
          </TouchableOpacity>
        </View>

        <View style={bodyStyles}>{children}</View>
      </ShellScroller>

      {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    width: '100%',
    maxWidth: 860,
    height: Platform.OS === 'web' ? '86vh' : '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#24324A',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  scrollContentNoScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  bodyNoOuterScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#0F172A',
    paddingRight: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  body: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 0,
  },
  footer: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
});

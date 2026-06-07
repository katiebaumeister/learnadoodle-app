import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { X, Sparkles } from 'lucide-react';
import { MODAL_SIZE, MODAL_SIZE_STYLES, MODAL_VISUAL } from './modalSystem';

/**
 * Canonical Learnadoodle modal shell.
 *
 * Structure (always):
 *   Header — title, optional Generate, close
 *   Optional description
 *   ───────
 *   Body — single scroll area
 *   ───────
 *   Sticky footer — Cancel / Save|Create
 */
export default function AppModalShell({
  title,
  description = null,
  onClose,
  onGenerate = null,
  generateLabel = 'Generate',
  children,
  footer,
  contentContainerStyle,
  bodyStyle,
  shellStyle,
  size = MODAL_SIZE.standard,
  /** @deprecated Use single shell scroll; only set for legacy fullscreen builders migrating off nested scroll. */
  disableShellScroll = false,
  // Legacy props — ignored
  mode: _mode,
  eyebrow: _eyebrow,
  accent: _accent,
  accentSoft: _accentSoft,
  HeroIcon: _HeroIcon,
}) {
  const isFullscreen = size === MODAL_SIZE.fullscreen;
  const BodyWrapper = disableShellScroll ? View : ScrollView;
  const bodyWrapperProps = disableShellScroll
    ? { style: [styles.bodyScroll, styles.bodyScrollDisabled, bodyStyle] }
    : {
        style: [styles.bodyScroll, bodyStyle],
        contentContainerStyle: [styles.bodyScrollContent, contentContainerStyle],
        showsVerticalScrollIndicator: true,
        keyboardShouldPersistTaps: 'handled',
      };

  return (
    <View
      style={[
        styles.modal,
        MODAL_SIZE_STYLES[size],
        isFullscreen && styles.modalFullscreen,
        shellStyle,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.headerActions}>
          {onGenerate ? (
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={onGenerate}
              accessibilityRole="button"
              accessibilityLabel={generateLabel}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Sparkles size={14} color="#7C3AED" strokeWidth={2} />
              <Text style={styles.generateBtnText}>{generateLabel}</Text>
            </TouchableOpacity>
          ) : null}
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
      </View>

      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}

      <View style={styles.headerDivider} />

      <BodyWrapper {...bodyWrapperProps}>{children}</BodyWrapper>

      {footer ? (
        <>
          <View style={styles.footerDivider} />
          <View style={styles.footer}>{footer}</View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    width: '100%',
    backgroundColor: MODAL_VISUAL.backgroundColor,
    borderRadius: MODAL_VISUAL.borderRadius,
    overflow: 'hidden',
    flexDirection: 'column',
    shadowColor: MODAL_VISUAL.shadowColor,
    shadowOpacity: MODAL_VISUAL.shadowOpacity,
    shadowRadius: MODAL_VISUAL.shadowRadius,
    shadowOffset: MODAL_VISUAL.shadowOffset,
    elevation: 10,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 40px rgba(15, 23, 42, 0.1)',
      display: 'flex',
    }),
  },
  modalFullscreen: {
    borderRadius: 0,
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
    flexShrink: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: MODAL_VISUAL.headerTitleColor,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.18)',
  },
  generateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  },
  description: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    color: MODAL_VISUAL.descriptionColor,
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerDivider: {
    height: 1,
    backgroundColor: MODAL_VISUAL.borderColor,
    flexShrink: 0,
  },
  bodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  bodyScrollDisabled: {
    overflow: 'hidden',
  },
  bodyScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 0,
  },
  footerDivider: {
    height: 1,
    backgroundColor: MODAL_VISUAL.borderColor,
    flexShrink: 0,
  },
  footer: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: MODAL_VISUAL.backgroundColor,
    flexShrink: 0,
  },
});

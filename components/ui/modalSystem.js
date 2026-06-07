import { Platform, StyleSheet } from 'react-native';

/** Canonical Learnadoodle modal sizes — use with AppModalShell `size` prop. */
export const MODAL_SIZE = {
  small: 'small',
  standard: 'standard',
  fullscreen: 'fullscreen',
};

export const MODAL_SIZE_STYLES = {
  small: {
    maxWidth: 480,
    width: '100%',
    ...(Platform.OS === 'web' ? { maxHeight: 'min(90vh, 560px)' } : { maxHeight: '90%' }),
  },
  standard: {
    maxWidth: 820,
    width: '100%',
    ...(Platform.OS === 'web' ? { height: '86vh', maxHeight: '86vh' } : { height: '86%' }),
  },
  fullscreen: {
    maxWidth: '100%',
    width: '100%',
    ...(Platform.OS === 'web'
      ? { height: '100vh', maxHeight: '100vh', borderRadius: 0 }
      : { height: '100%', maxHeight: '100%', borderRadius: 0 }),
  },
};

export const MODAL_VISUAL = {
  backgroundColor: '#FFFFFF',
  borderRadius: 22,
  shadowColor: '#24324A',
  shadowOpacity: 0.1,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  overlayColor: 'rgba(15, 23, 42, 0.45)',
  borderColor: 'rgba(148, 163, 184, 0.22)',
  headerTitleColor: '#0F172A',
  descriptionColor: '#64748B',
  sectionLabelColor: '#94A3B8',
  primaryBlue: '#2563EB',
  cancelBg: '#F1F5F9',
  cancelText: '#475569',
};

export const modalSystemStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: MODAL_VISUAL.overlayColor,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }),
  },
  overlayFullscreen: {
    padding: 0,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  wrap: {
    width: '100%',
    alignSelf: 'center',
  },
  wrapFullscreen: {
    flex: 1,
    maxWidth: '100%',
    height: '100%',
  },
  divider: {
    height: 1,
    backgroundColor: MODAL_VISUAL.borderColor,
    alignSelf: 'stretch',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: MODAL_VISUAL.sectionLabelColor,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionBlock: {
    gap: 16,
    marginBottom: 8,
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldRequired: {
    color: '#EF4444',
  },
});

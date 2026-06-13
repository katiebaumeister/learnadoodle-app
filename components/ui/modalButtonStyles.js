import { Platform, StyleSheet } from 'react-native';

/** Learnadoodle modal accent — outline secondary actions (Schedule, Try again, etc.) */
export const MODAL_ACCENT = '#9ECFFB';
export const MODAL_ACCENT_TEXT = '#6BB3E8';

export const modalButtonStyles = StyleSheet.create({
  secondaryButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: MODAL_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: MODAL_ACCENT_TEXT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  secondaryButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MODAL_ACCENT,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryButtonCompactText: {
    fontSize: 14,
    fontWeight: '700',
    color: MODAL_ACCENT_TEXT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  buttonDisabled: {
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
});

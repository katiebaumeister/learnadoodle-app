/**
 * Shared "Coming soon" modal styling — light Learnadoodle blue CTA + consistent type scale.
 * Matches planner FAB / brand pastel blue (#9ECFFB).
 */
import { Platform, StyleSheet } from 'react-native';

export const LEARNADOODLE_LIGHT_BLUE = '#9ECFFB';

export const comingSoonModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    paddingTop: 48,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E6EBF2',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
    }),
  },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 1,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  button: {
    backgroundColor: LEARNADOODLE_LIGHT_BLUE,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 2px 12px rgba(158, 207, 251, 0.55)',
    }),
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

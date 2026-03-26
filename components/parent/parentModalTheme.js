/**
 * Shared Learnadoodle-style tokens for parent-facing modals (help + submission review).
 * Light blue primary accent; black for primary actions.
 */
import { Platform } from 'react-native';

export const LD = {
  blue: '#89B5E4',
  blueMuted: '#7AACDF',
  fillSoft: '#EBF5FF',
  fillWash: 'rgba(235, 245, 255, 0.65)',
  fillSurface: 'rgba(137, 181, 228, 0.09)',
  border: 'rgba(137, 181, 228, 0.42)',
  borderStrong: 'rgba(137, 181, 228, 0.55)',
  accentBar: 'rgba(137, 181, 228, 0.55)',
  ring: 'rgba(137, 181, 228, 0.45)',
  ringSoft: 'rgba(137, 181, 228, 0.22)',
  shell: '#FAFCFE',
  shellBorder: 'rgba(148, 163, 184, 0.18)',
  ink: '#0f172a',
  inkSoft: '#334155',
  muted: '#64748b',
  mutedLight: '#94a3b8',
  placeholder: '#9ca3af',
  black: '#111827',
};

export const shellShadow =
  Platform.OS === 'web'
    ? {
        boxShadow: '0 10px 40px rgba(15, 23, 42, 0.07), 0 2px 8px rgba(15, 23, 42, 0.04)',
      }
    : {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 12,
      };

export const fontDisplay = (weight = '600') =>
  Platform.OS === 'web'
    ? {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: weight,
      }
    : { fontWeight: weight };

/**
 * Shared visual tokens for classwork panel (matches ManualCurriculumBuilderModal).
 */
import { Platform } from 'react-native';

export const CLASSWORK_ACCENT = '#9ECFFB';
export const CLASSWORK_FG = '#111827';
export const CLASSWORK_MUTED = '#64748B';
export const CLASSWORK_BORDER = '#e5e7eb';
export const CLASSWORK_BG = '#FFFFFF';
export const CLASSWORK_ERROR = '#ef4444';
export const CLASSWORK_LINK = '#6BB3E8';

export const CLASSWORK_LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export const CLASSWORK_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

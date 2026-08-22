/**
 * Onboarding modal branding — keep in sync across steps (PlanningMode, LearningContext, etc.)
 * Sky: primary actions / progress / checkbox fill. Primary text: headings & card labels (black).
 */
import { Platform } from 'react-native';

export const ONBOARDING_SKY = '#85C4F2';
/** Headings, option cards, and confirmation copy in onboarding */
export const ONBOARDING_TEXT_PRIMARY = '#111827';

/** Primary CTA sizing — match WelcomeStep "Get started" across Continue / Finish buttons */
export const ONBOARDING_CONTINUE_BTN = {
  paddingVertical: 14,
  paddingHorizontal: 24,
  borderRadius: 10,
  alignItems: 'center',
  ...(Platform.OS === 'web' && {
    boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
    fontFamily: '"League Spartan", sans-serif',
  }),
};

export const ONBOARDING_CONTINUE_BTN_TEXT = {
  fontSize: 18,
  fontWeight: '600',
  color: '#FFFFFF',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
};

export const ONBOARDING_CONTINUE_BTN_DISABLED = {
  backgroundColor: '#9CA3AF',
  opacity: 0.8,
};

export const ONBOARDING_CONTINUE_BTN_HOVERED = {
  backgroundColor: '#78BCEF',
};

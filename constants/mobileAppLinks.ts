/**
 * App Store / Play Store URLs for marketing CTAs. Set EXPO_PUBLIC_* in .env when live.
 */
export const IOS_APP_STORE_URL =
  process.env.EXPO_PUBLIC_IOS_APP_STORE_URL || 'https://apps.apple.com/app/learnadoodle';

export const ANDROID_PLAY_STORE_URL =
  process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.learnadoodle.app';

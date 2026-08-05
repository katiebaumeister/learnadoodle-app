import { Platform, Image } from 'react-native';

/** Bundled fallback (native + Expo web when /landing-hero.png is unavailable). */
export const LANDING_HERO_BUNDLE = require('../assets/landing-hero.png');
export const LANDING_LOGO_BUNDLE = require('../assets/icon.png');

/** Stable public URL used on web so HTML preload and <img> share one cache entry. */
export const LANDING_HERO_PUBLIC_PATH = '/landing-hero.png';

export function getLandingHeroSource() {
  if (Platform.OS === 'web') {
    return { uri: LANDING_HERO_PUBLIC_PATH };
  }
  return LANDING_HERO_BUNDLE;
}

export function getLandingLogoSource() {
  return LANDING_LOGO_BUNDLE;
}

function resolveUri(source) {
  try {
    if (!source) return null;
    if (typeof source === 'string') return source;
    if (typeof source === 'object' && typeof source.uri === 'string') return source.uri;
    if (typeof Image.resolveAssetSource === 'function') {
      return Image.resolveAssetSource(source)?.uri || null;
    }
  } catch (_) {}
  return null;
}

let heroPromise = null;
let heroReady = false;

export function isLandingHeroReady() {
  return heroReady;
}

/**
 * Preload + decode the marketing hero as early as possible (call from index.js).
 * Keeps a singleton promise so LandingPage can await the same decode.
 */
export function ensureLandingHeroLoaded() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    heroReady = true;
    return Promise.resolve();
  }
  if (heroPromise) return heroPromise;

  const uri = LANDING_HERO_PUBLIC_PATH;

  heroPromise = new Promise((resolve) => {
    const finish = () => {
      heroReady = true;
      resolve();
    };

    try {
      if (typeof document !== 'undefined' && !document.querySelector('link[data-landing-hero-preload]')) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = uri;
        link.setAttribute('fetchpriority', 'high');
        link.setAttribute('data-landing-hero-preload', '1');
        document.head.appendChild(link);
      }
    } catch (_) {}

    const img = new window.Image();
    img.decoding = 'sync';
    img.fetchPriority = 'high';
    const mark = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    img.onload = mark;
    img.onerror = () => {
      // Fall back to bundled asset if public file missing (e.g. odd local setups).
      const fallbackUri = resolveUri(LANDING_HERO_BUNDLE);
      if (!fallbackUri || fallbackUri === uri) {
        finish();
        return;
      }
      const fallback = new window.Image();
      fallback.onload = () => {
        if (typeof fallback.decode === 'function') {
          fallback.decode().then(finish).catch(finish);
        } else {
          finish();
        }
      };
      fallback.onerror = finish;
      fallback.src = fallbackUri;
    };
    img.src = uri;
  });

  return heroPromise;
}

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Image, ActivityIndicator } from 'react-native';
import {
  AVATAR_ASSETS,
  AVATAR_KEYS,
  LANDING_IMAGE_ASSETS,
  LEARNADOODLE_LOGO_ASSET,
  SIDEBAR_ICON_ASSETS,
} from '../assets/imageAssetMap';

const TOOLBAR_IDS = ['logo', 'home', 'planner', 'family', 'library', 'subject', 'more'];
const CONNECTED_ACCOUNT_LOGO_IDS = ['googleLogo', 'dropboxLogo', 'notionLogo', 'youtubeLogo', 'quizletLogo', 'canvasLogo'];
const SHELL_IMAGE_IDS = ['icon', 'messages', 'create', ...TOOLBAR_IDS, ...AVATAR_KEYS];

const SHELL_SOURCES = {
  icon: require('../assets/icon.png'),
  logo: LEARNADOODLE_LOGO_ASSET,
  home: SIDEBAR_ICON_ASSETS.home,
  planner: SIDEBAR_ICON_ASSETS.planner,
  messages: SIDEBAR_ICON_ASSETS.messages,
  create: SIDEBAR_ICON_ASSETS.create,
  family: SIDEBAR_ICON_ASSETS.family,
  library: SIDEBAR_ICON_ASSETS.library,
  subject: SIDEBAR_ICON_ASSETS.subjects,
  more: SIDEBAR_ICON_ASSETS.more,
  ...AVATAR_ASSETS,
};

/** Marketing / landing page PNGs — same batch as shell so first paint never waits on them */
const LANDING_PAGE_IDS = [
  'landingHero',
  'landingSchedule',
  'landingCurriculum',
  'landingProgress',
  'landingSupport',
  'landingTeach',
  'landingPrivacy',
  'landingSuperdoodle',
];
const LANDING_PAGE_SOURCES = {
  landingHero: LANDING_IMAGE_ASSETS.landing,
  landingSchedule: LANDING_IMAGE_ASSETS.schedule,
  landingCurriculum: LANDING_IMAGE_ASSETS.curriculum,
  landingProgress: LANDING_IMAGE_ASSETS.progress,
  landingSupport: LANDING_IMAGE_ASSETS.support,
  landingTeach: LANDING_IMAGE_ASSETS.teach,
  landingPrivacy: LANDING_IMAGE_ASSETS.privacy,
  landingSuperdoodle: LANDING_IMAGE_ASSETS.superdoodlesection,
};

/** Connected accounts logos (Family -> Connected accounts) */
const CONNECTED_ACCOUNT_LOGO_SOURCES = {
  googleLogo: require('../assets/google.png'),
  dropboxLogo: require('../assets/dropbox.png'),
  notionLogo: require('../assets/notion.png'),
  youtubeLogo: require('../assets/youtube.png'),
  quizletLogo: require('../assets/quizlet.png'),
  canvasLogo: require('../assets/canvas.png'),
};

/** Shell + sidebar + avatars + landing + connected-accounts logos */
const CRITICAL_WEB_IMAGE_IDS = [...SHELL_IMAGE_IDS, ...LANDING_PAGE_IDS, ...CONNECTED_ACCOUNT_LOGO_IDS];
const CRITICAL_WEB_SOURCES = {
  ...SHELL_SOURCES,
  ...LANDING_PAGE_SOURCES,
  ...CONNECTED_ACCOUNT_LOGO_SOURCES,
};

const TOTAL_PRELOAD = CRITICAL_WEB_IMAGE_IDS.length;
/** No extra delay after images decode — gate opens as soon as shell assets are loaded. */
const GATE_MIN_CYCLE_MS = 0;
/** App shell outer background — avoids white flash between landing and loader */
const LOADER_BG = '#F6F7FB';
const SPINNER_COLOR = '#6BB3E8';

function resolveUri(source) {
  try {
    const r = Image.resolveAssetSource(source);
    return r && r.uri ? r.uri : null;
  } catch {
    return null;
  }
}

let webShellImagesPromise = null;

/**
 * Web: preload + decode shell, toolbar, prof1–10, landing page PNGs once (singleton).
 * Call from index.js so decoding runs in parallel with the JS bundle before React root.
 * No-op resolve on native.
 */
export function ensureWebShellImagesLoaded() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (webShellImagesPromise) return webShellImagesPromise;
  webShellImagesPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const loaded = new Set();
    const onAssetDone = (id) => {
      if (loaded.has(id)) return;
      loaded.add(id);
      if (loaded.size >= TOTAL_PRELOAD) finish();
    };
    CRITICAL_WEB_IMAGE_IDS.forEach((id) => {
      const uri = resolveUri(CRITICAL_WEB_SOURCES[id]);
      if (!uri) {
        onAssetDone(id);
        return;
      }
      const img = new window.Image();
      const mark = () => {
        if (typeof img.decode === 'function') {
          img
            .decode()
            .then(() => onAssetDone(id))
            .catch(() => onAssetDone(id));
        } else {
          onAssetDone(id);
        }
      };
      img.onload = mark;
      img.onerror = () => onAssetDone(id);
      img.src = uri;
    });
  });
  return webShellImagesPromise;
}

/**
 * @param {object} props
 * @param {boolean} [props.spinnerOnly] - Normal spinner (session restore + shell gate). No avatar cycle.
 * @param {() => void} [props.onShellAssetsReady] - After preload + min delay; shell-only.
 */
export default function AppLoader({ style, onShellAssetsReady, spinnerOnly = false }) {
  const readyFiredRef = useRef(false);
  const gateMode = typeof onShellAssetsReady === 'function';
  const gateTimerStartRef = useRef(null);
  const loadedRef = useRef(new Set());
  const [loadedCount, setLoadedCount] = useState(0);
  const [webShellDecodeDone, setWebShellDecodeDone] = useState(Platform.OS !== 'web');

  const allShellImagesLoaded =
    Platform.OS === 'web' ? webShellDecodeDone : loadedCount >= TOTAL_PRELOAD;

  const markLoaded = (id) => {
    if (loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    setLoadedCount(loadedRef.current.size);
  };

  const fireShellReady = () => {
    if (!gateMode || readyFiredRef.current) return;
    readyFiredRef.current = true;
    onShellAssetsReady();
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    ensureWebShellImagesLoaded().then(() => setWebShellDecodeDone(true));
  }, []);

  const preloadImages =
    Platform.OS === 'web' ? null : (
      <View style={[styles.preloadWrap, { pointerEvents: 'none' }]}>
        {CRITICAL_WEB_IMAGE_IDS.map((id) => (
          <Image
            key={id}
            source={CRITICAL_WEB_SOURCES[id]}
            style={styles.preloadDecode}
            resizeMode="contain"
            onLoad={() => markLoaded(id)}
            onLoadEnd={() => markLoaded(id)}
            onError={() => markLoaded(id)}
          />
        ))}
      </View>
    );

  useEffect(() => {
    if (!allShellImagesLoaded || gateTimerStartRef.current != null) return;
    gateTimerStartRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, [allShellImagesLoaded]);

  useEffect(() => {
    if (!gateMode || readyFiredRef.current) return;

    const tryReady = () => {
      if (readyFiredRef.current) return;
      if (!allShellImagesLoaded || gateTimerStartRef.current == null) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - gateTimerStartRef.current < GATE_MIN_CYCLE_MS) return;
      fireShellReady();
    };

    const interval = setInterval(tryReady, 80);
    return () => {
      clearInterval(interval);
    };
  }, [gateMode, allShellImagesLoaded]);

  // Auth gate: no shell preload needed — instant spinner only
  if (spinnerOnly && !gateMode) {
    return (
      <View style={[styles.overlay, style]}>
        <ActivityIndicator size="large" color={SPINNER_COLOR} />
      </View>
    );
  }

  return (
    <View style={[styles.overlay, style]}>
      {preloadImages ?? null}
      <View style={styles.inner}>
        <ActivityIndicator size="large" color={SPINNER_COLOR} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: LOADER_BG,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      width: '100vw',
      height: '100vh',
      minWidth: '100vw',
      minHeight: '100vh',
      zIndex: 99999,
    }),
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 140,
    position: 'relative',
  },
  preloadWrap: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  preloadDecode: {
    width: 1,
    height: 1,
  },
});

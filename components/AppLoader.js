import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Image, ActivityIndicator } from 'react-native';

const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8', 'prof9', 'prof10'];
const AVATAR_SOURCES = {
  prof1: require('../assets/prof1.png'),
  prof2: require('../assets/prof2.png'),
  prof3: require('../assets/prof3.png'),
  prof4: require('../assets/prof4.png'),
  prof5: require('../assets/prof5.png'),
  prof6: require('../assets/prof6.png'),
  prof7: require('../assets/prof7.png'),
  prof8: require('../assets/prof8.png'),
  prof9: require('../assets/prof9.png'),
  prof10: require('../assets/prof10.png'),
};

const TOOLBAR_IDS = ['logo', 'home', 'planner', 'family', 'library', 'subject', 'more'];
const HOME_POODLE_IDS = ['homePoodleLight', 'homePoodleNormal', 'homePoodleHeavy'];
const SHELL_IMAGE_IDS = ['icon', ...TOOLBAR_IDS, ...HOME_POODLE_IDS, ...AVATAR_KEYS];

const SHELL_SOURCES = {
  icon: require('../assets/icon.png'),
  logo: require('../assets/learnadoodle-logo.png'),
  home: require('../assets/home.png'),
  planner: require('../assets/planner.png'),
  family: require('../assets/family.png'),
  library: require('../assets/library.png'),
  subject: require('../assets/subject.png'),
  more: require('../assets/more.png'),
  /** Home hero / forecast poodles — decoded before shell gate opens */
  homePoodleLight: require('../assets/light.png'),
  homePoodleNormal: require('../assets/normal.png'),
  homePoodleHeavy: require('../assets/heavy.png'),
  ...AVATAR_SOURCES,
};

const TOTAL_PRELOAD = SHELL_IMAGE_IDS.length;
/** No extra delay after images decode — gate opens as soon as shell assets are loaded. */
const GATE_MIN_CYCLE_MS = 0;
const STALL_FALLBACK_MS = 60000;
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
 * Web: preload + decode all shell/toolbar PNGs once (singleton). Resolves when every asset
 * has loaded and (if supported) decoded so the sidebar/FAB can paint without pop-in.
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
    SHELL_IMAGE_IDS.forEach((id) => {
      const uri = resolveUri(SHELL_SOURCES[id]);
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
    setTimeout(finish, STALL_FALLBACK_MS);
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
        {SHELL_IMAGE_IDS.map((id) => (
          <Image
            key={id}
            source={SHELL_SOURCES[id]}
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
    const stallFallback = setTimeout(() => {
      if (readyFiredRef.current) return;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[AppLoader] Stall fallback after', STALL_FALLBACK_MS, 'ms');
      }
      fireShellReady();
    }, STALL_FALLBACK_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(stallFallback);
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

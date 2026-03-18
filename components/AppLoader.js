import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';

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

/** Left rail + branding: must decode before app shows */
const TOOLBAR_IDS = ['logo', 'home', 'planner', 'family', 'library', 'subject', 'more'];
const SHELL_IMAGE_IDS = ['icon', ...TOOLBAR_IDS, ...AVATAR_KEYS];

const SHELL_SOURCES = {
  icon: require('../assets/icon.png'),
  logo: require('../assets/learnadoodle-logo.png'),
  home: require('../assets/home.png'),
  planner: require('../assets/planner.png'),
  family: require('../assets/family.png'),
  library: require('../assets/library.png'),
  subject: require('../assets/subject.png'),
  more: require('../assets/more.png'),
  ...AVATAR_SOURCES,
};

const TOTAL_PRELOAD = SHELL_IMAGE_IDS.length;
/** Never open app before this many ms of prof cycle (UX); toolbar gate still waits on images. */
const GATE_MIN_CYCLE_MS = 1600;
/** If loads stall (buggy onLoad), eventually proceed so user isn’t stuck — only after this. */
const STALL_FALLBACK_MS = 60000;

function resolveUri(source) {
  try {
    const r = Image.resolveAssetSource(source);
    return r && r.uri ? r.uri : null;
  } catch {
    return null;
  }
}

/**
 * Prof cycle on first paint + strict preload of every left-rail PNG.
 * WebLayout only dismisses loader after all shell images loaded (or errored) + min cycle — no early dismiss.
 */
export default function AppLoader({ style, onShellAssetsReady }) {
  const readyFiredRef = useRef(false);
  const gateMode = typeof onShellAssetsReady === 'function';
  const mountTimeRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [avatarIndex, setAvatarIndex] = useState(0);
  const loadedRef = useRef(new Set());
  const [loadedCount, setLoadedCount] = useState(0);

  const allShellImagesLoaded = loadedCount >= TOTAL_PRELOAD;

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

  // Web: decode every asset via HTML Image so toolbar PNGs are in network cache before LeftRail paints
  useEffect(() => {
    if (!gateMode || Platform.OS !== 'web' || typeof window === 'undefined') return;
    SHELL_IMAGE_IDS.forEach((id) => {
      const uri = resolveUri(SHELL_SOURCES[id]);
      if (!uri) {
        markLoaded(id);
        return;
      }
      const img = new window.Image();
      img.onload = () => markLoaded(id);
      img.onerror = () => markLoaded(id);
      img.src = uri;
    });
  }, [gateMode]);

  // Dismiss only when every shell asset reported + min prof cycle — loader persists until then
  useEffect(() => {
    if (!gateMode || readyFiredRef.current) return;

    const tryReady = () => {
      if (readyFiredRef.current) return;
      if (!allShellImagesLoaded) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - mountTimeRef.current < GATE_MIN_CYCLE_MS) return;
      fireShellReady();
    };

    tryReady();
    const interval = setInterval(tryReady, 80);
    const stallFallback = setTimeout(() => {
      if (readyFiredRef.current) return;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[AppLoader] Stall fallback: opening app after', STALL_FALLBACK_MS, 'ms');
      }
      fireShellReady();
    }, STALL_FALLBACK_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(stallFallback);
    };
  }, [gateMode, allShellImagesLoaded]);

  const avatarIntervalMs = 100;
  const lastTickRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    let rafId;
    lastTickRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
    indexRef.current = 0;
    setAvatarIndex(0);
    const tick = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = now - lastTickRef.current;
      const advance = Math.floor(elapsed / avatarIntervalMs);
      if (advance > 0) {
        lastTickRef.current = lastTickRef.current + advance * avatarIntervalMs;
        indexRef.current = (indexRef.current + advance) % AVATAR_KEYS.length;
        setAvatarIndex(indexRef.current);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (typeof cancelAnimationFrame !== 'undefined' && rafId != null) cancelAnimationFrame(rafId);
    };
  }, []);

  const preloadImages = (
    <View style={styles.preloadWrap} pointerEvents="none">
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

  return (
    <View style={[styles.overlay, style]}>
      <View style={styles.inner}>
        {preloadImages}
        <View style={styles.avatarWrap} pointerEvents="none">
          {AVATAR_KEYS.map((key, i) => (
            <Image
              key={key}
              source={SHELL_SOURCES[key]}
              style={[styles.avatar, styles.avatarStack, { opacity: avatarIndex === i ? 1 : 0 }]}
              resizeMode="contain"
            />
          ))}
        </View>
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
    backgroundColor: '#ffffff',
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
    left: -9999,
    top: 0,
    width: 64,
    height: 64,
    opacity: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  preloadDecode: {
    width: 48,
    height: 48,
  },
  avatarWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
  },
  avatarStack: {
    position: 'absolute',
  },
});

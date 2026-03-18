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
const GATE_MIN_CYCLE_MS = 1600;
const STALL_FALLBACK_MS = 60000;
/** App shell outer background — avoids white flash between landing and loader */
const LOADER_BG = '#F6F7FB';

function resolveUri(source) {
  try {
    const r = Image.resolveAssetSource(source);
    return r && r.uri ? r.uri : null;
  } catch {
    return null;
  }
}

/**
 * Web: preload + decode via HTML Image. Returns Promise per id (decode in browser cache).
 * RN visible Images then paint from cache immediately.
 */
function preloadShellImagesWeb(onEachLoaded) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  SHELL_IMAGE_IDS.forEach((id) => {
    const uri = resolveUri(SHELL_SOURCES[id]);
    if (!uri) {
      onEachLoaded(id);
      return;
    }
    const img = new window.Image();
    img.onload = () => onEachLoaded(id);
    img.onerror = () => onEachLoaded(id);
    img.src = uri;
  });
}

/**
 * Prof cycle only after all 10 prof PNGs decoded. Toolbar gated before app. Loader BG matches shell.
 */
export default function AppLoader({ style, onShellAssetsReady }) {
  const readyFiredRef = useRef(false);
  const gateMode = typeof onShellAssetsReady === 'function';
  const gateTimerStartRef = useRef(null);
  const [showProfCycle, setShowProfCycle] = useState(false);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const loadedRef = useRef(new Set());
  const [loadedCount, setLoadedCount] = useState(0);
  const profDecodedRef = useRef(new Set());

  const allShellImagesLoaded = loadedCount >= TOTAL_PRELOAD;

  const markLoaded = (id) => {
    if (loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    setLoadedCount(loadedRef.current.size);
  };

  const markProfDecoded = (id) => {
    if (!AVATAR_KEYS.includes(id)) return;
    if (profDecodedRef.current.has(id)) return;
    profDecodedRef.current.add(id);
    if (profDecodedRef.current.size >= AVATAR_KEYS.length) setShowProfCycle(true);
  };

  const fireShellReady = () => {
    if (!gateMode || readyFiredRef.current) return;
    readyFiredRef.current = true;
    onShellAssetsReady();
  };

  // Web: decode every asset; mark shell + prof decode for cycle
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    preloadShellImagesWeb((id) => {
      markLoaded(id);
      markProfDecoded(id);
    });
  }, []);

  // Native / fallback: RN Image preload
  const preloadImages = (
    <View style={styles.preloadWrap} pointerEvents="none">
      {SHELL_IMAGE_IDS.map((id) => (
        <Image
          key={id}
          source={SHELL_SOURCES[id]}
          style={styles.preloadDecode}
          resizeMode="contain"
          onLoad={() => {
            markLoaded(id);
            markProfDecoded(id);
          }}
          onLoadEnd={() => {
            markLoaded(id);
            markProfDecoded(id);
          }}
          onError={() => markLoaded(id)}
        />
      ))}
    </View>
  );

  // When all shell IDs reported (web HTML + RN), start gate timer for dismiss
  useEffect(() => {
    if (!allShellImagesLoaded || gateTimerStartRef.current != null) return;
    gateTimerStartRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, [allShellImagesLoaded]);

  // Non-web: prof cycle after RN marked all profs
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (AVATAR_KEYS.every((k) => loadedRef.current.has(k))) setShowProfCycle(true);
  }, [loadedCount]);

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

  const avatarIntervalMs = 100;
  const lastTickRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!showProfCycle) return;
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
  }, [showProfCycle]);

  return (
    <View style={[styles.overlay, style]}>
      {preloadImages}
      {showProfCycle ? (
        <View style={styles.inner}>
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
      ) : null}
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

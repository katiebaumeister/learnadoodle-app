import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Image, Animated, ActivityIndicator } from 'react-native';

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

const SHELL_IMAGE_IDS = [
  'icon',
  'logo',
  'home',
  'planner',
  'family',
  'library',
  'subject',
  'more',
  ...AVATAR_KEYS,
];

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
const PRELOAD_DONE_TIMEOUT_MS = 12000;

let globalIconSequenceDone = false;

/**
 * Preloads shell + left-rail PNGs. With onShellAssetsReady, parent should keep overlay until callback (WebLayout).
 * Without callback, runs icon → avatar animation after preload (landing / role gate).
 */
export default function AppLoader({ style, onShellAssetsReady }) {
  const readyFiredRef = useRef(false);
  const gateMode = typeof onShellAssetsReady === 'function';
  const [phase, setPhase] = useState(() =>
    gateMode ? 'gate' : globalIconSequenceDone ? 'avatars' : 'loading'
  );
  const [avatarIndex, setAvatarIndex] = useState(0);
  const loadedRef = useRef(new Set());
  const [loadedCount, setLoadedCount] = useState(0);
  const iconOpacity = useRef(new Animated.Value(globalIconSequenceDone ? 0 : 1)).current;
  const avatarContainerOpacity = useRef(new Animated.Value(globalIconSequenceDone ? 1 : 0)).current;
  const holdTimeoutRef = useRef(null);

  const allShellImagesLoaded = loadedCount >= TOTAL_PRELOAD;

  const markLoaded = (id) => {
    if (loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    setLoadedCount(loadedRef.current.size);
  };

  useEffect(() => {
    if (!allShellImagesLoaded) return;
    if (gateMode) {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;
      onShellAssetsReady();
      return;
    }
    setPhase(globalIconSequenceDone ? 'avatars' : 'icon');
    if (globalIconSequenceDone) avatarContainerOpacity.setValue(1);
  }, [allShellImagesLoaded, gateMode, onShellAssetsReady, avatarContainerOpacity]);

  useEffect(() => {
    if (!gateMode) return;
    const t = setTimeout(() => {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;
      onShellAssetsReady();
    }, PRELOAD_DONE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [gateMode, onShellAssetsReady]);

  useEffect(() => {
    if (gateMode || globalIconSequenceDone) return;
    if (phase !== 'icon') return;
    const holdMs = 1000;
    const fadeOutMs = 250;
    holdTimeoutRef.current = setTimeout(() => {
      Animated.timing(iconOpacity, {
        toValue: 0,
        duration: fadeOutMs,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        globalIconSequenceDone = true;
        setPhase('avatars');
        avatarContainerOpacity.setValue(1);
      });
    }, holdMs);
    return () => {
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, [gateMode, phase, iconOpacity, avatarContainerOpacity]);

  const avatarIntervalMs = 100;
  const lastTickRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (gateMode || phase !== 'avatars') return;
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
  }, [gateMode, phase]);

  const preloadImages = (
    <View style={styles.preloadWrap} pointerEvents="none">
      {SHELL_IMAGE_IDS.map((id) => (
        <Image
          key={id}
          source={SHELL_SOURCES[id]}
          style={styles.preloadPixel}
          resizeMode="contain"
          onLoad={() => markLoaded(id)}
          onLoadEnd={() => markLoaded(id)}
        />
      ))}
    </View>
  );

  if (gateMode) {
    return (
      <View style={[styles.overlay, style]}>
        <View style={styles.shellGateInner}>
          {preloadImages}
          <ActivityIndicator size="large" color="#887DEE" />
        </View>
      </View>
    );
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.overlay, style]}>
        <View style={styles.inner}>
          {preloadImages}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.overlay, style]}>
      <View style={styles.inner}>
        {phase === 'icon' && (
          <Animated.View style={[styles.iconWrap, { opacity: iconOpacity }]} pointerEvents="none">
            <Image source={SHELL_SOURCES.icon} style={styles.icon} resizeMode="contain" />
          </Animated.View>
        )}
        <Animated.View style={[styles.avatarWrap, { opacity: avatarContainerOpacity }]} pointerEvents="none">
          {AVATAR_KEYS.map((key, i) => (
            <Image
              key={key}
              source={SHELL_SOURCES[key]}
              style={[styles.avatar, styles.avatarStack, { opacity: avatarIndex === i ? 1 : 0 }]}
              resizeMode="contain"
            />
          ))}
        </Animated.View>
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
  shellGateInner: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
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
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  preloadPixel: {
    width: 8,
    height: 8,
  },
  iconWrap: {
    position: 'absolute',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 96,
    height: 96,
  },
  avatarWrap: {
    position: 'absolute',
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

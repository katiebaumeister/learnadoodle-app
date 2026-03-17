import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Image, Animated } from 'react-native';

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

// Run icon sequence only once per page load (survives Strict Mode remount so we don't flash icon twice)
let globalIconSequenceDone = false;

/**
 * Loading screen: preload all images, then show icon, brief hold, fade out, then prof1–10 fast cycle.
 * We only show icon/avatars after they have fully loaded so nothing appears half-drawn.
 */
export default function AppLoader({ style }) {
  const [phase, setPhase] = useState(() => (globalIconSequenceDone ? 'avatars' : 'loading'));
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [iconLoaded, setIconLoaded] = useState(false);
  const avatarLoadedRef = useRef(new Set());
  const [avatarsLoadedCount, setAvatarsLoadedCount] = useState(0);

  const iconOpacity = useRef(new Animated.Value(globalIconSequenceDone ? 0 : 1)).current;
  const avatarContainerOpacity = useRef(new Animated.Value(globalIconSequenceDone ? 1 : 0)).current;
  const holdTimeoutRef = useRef(null);

  const allImagesLoaded = iconLoaded && avatarsLoadedCount >= AVATAR_KEYS.length;

  useEffect(() => {
    if (phase === 'loading' && allImagesLoaded) {
      setPhase(globalIconSequenceDone ? 'avatars' : 'icon');
      if (globalIconSequenceDone) {
        avatarContainerOpacity.setValue(1);
      }
    }
  }, [phase, allImagesLoaded, avatarContainerOpacity]);

  const handleAvatarLoad = (key) => {
    avatarLoadedRef.current.add(key);
    setAvatarsLoadedCount((prev) => Math.min(AVATAR_KEYS.length, avatarLoadedRef.current.size));
  };

  useEffect(() => {
    if (globalIconSequenceDone) {
      setPhase('avatars');
      avatarContainerOpacity.setValue(1);
      return;
    }
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
  }, [phase, iconOpacity, avatarContainerOpacity]);

  // Even, continuous avatar cycle: use elapsed time so timing stays consistent under load
  const avatarIntervalMs = 100;
  const lastTickRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (phase !== 'avatars') return;
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
  }, [phase]);

  // Preload phase: render all images hidden so they load; only show icon/avatars after all have onLoad
  if (phase === 'loading') {
    return (
      <View style={[styles.overlay, style]}>
        <View style={styles.inner}>
          <View style={styles.preloadWrap}>
            <Image
              source={require('../assets/icon.png')}
              style={styles.icon}
              resizeMode="contain"
              onLoad={() => setIconLoaded(true)}
            />
            {AVATAR_KEYS.map((key) => (
              <Image
                key={key}
                source={AVATAR_SOURCES[key]}
                style={[styles.avatar, styles.avatarStack]}
                resizeMode="contain"
                onLoad={() => handleAvatarLoad(key)}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.overlay, style]}>
      <View style={styles.inner}>
        {phase === 'icon' && (
          <Animated.View style={[styles.iconWrap, { opacity: iconOpacity }]} pointerEvents="none">
            <Image source={require('../assets/icon.png')} style={styles.icon} resizeMode="contain" />
          </Animated.View>
        )}
        <Animated.View style={[styles.avatarWrap, { opacity: avatarContainerOpacity }]} pointerEvents="none">
          {AVATAR_KEYS.map((key, i) => (
            <Image
              key={key}
              source={AVATAR_SOURCES[key]}
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
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 140,
    position: 'relative',
  },
  preloadWrap: {
    position: 'absolute',
    width: 120,
    height: 120,
    opacity: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
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

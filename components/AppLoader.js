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
 * Loading screen: show icon, brief hold, fade out, then prof1–10 fast cycle.
 * When app is ready, loader unmounts and we go straight from avatars to app (no icon again).
 */
export default function AppLoader({ style }) {
  const [phase, setPhase] = useState(() => (globalIconSequenceDone ? 'avatars' : 'icon'));
  const [avatarIndex, setAvatarIndex] = useState(0);
  const iconOpacity = useRef(new Animated.Value(globalIconSequenceDone ? 0 : 1)).current;
  const avatarContainerOpacity = useRef(new Animated.Value(globalIconSequenceDone ? 1 : 0)).current;
  const cycleRef = useRef(null);

  const holdTimeoutRef = useRef(null);

  useEffect(() => {
    if (globalIconSequenceDone) {
      setPhase('avatars');
      avatarContainerOpacity.setValue(1);
      return;
    }

    const holdMs = 500;
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
  }, [iconOpacity, avatarContainerOpacity]);

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

  return (
    <View style={[styles.overlay, style]}>
      <View style={styles.inner}>
        {phase === 'icon' && (
          <Animated.View style={[styles.iconWrap, { opacity: iconOpacity }]} pointerEvents="none">
            <Image source={require('../assets/icon.png')} style={styles.icon} resizeMode="contain" />
          </Animated.View>
        )}
        <Animated.View style={[styles.avatarWrap, { opacity: avatarContainerOpacity }]} pointerEvents="none">
          <Image
            source={AVATAR_SOURCES[AVATAR_KEYS[avatarIndex]]}
            style={styles.avatar}
            resizeMode="contain"
          />
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
});

import React, { useEffect } from 'react';
import { View, Image, Platform, StyleSheet } from 'react-native';

// Same avatar assets as AddChildStep so they are cached before the onboarding "add learner" step
const AVATAR_SOURCES = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
};

/**
 * Invisible image elements that trigger the browser/bundler to load avatar PNGs.
 * Mount this as soon as the app may show onboarding (e.g. during initial load when user has session)
 * so the "Choose avatar" grid displays without delay.
 */
export default function AvatarPreloader() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Prefetch by URI if available (react-native-web may expose uri on the asset)
      const uris = Object.values(AVATAR_SOURCES)
        .map((src) => (typeof src === 'object' && src?.uri ? src.uri : null))
        .filter(Boolean);
      uris.forEach((uri) => {
        if (Image.prefetch) {
          Image.prefetch(uri).catch(() => {});
        }
      });
    }
  }, []);

  return (
    <View style={[styles.hidden, { pointerEvents: 'none' }]} accessibilityElementsHidden>
      {Object.entries(AVATAR_SOURCES).map(([key, source]) => (
        <Image key={key} source={source} style={styles.hiddenImage} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenImage: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});

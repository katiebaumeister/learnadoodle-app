import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Platform, Easing, View } from 'react-native';

// Lottie support - handles both native and web
let LottieView = null;
if (Platform.OS === 'web') {
  try {
    // On web, lottie-react-native uses @lottiefiles/dotlottie-react
    LottieView = require('lottie-react-native').default;
  } catch (e) {
    console.warn('Lottie not available on web:', e.message);
  }
} else {
  try {
    // On native platforms
    LottieView = require('lottie-react-native').default;
  } catch (e) {
    console.warn('Lottie not available on native:', e.message);
  }
}

/**
 * AnimatedIcon - An animated version of your app icon
 * Supports both Lottie JSON animations and React Native Animated API
 * Can combine both for layered animations
 * 
 * @param {string|object} source - Image source (require) or Lottie JSON source
 * @param {string|object} lottieSource - Optional Lottie JSON animation (can be used with or without image source)
 * @param {number} size - Size of the icon
 * @param {string} animationType - React Native animation type: 'pulse', 'rotate', 'bounce', 'float', 'none'
 * @param {number} duration - Duration for React Native animations
 * @param {boolean} loop - Whether to loop Lottie animation (default: true)
 * @param {boolean} autoPlay - Whether to auto-play Lottie animation (default: true)
 * @param {boolean} combineAnimations - If true, applies React Native animation to Lottie container
 */
export default function AnimatedIcon({
  source,
  lottieSource,
  size = 64,
  animationType = 'pulse', // 'pulse', 'rotate', 'bounce', 'float', 'none'
  duration = 2000,
  loop = true,
  autoPlay = true,
  combineAnimations = false,
  style,
  ...props
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const rotationValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animationType === 'none') return;

    let animation;

    switch (animationType) {
      case 'pulse':
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(animatedValue, {
              toValue: 1,
              duration: duration / 2,
              useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(animatedValue, {
              toValue: 0,
              duration: duration / 2,
              useNativeDriver: Platform.OS !== 'web',
            }),
          ])
        );
        break;

      case 'rotate':
        animation = Animated.loop(
          Animated.timing(rotationValue, {
            toValue: 1,
            duration,
            useNativeDriver: Platform.OS !== 'web',
          })
        );
        break;

      case 'bounce':
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(animatedValue, {
              toValue: 1,
              duration: duration / 2,
              useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(animatedValue, {
              toValue: 0,
              duration: duration / 2,
              useNativeDriver: Platform.OS !== 'web',
            }),
          ])
        );
        break;

      case 'float':
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(animatedValue, {
              toValue: 1,
              duration: duration / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(animatedValue, {
              toValue: 0,
              duration: duration / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: Platform.OS !== 'web',
            }),
          ])
        );
        break;

      default:
        return;
    }

    animation.start();

    return () => {
      animation.stop();
    };
  }, [animationType, duration, animatedValue, rotationValue]);

  // Interpolate values based on animation type
  const getAnimatedStyle = () => {
    switch (animationType) {
      case 'pulse':
        const scale = animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.1],
        });
        return { transform: [{ scale }] };

      case 'rotate':
        const rotate = rotationValue.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });
        return { transform: [{ rotate }] };

      case 'bounce':
        const translateY = animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -10],
        });
        return { transform: [{ translateY }] };

      case 'float':
        const floatY = animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        });
        return { transform: [{ translateY: floatY }] };

      default:
        return {};
    }
  };

  // Determine if we're using Lottie
  const isLottie = !!lottieSource && LottieView;
  const hasImage = !!source && !isLottie;
  
  // Apply React Native animation style (if combineAnimations is true or if using image)
  const animatedStyle = (combineAnimations || hasImage) ? getAnimatedStyle() : {};

  // Fallback: if Lottie is requested but not available, use image source if provided
  const shouldUseLottie = isLottie && LottieView;
  const shouldUseImage = hasImage || (lottieSource && !LottieView && source);

  return (
    <Animated.View style={[animatedStyle, { width: size, height: size }, style]}>
      {shouldUseLottie ? (
        <LottieView
          source={lottieSource}
          autoPlay={autoPlay}
          loop={loop}
          style={{ width: size, height: size }}
          {...props}
        />
      ) : shouldUseImage ? (
        <Image
          source={source}
          style={[styles.icon, { width: size, height: size }]}
          resizeMode="contain"
          {...props}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icon: {
    ...Platform.select({
      web: {
        userSelect: 'none',
        pointerEvents: 'none',
      },
    }),
  },
});

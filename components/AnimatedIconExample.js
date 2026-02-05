import React from 'react';
import { View, StyleSheet } from 'react-native';
import AnimatedIcon from './AnimatedIcon';

/**
 * Example usage of AnimatedIcon with different configurations
 * This demonstrates how to use both Lottie JSON and React Native Animated together
 */
export default function AnimatedIconExample() {
  return (
    <View style={styles.container}>
      {/* Option 1: React Native Animated only (current usage) */}
      <AnimatedIcon
        source={require('../assets/icon.png')}
        size={64}
        animationType="pulse"
        duration={2000}
      />

      {/* Option 2: Lottie JSON only */}
      <AnimatedIcon
        lottieSource={require('../assets/icon-animation.json')} // Your Lottie JSON file
        size={64}
        loop={true}
        autoPlay={true}
      />

      {/* Option 3: Combine both - Lottie animation with React Native pulse effect */}
      <AnimatedIcon
        lottieSource={require('../assets/icon-animation.json')}
        size={64}
        animationType="pulse"
        duration={2000}
        combineAnimations={true}
        loop={true}
        autoPlay={true}
      />

      {/* Option 4: Lottie with React Native rotation wrapper */}
      <AnimatedIcon
        lottieSource={require('../assets/icon-animation.json')}
        size={64}
        animationType="rotate"
        duration={3000}
        combineAnimations={true}
        loop={true}
        autoPlay={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 20,
    padding: 20,
  },
});

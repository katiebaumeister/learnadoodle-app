import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function StableImage({
  source,
  isLoaded = true,
  onLoad,
  onError,
  resizeMode = 'contain',
  shellStyle,
  imageStyle,
  placeholderStyle,
  fadeDuration = 0,
}) {
  return (
    <View style={[styles.shell, shellStyle]}>
      {!isLoaded && <View style={[styles.placeholder, placeholderStyle]} />}
      <Image
        source={source}
        style={[styles.image, imageStyle]}
        resizeMode={resizeMode}
        onLoad={onLoad}
        onError={onError}
        fadeDuration={fadeDuration}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
});

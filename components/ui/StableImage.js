import React from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';

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
  webLoading = 'auto',
  webFetchPriority = 'auto',
  webDecoding = 'auto',
}) {
  const imageStyles = [styles.image, imageStyle];
  const resolvedUri =
    Platform.OS === 'web'
      ? (() => {
          if (!source) return null;
          if (typeof source === 'string') return source;
          if (typeof source === 'object' && typeof source.uri === 'string') return source.uri;
          if (typeof source === 'number' && typeof Image.resolveAssetSource === 'function') {
            return Image.resolveAssetSource(source)?.uri || null;
          }
          return null;
        })()
      : null;

  if (Platform.OS === 'web' && resolvedUri) {
    const flattenedStyle = StyleSheet.flatten(imageStyles) || {};
    const objectFit =
      resizeMode === 'cover' ? 'cover' : resizeMode === 'stretch' ? 'fill' : 'contain';

    return (
      <View style={[styles.shell, shellStyle]}>
        {!isLoaded && <View style={[styles.placeholder, placeholderStyle]} />}
        <img
          src={resolvedUri}
          alt=""
          style={{ ...flattenedStyle, objectFit }}
          loading={webLoading}
          fetchPriority={webFetchPriority}
          decoding={webDecoding}
          onLoad={onLoad}
          onError={onError}
        />
      </View>
    );
  }

  return (
    <View style={[styles.shell, shellStyle]}>
      {!isLoaded && <View style={[styles.placeholder, placeholderStyle]} />}
      <Image
        source={source}
        style={imageStyles}
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

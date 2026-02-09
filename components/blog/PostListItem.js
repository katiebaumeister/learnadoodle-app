import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import PostMetaRow from './PostMetaRow';

export default function PostListItem({ post, onPress }) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.dek}>{post.dek}</Text>
        <PostMetaRow post={post} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      ':hover': {
        backgroundColor: '#f9fafb',
      },
    }),
  },
  content: {
    maxWidth: 720,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
    lineHeight: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dek: {
    fontSize: 18,
    lineHeight: 28,
    color: '#475569',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

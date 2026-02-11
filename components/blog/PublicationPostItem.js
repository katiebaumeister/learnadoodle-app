import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import PostMetaRow from './PostMetaRow';

export default function PublicationPostItem({ post, onPress, showDivider = true }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <>
      <TouchableOpacity
        style={styles.postItem}
        onPress={onPress}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Text style={styles.postTitle}>{post.title}</Text>
        <Text style={styles.postDek}>{post.dek}</Text>
        <PostMetaRow post={post} />
        <View style={styles.readLink}>
          <Text style={styles.readLinkText}>Read essay →</Text>
        </View>
      </TouchableOpacity>
      {showDivider && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  postItem: {
    paddingVertical: 24,
  },
  postTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
    lineHeight: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  postDek: {
    fontSize: 18,
    fontWeight: '400',
    color: '#475569',
    marginBottom: 16,
    lineHeight: 28,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  readLink: {
    marginTop: 16,
  },
  readLinkText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#60a5fa',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
});

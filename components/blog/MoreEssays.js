import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import PostListItem from './PostListItem';

export default function MoreEssays({ posts, onPostPress }) {
  if (!posts || posts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>More essays</Text>
      <View style={styles.list}>
        {posts.map((post) => (
          <PostListItem
            key={post.slug}
            post={post}
            onPress={() => onPostPress(post.slug)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 64,
    paddingTop: 48,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    gap: 0,
  },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import TagPill from './TagPill';

export default function PostMetaRow({ post }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.date}>{formatDate(post.date)}</Text>
      <Text style={styles.separator}>·</Text>
      <Text style={styles.readingTime}>{post.readingTime}</Text>
      {post.tags && post.tags.length > 0 && (
        <>
          <Text style={styles.separator}>·</Text>
          <View style={styles.tags}>
            {post.tags.map((tag, index) => (
              <TagPill key={index} tag={tag} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  date: {
    fontSize: 14,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  separator: {
    fontSize: 14,
    color: '#cbd5e1',
    marginHorizontal: 4,
  },
  readingTime: {
    fontSize: 14,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
});

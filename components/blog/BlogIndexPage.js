import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import BlogShell from './BlogShell';
import BlogCard from './BlogCard';
import { getRecentPosts, getPostsByTag, getFeaturedPost } from '../../lib/blog';
import { Image } from 'react-native';

export default function BlogIndexPage({ onNavigateToLogin, onNavigateToSignUp, selectedTag = null }) {
  const [recentPosts, setRecentPosts] = useState([]);
  const [featuredPost, setFeaturedPost] = useState(null);

  useEffect(() => {
    try {
      let recent;
      let featured = null;
      if (selectedTag) {
        recent = getPostsByTag(selectedTag);
        setFeaturedPost(null);
      } else {
        featured = getFeaturedPost();
        setFeaturedPost(featured);
        recent = getRecentPosts(12, featured?.slug);
      }
      // Ensure we have an array
      if (Array.isArray(recent)) {
        setRecentPosts(recent);
      } else {
        setRecentPosts([]);
      }
    } catch (error) {
      console.error('Error loading blog posts:', error);
      setRecentPosts([]);
    }
  }, [selectedTag]);

  const handlePostPress = (slug) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/blog/${slug}`;
    }
  };


  return (
    <BlogShell onNavigateToLogin={onNavigateToLogin} onNavigateToSignUp={onNavigateToSignUp}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Featured Post */}
        {featuredPost && !selectedTag && (
          <TouchableOpacity
            style={styles.featuredSection}
            onPress={() => handlePostPress(featuredPost.slug)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.featuredImageContainer}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.featuredImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTitle}>{featuredPost.title}</Text>
              <Text style={styles.featuredDek}>{featuredPost.dek}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Section Title */}
        <Text style={styles.sectionTitle}>
          {selectedTag ? `Essays tagged "${selectedTag}"` : 'Recent essays'}
        </Text>

        {/* Blog Cards Grid */}
        {recentPosts.length > 0 ? (
          <View style={styles.cardsGrid}>
            {recentPosts.map((post) => (
              <BlogCard
                key={post.slug}
                post={post}
                onPress={() => handlePostPress(post.slug)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Loading posts...</Text>
          </View>
        )}

        {/* All Posts Button */}
        {!selectedTag && (
          <View style={styles.allPostsButtonContainer}>
            <TouchableOpacity
              style={styles.allPostsButton}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.href = '/blog';
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.allPostsButtonText}>ALL POSTS</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </BlogShell>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      height: '100%',
      overflow: 'auto',
    }),
  },
  contentContainer: {
    paddingBottom: 0,
    paddingVertical: 48,
    flexGrow: 1,
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      alignItems: 'stretch',
      margin: 0,
    }),
  },
  featuredSection: {
    width: '100%',
    marginBottom: 64,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  featuredImageContainer: {
    width: '100%',
    ...(Platform.OS === 'web' ? {
      height: 500,
      aspectRatio: '16/9',
    } : {
      height: 400,
    }),
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 48,
  },
  featuredImage: {
    width: '60%',
    height: '60%',
  },
  featuredContent: {
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
    alignItems: 'center',
  },
  featuredTitle: {
    fontSize: 48,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 56,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuredDek: {
    fontSize: 24,
    fontWeight: '400',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 34,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 40,
    } : {
      justifyContent: 'space-between',
      paddingHorizontal: 24,
    }),
    gap: 24,
  },
  allPostsButtonContainer: {
    marginTop: 48,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  allPostsButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingVertical: 12,
    paddingHorizontal: 32,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease, border-color 0.2s ease',
    }),
  },
  allPostsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60a5fa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  emptyStateText: {
    fontSize: 16,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

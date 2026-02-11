import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  Image,
} from 'react-native';
import BlogShell from './BlogShell';
import PostMetaRowSimple from './PostMetaRowSimple';
import BlogFooter from './BlogFooter';
import { getFeaturedPost, getRecentPosts } from '../../lib/blog';

// Helper function to get image source based on filename
function getImageSource(imageName) {
  const imageMap = {
    'googlecalblog.png': require('../../assets/googlecalblog.png'),
    'togetherblog.png': require('../../assets/togetherblog.png'),
    'pomodoroblog.png': require('../../assets/pomodoroblog.png'),
    'famblog.png': require('../../assets/famblog.png'),
  };
  return imageMap[imageName] || require('../../assets/googlecalblog.png');
}

// Helper function to format date as "FEB 10" style
function formatCardDate(dateString) {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = date.getDate();
  return `${month} ${day}`;
}

export default function BlogIndexPage({ onNavigateToLogin, onNavigateToSignUp }) {
  const [featuredPost, setFeaturedPost] = useState(null);
  const [mostRecent, setMostRecent] = useState([]);

  useEffect(() => {
    const featured = getFeaturedPost();
    setFeaturedPost(featured);
    
    // Get next 3 posts after featured
    const recent = getRecentPosts(4, featured?.slug);
    setMostRecent(recent.slice(0, 3));
  }, []);

  const handlePostPress = (slug) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/blog/${slug}`;
    }
  };

  return (
    <BlogShell onNavigateToLogin={onNavigateToLogin} onNavigateToSignUp={onNavigateToSignUp}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Featured Post */}
        {featuredPost && (
          <View style={styles.featuredSection}>
            <TouchableOpacity
              onPress={() => handlePostPress(featuredPost.slug)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.featuredContent}>
                <View style={styles.featuredText}>
                  <Text style={styles.featuredTitle}>{featuredPost.title}</Text>
                  <Text style={styles.featuredDek}>{featuredPost.dek}</Text>
                  <View style={styles.featuredMeta}>
                    <PostMetaRowSimple post={featuredPost} />
                  </View>
                  <View style={styles.readLink}>
                    <Text style={styles.readLinkText}>Read more →</Text>
                  </View>
                </View>
                {featuredPost.image && (
                  <View style={styles.featuredImageContainer}>
                    <Image 
                      source={getImageSource(featuredPost.image)} 
                      style={styles.featuredImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Most Recent */}
        {mostRecent.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MOST RECENT POSTS</Text>
            <View style={styles.recentCardsContainer}>
              {mostRecent.map((post, index) => (
                <TouchableOpacity
                  key={post.slug}
                  style={styles.recentCard}
                  onPress={() => handlePostPress(post.slug)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  {post.image && (
                    <View style={styles.recentCardImageContainer}>
                      <Image 
                        source={getImageSource(post.image)} 
                        style={styles.recentCardImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                  <View style={styles.recentCardContent}>
                    <Text style={styles.recentCardDate}>
                      {formatCardDate(post.date)}
                    </Text>
                    <Text style={styles.recentCardTitle}>{post.title}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.viewAllContainer}>
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = '/blog/all';
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.viewAllText}>View all posts</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Footer as part of scrollable content */}
        <BlogFooter />
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
      maxWidth: 1200,
      marginHorizontal: 'auto',
      alignItems: 'stretch',
    }),
  },
  headingBlock: {
    marginBottom: 64,
    marginTop: 48,
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  mainHeading: {
    fontSize: 56,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 48,
    marginBottom: 48,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subHeading: {
    fontSize: 20,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 30,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuredSection: {
    marginTop: 72,
    marginBottom: 80,
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  featuredContent: {
    ...(Platform.OS === 'web' ? {
      flexDirection: 'row',
      alignItems: 'flex-start',
      alignContent: 'flex-start',
      gap: 48,
    } : {
      flexDirection: 'column',
    }),
  },
  featuredText: {
    ...(Platform.OS === 'web' ? {
      flex: 1,
      minWidth: 0,
      marginTop: 0,
    } : {
      width: '100%',
    }),
  },
  featuredImageContainer: {
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      width: 560,
      height: 420,
      flexShrink: 0,
      marginTop: 0,
      paddingTop: 0,
      padding: 0,
    } : {
      width: '100%',
      height: 200,
      marginTop: 24,
    }),
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    marginTop: 0,
    paddingTop: 0,
    ...(Platform.OS === 'web' && {
      objectFit: 'contain',
    }),
  },
  featuredTitle: {
    fontSize: 40,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 0,
    marginBottom: 16,
    lineHeight: 48,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuredDek: {
    fontSize: 22,
    fontWeight: '400',
    color: '#475569',
    marginBottom: 20,
    lineHeight: 32,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuredMeta: {
    marginBottom: 24,
  },
  readLink: {
    marginTop: 8,
  },
  readLinkText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#60a5fa',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  section: {
    marginBottom: 80,
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  sectionHeader: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 32,
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionSubtext: {
    fontSize: 18,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 28,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  picksGrid: {
    ...(Platform.OS === 'web' ? {
      flexDirection: 'row',
      gap: 48,
    } : {
      flexDirection: 'column',
    }),
  },
  pickItem: {
    ...(Platform.OS === 'web' ? {
      flex: 1,
    } : {
      width: '100%',
      marginBottom: 32,
    }),
  },
  pickTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
    lineHeight: 30,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickDek: {
    fontSize: 16,
    fontWeight: '400',
    color: '#475569',
    marginBottom: 16,
    lineHeight: 24,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickMeta: {
    marginTop: 8,
  },
  pickDate: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickTags: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748b',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickDivider: {
    ...(Platform.OS === 'web' ? {
      display: 'none',
    } : {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginVertical: 24,
    }),
  },
  basicsList: {
    ...(Platform.OS === 'web' ? {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 24,
    } : {
      flexDirection: 'column',
    }),
  },
  basicsItem: {
    ...(Platform.OS === 'web' ? {
      width: 'calc(50% - 12px)',
    } : {
      width: '100%',
      marginBottom: 16,
    }),
    paddingVertical: 12,
  },
  basicsTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#0f172a',
    lineHeight: 26,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  recentCardsContainer: {
    ...(Platform.OS === 'web' ? {
      flexDirection: 'row',
      gap: 24,
    } : {
      flexDirection: 'column',
      gap: 24,
    }),
  },
  recentCard: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      flex: 1,
      minHeight: 400,
    } : {
      width: '100%',
    }),
  },
  recentCardImageContainer: {
    width: '100%',
    height: 200,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCardImage: {
    width: '100%',
    height: '100%',
    maxWidth: 380,
  },
  recentCardContent: {
    flex: 1,
  },
  recentCardDate: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  recentCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 26,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewAllContainer: {
    alignItems: 'center',
  },
  viewAllButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease, border-color 0.2s ease',
    }),
  },
  viewAllText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0f172a',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

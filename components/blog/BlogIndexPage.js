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
import BlogSearchBar from './BlogSearchBar';
import PublicationPostItem from './PublicationPostItem';
import PostMetaRowSimple from './PostMetaRowSimple';
import BlogFooter from './BlogFooter';
import { getFeaturedPost, getRecentPosts, getEditorsPicks, getBasicsPosts } from '../../lib/blog';

export default function BlogIndexPage({ onNavigateToLogin, onNavigateToSignUp }) {
  const [featuredPost, setFeaturedPost] = useState(null);
  const [editorsPicks, setEditorsPicks] = useState([]);
  const [basicsPosts, setBasicsPosts] = useState([]);
  const [mostRecent, setMostRecent] = useState([]);

  useEffect(() => {
    const featured = getFeaturedPost();
    setFeaturedPost(featured);
    
    const picks = getEditorsPicks();
    setEditorsPicks(picks);
    
    const basics = getBasicsPosts();
    setBasicsPosts(basics);
    
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
        {/* Search Bar */}
        <BlogSearchBar />

        {/* Main Heading */}
        <View style={styles.headingBlock}>
          <Text style={styles.mainHeading}>Blog</Text>
          <Text style={styles.subHeading}>
            Thoughtful essays on learning, family rhythms, and how kids grow.
          </Text>
        </View>

        {/* Featured Post */}
        {featuredPost && (
          <View style={styles.featuredSection}>
            <TouchableOpacity
              onPress={() => handlePostPress(featuredPost.slug)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.featuredTitle}>{featuredPost.title}</Text>
              <Text style={styles.featuredDek}>{featuredPost.dek}</Text>
              <View style={styles.featuredMeta}>
                <PostMetaRowSimple post={featuredPost} />
              </View>
              <View style={styles.readLink}>
                <Text style={styles.readLinkText}>Read essay →</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Editor's Picks */}
        {editorsPicks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Editor's picks</Text>
              <Text style={styles.sectionSubtext}>
                Three pieces we often recommend to families starting out.
              </Text>
            </View>
            <View style={styles.picksGrid}>
              {editorsPicks.map((post, index) => (
                <View key={post.slug} style={styles.pickItem}>
                  <TouchableOpacity
                    onPress={() => handlePostPress(post.slug)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.pickTitle}>{post.title}</Text>
                    <Text style={styles.pickDek}>{post.dek}</Text>
                    <View style={styles.pickMeta}>
                      <Text style={styles.pickDate}>
                        {new Date(post.date).toLocaleDateString('en-US', { 
                          month: 'long', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </Text>
                      <Text style={styles.pickTags}>
                        {post.tags.join(' · ')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {index < editorsPicks.length - 1 && <View style={styles.pickDivider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Homeschooling Basics */}
        {basicsPosts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Homeschooling basics</Text>
              <Text style={styles.sectionSubtext}>
                Foundational ideas we point families to again and again.
              </Text>
            </View>
            <View style={styles.basicsList}>
              {basicsPosts.map((post) => (
                <TouchableOpacity
                  key={post.slug}
                  style={styles.basicsItem}
                  onPress={() => handlePostPress(post.slug)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.basicsTitle}>{post.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Most Recent */}
        {mostRecent.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Most recent</Text>
            <View style={styles.recentList}>
              {mostRecent.map((post, index) => (
                <PublicationPostItem
                  key={post.slug}
                  post={post}
                  onPress={() => handlePostPress(post.slug)}
                  showDivider={index < mostRecent.length - 1}
                />
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
      maxWidth: '100%',
      alignItems: 'stretch',
      margin: 0,
    }),
  },
  headingBlock: {
    marginBottom: 64,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  mainHeading: {
    fontSize: 56,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subHeading: {
    fontSize: 20,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 30,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuredSection: {
    marginBottom: 80,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  featuredTitle: {
    fontSize: 40,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    lineHeight: 48,
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  section: {
    marginBottom: 80,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  sectionHeader: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionSubtext: {
    fontSize: 18,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 28,
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickTags: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748b',
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  recentList: {
    marginBottom: 48,
  },
  viewAllContainer: {
    alignItems: 'flex-start',
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

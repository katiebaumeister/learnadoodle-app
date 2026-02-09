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
import PublicationPostItem from './PublicationPostItem';
import TagPill from './TagPill';
import BlogFooter from './BlogFooter';
import { getAllPosts, getAllTags, getPostsByTag, searchPosts } from '../../lib/blog';

export default function BlogAllPage({ onNavigateToLogin, onNavigateToSignUp }) {
  const [allPosts, setAllPosts] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setAllPosts(getAllPosts());
      setTags(getAllTags());
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const tag = urlParams.get('tag');
    const query = urlParams.get('q');
    
    if (tag) {
      setSelectedTag(tag);
      setAllPosts(getPostsByTag(tag));
    } else if (query) {
      setSearchQuery(query);
      setAllPosts(searchPosts(query));
    } else {
      setAllPosts(getAllPosts());
    }
    
    setTags(getAllTags());
  }, []);

  const handleTagPress = (tag) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (tag === selectedTag) {
        window.location.href = '/blog/all';
      } else {
        window.location.href = `/blog/all?tag=${encodeURIComponent(tag)}`;
      }
    }
  };

  const handlePostPress = (slug) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/blog/${slug}`;
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      setAllPosts(searchPosts(query));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('q', query);
        window.history.pushState({}, '', url.toString());
      }
    } else {
      setAllPosts(getAllPosts());
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('q');
        window.history.pushState({}, '', url.toString());
      }
    }
  };

  return (
    <BlogShell onNavigateToLogin={onNavigateToLogin} onNavigateToSignUp={onNavigateToSignUp}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tag Filters */}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.slice(0, 10).map(({ tag }) => (
              <TagPill
                key={tag}
                tag={tag}
                isActive={tag === selectedTag}
                onPress={() => handleTagPress(tag)}
              />
            ))}
          </View>
        )}

        {/* Results Header */}
        <View style={styles.resultsHeader}>
          {selectedTag && (
            <Text style={styles.resultsText}>
              {allPosts.length} {allPosts.length === 1 ? 'essay' : 'essays'} tagged "{selectedTag}"
            </Text>
          )}
          {searchQuery && !selectedTag && (
            <Text style={styles.resultsText}>
              {allPosts.length} {allPosts.length === 1 ? 'result' : 'results'} for "{searchQuery}"
            </Text>
          )}
          {!selectedTag && !searchQuery && (
            <Text style={styles.resultsText}>
              All essays ({allPosts.length})
            </Text>
          )}
        </View>

        {/* Posts List */}
        <View style={styles.postsList}>
          {allPosts.map((post, index) => (
            <PublicationPostItem
              key={post.slug}
              post={post}
              onPress={() => handlePostPress(post.slug)}
              showDivider={index < allPosts.length - 1}
            />
          ))}
        </View>

        {allPosts.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchQuery ? 'No results found.' : 'No posts available.'}
            </Text>
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
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 32,
    gap: 12,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  resultsHeader: {
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  resultsText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  postsList: {
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
      maxWidth: 1200,
      marginHorizontal: 'auto',
    } : {
      paddingHorizontal: 24,
    }),
  },
  emptyStateText: {
    fontSize: 18,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

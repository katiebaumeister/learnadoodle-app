import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import BlogShell from './BlogShell';
import PostMetaRow from './PostMetaRow';
import MoreEssays from './MoreEssays';
import BlogFooter from './BlogFooter';
import { getPostBySlug, getRelatedPosts } from '../../lib/blog';

// Simple markdown-like parser for basic formatting
function parseContent(content) {
  const lines = content.split('\n');
  const elements = [];
  let currentParagraph = [];
  let inList = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('# ')) {
      // H1
      if (currentParagraph.length > 0) {
        elements.push({ type: 'p', content: currentParagraph.join(' ') });
        currentParagraph = [];
      }
      elements.push({ type: 'h1', content: trimmed.substring(2) });
    } else if (trimmed.startsWith('## ')) {
      // H2
      if (currentParagraph.length > 0) {
        elements.push({ type: 'p', content: currentParagraph.join(' ') });
        currentParagraph = [];
      }
      elements.push({ type: 'h2', content: trimmed.substring(3) });
    } else if (trimmed.startsWith('### ')) {
      // H3
      if (currentParagraph.length > 0) {
        elements.push({ type: 'p', content: currentParagraph.join(' ') });
        currentParagraph = [];
      }
      elements.push({ type: 'h3', content: trimmed.substring(4) });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      // List item
      if (!inList) {
        if (currentParagraph.length > 0) {
          elements.push({ type: 'p', content: currentParagraph.join(' ') });
          currentParagraph = [];
        }
        elements.push({ type: 'ul', items: [] });
        inList = true;
      }
      const lastUl = elements[elements.length - 1];
      if (lastUl.type === 'ul') {
        lastUl.items.push(trimmed.substring(2));
      }
    } else if (trimmed === '') {
      // Empty line
      if (inList) {
        inList = false;
      }
      if (currentParagraph.length > 0) {
        elements.push({ type: 'p', content: currentParagraph.join(' ') });
        currentParagraph = [];
      }
    } else {
      // Regular paragraph text
      if (inList) {
        inList = false;
      }
      currentParagraph.push(trimmed);
    }
  });

  if (currentParagraph.length > 0) {
    elements.push({ type: 'p', content: currentParagraph.join(' ') });
  }

  return elements;
}

function ContentRenderer({ elements }) {
  return (
    <View style={styles.content}>
      {elements.map((element, index) => {
        switch (element.type) {
          case 'h1':
            return (
              <Text key={index} style={styles.h1}>
                {element.content}
              </Text>
            );
          case 'h2':
            return (
              <Text key={index} style={styles.h2}>
                {element.content}
              </Text>
            );
          case 'h3':
            return (
              <Text key={index} style={styles.h3}>
                {element.content}
              </Text>
            );
          case 'p':
            return (
              <Text key={index} style={styles.paragraph}>
                {element.content}
              </Text>
            );
          case 'ul':
            return (
              <View key={index} style={styles.list}>
                {element.items.map((item, itemIndex) => (
                  <View key={itemIndex} style={styles.listItem}>
                    <Text style={styles.listBullet}>•</Text>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

export default function BlogPostPage({ slug, onNavigateToLogin, onNavigateToSignUp }) {
  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [contentElements, setContentElements] = useState([]);

  useEffect(() => {
    const postData = getPostBySlug(slug);
    if (postData) {
      setPost(postData);
      const related = getRelatedPosts(postData.meta, 3);
      setRelatedPosts(related);
      const elements = parseContent(postData.content);
      setContentElements(elements);
    }
  }, [slug]);

  if (!post) {
    return (
      <BlogShell onNavigateToLogin={onNavigateToLogin} onNavigateToSignUp={onNavigateToSignUp}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundText}>Post not found</Text>
        </View>
      </BlogShell>
    );
  }

  const handleRelatedPostPress = (relatedSlug) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/blog/${relatedSlug}`;
    }
  };

  return (
    <BlogShell onNavigateToLogin={onNavigateToLogin} onNavigateToSignUp={onNavigateToSignUp}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Title and Meta */}
        <View style={styles.header}>
          <Text style={styles.title}>{post.meta.title}</Text>
          <Text style={styles.dek}>{post.meta.dek}</Text>
          <PostMetaRow post={post.meta} />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Content */}
        <ContentRenderer elements={contentElements} />

        {/* Divider */}
        <View style={styles.divider} />

        {/* More Essays */}
        <MoreEssays
          posts={relatedPosts}
          onPostPress={handleRelatedPostPress}
        />

        {/* Quiet CTA */}
        <View style={styles.cta}>
          <Text style={styles.ctaText}>
            Ready to organize your family's learning?{' '}
            <Text
              style={styles.ctaLink}
              onPress={onNavigateToSignUp}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              Get started
            </Text>
            .
          </Text>
        </View>

        {/* Footer as part of scrollable content */}
        <BlogFooter />
      </ScrollView>
    </BlogShell>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 0,
    paddingVertical: 48,
    flexGrow: 1,
    ...(Platform.OS === 'web' && {
      width: '100%',
    }),
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  notFoundText: {
    fontSize: 18,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    lineHeight: 56,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dek: {
    fontSize: 20,
    lineHeight: 30,
    color: '#475569',
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 48,
    ...(Platform.OS === 'web' && {
      marginHorizontal: 40,
    } : {
      marginHorizontal: 24,
    }),
  },
  content: {
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 40,
    } : {
      paddingHorizontal: 24,
    }),
  },
  h1: {
    fontSize: 36,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 48,
    marginBottom: 16,
    lineHeight: 44,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  h2: {
    fontSize: 28,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 40,
    marginBottom: 16,
    lineHeight: 36,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  h3: {
    fontSize: 22,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 32,
    marginBottom: 12,
    lineHeight: 30,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  paragraph: {
    fontSize: 18,
    lineHeight: 30,
    color: '#1e293b',
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    marginTop: 8,
    marginBottom: 24,
    paddingLeft: 0,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingLeft: 0,
  },
  listBullet: {
    fontSize: 18,
    color: '#64748b',
    marginRight: 12,
    lineHeight: 30,
  },
  listText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 30,
    color: '#1e293b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cta: {
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
  ctaText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaLink: {
    color: '#60a5fa',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
});

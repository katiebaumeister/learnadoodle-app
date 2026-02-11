import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Mail, MessageSquare, Facebook, Twitter } from 'lucide-react';
import BlogShell from './BlogShell';
import PostMetaRow from './PostMetaRow';
import MoreEssays from './MoreEssays';
import BlogFooter from './BlogFooter';
import TagPill from './TagPill';
import { getPostBySlug, getRelatedPosts } from '../../lib/blog';

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
      // Filter out the duplicate title (first h1) and first paragraph if they match the title/dek
      const filteredElements = elements.filter((element, index) => {
        if (index === 0 && element.type === 'h1' && element.content === postData.meta.title) {
          return false;
        }
        if (index === 1 && element.type === 'p' && element.content.includes('can now connect with Google Calendar')) {
          return false;
        }
        return true;
      });
      setContentElements(filteredElements);
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

  const getShareUrl = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.location.href;
    }
    return '';
  };

  const getShareText = () => {
    return post ? `${post.meta.title} - ${post.meta.dek}` : '';
  };

  const handleShareEmail = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = getShareUrl();
      const text = getShareText();
      window.location.href = `mailto:?subject=${encodeURIComponent(post.meta.title)}&body=${encodeURIComponent(text + '\n\n' + url)}`;
    }
  };

  const handleShareText = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = getShareUrl();
      const text = getShareText();
      window.location.href = `sms:?body=${encodeURIComponent(text + ' ' + url)}`;
    }
  };

  const handleShareFacebook = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = encodeURIComponent(getShareUrl());
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    }
  };

  const handleShareX = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = encodeURIComponent(getShareUrl());
      const text = encodeURIComponent(getShareText());
      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
    }
  };

  return (
    <BlogShell onNavigateToLogin={onNavigateToLogin} onNavigateToSignUp={onNavigateToSignUp}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Title and Meta */}
        <View style={styles.header}>
          <Text style={styles.title}>{post.meta.title}</Text>
          <Text style={styles.dek}>{post.meta.dek}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaDate}>
              {new Date(post.meta.date).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
            <Text style={styles.metaSeparator}>·</Text>
            <Text style={styles.metaReadingTime}>{post.meta.readingTime}</Text>
          </View>
        </View>

        {/* Image */}
        {post.meta.image && (
          <View style={styles.postImageContainer}>
            <Image 
              source={getImageSource(post.meta.image)} 
              style={styles.postImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Content */}
        <ContentRenderer elements={contentElements} />

        {/* Tags Section */}
        {post.meta.tags && post.meta.tags.length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.tagsHeading}>TAGS</Text>
            <View style={styles.tagsContainer}>
              {post.meta.tags.map((tag, index) => (
                <TagPill key={index} tag={tag} />
              ))}
            </View>
          </View>
        )}

        {/* Share Section */}
        <View style={styles.shareSection}>
          <Text style={styles.shareHeading}>SHARE</Text>
          <View style={styles.shareButtons}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareText}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <MessageSquare size={18} color="#475569" />
              <Text style={styles.shareButtonText}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareEmail}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Mail size={18} color="#475569" />
              <Text style={styles.shareButtonText}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareFacebook}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Facebook size={18} color="#475569" />
              <Text style={styles.shareButtonText}>Facebook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareX}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Twitter size={18} color="#475569" />
              <Text style={styles.shareButtonText}>X</Text>
            </TouchableOpacity>
          </View>
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
      maxWidth: 1100,
      marginHorizontal: 'auto',
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
    marginBottom: 0,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 240,
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
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dek: {
    fontSize: 20,
    lineHeight: 30,
    color: '#475569',
    marginBottom: 24,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  metaDate: {
    fontSize: 14,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metaSeparator: {
    fontSize: 14,
    color: '#cbd5e1',
    marginHorizontal: 4,
  },
  metaReadingTime: {
    fontSize: 14,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 48,
    ...(Platform.OS === 'web' ? {
      marginHorizontal: 240,
    } : {
      marginHorizontal: 24,
    }),
  },
  postImageContainer: {
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 240,
    } : {
      paddingHorizontal: 24,
    }),
  },
  postImage: {
    width: '100%',
    ...(Platform.OS === 'web' ? {
      height: 500,
      objectFit: 'contain',
    } : {
      height: 250,
    }),
  },
  content: {
    marginTop: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 240,
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
    marginTop: 0,
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
    marginBottom: 32,
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
  tagsSection: {
    marginTop: 32,
    marginBottom: 32,
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 240,
    } : {
      paddingHorizontal: 24,
    }),
  },
  tagsHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  shareSection: {
    marginTop: 32,
    marginBottom: 64,
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 240,
    } : {
      paddingHorizontal: 24,
    }),
  },
  shareHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  shareButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cta: {
    marginTop: 64,
    paddingTop: 48,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    ...(Platform.OS === 'web' ? {
      paddingHorizontal: 240,
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

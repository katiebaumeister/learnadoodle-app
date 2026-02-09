import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';

export default function BlogCard({ post, onPress }) {
  const [isHovered, setIsHovered] = useState(false);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).toUpperCase();
  };

  // Get author name based on post slug or use default
  const getAuthor = (slug) => {
    // You can customize authors per post if needed
    return 'LEARNADOODLE TEAM';
  };

  const cardStyle = [
    styles.card,
    isHovered && Platform.OS === 'web' && {
      transform: [{ translateY: -4 }],
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
    },
  ];

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={onPress}
      onMouseEnter={() => Platform.OS === 'web' && setIsHovered(true)}
      onMouseLeave={() => Platform.OS === 'web' && setIsHovered(false)}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      {/* Card Graphic */}
      <View style={styles.graphicContainer}>
        <View style={[styles.graphic, { backgroundColor: getCardColor(post.slug) }]}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.graphicImage}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Card Content */}
      <View style={styles.cardContent}>
        <Text style={styles.date}>{formatDate(post.date)}</Text>
        <Text style={styles.author}>{getAuthor(post.slug)}</Text>
        <Text style={styles.title}>{post.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// Get card color based on slug for variety
function getCardColor(slug) {
  const colors = ['#fce7f3', '#ede9fe', '#e0e7ff', '#fef3c7', '#dbeafe'];
  const index = slug.length % colors.length;
  return colors[index];
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginBottom: 24,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      cursor: 'pointer',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      width: 350,
      flexShrink: 0,
      position: 'relative',
      zIndex: 1,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
      width: '48%',
      marginBottom: 16,
    }),
  },
  graphicContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  graphic: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  graphicImage: {
    width: '60%',
    height: '60%',
  },
  cardContent: {
    padding: 20,
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  author: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 26,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

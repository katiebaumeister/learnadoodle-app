import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { FileText } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const defaultArticles = [
  {
    id: '1',
    title: 'Teach note-taking with emojis',
    readTime: '3–5 min read',
    url: '#',
  },
  {
    id: '2',
    title: '5 ways to keep Algebra fun',
    readTime: '4 min read',
    url: '#',
  },
];

export default function RecommendedReads({ articles = defaultArticles }) {
  const handleArticlePress = async (url) => {
    if (url && url !== '#') {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FileText size={16} color={colors.text} />
          <Text style={styles.title}>Recommended reads</Text>
        </View>
        <Text style={styles.subtitle}>Because Max is in Algebra I</Text>
      </View>

      <View style={styles.articlesGrid}>
        {articles.map((article) => (
          <TouchableOpacity
            key={article.id}
            style={styles.articleCard}
            onPress={() => handleArticlePress(article.url)}
          >
            <Text style={styles.articleTitle}>{article.title}</Text>
            <Text style={styles.articleReadTime}>{article.readTime}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(228, 245, 231, 0.25)', // greenSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  articlesGrid: {
    gap: 8,
  },
  articleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    padding: 12,
    backgroundColor: colors.bgSubtle,
  },
  articleTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  articleReadTime: {
    fontSize: 12,
    color: colors.muted,
  },
});


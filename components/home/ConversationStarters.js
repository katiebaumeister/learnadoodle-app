import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MessageCircle, Sparkles, Heart, BookOpen, TrendingUp } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

export default function ConversationStarters({ 
  familyId, 
  childId = null,
  limit = 5 
}) {
  const [starters, setStarters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (familyId) {
      loadStarters();
    }
  }, [familyId, childId]);

  const loadStarters = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (childId) {
        params.append('child_id', childId);
      }
      
      const { data, error } = await apiRequest(
        `/api/conversation/starters?${params.toString()}`,
        { method: 'GET' }
      );
      
      if (error) {
        setStarters([]);
      } else {
        // Backend now returns one per child, so we can use all of them
        setStarters(data || []);
      }
    } catch (err) {
      setStarters([]);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'interest':
        return <Sparkles size={14} color={colors.violetBold} />;
      case 'subject':
        return <BookOpen size={14} color={colors.blueBold} />;
      case 'personal':
        return <Heart size={14} color={colors.pinkBold} />;
      case 'encouragement':
        return <TrendingUp size={14} color={colors.greenBold} />;
      default:
        return <MessageCircle size={14} color={colors.accent} />;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MessageCircle size={16} color={colors.accent} />
            <Text style={styles.title}>Daily conversation starters</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Generating prompts...</Text>
        </View>
      </View>
    );
  }

  if (!starters || starters.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MessageCircle size={16} color={colors.accent} />
          <Text style={styles.title}>Daily conversation starters</Text>
        </View>
      </View>

      <View style={styles.startersList}>
        {starters.map((starter, index) => (
          <View key={`${starter.child_id}-${index}`} style={styles.starterCard}>
            <View style={styles.starterHeader}>
              {getIcon(starter.type)}
              <Text style={styles.childName}>{starter.child_name}</Text>
            </View>
            <Text style={styles.prompt}>{starter.prompt}</Text>
            {starter.context && (
              <Text style={styles.context}>{starter.context}</Text>
            )}
          </View>
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
    padding: 16,
    ...shadows.md,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
  },
  startersList: {
    gap: 12,
  },
  starterCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: colors.radiusMd,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  starterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  childName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  prompt: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  context: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
});


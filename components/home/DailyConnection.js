import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MessageCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

export default function DailyConnection({ 
  familyId, 
  children = [],
  learning = [],
  preloadedStarters = null
}) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  const generateFallbackConnections = useCallback(() => {
    const fallback = children.map((child, index) => {
      const childLearning = learning.filter(l => l.child_id === child.id);
      const subjects = [...new Set(childLearning.map(l => l.subject))];
      const primarySubject = subjects[0] || 'Learning';
      
      const prompts = [
        `Ask ${child.first_name || child.name} about ${primarySubject}. They were learning about it recently.`,
        `Ask ${child.first_name || child.name} about ${primarySubject}. They were learning about it recently.`,
        `Ask ${child.first_name || child.name} about ${primarySubject}. They were learning about it recently.`,
      ];

      return {
        childId: child.id,
        childName: child.first_name || child.name || 'Child',
        prompt: prompts[index % prompts.length],
        detail: `Learning focus: ${primarySubject}`,
        subject: primarySubject,
      };
    });

    setConnections(fallback);
  }, [children, learning]);

  const transformConnections = useCallback((starters) => {
    const transformed = (starters || []).map((starter, index) => {
      // Find child's subjects from learning data
      const childLearning = learning.filter(l => l.child_id === starter.child_id);
      const subjects = [...new Set(childLearning.map(l => l.subject))];
      const primarySubject = subjects[0] || 'Learning';

      return {
        childId: starter.child_id,
        childName: starter.child_name,
        prompt: starter.prompt || `Ask ${starter.child_name} about ${primarySubject}. They were learning about it recently.`,
        detail: `Learning focus: ${primarySubject}`,
        subject: primarySubject,
      };
    });

    // If no data, generate fallback
    if (transformed.length === 0) {
      generateFallbackConnections();
    } else {
      setConnections(transformed);
    }
  }, [children, learning, generateFallbackConnections]);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      const { data, error } = await apiRequest(
        `/api/conversation/starters?${params.toString()}`,
        { method: 'GET' }
      );
      
      if (error) {
        console.error('[DailyConnection] Error loading starters:', error);
        // Generate fallback connections
        generateFallbackConnections();
        return;
      }

      transformConnections(data);
    } catch (err) {
      console.error('[DailyConnection] Error:', err);
      generateFallbackConnections();
    } finally {
      setLoading(false);
    }
  }, [transformConnections, generateFallbackConnections]);

  useEffect(() => {
    // If preloaded starters are provided, use them immediately
    if (preloadedStarters && preloadedStarters.length > 0) {
      transformConnections(preloadedStarters);
      setLoading(false);
      return;
    }
    
    // Otherwise, load from API
    if (familyId && children.length > 0) {
      loadConnections();
    } else {
      setLoading(false);
    }
  }, [familyId, children.length, preloadedStarters, transformConnections, loadConnections]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Daily connection</Text>
        </View>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }

  if (connections.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily connection</Text>
      </View>

      <View style={styles.startersList}>
        {connections.map((connection, index) => (
          <View key={connection.childId} style={styles.starterCard}>
            <View style={styles.cardHeader}>
              <View style={styles.nameContainer}>
                <Text style={styles.childName}>{connection.childName}</Text>
                <Text style={styles.subjectTag}>{connection.subject}</Text>
              </View>
            </View>
            <Text style={styles.prompt}>{connection.prompt}</Text>
            <Text style={styles.detail}>{connection.detail}</Text>
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
    marginTop: 24,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  startersList: {
    gap: 12,
  },
  starterCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: colors.radiusMd,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    marginBottom: 6,
  },
  nameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  childName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b', // slate-800
  },
  subjectTag: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94a3b8', // slate-400
  },
  prompt: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 6,
  },
  detail: {
    fontSize: 12,
    color: colors.muted,
  },
});


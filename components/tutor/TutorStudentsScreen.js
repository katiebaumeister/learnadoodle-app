/**
 * Tutor Students Screen
 * 
 * Lists all assigned children for the tutor.
 * Shows basic info and quick stats.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { User, Clock, Award, TrendingUp, BookOpen } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

export default function TutorStudentsScreen({ onSelectChild }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [childStats, setChildStats] = useState({});

  useEffect(() => {
    if (session && !session.loading && session.accessible_children) {
      loadChildren();
    }
  }, [session]);

  const loadChildren = async () => {
    if (!session.accessible_children || session.accessible_children.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const childIds = session.accessible_children.map(c => c.id);
      
      // Load child details
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name, name, avatar, family_id')
        .in('id', childIds);

      if (childrenError) throw childrenError;

      setChildren(childrenData || []);

      // Load stats for each child
      const stats = {};
      for (const child of childrenData || []) {
        try {
          // Get recent progress stats
          const { data: eventsData } = await supabase
            .from('events')
            .select('id, status')
            .eq('child_id', child.id)
            .gte('start_ts', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

          const completedCount = eventsData?.filter(e => e.status === 'done').length || 0;
          const totalCount = eventsData?.length || 0;

          stats[child.id] = {
            completedThisWeek: completedCount,
            totalThisWeek: totalCount,
          };
        } catch (error) {
          console.error(`[TutorStudentsScreen] Error loading stats for child ${child.id}:`, error);
        }
      }

      setChildStats(stats);
    } catch (error) {
      console.error('[TutorStudentsScreen] Error loading children:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChildName = (child) => {
    return child.first_name || child.name || 'Unknown';
  };

  const getChildColor = (child) => {
    return getChildColorFromAvatar(child.avatar);
  };

  if (session?.loading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading students...</Text>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <User size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>No Students Assigned</Text>
        <Text style={styles.emptyText}>
          You don't have any students assigned yet. Contact the parent to get started.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
    >
      <View style={styles.header}>
        <Text style={styles.title}>My Students</Text>
        <Text style={styles.subtitle}>
          {children.length} {children.length === 1 ? 'student' : 'students'} assigned
        </Text>
      </View>

      <View style={styles.studentsList}>
        {children.map((child) => {
          const childName = getChildName(child);
          const childColor = getChildColor(child);
          const stats = childStats[child.id] || {};

          return (
            <TouchableOpacity
              key={child.id}
              style={styles.studentCard}
              onPress={() => onSelectChild && onSelectChild(child.id)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={[styles.avatar, { backgroundColor: childColor + '20' }]}>
                <User size={24} color={childColor} />
              </View>
              
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{childName}</Text>
                {stats.totalThisWeek > 0 && (
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={styles.statText}>
                        {stats.completedThisWeek}/{stats.totalThisWeek} this week
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.arrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    backgroundColor: colors.card,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentsList: {
    gap: 12,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  arrow: {
    marginLeft: 8,
  },
  arrowText: {
    fontSize: 18,
    color: colors.textSecondary,
  },
});

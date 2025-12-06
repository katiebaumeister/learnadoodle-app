/**
 * Streak Display Component
 * Shows current streak, longest streak, and streak visualization
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Flame, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function StreakDisplay({ childId, familyId, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [gamification, setGamification] = useState(null);

  useEffect(() => {
    loadGamification();
  }, [childId, familyId]);

  const loadGamification = async () => {
    if (!childId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('child_gamification')
        .select('*')
        .eq('child_id', childId)
        .eq('streak_type', 'daily')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading gamification:', error);
      } else {
        setGamification(data);
      }
    } catch (error) {
      console.error('Error loading gamification:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.indigo} />
      </View>
    );
  }

  if (!gamification) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDataText}>Start your streak today!</Text>
      </View>
    );
  }

  const currentStreak = gamification.current_streak || 0;
  const longestStreak = gamification.longest_streak || 0;
  const lastActivity = gamification.last_activity_date;

  // Check if streak is active (last activity was today or yesterday)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const isActive = lastActivity === today || lastActivity === yesterday;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Flame size={16} color={isActive ? colors.orangeBold : colors.textSecondary} />
        <Text style={[styles.compactStreak, !isActive && styles.compactStreakInactive]}>
          {currentStreak} day{currentStreak !== 1 ? 's' : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.streakSection}>
          <Flame size={28} color={isActive ? colors.orangeBold : colors.textSecondary} />
          <View style={styles.streakInfo}>
            <Text style={styles.streakValue}>{currentStreak}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>
            {!isActive && (
              <Text style={styles.streakWarning}>Keep it going!</Text>
            )}
          </View>
        </View>
        {longestStreak > currentStreak && (
          <View style={styles.recordSection}>
            <TrendingUp size={20} color={colors.textSecondary} />
            <View style={styles.recordInfo}>
              <Text style={styles.recordValue}>{longestStreak}</Text>
              <Text style={styles.recordLabel}>Best</Text>
            </View>
          </View>
        )}
      </View>

      {/* Streak Visualization */}
      {currentStreak > 0 && (
        <View style={styles.visualization}>
          {Array.from({ length: Math.min(currentStreak, 7) }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.streakDot,
                index < currentStreak && styles.streakDotActive,
              ]}
            />
          ))}
          {currentStreak > 7 && (
            <Text style={styles.streakMore}>+{currentStreak - 7} more</Text>
          )}
        </View>
      )}

      {/* Motivation Message */}
      {currentStreak > 0 && (
        <Text style={styles.motivationText}>
          {currentStreak === 1 && "Great start! Keep it up!"}
          {currentStreak >= 2 && currentStreak < 5 && "You're building a habit!"}
          {currentStreak >= 5 && currentStreak < 10 && "Amazing consistency!"}
          {currentStreak >= 10 && currentStreak < 30 && "Incredible dedication!"}
          {currentStreak >= 30 && "You're unstoppable!"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  streakSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streakInfo: {
    gap: 2,
  },
  streakValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  streakLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  streakWarning: {
    fontSize: 11,
    color: colors.orangeBold,
    fontStyle: 'italic',
  },
  recordSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordInfo: {
    alignItems: 'flex-end',
    gap: 2,
  },
  recordValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  recordLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  visualization: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  streakDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakDotActive: {
    backgroundColor: colors.orangeBold,
    borderColor: colors.orangeBold,
  },
  streakMore: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  motivationText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  compactStreak: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  compactStreakInactive: {
    color: colors.textSecondary,
  },
  noDataText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});


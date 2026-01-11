import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Flame, TrendingUp, Heart } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getStudentStreak } from '../../lib/apiClient';

/**
 * Student Streak Notification Component
 * Shows streak reinforcement messages to parents when children complete quests consistently
 * Usage: <StudentStreakNotification childId={childId} childName={childName} />
 */
export default function StudentStreakNotification({ childId, childName, onDismiss }) {
  const [data, setData] = useState(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (childId) {
      loadStreakData();
    }
  }, [childId]);

  const loadStreakData = async () => {
    if (!childId) return;
    try {
      const { data: result, error } = await getStudentStreak(childId, 30);
      if (error) throw error;
      
      // Only show notification if there's meaningful streak data
      if (result && (result.current_streak >= 2 || result.recent_completions >= 4)) {
        setData(result);
      } else {
        setVisible(false);
      }
    } catch (error) {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!visible || !data) {
    return null;
  }

  // Determine message tone based on streak
  const isStrongStreak = data.current_streak >= 4;
  const isGoodStreak = data.current_streak >= 2;
  const isGoodWeek = data.recent_completions >= 4;

  return (
    <View style={[styles.container, isStrongStreak && styles.containerStrong]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {isStrongStreak ? (
            <Flame size={20} color="#f59e0b" />
          ) : isGoodStreak ? (
            <TrendingUp size={20} color="#10b981" />
          ) : (
            <Heart size={20} color={colors.accent} />
          )}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.message}>{data.message}</Text>
          {(isGoodStreak || isGoodWeek) && (
            <View style={styles.streakInfo}>
              {data.current_streak > 0 && (
                <Text style={styles.streakText}>
                  {data.current_streak}-day streak
                </Text>
              )}
              {data.recent_completions > 0 && (
                <Text style={styles.completionText}>
                  {data.recent_completions} days this week
                </Text>
              )}
            </View>
          )}
        </View>
        <TouchableOpacity 
          style={styles.dismissButton}
          onPress={handleDismiss}
        >
          <Text style={styles.dismissText}>×</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#d1fae5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  containerStrong: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065f46',
    lineHeight: 20,
    marginBottom: 4,
  },
  streakInfo: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  streakText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '500',
  },
  completionText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '500',
  },
  dismissButton: {
    padding: 4,
    marginTop: -4,
    marginRight: -4,
  },
  dismissText: {
    fontSize: 20,
    color: '#6b7280',
    fontWeight: '300',
  },
});


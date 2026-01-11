/**
 * XP Display Component
 * Shows XP, level, and progress to next level
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Award, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function XPDisplay({ childId, familyId, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [gamification, setGamification] = useState(null);
  const [xpForCurrentLevel, setXpForCurrentLevel] = useState(0);
  const [xpForNextLevel, setXpForNextLevel] = useState(0);
  const [progressPercentage, setProgressPercentage] = useState(0);

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
      } else {
        setGamification(data);
        if (data) {
          calculateLevelProgress(data);
        }
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const calculateLevelProgress = async (gamData) => {
    try {
      // Calculate XP needed for current level
      const currentLevel = gamData.level || 1;
      const xpForCurrent = await getXPForLevel(currentLevel);
      const xpForNext = await getXPForLevel(currentLevel + 1);
      
      setXpForCurrentLevel(xpForCurrent);
      setXpForNextLevel(xpForNext);

      // Calculate progress percentage
      const totalXP = gamData.total_xp || 0;
      const xpInCurrentLevel = totalXP - xpForCurrent;
      const xpNeededForNext = xpForNext - xpForCurrent;
      const percentage = xpNeededForNext > 0 
        ? Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNext) * 100))
        : 0;
      
      setProgressPercentage(percentage);
    } catch (error) {
    }
  };

  const getXPForLevel = async (level) => {
    try {
      const { data, error } = await supabase.rpc('get_xp_for_level', {
        level_num: level,
      });
      if (error) throw error;
      return data || Math.round(100 * Math.pow(level, 1.5));
    } catch (error) {
      // Fallback calculation
      return Math.round(100 * Math.pow(level, 1.5));
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
        <Text style={styles.noDataText}>No XP data yet</Text>
      </View>
    );
  }

  const totalXP = gamification.total_xp || 0;
  const level = gamification.level || 1;
  const xpInCurrentLevel = totalXP - xpForCurrentLevel;
  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Award size={16} color={colors.yellowBold} />
        <Text style={styles.compactXP}>{totalXP} XP</Text>
        <Text style={styles.compactLevel}>Level {level}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.xpSection}>
          <Award size={24} color={colors.yellowBold} />
          <View style={styles.xpInfo}>
            <Text style={styles.xpValue}>{totalXP.toLocaleString()}</Text>
            <Text style={styles.xpLabel}>Total XP</Text>
          </View>
        </View>
        <View style={styles.levelSection}>
          <Text style={styles.levelValue}>Level {level}</Text>
          <Text style={styles.levelLabel}>Current Level</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercentage}%` },
            ]}
          />
        </View>
        <View style={styles.progressTextContainer}>
          <Text style={styles.progressText}>
            {xpInCurrentLevel} / {xpNeededForNext} XP to Level {level + 1}
          </Text>
        </View>
      </View>
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
  xpSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  xpInfo: {
    gap: 2,
  },
  xpValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  xpLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  levelSection: {
    alignItems: 'flex-end',
    gap: 2,
  },
  levelValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.indigo,
  },
  levelLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressSection: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.yellowBold,
    borderRadius: 4,
  },
  progressTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  compactXP: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  compactLevel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  noDataText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});


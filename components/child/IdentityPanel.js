import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Flame, Clock, BookOpen, Award } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function IdentityPanel({ child, summary, goals, weekStart, weekEnd }) {
  const childName = child?.name || child?.first_name || 'Child';
  const grade = child?.grade || null;
  
  // Calculate learning streak (placeholder - would need to fetch from backend)
  const streak = 0; // TODO: Get from summary or separate API call
  
  // Calculate metrics for badges
  const totalMinutes = summary?.done_minutes || 0;
  const subjectsInProgress = goals?.filter(g => (g.done_min || 0) > 0).length || 0;
  
  // Find strongest subject (most minutes done)
  const strongestSubject = goals?.reduce((max, g) => 
    (g.done_min || 0) > (max?.done_min || 0) ? g : max, null
  );

  // Format date range
  const formatDate = (date) => {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const dateRange = weekStart && weekEnd 
    ? `${formatDate(weekStart)} - ${formatDate(weekEnd)}`
    : 'This week';

  return (
    <View style={styles.container}>
      {/* Avatar and Basic Info */}
      <View style={styles.mainRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {childName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{childName}</Text>
            {grade && (
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeText}>Grade {grade}</Text>
              </View>
            )}
          </View>
          <View style={styles.streakRow}>
            <Flame size={16} color={colors.orangeBold} />
            <Text style={styles.streakText}>
              {streak > 0 ? `${streak} day streak` : 'Start your streak!'}
            </Text>
          </View>
          <Text style={styles.dateRange}>{dateRange}</Text>
        </View>
      </View>

      {/* Badge Row */}
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Flame size={14} color={colors.orangeBold} />
          <Text style={styles.badgeLabel}>Streak</Text>
          <Text style={styles.badgeValue}>{streak}</Text>
        </View>
        <View style={styles.badge}>
          <Clock size={14} color={colors.greenBold} />
          <Text style={styles.badgeLabel}>Minutes</Text>
          <Text style={styles.badgeValue}>{totalMinutes}</Text>
        </View>
        <View style={styles.badge}>
          <BookOpen size={14} color={colors.violetBold} />
          <Text style={styles.badgeLabel}>Subjects</Text>
          <Text style={styles.badgeValue}>{subjectsInProgress}</Text>
        </View>
        {strongestSubject && (
          <View style={styles.badge}>
            <Award size={14} color={colors.blueBold} />
            <Text style={styles.badgeLabel}>Strongest</Text>
            <Text style={styles.badgeValue} numberOfLines={1}>
              {strongestSubject.subject || strongestSubject.subject_id}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 16,
    ...shadows.md,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.blueBold,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  gradeBadge: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  gradeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  dateRange: {
    fontSize: 12,
    color: colors.muted,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  badge: {
    flex: 1,
    minWidth: 80,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  badgeLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  badgeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});


/**
 * Child Summary Card
 * Shows per-child snapshot when "All" is selected
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Calendar, Award, FileText, ArrowRight, BarChart3 } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildColor, getTextColorForBackground } from '../../utils/avatarColors';

const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
};

const resolveAvatarSource = (avatarKey) => {
  if (!avatarKey) {
    return avatarSources.prof1;
  }
  const normalized = String(avatarKey)
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return avatarSources[normalized] || avatarSources.prof1;
};

export default function ChildSummaryCard({
  child,
  readinessScore = 0,
  attendanceDays = 0,
  attendanceMinutes = 0,
  creditsEarned = 0,
  creditsPlanned = 0,
  portfolioCount = 0,
  gapWarnings = [],
  onOpenPlanner,
  onOpenAnalytics,
  onOpenPortfolio,
}) {
  const attendanceHours = Math.floor(attendanceMinutes / 60);
  const barColor = useMemo(() => getChildColor(child), [child]);
  const barTextColor = useMemo(() => getTextColorForBackground(barColor), [barColor]);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={resolveAvatarSource(child.avatar)}
          style={styles.avatar}
          resizeMode="contain"
        />
        <View style={styles.headerText}>
          <Text style={styles.childName}>{child.first_name || child.name}</Text>
          {child.grade && (
            <Text style={styles.grade}>{child.grade}</Text>
          )}
        </View>
      </View>

      {/* Readiness Meter */}
      <View style={styles.meterSection}>
        <View style={styles.meterLabelRow}>
          <Text style={styles.meterLabel}>Readiness Score</Text>
        </View>
        <View style={styles.meterBar}>
          <View style={[styles.meterFill, { width: `${readinessScore}%`, backgroundColor: barColor }]}>
            {readinessScore > 0 && (
              <Text style={[styles.meterValueInside, { color: barTextColor }]}>{readinessScore}%</Text>
            )}
          </View>
        </View>
      </View>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metric}>
          <Calendar size={16} color={colors.textSecondary} />
          <Text style={styles.metricValue}>{attendanceDays}</Text>
          <Text style={styles.metricLabel}>days</Text>
          <Text style={styles.metricSubtext}>{attendanceHours}h</Text>
        </View>
        <View style={styles.metric}>
          <Award size={16} color={colors.textSecondary} />
          <Text style={styles.metricValue}>{creditsEarned}</Text>
          <Text style={styles.metricLabel}>credits</Text>
          <Text style={styles.metricSubtext}>/{creditsPlanned} planned</Text>
        </View>
        <View style={styles.metric}>
          <FileText size={16} color={colors.textSecondary} />
          <Text style={styles.metricValue}>{portfolioCount}</Text>
          <Text style={styles.metricLabel}>artifacts</Text>
        </View>
      </View>

      {/* Gap Warnings */}
      {gapWarnings.length > 0 && (
        <View style={styles.gapsSection}>
          <Text style={styles.gapsTitle}>Gaps:</Text>
          {gapWarnings.slice(0, 2).map((gap, idx) => (
            <Text key={idx} style={styles.gapText}>{gap}</Text>
          ))}
        </View>
      )}

      {/* Divider before actions */}
      <View style={styles.actionDivider} />

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onOpenPlanner?.(child.id)}
        >
          <Calendar size={14} color={colors.indigo} />
          <Text style={styles.actionText}>Planner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onOpenAnalytics?.(child.id)}
        >
          <BarChart3 size={14} color={colors.indigo} />
          <Text style={styles.actionText}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onOpenPortfolio?.(child.id)}
        >
          <FileText size={14} color={colors.indigo} />
          <Text style={styles.actionText}>Portfolio</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  childName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  grade: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meterSection: {
    marginBottom: 12,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  meterLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  meterValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  meterBar: {
    height: 24,
    backgroundColor: colors.panel,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  meterFill: {
    height: '100%',
    backgroundColor: colors.indigo,
    borderRadius: 12,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 8,
    minWidth: 40,
  },
  meterValueInside: {
    fontSize: 13,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metricSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gapsSection: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  actionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
    opacity: 0.5,
  },
  gapsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  gapText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
    paddingHorizontal: 4,
    paddingBottom: 4,
    backgroundColor: colors.panel,
    borderRadius: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  actionText: {
    fontSize: 12,
    color: colors.indigo,
    fontWeight: '500',
  },
});


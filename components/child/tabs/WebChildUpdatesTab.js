/**
 * Updates Tab
 * "What changed. What matters today."
 * Diagnostic, real data tab - narrative, not overwhelming
 * 
 * Structure:
 * A. Intro sentence
 * B. Three Blocks (Strengths, In Flux, Challenges)
 * C. Stable Diagnostic Axes (Power, Pressure, Trouble)
 * D. Daily Breakdown Examples
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import AppContainer from '../../ui/AppContainer';
import PageHeader from '../../ui/PageHeader';
import Card from '../../ui/Card';
import { TrendingUp, AlertCircle, Activity } from 'lucide-react';

export default function WebChildUpdatesTab({ childId, childName, familyId, onNavigate }) {
  return (
    <View style={styles.container}>
      <PageHeader
        title="Updates"
        subtitle={`These updates reflect ${childName}'s progress, patterns, and readiness today.`}
        icon={Activity}
        iconColor={colors.indigo}
      />
      
      <AppContainer>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* B. Three Blocks */}
          <View style={styles.blocksRow}>
            {/* Strengths */}
            <Card style={styles.blockCard}>
              <View style={styles.blockHeader}>
                <TrendingUp size={20} color={colors.green} />
                <Text style={styles.blockTitle}>Strengths</Text>
              </View>
              <Text style={styles.blockSubtitle}>Where she is shining this week:</Text>
              <View style={styles.blockList}>
                <Text style={styles.blockItem}>Deep focus in the mornings</Text>
                <Text style={styles.blockItem}>Curiosity peaked in science</Text>
                <Text style={styles.blockItem}>Completing sessions with ease</Text>
              </View>
            </Card>

            {/* In Flux */}
            <Card style={styles.blockCard}>
              <View style={styles.blockHeader}>
                <Activity size={20} color={colors.orange} />
                <Text style={styles.blockTitle}>In Flux</Text>
              </View>
              <Text style={styles.blockSubtitle}>Areas shifting or inconsistent:</Text>
              <View style={styles.blockList}>
                <Text style={styles.blockItem}>Math pacing variable</Text>
                <Text style={styles.blockItem}>Energy dips early afternoon</Text>
              </View>
            </Card>

            {/* Challenges */}
            <Card style={styles.blockCard}>
              <View style={styles.blockHeader}>
                <AlertCircle size={20} color={colors.red} />
                <Text style={styles.blockTitle}>Challenges</Text>
              </View>
              <Text style={styles.blockSubtitle}>Specific actionable awareness:</Text>
              <View style={styles.blockList}>
                <Text style={styles.blockItem}>One overdue session is causing drag</Text>
                <Text style={styles.blockItem}>Stress signals elevated after long days</Text>
              </View>
            </Card>
          </View>

          {/* C. Stable Diagnostic Axes */}
          <View style={styles.axesSection}>
            <Card style={styles.axisCard}>
              <Text style={styles.axisTitle}>Power</Text>
              <Text style={styles.axisSubtitle}>charisma, responsibility, curiosity, leadership</Text>
              <View style={styles.axisItem}>
                <Text style={styles.axisLabel}>Curiosity</Text>
                <Text style={styles.axisDescription}>Drawing today pulls her in; lean on it.</Text>
              </View>
            </Card>

            <Card style={styles.axisCard}>
              <Text style={styles.axisTitle}>Pressure</Text>
              <Text style={styles.axisSubtitle}>change in perception, sensitivity, tension</Text>
              <View style={styles.axisItem}>
                <Text style={styles.axisLabel}>Change</Text>
                <Text style={styles.axisDescription}>New content may feel overwhelming; slow pacing helps.</Text>
              </View>
            </Card>

            <Card style={styles.axisCard}>
              <Text style={styles.axisTitle}>Trouble</Text>
              <Text style={styles.axisSubtitle}>strain, stress, out-of-sorts indicators</Text>
              <View style={styles.axisItem}>
                <Text style={styles.axisLabel}>Stress</Text>
                <Text style={styles.axisDescription}>She needs a low-stakes win early.</Text>
              </View>
            </Card>
          </View>

          {/* D. Daily Breakdown Examples */}
          <Card style={styles.dailyCard}>
            <Text style={styles.dailyTitle}>Today</Text>
            <Text style={styles.dailyText}>
              Today math seeks your spark. A 10-minute warm-up could unlock momentum.
            </Text>
          </Card>
        </ScrollView>
      </AppContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  blocksRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  blockCard: {
    flex: 1,
    minWidth: 280,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  blockSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  blockList: {
    gap: 8,
  },
  blockItem: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    paddingLeft: 8,
  },
  axesSection: {
    gap: 16,
    marginBottom: 24,
  },
  axisCard: {
    marginBottom: 16,
  },
  axisTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  axisSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  axisItem: {
    marginTop: 8,
  },
  axisLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  axisDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  dailyCard: {
    marginBottom: 24,
  },
  dailyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  dailyText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
});


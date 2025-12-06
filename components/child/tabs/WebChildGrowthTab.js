/**
 * Growth Tab
 * "Who she is becoming."
 * Long-term, non-changing tab - identity view
 * 
 * Structure:
 * A. Skills Table (Academic, Cognitive, Habits/Executive Function)
 * B. Interests Chart (Bubble chart or chips with size based on engagement)
 * C. Subjects Breakdown (Hours completed per subject - last 30 days)
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import AppContainer from '../../ui/AppContainer';
import PageHeader from '../../ui/PageHeader';
import Card from '../../ui/Card';
import { TrendingUp, Target, Brain } from 'lucide-react';

export default function WebChildGrowthTab({ childId, childName, familyId, onNavigate }) {
  return (
    <View style={styles.container}>
      <PageHeader
        title="Growth"
        subtitle={`Who ${childName} is becoming`}
        icon={TrendingUp}
        iconColor={colors.green}
      />
      
      <AppContainer>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* A. Skills Table */}
          <Card style={styles.skillsCard}>
            <Text style={styles.sectionTitle}>Skills</Text>
            
            {/* Academic Skills */}
            <View style={styles.skillCategory}>
              <Text style={styles.categoryTitle}>Academic Skills</Text>
              <View style={styles.skillList}>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Reading comprehension</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '75%' }]} />
                  </View>
                </View>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Mathematical reasoning</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '60%' }]} />
                  </View>
                </View>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Writing fluency</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '80%' }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* Cognitive Skills */}
            <View style={styles.skillCategory}>
              <Text style={styles.categoryTitle}>Cognitive Skills</Text>
              <View style={styles.skillList}>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Working memory</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '70%' }]} />
                  </View>
                </View>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Focus stamina</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '65%' }]} />
                  </View>
                </View>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Processing speed</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '72%' }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* Habits / Executive Function */}
            <View style={styles.skillCategory}>
              <Text style={styles.categoryTitle}>Habits / Executive Function</Text>
              <View style={styles.skillList}>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Organization</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '68%' }]} />
                  </View>
                </View>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Planning</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '55%' }]} />
                  </View>
                </View>
                <View style={styles.skillItem}>
                  <Text style={styles.skillLabel}>Independence</Text>
                  <View style={styles.skillBar}>
                    <View style={[styles.skillBarFill, { width: '78%' }]} />
                  </View>
                </View>
              </View>
            </View>
          </Card>

          {/* B. Interests Chart */}
          <Card style={styles.interestsCard}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <View style={styles.interestsContainer}>
              <View style={[styles.interestBubble, styles.interestLarge]}>
                <Text style={styles.interestText}>Animals</Text>
              </View>
              <View style={[styles.interestBubble, styles.interestMedium]}>
                <Text style={styles.interestText}>Drawing</Text>
              </View>
              <View style={[styles.interestBubble, styles.interestSmall]}>
                <Text style={styles.interestText}>Math puzzles</Text>
              </View>
              <View style={[styles.interestBubble, styles.interestMedium]}>
                <Text style={styles.interestText}>Space</Text>
              </View>
              <View style={[styles.interestBubble, styles.interestSmall]}>
                <Text style={styles.interestText}>Legos</Text>
              </View>
            </View>
          </Card>

          {/* C. Subjects Breakdown */}
          <Card style={styles.subjectsCard}>
            <Text style={styles.sectionTitle}>Subjects Breakdown</Text>
            <Text style={styles.subjectsSubtitle}>Hours completed per subject (last 30 days)</Text>
            <View style={styles.subjectsList}>
              <View style={styles.subjectItem}>
                <Text style={styles.subjectLabel}>Reading</Text>
                <Text style={styles.subjectHours}>24h</Text>
              </View>
              <View style={styles.subjectItem}>
                <Text style={styles.subjectLabel}>Math</Text>
                <Text style={styles.subjectHours}>18h</Text>
              </View>
              <View style={styles.subjectItem}>
                <Text style={styles.subjectLabel}>Science</Text>
                <Text style={styles.subjectHours}>12h</Text>
              </View>
              <View style={styles.subjectItem}>
                <Text style={styles.subjectLabel}>Arts</Text>
                <Text style={styles.subjectHours}>15h</Text>
              </View>
            </View>
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
  skillsCard: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  skillCategory: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  skillList: {
    gap: 12,
  },
  skillItem: {
    marginBottom: 8,
  },
  skillLabel: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },
  skillBar: {
    height: 8,
    backgroundColor: colors.panel,
    borderRadius: 4,
    overflow: 'hidden',
  },
  skillBarFill: {
    height: '100%',
    backgroundColor: colors.green,
    borderRadius: 4,
  },
  interestsCard: {
    marginBottom: 24,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  interestBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.indigo + '15',
    borderWidth: 1,
    borderColor: colors.indigo + '30',
  },
  interestLarge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  interestMedium: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  interestSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  interestText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  subjectsCard: {
    marginBottom: 24,
  },
  subjectsSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  subjectsList: {
    gap: 12,
  },
  subjectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectLabel: {
    fontSize: 16,
    color: colors.text,
  },
  subjectHours: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.indigo,
  },
});


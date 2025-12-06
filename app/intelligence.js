import React from 'react';
import { View, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { BottomToolbarLegacy as BottomToolbar } from '../components/navigation/BottomToolbarLegacy';
import { Card, PastelCard } from '../components/design-system/Card';
import { Icon } from '../components/design-system/Icon';
import { Heading, Body, Label } from '../components/design-system/Typography';
import { getModeTokens } from '../theme/pastelDesignTokens';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { spacing } from '../theme/pastelDesignTokens';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel' };
  }
}

export default function IntelligenceScreen() {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.bg,
          paddingBottom: 80, // Space for bottom toolbar
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {}}>
          <Icon name="home" size={24} color={tokens.icon} />
        </TouchableOpacity>
        <Heading level={2}>Intelligence</Heading>
        <TouchableOpacity onPress={() => {}}>
          <Icon name="settings" size={24} color={tokens.icon} />
        </TouchableOpacity>
      </View>
      
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Insight Cards */}
        <View style={styles.grid}>
          <Card style={styles.insightCard}>
            <Icon name="learning" size={32} floating />
            <Heading level={4} style={styles.insightTitle}>
              Learning Patterns
            </Heading>
            <Body size="sm" muted>
              Discover your unique learning style
            </Body>
          </Card>
          
          <Card style={styles.insightCard}>
            <Icon name="progress" size={32} floating />
            <Heading level={4} style={styles.insightTitle}>
              Growth Insights
            </Heading>
            <Body size="sm" muted>
              Track your progress over time
            </Body>
          </Card>
        </View>
        
        {/* Recent Activity */}
        <View style={styles.section}>
          <Heading level={3}>Recent Insights</Heading>
          {[1, 2, 3].map((item) => (
            <Card key={item} style={styles.insightItem}>
              <View style={styles.insightItemContent}>
                <Icon name="star" size={20} />
                <View style={styles.insightItemText}>
                  <Body size="md">New pattern detected</Body>
                  <Body size="sm" muted>2 hours ago</Body>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
      
      <BottomToolbar currentRoute="/intelligence" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...Platform.select({
      web: {
        minHeight: '100vh',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  insightCard: {
    width: '48%',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  insightTitle: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  insightItem: {
    marginBottom: spacing.sm,
  },
  insightItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  insightItemText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
});

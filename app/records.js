import React from 'react';
import { View, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { BottomToolbarLegacy as BottomToolbar } from '../components/navigation/BottomToolbarLegacy';
import { Card, PastelCard } from '../components/design-system/Card';
import { Icon } from '../components/design-system/Icon';
import { Heading, Body, Label, Mono } from '../components/design-system/Typography';
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

export default function RecordsScreen() {
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
        <Heading level={2}>Records</Heading>
        <TouchableOpacity onPress={() => {}}>
          <Icon name="settings" size={24} color={tokens.icon} />
        </TouchableOpacity>
      </View>
      
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Cards */}
        <View style={styles.grid}>
          <Card style={styles.summaryCard}>
            <Icon name="activity" size={28} />
            <Mono size="xl" style={styles.summaryValue}>24</Mono>
            <Label size="xs">ACTIVITIES</Label>
          </Card>
          
          <Card style={styles.summaryCard}>
            <Icon name="progress" size={28} />
            <Mono size="xl" style={styles.summaryValue}>18</Mono>
            <Label size="xs">COMPLETED</Label>
          </Card>
        </View>
        
        {/* Record Categories */}
        <View style={styles.section}>
          <Heading level={3}>Categories</Heading>
          {[
            { name: 'Activities', icon: 'activity' },
            { name: 'Progress', icon: 'progress' },
            { name: 'Achievements', icon: 'star' },
          ].map((category, index) => (
            <Card key={index} style={styles.categoryCard} onPress={() => {}}>
              <View style={styles.categoryContent}>
                <View
                  style={[
                    styles.categoryIconContainer,
                    { backgroundColor: tokens.pastels.lavender },
                  ]}
                >
                  <Icon name={category.icon} size={24} />
                </View>
                <Body size="md" style={styles.categoryName}>
                  {category.name}
                </Body>
                <Icon name="learning" size={20} color={tokens.iconMuted} />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
      
      <BottomToolbar currentRoute="/records" />
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
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  summaryValue: {
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  categoryCard: {
    marginBottom: spacing.sm,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    flex: 1,
  },
});

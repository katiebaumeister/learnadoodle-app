import React from 'react';
import { View, ScrollView, StyleSheet, Platform, Image } from 'react-native';
import { BottomToolbarLegacy as BottomToolbar } from '../components/navigation/BottomToolbarLegacy';
import { Card, PastelCard } from '../components/design-system/Card';
import { Icon } from '../components/design-system/Icon';
import { Heading, Body, Label, Mono } from '../components/design-system/Typography';
import { getModeTokens } from '../theme/pastelDesignTokens';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { spacing } from '../theme/pastelDesignTokens';
import AnimatedIcon from '../components/AnimatedIcon';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel' };
  }
}

export default function HomeScreen() {
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <AnimatedIcon
              source={require('../assets/icon.png')}
              size={48}
              animationType="pulse"
              duration={2000}
              style={styles.headerIcon}
            />
            <View style={styles.headerText}>
              <Heading level={1}>Hello, Oliver</Heading>
              <Body size="md" muted style={styles.subtitle}>
                Ready to explore today?
              </Body>
            </View>
          </View>
        </View>
        
        {/* Sunny Outlook Card */}
        <PastelCard color="mint" style={styles.featureCard}>
          <View style={styles.featureCardContent}>
            <Icon name="sun" size={32} floating />
            <View style={styles.featureCardText}>
              <Heading level={4}>Sunny Outlook</Heading>
              <Body size="sm" muted>Perfect for outdoor discovery.</Body>
            </View>
          </View>
        </PastelCard>
        
        {/* Activity Grid */}
        <View style={styles.grid}>
          <Card
            style={[styles.gridCard, { backgroundColor: tokens.pastels.peach }]}
            onPress={() => {}}
          >
            <Icon name="activity" size={24} />
            <Label size="xs" style={styles.gridLabel}>TODAY'S ACTIVITIES</Label>
            <Mono size="xs" style={styles.gridValue}>3 TASKS</Mono>
          </Card>
          
          <Card
            style={[styles.gridCard, { backgroundColor: tokens.pastels.lavender }]}
            onPress={() => {}}
          >
            <Icon name="learning" size={24} />
            <Label size="xs" style={styles.gridLabel}>LEARNING PATHS</Label>
            <Mono size="xs" style={styles.gridValue}>SCIENCE</Mono>
          </Card>
          
          <Card
            style={[styles.gridCard, { backgroundColor: tokens.pastels.mint }]}
            onPress={() => {}}
          >
            <Icon name="creative" size={24} />
            <Label size="xs" style={styles.gridLabel}>CREATIVE SPACE</Label>
            <Mono size="xs" style={styles.gridValue}>DRAW</Mono>
          </Card>
          
          <Card
            style={[styles.gridCard, { backgroundColor: tokens.pastels.sky }]}
            onPress={() => {}}
          >
            <Icon name="progress" size={24} />
            <Label size="xs" style={styles.gridLabel}>PROGRESS GARDEN</Label>
            <Mono size="xs" style={styles.gridValue}>GROWING</Mono>
          </Card>
        </View>
        
        {/* Jump Back In Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Heading level={3}>Jump Back In</Heading>
            <Body size="sm" style={styles.linkText}>View all</Body>
          </View>
          
          <Card onPress={() => {}}>
            <View style={styles.jumpBackCard}>
              <Icon name="planet" size={32} />
              <View style={styles.jumpBackContent}>
                <Heading level={4}>Solar System 101</Heading>
                <Body size="sm" muted>Continue your journey through space</Body>
              </View>
              <Icon name="learning" size={24} color={tokens.accent} />
            </View>
          </Card>
        </View>
      </ScrollView>
      
      <BottomToolbar />
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    marginBottom: spacing.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIcon: {
    marginRight: spacing.xs,
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  featureCard: {
    marginBottom: spacing.md,
  },
  featureCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureCardText: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  gridCard: {
    width: '48%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  gridLabel: {
    marginTop: spacing.xs,
  },
  gridValue: {
    marginTop: spacing.xs / 2,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  linkText: {
    color: '#8B7CF6',
  },
  jumpBackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  jumpBackContent: {
    flex: 1,
  },
});

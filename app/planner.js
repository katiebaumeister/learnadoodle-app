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

export default function PlannerScreen() {
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
        <Heading level={2}>Learning Journey</Heading>
        <TouchableOpacity onPress={() => {}}>
          <Icon name="settings" size={24} color={tokens.icon} />
        </TouchableOpacity>
      </View>
      
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Encouragement Banner */}
        <PastelCard color="mint" style={styles.banner}>
          <Body size="md">
            You're doing great! Keep exploring ✨
          </Body>
        </PastelCard>
        
        {/* Learning Activities */}
        <View style={styles.activities}>
          {[1, 2, 3].map((item) => (
            <Card key={item} style={styles.activityCard}>
              <View style={styles.activityContent}>
                <View
                  style={[
                    styles.activityIconContainer,
                    { backgroundColor: tokens.pastels.lavender },
                  ]}
                >
                  <Icon name="learning" size={20} />
                </View>
                <View style={styles.activityText}>
                  <Heading level={4}>Reading Adventures</Heading>
                  <Body size="sm" muted>
                    Explore new stories and build your vocabulary
                  </Body>
                  <View style={styles.activityMeta}>
                    <Mono size="xs">20 MIN</Mono>
                    <Label size="xs" style={styles.activityStatus}>
                      COMPLETED
                    </Label>
                  </View>
                </View>
                <Icon name="learning" size={20} color={tokens.accent} />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
      
      <BottomToolbar currentRoute="/planner" />
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
  banner: {
    marginBottom: spacing.md,
  },
  activities: {
    gap: spacing.md,
  },
  activityCard: {
    marginBottom: spacing.sm,
  },
  activityContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  activityIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  activityStatus: {
    color: '#86EFAC',
  },
});

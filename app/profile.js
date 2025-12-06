import React from 'react';
import { View, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { BottomToolbarLegacy as BottomToolbar } from '../components/navigation/BottomToolbarLegacy';
import { Card, PastelCard } from '../components/design-system/Card';
import { Icon } from '../components/design-system/Icon';
import { Heading, Body, Label } from '../components/design-system/Typography';
import { getModeTokens } from '../theme/pastelDesignTokens';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { spacing } from '../theme/pastelDesignTokens';
import { SensorySettings } from '../components/profile/SensorySettings';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel' };
  }
}

export default function ProfileScreen() {
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
        <Heading level={2}>Profile</Heading>
        <TouchableOpacity onPress={() => {}}>
          <Icon name="settings" size={24} color={tokens.icon} />
        </TouchableOpacity>
      </View>
      
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <Card style={styles.profileHeader}>
          <View
            style={[
              styles.avatarContainer,
              { backgroundColor: tokens.pastels.lavender },
            ]}
          >
            <Icon name="profile" size={48} />
          </View>
          <Heading level={2} style={styles.profileName}>
            Oliver
          </Heading>
          <Body size="sm" muted>
            Learning Explorer
          </Body>
        </Card>
        
        {/* Sensory Settings */}
        <SensorySettings />
        
        {/* Settings Options */}
        <View style={styles.section}>
          <Heading level={3}>Settings</Heading>
          {[
            { name: 'Preferences', icon: 'settings' },
            { name: 'Notifications', icon: 'learning' },
            { name: 'Privacy', icon: 'profile' },
          ].map((item, index) => (
            <Card key={index} style={styles.settingItem} onPress={() => {}}>
              <View style={styles.settingContent}>
                <Icon name={item.icon} size={24} />
                <Body size="md" style={styles.settingName}>
                  {item.name}
                </Body>
                <Icon name="learning" size={20} color={tokens.iconMuted} />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
      
      {Platform.OS !== 'web' && <BottomToolbar currentRoute="/profile" />}
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
  profileHeader: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  profileName: {
    marginBottom: spacing.xs / 2,
  },
  section: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  settingItem: {
    marginBottom: spacing.sm,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingName: {
    flex: 1,
  },
});

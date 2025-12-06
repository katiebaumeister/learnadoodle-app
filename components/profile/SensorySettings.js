import React from 'react';
import { View, StyleSheet, Switch, Text, Platform } from 'react-native';
import { Card } from '../design-system/Card';
import { Heading, Body } from '../design-system/Typography';
import { getModeTokens, sensoryModes } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { spacing } from '../../theme/pastelDesignTokens';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel', setMode: () => {} };
  }
}

export function SensorySettings() {
  const { mode, setMode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <View style={styles.container}>
      <Heading level={3} style={styles.sectionTitle}>
        Sensory Settings
      </Heading>
      
      {/* Visual Modes */}
      <View style={styles.subsection}>
        <Body size="sm" style={styles.subsectionTitle}>
          Visual Modes
        </Body>
        
        {Object.entries(sensoryModes).map(([key, modeConfig]) => {
          const isActive = mode === key;
          
          return (
            <Card key={key} style={styles.modeCard}>
              <View style={styles.modeCardContent}>
                <View style={styles.modeCardText}>
                  <Heading level={5}>{modeConfig.name}</Heading>
                  <Body size="sm" muted style={styles.modeDescription}>
                    {modeConfig.description}
                  </Body>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={() => setMode(key)}
                  trackColor={{
                    false: tokens.border,
                    true: tokens.accent,
                  }}
                  thumbColor={tokens.card}
                />
              </View>
              {key === 'contrast' && isActive && (
                <View
                  style={[
                    styles.previewBox,
                    {
                      backgroundColor: modeConfig.tokens.card,
                      borderColor: modeConfig.tokens.border,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: modeConfig.tokens.text,
                      fontSize: 12,
                    }}
                  >
                    High-Contrast Preview
                  </Text>
                </View>
              )}
            </Card>
          );
        })}
      </View>
      
      {/* Accessibility Options */}
      <View style={styles.subsection}>
        <Body size="sm" style={styles.subsectionTitle}>
          Accessibility Options
        </Body>
        
        <Card style={styles.optionCard}>
          <View style={styles.optionContent}>
            <Body size="md">Font Size</Body>
            <Body size="sm" muted>Medium</Body>
          </View>
        </Card>
        
        <Card style={styles.optionCard}>
          <View style={styles.optionContent}>
            <Body size="md">Animation Speed</Body>
            <Body size="sm" muted>Gentle</Body>
          </View>
        </Card>
        
        <Card style={styles.optionCard}>
          <View style={styles.optionContent}>
            <Body size="md">Sound Effects</Body>
            <Switch
              value={true}
              onValueChange={() => {}}
              trackColor={{
                false: tokens.border,
                true: tokens.accent,
              }}
              thumbColor={tokens.card}
            />
          </View>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  subsection: {
    marginBottom: spacing.lg,
  },
  subsectionTitle: {
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  modeCard: {
    marginBottom: spacing.md,
  },
  modeCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeCardText: {
    flex: 1,
    marginRight: spacing.md,
  },
  modeDescription: {
    marginTop: spacing.xs / 2,
  },
  previewBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCard: {
    marginBottom: spacing.sm,
  },
  optionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

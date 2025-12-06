/**
 * Simple Intelligence Hub - Old Design
 * Simple insight cards without AI chat interface
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Brain } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';

const DEFAULT_TOKENS = {
  bg: '#FAF9F7',
  textPrimary: '#2D2D2D',
  textSecondary: '#6B6B6B',
  cardBg: '#FFFFFF',
  shadow: '0 2px 12px rgba(139, 124, 246, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
  border: '#E8E6E3',
  accent: '#8B7CF6',
};

function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch (e) {
    return { mode: 'pastel', tokens: DEFAULT_TOKENS, setMode: () => {} };
  }
}

export default function SimpleIntelligenceHub({ familyId, children = [] }) {
  const { tokens, mode } = useSensoryModeSafe();

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={[styles.iconContainer, { backgroundColor: `${tokens.accent}22` }]}>
              <Brain size={32} color={tokens.accent} strokeWidth={1.5} />
            </View>
            <View style={styles.headerText}>
              <Text
                style={[
                  styles.title,
                  { color: tokens.textPrimary },
                  Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
                ]}
              >
                Intelligence
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: tokens.textSecondary },
                  Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
                ]}
              >
                A reflective space for learning insights
              </Text>
            </View>
          </View>
        </View>

        {/* Insight Cards Grid */}
        <View style={styles.cardsGrid}>
          <View
            style={[
              styles.insightCard,
              {
                backgroundColor: tokens.cardBg,
                borderColor: tokens.border,
                ...Platform.select({
                  web: {
                    boxShadow: tokens.shadow,
                  },
                  default: {
                    shadowColor: '#8B7CF6',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    elevation: 2,
                  },
                }),
              },
            ]}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${tokens.accent}15` }]}>
              <Brain size={24} color={tokens.accent} strokeWidth={1.5} />
            </View>
            <Text
              style={[
                styles.cardTitle,
                { color: tokens.textPrimary },
                Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
              ]}
            >
              Learning Patterns
            </Text>
            <Text
              style={[
                styles.cardDescription,
                { color: tokens.textSecondary },
                Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
              ]}
            >
              Discover your unique learning style
            </Text>
          </View>

          <View
            style={[
              styles.insightCard,
              {
                backgroundColor: tokens.cardBg,
                borderColor: tokens.border,
                ...Platform.select({
                  web: {
                    boxShadow: tokens.shadow,
                  },
                  default: {
                    shadowColor: '#8B7CF6',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    elevation: 2,
                  },
                }),
              },
            ]}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${tokens.accent}15` }]}>
              <Brain size={24} color={tokens.accent} strokeWidth={1.5} />
            </View>
            <Text
              style={[
                styles.cardTitle,
                { color: tokens.textPrimary },
                Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
              ]}
            >
              Growth Insights
            </Text>
            <Text
              style={[
                styles.cardDescription,
                { color: tokens.textSecondary },
                Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
              ]}
            >
              Track your progress over time
            </Text>
          </View>
        </View>

        {/* Recent Insights Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: tokens.textPrimary },
              Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
            ]}
          >
            Recent Insights
          </Text>
          
          {[1, 2, 3].map((item) => (
            <View
              key={item}
              style={[
                styles.insightItem,
                {
                  backgroundColor: tokens.cardBg,
                  borderColor: tokens.border,
                  ...Platform.select({
                    web: {
                      boxShadow: tokens.shadow,
                    },
                    default: {
                      shadowColor: '#8B7CF6',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 3,
                      elevation: 1,
                    },
                  }),
                },
              ]}
            >
              <View style={styles.insightItemContent}>
                <View style={[styles.insightItemIcon, { backgroundColor: `${tokens.accent}15` }]}>
                  <Brain size={16} color={tokens.accent} strokeWidth={1.5} />
                </View>
                <View style={styles.insightItemText}>
                  <Text
                    style={[
                      styles.insightItemTitle,
                      { color: tokens.textPrimary },
                      Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
                    ]}
                  >
                    New pattern detected
                  </Text>
                  <Text
                    style={[
                      styles.insightItemTime,
                      { color: tokens.textSecondary },
                      Platform.OS === 'web' && { fontFamily: 'system-ui, -apple-system, sans-serif' },
                    ]}
                  >
                    2 hours ago
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(139, 124, 246, 0.15)',
      },
      default: {
        shadowColor: '#8B7CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  insightCard: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '48%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '300',
  },
  section: {
    paddingHorizontal: 24,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  insightItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  insightItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  insightItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightItemText: {
    flex: 1,
  },
  insightItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  insightItemTime: {
    fontSize: 13,
    fontWeight: '400',
  },
});

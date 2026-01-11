/**
 * Hero Insights Component
 * Co-Star style daily guidance with emotional, tactical, and strategic layers
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Sparkles, ArrowRight, Heart, Target, Lightbulb } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function HeroInsights({
  primary,
  emotional,
  tactical,
  strategic,
  child_insight,
  cta = "View weekly story",
  onViewFull,
}) {
  if (!primary && !emotional && !tactical && !strategic) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Hero Primary Insight */}
      {primary && (
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.iconCircle}>
              <Sparkles size={20} color="#8B7CF6" />
            </View>
            <Text style={styles.heroLabel}>Today's Guidance</Text>
          </View>
          <Text style={styles.heroText}>{primary}</Text>
        </View>
      )}

      {/* Layered Insights */}
      <View style={styles.layersContainer}>
        {emotional && (
          <View style={[styles.layerCard, styles.emotionalLayer]}>
            <View style={styles.layerHeader}>
              <Heart size={14} color="#F9A8D4" />
              <Text style={styles.layerLabel}>Emotional</Text>
            </View>
            <Text style={styles.layerText}>{emotional}</Text>
          </View>
        )}

        {tactical && (
          <View style={[styles.layerCard, styles.tacticalLayer]}>
            <View style={styles.layerHeader}>
              <Target size={14} color="#86EFAC" />
              <Text style={styles.layerLabel}>Tactical</Text>
            </View>
            <Text style={styles.layerText}>{tactical}</Text>
          </View>
        )}

        {strategic && (
          <View style={[styles.layerCard, styles.strategicLayer]}>
            <View style={styles.layerHeader}>
              <Lightbulb size={14} color="#C084FC" />
              <Text style={styles.layerLabel}>Strategic</Text>
            </View>
            <Text style={styles.layerText}>{strategic}</Text>
          </View>
        )}

        {child_insight && (
          <View style={[styles.layerCard, styles.childLayer]}>
            <View style={styles.layerHeader}>
              <Sparkles size={14} color="#7DD3FC" />
              <Text style={styles.layerLabel}>For Your Child</Text>
            </View>
            <Text style={styles.layerText}>{child_insight}</Text>
          </View>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 52,
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    ...(Platform.OS === 'web' 
      ? { boxShadow: shadows.md.boxShadow }
      : {
          shadowColor: shadows.md.shadowColor,
          shadowOffset: shadows.md.shadowOffset,
          shadowOpacity: shadows.md.shadowOpacity,
          shadowRadius: shadows.md.shadowRadius,
          elevation: shadows.md.elevation,
        }
    ),
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#8B7CF6',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 26,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  layersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  layerCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    ...(Platform.OS === 'web' 
      ? { boxShadow: shadows.sm.boxShadow }
      : {
          shadowColor: shadows.sm.shadowColor,
          shadowOffset: shadows.sm.shadowOffset,
          shadowOpacity: shadows.sm.shadowOpacity,
          shadowRadius: shadows.sm.shadowRadius,
          elevation: shadows.sm.elevation,
        }
    ),
  },
  emotionalLayer: {
    backgroundColor: '#FFF1F2',
    borderColor: '#F9A8D4',
  },
  tacticalLayer: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  strategicLayer: {
    backgroundColor: '#FAE8FF',
    borderColor: '#C084FC',
  },
  childLayer: {
    backgroundColor: '#F0F9FF',
    borderColor: '#7DD3FC',
  },
  layerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  layerLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  layerText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  viewLinkText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});


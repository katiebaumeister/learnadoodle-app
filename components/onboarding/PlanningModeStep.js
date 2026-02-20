import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, Animated } from 'react-native';

const MODES = [
  {
    id: 'HOMESCHOOL_COMPLIANCE',
    label: 'Homeschool',
    description: 'Track instruction, subjects, and learning progress',
    image: require('../../assets/homeschoolpood.png'),
    emotion: 'calm', // calm, grounded
  },
  {
    id: 'AFTERSCHOOL_GOALS',
    label: 'Afterschool',
    description: 'Track goals, activities, and progress outside school',
    image: require('../../assets/afterschoolpood.png'),
    emotion: 'curious', // curious, active
  },
  {
    id: 'NONE',
    label: 'Just scheduling',
    description: 'Use calendar only — no learning tracking',
    image: require('../../assets/schedulingpood.png'),
    emotion: 'efficient', // organized, efficient
  },
];

const POODLE_SIZE = 90;

export default function PlanningModeStep({ value, onChange, onNext, isSaving }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [continueHovered, setContinueHovered] = useState(false);
  const scaleAnims = useRef(MODES.map(() => new Animated.Value(1))).current;

  // 120ms scale effect on selection
  useEffect(() => {
    MODES.forEach((mode, i) => {
      Animated.timing(scaleAnims[i], {
        toValue: value === mode.id ? 1.02 : 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
  }, [value]);

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>I'm using Learnadoodle for…</Text>

      <View style={styles.cards}>
        {MODES.map((mode, index) => {
          const selected = value === mode.id;
          const hovered = hoveredId === mode.id;
          const cardStyle = [
            styles.card,
            selected && styles.cardSelected,
            hovered && !selected && styles.cardHovered,
            Platform.OS === 'web' && hovered && !selected && styles.cardHoveredTransform,
          ];
          return (
            <Animated.View
              key={mode.id}
              style={[
                styles.cardWrapper,
                { transform: [{ scale: scaleAnims[index] }] },
              ]}
            >
              <TouchableOpacity
                style={cardStyle}
                onPress={() => onChange(mode.id)}
                onMouseEnter={Platform.OS === 'web' ? () => setHoveredId(mode.id) : undefined}
                onMouseLeave={Platform.OS === 'web' ? () => setHoveredId(null) : undefined}
                activeOpacity={1}
              >
                <View style={styles.cardIcon}>
                  <Image source={mode.image} style={styles.cardImage} resizeMode="contain" />
                </View>
                <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                  {mode.label}
                </Text>
                <Text style={styles.cardDescription}>{mode.description}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          !value && styles.continueBtnDisabled,
          Platform.OS === 'web' && value && continueHovered && styles.continueBtnHovered,
        ]}
        onPress={onNext}
        disabled={!value || isSaving}
        onMouseEnter={Platform.OS === 'web' ? () => setContinueHovered(true) : undefined}
        onMouseLeave={Platform.OS === 'web' ? () => setContinueHovered(false) : undefined}
        activeOpacity={0.9}
      >
        <Text style={styles.continueBtnText}>
          {isSaving ? 'Saving…' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    paddingBottom: 8,
  },
  prompt: {
    fontSize: 30,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.95)',
    marginBottom: 24,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  cards: {
    flexDirection: 'row',
    paddingTop: 18,
    marginBottom: 28,
  },
  cardWrapper: {
    flex: 1,
    marginHorizontal: 6,
  },
  card: {
    flex: 1,
    padding: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      transition: 'border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
    }),
  },
  cardHovered: {
    borderColor: '#C7D2FE',
    backgroundColor: '#FAFBFF',
  },
  cardHoveredTransform: {
    transform: [{ translateY: -1 }],
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: '#85C4F2',
    backgroundColor: '#F4F7FF',
    ...(Platform.OS === 'web' && {
      shadowColor: '#85C4F2',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    }),
  },
  cardIcon: {
    marginBottom: 12,
    alignItems: 'center',
  },
  cardImage: {
    width: POODLE_SIZE,
    height: POODLE_SIZE,
  },
  cardLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.9)',
    marginBottom: 6,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  cardLabelSelected: {
    color: '#4A5FEB',
  },
  cardDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  continueBtn: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  continueBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
  },
  continueBtnHovered: {
    backgroundColor: '#78BCEF',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});

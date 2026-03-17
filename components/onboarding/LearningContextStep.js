import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';

const MODE_OPTIONS = [
  { id: 'HOMESCHOOL_COMPLIANCE', label: 'Homeschool' },
  { id: 'AFTERSCHOOL_GOALS', label: 'Afterschool' },
  { id: 'NONE', label: 'Just scheduling' },
];

export default function LearningContextStep({ value, onChange, onNext, isSaving }) {
  const [hoveredMode, setHoveredMode] = useState(null);
  const [continueHovered, setContinueHovered] = useState(false);
  const scaleAnimsMode = useRef(MODE_OPTIONS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    MODE_OPTIONS.forEach((opt, i) => {
      Animated.timing(scaleAnimsMode[i], {
        toValue: value === opt.id ? 1.02 : 1,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [value]);

  const canContinue = Boolean(value);

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>How are you using Learnadoodle?</Text>
      <Text style={styles.subtext}>Choose the option that best fits your situation.</Text>

      <View style={styles.row}>
        {MODE_OPTIONS.map((mode, index) => {
          const selected = value === mode.id;
          const hovered = hoveredMode === mode.id;
          const cardStyle = [
            styles.card,
            selected && styles.cardSelected,
            hovered && !selected && styles.cardHovered,
            Platform.OS === 'web' && hovered && !selected && styles.cardHoveredTransform,
          ];
          return (
            <Animated.View
              key={mode.id}
              style={[styles.cardWrapper, { transform: [{ scale: scaleAnimsMode[index] }] }]}
            >
              <TouchableOpacity
                style={cardStyle}
                onPress={() => onChange(mode.id)}
                onMouseEnter={Platform.OS === 'web' ? () => setHoveredMode(mode.id) : undefined}
                onMouseLeave={Platform.OS === 'web' ? () => setHoveredMode(null) : undefined}
                activeOpacity={1}
              >
                <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          !canContinue && styles.continueBtnDisabled,
          Platform.OS === 'web' && canContinue && continueHovered && styles.continueBtnHovered,
        ]}
        onPress={onNext}
        disabled={!canContinue || isSaving}
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
    paddingTop: 28,
    paddingBottom: 16,
  },
  prompt: {
    fontSize: 30,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.95)',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  subtext: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  row: {
    flexDirection: 'row',
    marginBottom: 36,
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
  cardLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.9)',
    textAlign: 'center',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  cardLabelSelected: {
    color: '#4A5FEB',
  },
  continueBtn: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 28,
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
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});

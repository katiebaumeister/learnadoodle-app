import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { ONBOARDING_SKY, ONBOARDING_TEXT_PURPLE } from '../../lib/constants/onboardingTheme';

const WHO_OPTIONS = [
  { id: 'parent', label: 'My family (I\'m a parent)' },
  { id: 'student', label: 'Myself (I\'m a student)' },
];

export default function PlanningModeStep({ onNext, isSaving }) {
  const [who, setWho] = useState(null);
  const [ageLocationConfirmed, setAgeLocationConfirmed] = useState(false);
  const [hoveredWho, setHoveredWho] = useState(null);
  const [continueHovered, setContinueHovered] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnimsWho = useRef(WHO_OPTIONS.map(() => new Animated.Value(1))).current;

  // Reset age/location confirmation when role changes
  const handleSetWho = (id) => {
    setWho(id);
    setAgeLocationConfirmed(false);
  };

  // Fade in second row when "who" is selected
  useEffect(() => {
    if (who) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [who, fadeAnim]);

  // Scale effect on who selection
  useEffect(() => {
    WHO_OPTIONS.forEach((opt, i) => {
      Animated.timing(scaleAnimsWho[i], {
        toValue: who === opt.id ? 1.02 : 1,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [who]);

  const canContinue = who && ageLocationConfirmed;

  const ageLocationText =
    who === 'student'
      ? 'I confirm I am 13 years or older and in the U.S.'
      : who === 'parent'
        ? 'I confirm I am 18 years or older and in the U.S.'
        : null;

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>I'm using Learnadoodle for…</Text>

      {/* First row: Who */}
      <View style={styles.row}>
        {WHO_OPTIONS.map((opt, index) => {
          const selected = who === opt.id;
          const hovered = hoveredWho === opt.id;
          const cardStyle = [
            styles.card,
            selected && styles.cardSelected,
            hovered && !selected && styles.cardHovered,
            Platform.OS === 'web' && hovered && !selected && styles.cardHoveredTransform,
          ];
          return (
            <Animated.View
              key={opt.id}
              style={[styles.cardWrapper, { transform: [{ scale: scaleAnimsWho[index] }] }]}
            >
              <TouchableOpacity
                style={cardStyle}
                onPress={() => handleSetWho(opt.id)}
                onMouseEnter={Platform.OS === 'web' ? () => setHoveredWho(opt.id) : undefined}
                onMouseLeave={Platform.OS === 'web' ? () => setHoveredWho(null) : undefined}
                activeOpacity={1}
              >
                <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* Age/location confirmation (after role selected) */}
      {who && ageLocationText && (
        <Animated.View style={[styles.confirmRow, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAgeLocationConfirmed((c) => !c)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, ageLocationConfirmed && styles.checkboxChecked]}>
              {ageLocationConfirmed ? (
                <Text style={styles.checkboxCheck}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.confirmLabel}>{ageLocationText}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <TouchableOpacity
        style={[
          styles.continueBtn,
          !canContinue && styles.continueBtnDisabled,
          Platform.OS === 'web' && canContinue && continueHovered && styles.continueBtnHovered,
        ]}
        onPress={() => onNext(who)}
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
    color: ONBOARDING_TEXT_PURPLE,
    marginBottom: 36,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  row: {
    flexDirection: 'row',
    marginBottom: 28,
  },
  confirmRow: {
    marginBottom: 32,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: ONBOARDING_SKY,
    backgroundColor: ONBOARDING_SKY,
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmLabel: {
    flex: 1,
    fontSize: 16,
    color: ONBOARDING_TEXT_PURPLE,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
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
    borderColor: ONBOARDING_SKY,
    backgroundColor: '#F4F7FF',
    ...(Platform.OS === 'web' && {
      shadowColor: ONBOARDING_SKY,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    }),
  },
  cardLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: ONBOARDING_TEXT_PURPLE,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  cardLabelSelected: {
    color: ONBOARDING_TEXT_PURPLE,
  },
  continueBtn: {
    backgroundColor: ONBOARDING_SKY,
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

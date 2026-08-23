import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import PlannerSettingsContent from '../settings/PlannerSettingsContent';
import {
  ONBOARDING_SKY,
  ONBOARDING_TEXT_PRIMARY,
  ONBOARDING_CONTINUE_BTN,
  ONBOARDING_CONTINUE_BTN_TEXT,
  ONBOARDING_CONTINUE_BTN_DISABLED,
  ONBOARDING_CONTINUE_BTN_HOVERED,
} from '../../lib/constants/onboardingTheme';

export default function SchoolYearSetupStep({
  familyId,
  planningMode,
  onNext,
  isSaving = false,
}) {
  const saveActionsRef = useRef(null);
  const [continueHovered, setContinueHovered] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (isSaving || saving) return;
    setSaving(true);
    try {
      const save = saveActionsRef.current?.handleSave;
      if (typeof save === 'function') {
        const ok = await save();
        if (ok === false) return;
      }
      onNext?.();
    } finally {
      setSaving(false);
    }
  };

  const busy = isSaving || saving;

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>Set up your school year</Text>
      <Text style={styles.subtext}>
        Choose your term dates, learning days, and hours. You can change these anytime in School Year Settings.
      </Text>

      {familyId ? (
        <PlannerSettingsContent
          familyId={familyId}
          familyApproach={planningMode}
          onboardingStep
          hidePageTitle
          onOnboardingActionsReady={(actions) => {
            saveActionsRef.current = actions;
          }}
        />
      ) : null}

      <TouchableOpacity
        style={[
          styles.continueBtn,
          busy && styles.continueBtnDisabled,
          Platform.OS === 'web' && !busy && continueHovered && styles.continueBtnHovered,
        ]}
        onPress={handleContinue}
        disabled={busy || !familyId}
        onMouseEnter={Platform.OS === 'web' ? () => setContinueHovered(true) : undefined}
        onMouseLeave={Platform.OS === 'web' ? () => setContinueHovered(false) : undefined}
        activeOpacity={0.9}
      >
        <Text style={styles.continueBtnText}>
          {busy ? 'Finishing…' : 'Finish setup'}
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
    color: ONBOARDING_TEXT_PRIMARY,
    marginBottom: 12,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  subtext: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  continueBtn: {
    ...ONBOARDING_CONTINUE_BTN,
    backgroundColor: ONBOARDING_SKY,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  continueBtnDisabled: {
    ...ONBOARDING_CONTINUE_BTN_DISABLED,
  },
  continueBtnHovered: {
    backgroundColor: '#78BCEF',
  },
  continueBtnText: {
    ...ONBOARDING_CONTINUE_BTN_TEXT,
  },
});

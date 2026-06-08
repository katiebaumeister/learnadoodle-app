import React, { useCallback, useState } from 'react';
import { View, Text, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Check, ChevronDown } from 'lucide-react';
import { setOnboardingPlanningMode } from '../../lib/apiClient';
import { useToast } from '../Toast';
import { SettingsTypography } from './settingsDesignTokens';

export const FAMILY_APPROACH_OPTIONS = [
  { id: 'HOMESCHOOL_COMPLIANCE', label: 'Homeschool Compliance' },
  { id: 'AFTERSCHOOL_GOALS', label: 'Afterschool Goals' },
];

export default function FamilyApproachSelector({
  familyId,
  family,
  onFamilyUpdate,
  readOnly = false,
  description = 'Days vs hours, learning days, and breaks are saved per school year.',
}) {
  const toast = useToast();
  const [savingGoal, setSavingGoal] = useState(false);
  const [showGoalMenu, setShowGoalMenu] = useState(false);
  const currentGoalId = family?.default_planning_mode || null;
  const currentGoalLabel =
    FAMILY_APPROACH_OPTIONS.find((option) => option.id === currentGoalId)?.label || 'Not set';

  const handleGoalChange = useCallback(async (nextGoalId) => {
    if (!familyId || readOnly || nextGoalId === currentGoalId) {
      setShowGoalMenu(false);
      return;
    }
    setSavingGoal(true);
    try {
      const res = await setOnboardingPlanningMode({
        family_id: familyId,
        planning_mode: nextGoalId,
      });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to update approach');
      onFamilyUpdate?.({ ...(family || {}), default_planning_mode: nextGoalId });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshFamily'));
      }
      toast.push('Learning approach updated', 'success');
    } catch (err) {
      toast.push(err?.message || 'Could not update learning approach', 'error');
    } finally {
      setSavingGoal(false);
      setShowGoalMenu(false);
    }
  }, [currentGoalId, family, familyId, onFamilyUpdate, readOnly, toast]);

  return (
    <View style={[styles.card, showGoalMenu && styles.cardMenuOpen]}>
      <Text style={styles.labelCaps}>Family approach</Text>
      <Text style={styles.bodyText}>{description}</Text>
      <View style={styles.goalPickerWrap}>
        <TouchableOpacity
          style={styles.goalPicker}
          onPress={() => !readOnly && !savingGoal && setShowGoalMenu((prev) => !prev)}
          disabled={readOnly || savingGoal}
          {...(Platform.OS === 'web' && { cursor: readOnly ? 'default' : 'pointer' })}
        >
          {savingGoal ? (
            <ActivityIndicator size="small" color="#374151" />
          ) : (
            <>
              <Text style={styles.goalPickerText}>{currentGoalLabel}</Text>
              {!readOnly ? <ChevronDown size={16} color="#6B7280" /> : null}
            </>
          )}
        </TouchableOpacity>
        {showGoalMenu ? (
          <View style={styles.goalMenu}>
            {FAMILY_APPROACH_OPTIONS.map((option) => {
              const selected = option.id === currentGoalId;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={styles.goalMenuItem}
                  onPress={() => handleGoalChange(option.id)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={[styles.goalMenuItemText, selected && styles.goalMenuItemTextSelected]}>
                    {option.label}
                  </Text>
                  {selected ? <Check size={14} color="#111827" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = {
  card: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  cardMenuOpen: {
    zIndex: 20,
    ...(Platform.OS === 'web' && { position: 'relative' }),
  },
  labelCaps: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 8,
  },
  bodyText: {
    ...SettingsTypography.secondary,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  goalPickerWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    zIndex: 30,
  },
  goalPicker: {
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
  },
  goalPickerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  goalMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    minWidth: 240,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    zIndex: 100,
    elevation: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
    }),
  },
  goalMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goalMenuItemText: {
    fontSize: 14,
    color: '#374151',
  },
  goalMenuItemTextSelected: {
    fontWeight: '600',
    color: '#0F172A',
  },
};

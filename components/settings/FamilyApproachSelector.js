import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Platform, TouchableOpacity, ActivityIndicator, Switch } from 'react-native';
import { Check, ChevronDown } from 'lucide-react';
import { setOnboardingPlanningMode, saveFamilyFeatureSettings } from '../../lib/apiClient';
import {
  FAMILY_APPROACH_OPTIONS,
  FEATURE_TOGGLE_DEFS,
  APPROACH_DEFAULT_FEATURES,
  getPlanningModeLabel,
  resolveFeatureSettings,
} from '../../lib/planningMode';
import { dispatchPlanningModeChanged } from '../../lib/useFamilyPlanningMode';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import { SettingsTypography } from './settingsDesignTokens';

export { FAMILY_APPROACH_OPTIONS };

export default function FamilyApproachSelector({
  familyId,
  family,
  onFamilyUpdate,
  readOnly = false,
  fieldLabel = 'How your family uses Learnadoodle',
  onMenuOpenChange = null,
}) {
  const toast = useToast();
  const [savingGoal, setSavingGoal] = useState(false);
  const [showGoalMenu, setShowGoalMenu] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  // Confirmation dialog for approach change
  const [pendingApproachChange, setPendingApproachChange] = useState(null);

  const currentGoalId = family?.default_planning_mode || null;
  const currentGoalLabel = getPlanningModeLabel(currentGoalId);

  const featureSettings = useMemo(
    () => resolveFeatureSettings(currentGoalId, family?.feature_settings),
    [currentGoalId, family?.feature_settings]
  );

  const setMenuOpen = useCallback((nextOpen) => {
    setShowGoalMenu(nextOpen);
    onMenuOpenChange?.(nextOpen);
  }, [onMenuOpenChange]);

  const saveApproachOnly = useCallback(async (nextGoalId) => {
    setSavingGoal(true);
    try {
      const res = await setOnboardingPlanningMode({
        family_id: familyId,
        planning_mode: nextGoalId,
      });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to update approach');
      onFamilyUpdate?.({ ...(family || {}), default_planning_mode: nextGoalId });
      dispatchPlanningModeChanged(nextGoalId);
    } catch (err) {
      toast.push(err?.message || 'Could not update learning approach', 'error');
    } finally {
      setSavingGoal(false);
    }
  }, [family, familyId, onFamilyUpdate, toast]);

  const saveApproachWithDefaults = useCallback(async (nextGoalId) => {
    setSavingGoal(true);
    try {
      const defaults = APPROACH_DEFAULT_FEATURES[nextGoalId] || APPROACH_DEFAULT_FEATURES.AFTERSCHOOL_GOALS;
      const [modeRes, featRes] = await Promise.all([
        setOnboardingPlanningMode({ family_id: familyId, planning_mode: nextGoalId }),
        saveFamilyFeatureSettings(familyId, defaults),
      ]);
      if (modeRes?.error) throw new Error(modeRes.error?.message || 'Failed to update approach');
      if (featRes?.error) throw new Error(featRes.error?.message || 'Failed to update features');
      const updated = { ...(family || {}), default_planning_mode: nextGoalId, feature_settings: defaults };
      onFamilyUpdate?.(updated);
      dispatchPlanningModeChanged(nextGoalId);
    } catch (err) {
      toast.push(err?.message || 'Could not update settings', 'error');
    } finally {
      setSavingGoal(false);
    }
  }, [family, familyId, onFamilyUpdate, toast]);

  const handleGoalChange = useCallback((nextGoalId) => {
    if (!familyId || readOnly || nextGoalId === currentGoalId) {
      setMenuOpen(false);
      return;
    }
    setMenuOpen(false);
    setPendingApproachChange(nextGoalId);
  }, [currentGoalId, familyId, readOnly, setMenuOpen]);

  const handleToggleFeature = useCallback(async (key, newValue) => {
    if (!familyId || readOnly) return;
    const nextSettings = { ...featureSettings, [key]: newValue };
    setSavingFeatures(true);
    try {
      const res = await saveFamilyFeatureSettings(familyId, nextSettings);
      if (res?.error) throw new Error(res.error?.message || 'Failed to save');
      onFamilyUpdate?.({ ...(family || {}), feature_settings: nextSettings });
      dispatchPlanningModeChanged(currentGoalId);
    } catch (err) {
      toast.push(err?.message || 'Could not save feature settings', 'error');
    } finally {
      setSavingFeatures(false);
    }
  }, [familyId, readOnly, featureSettings, family, onFamilyUpdate, currentGoalId, toast]);

  const pendingLabel = pendingApproachChange ? getPlanningModeLabel(pendingApproachChange) : '';

  return (
    <View style={styles.container}>
      {/* Section 1: Family Approach */}
      <View style={[styles.fieldGroup, showGoalMenu && styles.fieldGroupMenuOpen]}>
        <Text style={styles.fieldLabel}>{fieldLabel}</Text>
        <View style={styles.goalPickerWrap}>
          <TouchableOpacity
            style={styles.goalPicker}
            onPress={() => !readOnly && !savingGoal && setMenuOpen(!showGoalMenu)}
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
        <Text style={styles.helperText}>This sets suggested defaults. You can customize features below.</Text>
      </View>

      {/* Section 2: Feature Toggles */}
      <View style={styles.featuresSection}>
        <Text style={styles.featuresSectionTitle}>Features</Text>
        <Text style={styles.featuresSectionHelper}>Choose which tools appear in your workspace.</Text>
        <View style={styles.togglesList}>
          {FEATURE_TOGGLE_DEFS.map((def) => {
            const isOn = featureSettings[def.key] ?? false;
            return (
              <View key={def.key} style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>{def.label}</Text>
                  <Text style={styles.toggleDescription}>{def.description}</Text>
                </View>
                <Switch
                  value={isOn}
                  onValueChange={(val) => handleToggleFeature(def.key, val)}
                  disabled={readOnly || savingFeatures}
                  trackColor={{ false: '#E2E8F0', true: '#9ECFFB' }}
                  thumbColor={isOn ? '#FFFFFF' : '#F4F4F5'}
                  {...(Platform.OS === 'web' && { activeThumbColor: '#FFFFFF' })}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* Confirmation dialog */}
      <ConfirmDialog
        visible={!!pendingApproachChange}
        title="Apply suggested setup?"
        message={`Switching to ${pendingLabel} can update your feature settings to match that style. Your existing subjects, assignments, materials, grades, attendance, and planner events will not be deleted.`}
        confirmLabel="Apply suggested settings"
        cancelLabel="Cancel"
        brandConfirm
        onConfirm={() => {
          const next = pendingApproachChange;
          setPendingApproachChange(null);
          saveApproachWithDefaults(next);
        }}
        onCancel={() => {
          const next = pendingApproachChange;
          setPendingApproachChange(null);
          saveApproachOnly(next);
        }}
      />
    </View>
  );
}

const styles = {
  container: {
    gap: 28,
  },
  fieldGroup: {
    position: 'relative',
    marginBottom: 0,
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  fieldGroupMenuOpen: {
    zIndex: 80,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  fieldLabel: {
    ...SettingsTypography.label,
    color: '#111827',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  goalPickerWrap: {
    position: 'relative',
    alignSelf: 'stretch',
    zIndex: 30,
  },
  goalPicker: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#f9fafb',
  },
  goalPickerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  goalMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
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
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goalMenuItemText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  goalMenuItemTextSelected: {
    fontWeight: '600',
    color: '#0F172A',
  },
  featuresSection: {
    paddingTop: 4,
  },
  featuresSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuresSectionHelper: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  togglesList: {
    gap: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  toggleDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
};

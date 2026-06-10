import React, { useCallback, useState } from 'react';
import { View, Text, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Check, ChevronDown } from 'lucide-react';
import { setOnboardingPlanningMode } from '../../lib/apiClient';
import { useToast } from '../Toast';
import { SettingsTypography } from './settingsDesignTokens';

export const FAMILY_APPROACH_OPTIONS = [
  {
    id: 'HOMESCHOOL_COMPLIANCE',
    label: 'Homeschooling',
    summary: 'Subject-focused learning management for families who homeschool as their primary education.',
  },
  {
    id: 'AFTERSCHOOL_GOALS',
    label: 'Afterschooling',
    summary: 'Schedule-first setup for families who mainly want help optimizing routines outside the school day.',
  },
];

const APPROACH_COMPARISON_INTRO =
  'Choose how Learnadoodle is shaped for your family.';

const APPROACH_COMPARISON_DETAILS = [
  {
    id: 'HOMESCHOOL_COMPLIANCE',
    title: 'Homeschooling',
    body:
      'Built for families who homeschool as their primary education. Learnadoodle centers on subjects, curriculum, attendance, and progress tracking—so you can manage learning day to day and stay organized.',
  },
  {
    id: 'AFTERSCHOOL_GOALS',
    title: 'Afterschooling',
    body:
      'Built for families whose children learn elsewhere during the day. Learnadoodle is less subject-focused and emphasizes schedule optimization—activities, routines, and family time—rather than full learning management.',
  },
];

export default function FamilyApproachSelector({
  familyId,
  family,
  onFamilyUpdate,
  readOnly = false,
  description = null,
  fieldLabel = 'Family approach',
  onMenuOpenChange = null,
}) {
  const toast = useToast();
  const [savingGoal, setSavingGoal] = useState(false);
  const [showGoalMenu, setShowGoalMenu] = useState(false);
  const currentGoalId = family?.default_planning_mode || null;
  const currentGoalLabel =
    FAMILY_APPROACH_OPTIONS.find((option) => option.id === currentGoalId)?.label || 'Not set';

  const setMenuOpen = useCallback((nextOpen) => {
    setShowGoalMenu(nextOpen);
    onMenuOpenChange?.(nextOpen);
  }, [onMenuOpenChange]);

  const handleGoalChange = useCallback(async (nextGoalId) => {
    if (!familyId || readOnly || nextGoalId === currentGoalId) {
      setMenuOpen(false);
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
      setMenuOpen(false);
    }
  }, [currentGoalId, family, familyId, onFamilyUpdate, readOnly, setMenuOpen, toast]);

  return (
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
                  <View style={styles.goalMenuItemContent}>
                    <Text style={[styles.goalMenuItemText, selected && styles.goalMenuItemTextSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.goalMenuItemSummary}>{option.summary}</Text>
                  </View>
                  {selected ? <Check size={14} color="#111827" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
      <View style={styles.fieldHintBlock}>
        <Text style={styles.fieldHint}>{description || APPROACH_COMPARISON_INTRO}</Text>
        {APPROACH_COMPARISON_DETAILS.map((item) => (
          <Text key={item.id} style={styles.approachDetail}>
            <Text style={styles.approachDetailTitle}>{item.title} — </Text>
            {item.body}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = {
  fieldGroup: {
    position: 'relative',
    marginBottom: 0,
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  fieldGroupMenuOpen: {
    zIndex: 80,
    ...(Platform.OS === 'web' && {
      isolation: 'isolate',
    }),
  },
  fieldLabel: {
    ...SettingsTypography.label,
    color: '#111827',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldHintBlock: {
    marginTop: 12,
    gap: 10,
  },
  fieldHint: {
    ...SettingsTypography.secondary,
    color: '#6b7280',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  approachDetail: {
    ...SettingsTypography.secondary,
    color: '#6b7280',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  approachDetailTitle: {
    fontWeight: '600',
    color: '#374151',
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goalMenuItemContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  goalMenuItemText: {
    fontSize: 14,
    color: '#374151',
  },
  goalMenuItemSummary: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  goalMenuItemTextSelected: {
    fontWeight: '600',
    color: '#0F172A',
  },
};

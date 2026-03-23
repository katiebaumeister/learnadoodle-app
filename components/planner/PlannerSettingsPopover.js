/**
 * Mini Planning Preferences popover - attached to Settings button in planner toolbar.
 * Key settings: Learning Goals, Target, Public holidays. Links to full settings for holidays & breaks.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { X, Plus, ChevronRight } from 'lucide-react';
import {
  getPlanDefaultsFromSettings,
  saveFamilyPlannerSettings,
} from '../../lib/services/plannerSettingsClient';
import { useToast } from '../Toast';

const MUTED = 'rgba(15,23,42,0.6)';
const FG = 'rgba(15,23,42,0.9)';
const ACCENT = '#3b82f6';
const BORDER = '#E2E8F0';

const chip = (active) => ({
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: active ? ACCENT : BORDER,
  backgroundColor: active ? '#eff6ff' : '#fff',
  ...(Platform.OS === 'web' && { cursor: 'pointer' }),
});
const chipText = (active) => ({ fontSize: 13, fontWeight: '500', color: active ? ACCENT : MUTED });

export default function PlannerSettingsPopover({
  visible,
  onClose,
  position,
  familyId,
  initialData,
  onOpenFullSettings,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [targetScope, setTargetScope] = useState('overall');
  const [goalMode, setGoalMode] = useState('none');
  const [targetDays, setTargetDays] = useState('180');
  const [targetHours, setTargetHours] = useState('1000');
  const [hoursPerDay, setHoursPerDay] = useState('5');
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);

  const loadDefaults = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { settings: s, error } = await getPlanDefaultsFromSettings(familyId);
      if (error) throw error;
      if (s) {
        setTargetScope(s.target_scope || 'overall');
        setGoalMode(s.default_constraint_mode || 'none');
        setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
        setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
        setHoursPerDay(s.default_planned_hours_per_day != null ? String(s.default_planned_hours_per_day) : '5');
        setFollowGlobalHolidays(s.follow_public_holidays !== false);
      }
    } catch (err) {
      toast?.push?.(err?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [familyId, toast]);

  useEffect(() => {
    if (initialData?.settings) {
      const s = initialData.settings;
      setTargetScope(s.target_scope || 'overall');
      setGoalMode(s.default_constraint_mode || 'none');
      setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
      setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
      setHoursPerDay(s.default_planned_hours_per_day != null ? String(s.default_planned_hours_per_day) : '5');
      setFollowGlobalHolidays(s.follow_public_holidays !== false);
      setLoading(false);
    } else if (visible && familyId) {
      loadDefaults();
    }
  }, [initialData, visible, familyId, loadDefaults]);

  const persist = useCallback(
    async (updates) => {
      if (!familyId) return;
      setSaving(true);
      try {
        const payload = {
          target_scope: targetScope,
          default_constraint_mode: goalMode,
          default_target_days: goalMode === 'days' ? parseInt(targetDays, 10) : null,
          default_target_hours: goalMode === 'hours' ? parseInt(targetHours, 10) : null,
          default_planned_hours_per_day: goalMode === 'hours' ? parseFloat(hoursPerDay) : null,
          follow_public_holidays: followGlobalHolidays,
          holiday_country: 'US',
          holiday_region: null,
          ...updates,
        };
        const { error } = await saveFamilyPlannerSettings(familyId, payload);
        if (error) throw error;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        }
      } catch (err) {
        toast?.push?.(err?.message || 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
    },
    [familyId, targetScope, goalMode, targetDays, targetHours, hoursPerDay, followGlobalHolidays, toast]
  );

  const handleTargetScopeChange = async (scope) => {
    setTargetScope(scope);
    const { error } = await saveFamilyPlannerSettings(familyId, { target_scope: scope });
    if (error) toast?.push?.(error?.message || 'Failed to save', 'error');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
    }
  };

  const handleGoalChange = (mode) => {
    setGoalMode(mode);
    setTimeout(() => persist({ default_constraint_mode: mode }), 200);
  };

  const handleFollowChange = () => {
    const next = !followGlobalHolidays;
    setFollowGlobalHolidays(next);
    setTimeout(() => persist({ follow_public_holidays: next }), 200);
  };

  const handleOpenFull = () => {
    onClose();
    onOpenFullSettings?.();
  };

  if (!visible) return null;

  const sectionStyle = {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  };

  return (
    <View
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: 320,
        maxHeight: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        zIndex: 1001,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(15,23,42,0.06)',
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: FG,
            fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          Planning Preferences
        </Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <X size={20} color={MUTED} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={ACCENT} />
        </View>
      ) : (
        <ScrollView
          style={{ maxHeight: 360 }}
          showsVerticalScrollIndicator
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {/* Learning Goals */}
          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Learning Goals</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity style={chip(targetScope === 'overall')} onPress={() => handleTargetScopeChange('overall')}>
                <Text style={chipText(targetScope === 'overall')}>Overall</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chip(targetScope === 'per_subject')} onPress={() => handleTargetScopeChange('per_subject')}>
                <Text style={chipText(targetScope === 'per_subject')}>Per subject</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Target (only when Overall) */}
          {targetScope === 'overall' && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Target</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity style={chip(goalMode === 'none')} onPress={() => handleGoalChange('none')}>
                  <Text style={chipText(goalMode === 'none')}>None</Text>
                </TouchableOpacity>
                <TouchableOpacity style={chip(goalMode === 'days')} onPress={() => handleGoalChange('days')}>
                  <Text style={chipText(goalMode === 'days')}>Days</Text>
                </TouchableOpacity>
                <TouchableOpacity style={chip(goalMode === 'hours')} onPress={() => handleGoalChange('hours')}>
                  <Text style={chipText(goalMode === 'hours')}>Hours</Text>
                </TouchableOpacity>
                {goalMode === 'days' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      value={targetDays}
                      onChangeText={(v) => {
                        setTargetDays(v);
                        setTimeout(() => persist({ default_target_days: parseInt(v, 10) || null }), 400);
                      }}
                      keyboardType="number-pad"
                      style={{
                        width: 48,
                        borderWidth: 1,
                        borderColor: BORDER,
                        borderRadius: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        fontSize: 13,
                        color: FG,
                      }}
                      placeholder="180"
                      placeholderTextColor={MUTED}
                    />
                    <Text style={{ fontSize: 12, color: MUTED }}>days</Text>
                  </View>
                )}
                {goalMode === 'hours' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      value={targetHours}
                      onChangeText={(v) => {
                        setTargetHours(v);
                        setTimeout(() => persist({ default_target_hours: parseInt(v, 10) || null }), 400);
                      }}
                      keyboardType="number-pad"
                      style={{
                        width: 56,
                        borderWidth: 1,
                        borderColor: BORDER,
                        borderRadius: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        fontSize: 13,
                        color: FG,
                      }}
                      placeholder="1000"
                      placeholderTextColor={MUTED}
                    />
                    <Text style={{ fontSize: 12, color: MUTED }}>h</Text>
                    <TextInput
                      value={hoursPerDay}
                      onChangeText={(v) => {
                        setHoursPerDay(v);
                        setTimeout(() => persist({ default_planned_hours_per_day: parseFloat(v) || null }), 400);
                      }}
                      keyboardType="decimal-pad"
                      style={{
                        width: 40,
                        borderWidth: 1,
                        borderColor: BORDER,
                        borderRadius: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        fontSize: 13,
                        color: FG,
                      }}
                      placeholder="5"
                      placeholderTextColor={MUTED}
                    />
                    <Text style={{ fontSize: 12, color: MUTED }}>/day</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {targetScope === 'per_subject' && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 12, color: MUTED }}>Configure per-subject targets in full settings.</Text>
            </View>
          )}

          {/* Public holidays */}
          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Public holidays</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: followGlobalHolidays ? '#0D9488' : BORDER,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
                onPress={handleFollowChange}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#fff',
                    transform: [{ translateX: followGlobalHolidays ? 20 : 0 }],
                  }}
                />
              </TouchableOpacity>
              <Text style={{ fontSize: 13, color: MUTED }}>Follow U.S. public holidays</Text>
            </View>
          </View>

          {/* Custom holidays & Breaks - link to full */}
          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Custom holidays</Text>
            <TouchableOpacity
              onPress={handleOpenFull}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color={ACCENT} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: ACCENT }}>Add holiday</Text>
            </TouchableOpacity>
          </View>

          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Breaks</Text>
            <TouchableOpacity
              onPress={handleOpenFull}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color={ACCENT} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: ACCENT }}>Add break</Text>
            </TouchableOpacity>
          </View>

          {/* Open full settings */}
          <View style={{ paddingVertical: 12, paddingBottom: 16 }}>
            <TouchableOpacity
              onPress={handleOpenFull}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: ACCENT }}>Open full settings</Text>
              <ChevronRight size={18} color={ACCENT} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

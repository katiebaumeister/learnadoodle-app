/**
 * Planning Preferences popover - planner toolbar. Same data path as Family → Planning Preferences.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { X, Plus, ChevronRight, Trash2, Pencil, Check } from 'lucide-react';
import {
  getPlanDefaultsFromSettings,
  saveFamilyPlannerSettings,
  mapPlannerExclusionsToHolidayBreakUi,
  syncFamilyHolidayBreakExclusions,
} from '../../lib/services/plannerSettingsClient';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { PLANNING_PREFERENCES_UI } from './planningPreferencesUiCopy';
import { PlannerPreferenceDateField } from '../ui/AppCalendarDatePickerModal';

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
const chipText = (active) => ({ fontSize: 12, fontWeight: '500', color: active ? ACCENT : MUTED });

const inputStyle = {
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 8,
  paddingVertical: 6,
  paddingHorizontal: 8,
  fontSize: 12,
  color: FG,
};

function dispatchPlanRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
  window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
}

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
  const [exclusionBusy, setExclusionBusy] = useState(false);
  const [targetScope, setTargetScope] = useState('overall');
  const [goalMode, setGoalMode] = useState('none');
  const [targetDays, setTargetDays] = useState('180');
  const [targetHours, setTargetHours] = useState('1000');
  const [hoursPerDay, setHoursPerDay] = useState('5');
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);

  const [customHolidays, setCustomHolidays] = useState([]);
  const [customBreaks, setCustomBreaks] = useState([]);
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [addingBreak, setAddingBreak] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newBreakStart, setNewBreakStart] = useState('');
  const [newBreakEnd, setNewBreakEnd] = useState('');
  const [newBreakName, setNewBreakName] = useState('');
  const [editingHolidayIndex, setEditingHolidayIndex] = useState(null);
  const [editingHolidayDraft, setEditingHolidayDraft] = useState({ date: '', name: '' });
  const [editingBreakIndex, setEditingBreakIndex] = useState(null);
  const [editingBreakDraft, setEditingBreakDraft] = useState({ start: '', end: '', name: '' });

  const [subjects, setSubjects] = useState([]);
  const [subjectTargets, setSubjectTargets] = useState({});

  const exclusionStateRef = useRef({ customHolidays: [], customBreaks: [] });
  const exclusionSyncTimerRef = useRef(null);
  const subjectTargetSaveTimeoutRef = useRef(null);

  useEffect(() => {
    exclusionStateRef.current = { customHolidays, customBreaks };
  }, [customHolidays, customBreaks]);

  const runExclusionSyncSoon = useCallback(
    (nextH, nextB) => {
      exclusionStateRef.current = { customHolidays: nextH, customBreaks: nextB };
      if (exclusionSyncTimerRef.current) clearTimeout(exclusionSyncTimerRef.current);
      exclusionSyncTimerRef.current = setTimeout(async () => {
        if (!familyId) return;
        const { customHolidays: h, customBreaks: b } = exclusionStateRef.current;
        setExclusionBusy(true);
        try {
          const { error } = await syncFamilyHolidayBreakExclusions(familyId, h, b);
          if (error) throw error;
          const { exclusions: ex } = await getPlanDefaultsFromSettings(familyId);
          const mapped = mapPlannerExclusionsToHolidayBreakUi(ex || []);
          setCustomHolidays(mapped.customHolidays);
          setCustomBreaks(mapped.customBreaks);
          dispatchPlanRefresh();
        } catch (err) {
          toast?.push?.(err?.message || 'Failed to save', 'error');
        } finally {
          setExclusionBusy(false);
        }
      }, 320);
    },
    [familyId, toast]
  );

  const applySettingsPayload = useCallback((s) => {
    if (!s) return;
    setTargetScope(s.target_scope || 'overall');
    setGoalMode(s.default_constraint_mode || 'none');
    setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
    setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
    setHoursPerDay(s.default_planned_hours_per_day != null ? String(s.default_planned_hours_per_day) : '5');
    setFollowGlobalHolidays(s.follow_public_holidays !== false);
  }, []);

  const applySubjectsFromRows = useCallback((subjectsData) => {
    const list = subjectsData || [];
    setSubjects(list);
    const st = {};
    list.forEach((s) => {
      const mode =
        s.default_constraint_mode ||
        (s.default_target_days != null ? 'days' : s.default_target_hours != null ? 'hours' : 'none');
      st[s.id] = {
        mode,
        days: s.default_target_days != null ? String(s.default_target_days) : '',
        hours: s.default_target_hours != null ? String(s.default_target_hours) : '',
      };
    });
    setSubjectTargets(st);
  }, []);

  const loadAll = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { settings: s, exclusions: ex, error } = await getPlanDefaultsFromSettings(familyId);
      if (error) throw error;
      applySettingsPayload(s);
      const mapped = mapPlannerExclusionsToHolidayBreakUi(ex || []);
      setCustomHolidays(mapped.customHolidays);
      setCustomBreaks(mapped.customBreaks);

      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      applySubjectsFromRows(subjectsData || []);
    } catch (err) {
      toast?.push?.(err?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [familyId, toast, applySettingsPayload, applySubjectsFromRows]);

  useEffect(() => {
    if (initialData?.settings) {
      applySettingsPayload(initialData.settings);
      const mapped = mapPlannerExclusionsToHolidayBreakUi(initialData.exclusions || []);
      setCustomHolidays(mapped.customHolidays);
      setCustomBreaks(mapped.customBreaks);
      applySubjectsFromRows(initialData.subjects);
      setLoading(false);
    } else if (visible && familyId) {
      loadAll();
    }
  }, [initialData, visible, familyId, loadAll, applySettingsPayload, applySubjectsFromRows]);

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
        dispatchPlanRefresh();
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
    else dispatchPlanRefresh();
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

  const handleSubjectTargetChange = useCallback(
    (subjectId, merged) => {
      setSubjectTargets((prev) => ({ ...prev, [subjectId]: merged }));
      if (subjectTargetSaveTimeoutRef.current) clearTimeout(subjectTargetSaveTimeoutRef.current);
      subjectTargetSaveTimeoutRef.current = setTimeout(async () => {
        const mode = merged.mode || 'none';
        const days = mode === 'days' && merged.days?.trim() ? parseInt(merged.days, 10) : null;
        const hours = mode === 'hours' && merged.hours?.trim() ? parseFloat(merged.hours) : null;
        try {
          const { error } = await supabase
            .from('subject')
            .update({
              default_constraint_mode: mode,
              default_target_days: days,
              default_target_hours: hours,
            })
            .eq('id', subjectId);
          if (error) throw error;
          dispatchPlanRefresh();
        } catch (err) {
          toast?.push?.(err?.message || 'Failed to save', 'error');
        }
      }, 400);
    },
    [toast]
  );

  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      toast?.push?.('Enter date and name.', 'error');
      return;
    }
    const nextH = [...customHolidays, { date: newHolidayDate, name: newHolidayName.trim() }];
    setCustomHolidays(nextH);
    setNewHolidayDate('');
    setNewHolidayName('');
    setAddingHoliday(false);
    runExclusionSyncSoon(nextH, customBreaks);
  };

  const removeHoliday = (index) => {
    const nextH = customHolidays.filter((_, i) => i !== index);
    setCustomHolidays(nextH);
    runExclusionSyncSoon(nextH, customBreaks);
  };

  const startEditHoliday = (index) => {
    setEditingHolidayIndex(index);
    setEditingHolidayDraft({ date: customHolidays[index].date, name: customHolidays[index].name });
  };
  const cancelEditHoliday = () => {
    setEditingHolidayIndex(null);
    setEditingHolidayDraft({ date: '', name: '' });
  };
  const saveEditHoliday = (index) => {
    const { date, name } = editingHolidayDraft;
    const next = [...customHolidays];
    next[index] = { ...next[index], date, name };
    setCustomHolidays(next);
    setEditingHolidayIndex(null);
    setEditingHolidayDraft({ date: '', name: '' });
    runExclusionSyncSoon(next, customBreaks);
  };

  const addBreak = () => {
    if (!newBreakStart || !newBreakEnd || !newBreakName.trim()) {
      toast?.push?.('Enter start, end, and name.', 'error');
      return;
    }
    if (newBreakStart > newBreakEnd) {
      toast?.push?.('End date must be on or after start.', 'error');
      return;
    }
    const nextB = [...customBreaks, { start: newBreakStart, end: newBreakEnd, name: newBreakName.trim() }];
    setCustomBreaks(nextB);
    setNewBreakStart('');
    setNewBreakEnd('');
    setNewBreakName('');
    setAddingBreak(false);
    runExclusionSyncSoon(customHolidays, nextB);
  };

  const removeBreak = (index) => {
    const nextB = customBreaks.filter((_, i) => i !== index);
    setCustomBreaks(nextB);
    runExclusionSyncSoon(customHolidays, nextB);
  };

  const startEditBreak = (index) => {
    setEditingBreakIndex(index);
    setEditingBreakDraft({
      start: customBreaks[index].start,
      end: customBreaks[index].end,
      name: customBreaks[index].name,
    });
  };
  const cancelEditBreak = () => {
    setEditingBreakIndex(null);
    setEditingBreakDraft({ start: '', end: '', name: '' });
  };
  const saveEditBreak = (index) => {
    const { start, end, name } = editingBreakDraft;
    const next = [...customBreaks];
    next[index] = { ...next[index], start, end, name };
    setCustomBreaks(next);
    setEditingBreakIndex(null);
    setEditingBreakDraft({ start: '', end: '', name: '' });
    runExclusionSyncSoon(customHolidays, next);
  };

  const handleOpenFull = () => {
    onClose();
    onOpenFullSettings?.();
  };

  if (!visible) return null;

  const sectionStyle = {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  };

  return (
    <View
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: 340,
        maxHeight: 480,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        zIndex: 1001,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
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
        <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          {(saving || exclusionBusy) && (
            <Text style={{ fontSize: 11, color: MUTED, paddingTop: 8 }}>Saving…</Text>
          )}

          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Learning Goals</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity style={chip(targetScope === 'overall')} onPress={() => handleTargetScopeChange('overall')}>
                <Text style={chipText(targetScope === 'overall')}>Overall</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chip(targetScope === 'per_subject')} onPress={() => handleTargetScopeChange('per_subject')}>
                <Text style={chipText(targetScope === 'per_subject')}>Per subject</Text>
              </TouchableOpacity>
            </View>
          </View>

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
                      style={{ ...inputStyle, width: 48 }}
                      placeholder="180"
                      placeholderTextColor={MUTED}
                    />
                    <Text style={{ fontSize: 11, color: MUTED }}>days</Text>
                  </View>
                )}
                {goalMode === 'hours' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <TextInput
                      value={targetHours}
                      onChangeText={(v) => {
                        setTargetHours(v);
                        setTimeout(() => persist({ default_target_hours: parseInt(v, 10) || null }), 400);
                      }}
                      keyboardType="number-pad"
                      style={{ ...inputStyle, width: 52 }}
                      placeholder="1000"
                      placeholderTextColor={MUTED}
                    />
                    <Text style={{ fontSize: 11, color: MUTED }}>h</Text>
                    <TextInput
                      value={hoursPerDay}
                      onChangeText={(v) => {
                        setHoursPerDay(v);
                        setTimeout(() => persist({ default_planned_hours_per_day: parseFloat(v) || null }), 400);
                      }}
                      keyboardType="decimal-pad"
                      style={{ ...inputStyle, width: 40 }}
                      placeholder="5"
                      placeholderTextColor={MUTED}
                    />
                    <Text style={{ fontSize: 11, color: MUTED }}>/day</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {targetScope === 'per_subject' && (
            <View style={sectionStyle}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>Subject targets</Text>
              {subjects.length === 0 ? (
                <Text style={{ fontSize: 12, color: MUTED }}>Add subjects under Subjects to set per-subject targets.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {subjects.map((subj) => {
                    const t = subjectTargets[subj.id] || { mode: 'none', days: '', hours: '' };
                    return (
                      <View key={subj.id} style={{ gap: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: FG }} numberOfLines={2}>
                          {subj.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <TouchableOpacity style={chip(t.mode === 'none')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'none' })}>
                            <Text style={chipText(t.mode === 'none')}>None</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={chip(t.mode === 'days')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'days' })}>
                            <Text style={chipText(t.mode === 'days')}>Days</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={chip(t.mode === 'hours')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'hours' })}>
                            <Text style={chipText(t.mode === 'hours')}>Hours</Text>
                          </TouchableOpacity>
                          {t.mode === 'days' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <TextInput
                                value={t.days}
                                onChangeText={(v) => handleSubjectTargetChange(subj.id, { ...t, days: v })}
                                keyboardType="number-pad"
                                style={{ ...inputStyle, width: 48 }}
                                placeholder="90"
                                placeholderTextColor={MUTED}
                              />
                              <Text style={{ fontSize: 11, color: MUTED }}>d</Text>
                            </View>
                          )}
                          {t.mode === 'hours' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <TextInput
                                value={t.hours}
                                onChangeText={(v) => handleSubjectTargetChange(subj.id, { ...t, hours: v })}
                                keyboardType="decimal-pad"
                                style={{ ...inputStyle, width: 52 }}
                                placeholder="120"
                                placeholderTextColor={MUTED}
                              />
                              <Text style={{ fontSize: 11, color: MUTED }}>h</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

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
              <Text style={{ fontSize: 12, color: MUTED, flex: 1 }}>Follow U.S. public holidays</Text>
            </View>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 16 }}>
              To choose which federal dates count, use full settings (below).
            </Text>
          </View>

          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>{PLANNING_PREFERENCES_UI.customDaysSectionTitle}</Text>
            <View style={{ gap: 6 }}>
              {customHolidays.map((h, i) => (
                <View key={h.id || `h-${i}`}>
                  {editingHolidayIndex === i ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <PlannerPreferenceDateField
                        value={editingHolidayDraft.date}
                        onChange={(v) => setEditingHolidayDraft((d) => ({ ...d, date: v }))}
                        placeholder="Select date"
                        borderColor={BORDER}
                        textColor={FG}
                        mutedColor={MUTED}
                        style={inputStyle}
                        width={108}
                      />
                      <TextInput
                        value={editingHolidayDraft.name}
                        onChangeText={(v) => setEditingHolidayDraft((d) => ({ ...d, name: v }))}
                        placeholder="Name"
                        style={{ ...inputStyle, flex: 1, minWidth: 80 }}
                        placeholderTextColor={MUTED}
                      />
                      <TouchableOpacity onPress={() => saveEditHoliday(i)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Check size={16} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditHoliday} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <X size={16} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: FG, flex: 1 }} numberOfLines={2}>
                        {h.date} — {h.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <TouchableOpacity onPress={() => startEditHoliday(i)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={14} color={MUTED} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeHoliday(i)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
              {addingHoliday ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <PlannerPreferenceDateField
                    value={newHolidayDate}
                    onChange={setNewHolidayDate}
                    placeholder="Select date"
                    borderColor={BORDER}
                    textColor={FG}
                    mutedColor={MUTED}
                    style={inputStyle}
                    width={108}
                  />
                  <TextInput
                    value={newHolidayName}
                    onChangeText={setNewHolidayName}
                    placeholder={PLANNING_PREFERENCES_UI.dayNamePlaceholder}
                    style={{ ...inputStyle, flex: 1, minWidth: 90 }}
                    placeholderTextColor={MUTED}
                  />
                  <TouchableOpacity onPress={addHoliday} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Check size={18} color={ACCENT} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setAddingHoliday(false);
                      setNewHolidayDate('');
                      setNewHolidayName('');
                    }}
                    style={{ padding: 6 }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={18} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingHoliday(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color={ACCENT} />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: ACCENT }}>{PLANNING_PREFERENCES_UI.addDay}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={sectionStyle}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>{PLANNING_PREFERENCES_UI.rangesSectionTitle}</Text>
            <View style={{ gap: 6 }}>
              {customBreaks.map((b, i) => (
                <View key={b.id || `b-${i}`}>
                  {editingBreakIndex === i ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <PlannerPreferenceDateField
                        value={editingBreakDraft.start}
                        onChange={(v) => setEditingBreakDraft((d) => ({ ...d, start: v }))}
                        placeholder="Start"
                        borderColor={BORDER}
                        textColor={FG}
                        mutedColor={MUTED}
                        style={inputStyle}
                        width={96}
                      />
                      <PlannerPreferenceDateField
                        value={editingBreakDraft.end}
                        onChange={(v) => setEditingBreakDraft((d) => ({ ...d, end: v }))}
                        placeholder="End"
                        borderColor={BORDER}
                        textColor={FG}
                        mutedColor={MUTED}
                        style={inputStyle}
                        width={96}
                      />
                      <TextInput
                        value={editingBreakDraft.name}
                        onChangeText={(v) => setEditingBreakDraft((d) => ({ ...d, name: v }))}
                        placeholder="Name"
                        style={{ ...inputStyle, flex: 1, minWidth: 70 }}
                        placeholderTextColor={MUTED}
                      />
                      <TouchableOpacity onPress={() => saveEditBreak(i)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Check size={16} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditBreak} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <X size={16} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: FG, flex: 1 }} numberOfLines={2}>
                        {b.start}–{b.end} {b.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <TouchableOpacity onPress={() => startEditBreak(i)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={14} color={MUTED} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeBreak(i)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
              {addingBreak ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <PlannerPreferenceDateField
                    value={newBreakStart}
                    onChange={setNewBreakStart}
                    placeholder="Start"
                    borderColor={BORDER}
                    textColor={FG}
                    mutedColor={MUTED}
                    style={inputStyle}
                    width={96}
                  />
                  <PlannerPreferenceDateField
                    value={newBreakEnd}
                    onChange={setNewBreakEnd}
                    placeholder="End"
                    borderColor={BORDER}
                    textColor={FG}
                    mutedColor={MUTED}
                    style={inputStyle}
                    width={96}
                  />
                  <TextInput
                    value={newBreakName}
                    onChangeText={setNewBreakName}
                    placeholder={PLANNING_PREFERENCES_UI.rangeNamePlaceholder}
                    style={{ ...inputStyle, flex: 1, minWidth: 70 }}
                    placeholderTextColor={MUTED}
                  />
                  <TouchableOpacity onPress={addBreak} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Check size={18} color={ACCENT} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setAddingBreak(false);
                      setNewBreakStart('');
                      setNewBreakEnd('');
                      setNewBreakName('');
                    }}
                    style={{ padding: 6 }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={18} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingBreak(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color={ACCENT} />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: ACCENT }}>{PLANNING_PREFERENCES_UI.addRange}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={{ paddingVertical: 12 }}>
            <TouchableOpacity
              onPress={handleOpenFull}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: ACCENT }}>Open full Planning Preferences</Text>
              <ChevronRight size={18} color={ACCENT} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

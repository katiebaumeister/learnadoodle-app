/**
 * Planning Preferences - Family default targets, public holidays, custom days, and ranges.
 * Not tied to any plan. These defaults are used when creating/editing a plan year.
 * Flat layout: static sections, no accordions, Profile-style rhythm.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import {
  getFamilyPlannerSettings,
  saveFamilyPlannerSettings,
  getPlanDefaultsFromSettings,
  syncFamilyHolidayBreakExclusions,
  deleteExclusion,
  saveExcludedPublicHolidayDates,
} from '../../lib/services/plannerSettingsClient';
import { getPublicHolidaysForRange } from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { PLANNING_PREFERENCES_UI } from '../planner/planningPreferencesUiCopy';
import { PlannerPreferenceDateField } from '../ui/AppCalendarDatePickerModal';
import { LEARNADOODLE_LIGHT_BLUE } from '../../theme/comingSoonModalTheme';
import { designTokens } from '../../theme/designTokens';

const MUTED = 'rgba(15,23,42,0.6)';
/** Body copy on this screen — solid black per design */
const TEXT_BLACK = '#000000';
/** Brand pastel blue (FAB, coming-soon CTAs) — borders, fills, toggles on this page */
const ACCENT = LEARNADOODLE_LIGHT_BLUE;
const BORDER = '#E2E8F0';
/** Selected chips — planner violet border/text + soft lavender fill */
const CHIP_SELECTED_BORDER = designTokens.colors.primary;
const CHIP_SELECTED_BG = designTokens.softAccents.core;

const parsePositiveIntOrNull = (value) => {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parsePositiveFloatOrNull = (value) => {
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normalizeTargetMode = (mode) => (typeof mode === 'string' ? mode.toLowerCase() : '');

const deriveSubjectTargetState = (subjectsList) => {
  const st = {};
  let firstActiveTarget = null;
  (subjectsList || []).forEach((subj) => {
    const modeRaw = normalizeTargetMode(subj.default_constraint_mode);
    const daysNum = parsePositiveIntOrNull(subj.default_target_days);
    const hoursNum = parsePositiveFloatOrNull(subj.default_target_hours);
    let mode = 'none';
    let days = '';
    let hours = '';

    if (modeRaw === 'days' && daysNum != null) {
      mode = 'days';
      days = String(daysNum);
    } else if (modeRaw === 'hours' && hoursNum != null) {
      mode = 'hours';
      hours = String(hoursNum);
    }

    if (!firstActiveTarget && (mode === 'days' || mode === 'hours')) {
      firstActiveTarget = { mode, days, hours };
    }

    st[subj.id] = { mode, days, hours };
  });
  return { subjectTargetsMap: st, firstActiveTarget };
};

export default function PlannerSettingsContent({ familyId, onSave, initialData, readOnly = false }) {
  const toast = useToast();
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeoutRef = useRef(null);
  const subjectTargetSaveTimeoutRef = useRef(null);
  const stateRef = useRef({});

  // Target scope: overall (one target) vs per_subject
  const [targetScope, setTargetScope] = useState('overall');

  // Learning goals (overall mode only)
  const [goalMode, setGoalMode] = useState('none');
  const [targetDays, setTargetDays] = useState('180');
  const [targetHours, setTargetHours] = useState('1000');
  const [hoursPerDay, setHoursPerDay] = useState('5');

  // Public holidays
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);
  const [excludedPublicHolidayDates, setExcludedPublicHolidayDates] = useState([]);
  const [showPublicHolidaysPicker, setShowPublicHolidaysPicker] = useState(false);
  const [publicHolidaysList, setPublicHolidaysList] = useState([]);
  const [publicHolidaysLoading, setPublicHolidaysLoading] = useState(false);
  const countryCode = 'US';
  const regionCode = null;

  // Custom days & ranges (stored as holiday / break exclusions in API)
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

  // Subject targets (per-subject defaults)
  const [subjects, setSubjects] = useState([]);
  const [subjectTargets, setSubjectTargets] = useState({}); // { subjectId: { mode, days, hours } }

  useEffect(() => {
    stateRef.current = { targetScope, goalMode, targetDays, targetHours, hoursPerDay, followGlobalHolidays, countryCode, regionCode, customHolidays, customBreaks, subjectTargets };
  });

  // Apply preloaded data from FamilyPanel when available (avoids loading flash when navigating to Planning Preferences)
  useEffect(() => {
    if (!initialData) return;
    const s = initialData.settings || {};
    setTargetScope(s.target_scope || 'overall');
    setGoalMode(s.default_constraint_mode || 'none');
    setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
    setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
    setHoursPerDay(s.default_planned_hours_per_day != null ? String(s.default_planned_hours_per_day) : '5');
    setFollowGlobalHolidays(s.follow_public_holidays !== false);
    const ex = initialData.exclusions || [];
    const holidays = ex.filter((e) => e.exclusion_type === 'holiday').map((e) => ({
      id: e.id,
      date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
      name: e.label || '',
    }));
    const breaks = ex.filter((e) => e.exclusion_type === 'break').map((e) => ({
      id: e.id,
      start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
      end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
      name: e.label || '',
    }));
    setCustomHolidays(holidays);
    setCustomBreaks(breaks);
    setExcludedPublicHolidayDates(Array.isArray(initialData.excluded_holiday_dates) ? initialData.excluded_holiday_dates : []);
    const subjectsList = initialData.subjects || [];
    setSubjects(subjectsList);
    const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(subjectsList);
    setSubjectTargets(subjectTargetsMap);
    if (firstActiveTarget) {
      setTargetScope('per_subject');
      setGoalMode(firstActiveTarget.mode);
      if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '180');
      if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '1000');
    }
    setLoading(false);
  }, [initialData]);

  const showSaved = () => {
    setSavedIndicator(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSavedIndicator(false), 2000);
  };

  const loadDefaults = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const { settings: s, exclusions: ex, excluded_holiday_dates: excludedDates, error: planErr } = await getPlanDefaultsFromSettings(familyId);
      if (planErr) throw planErr;
      if (s) {
        setTargetScope(s.target_scope || 'overall');
        setGoalMode(s.default_constraint_mode || 'none');
        setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
        setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
        setHoursPerDay(s.default_planned_hours_per_day != null ? String(s.default_planned_hours_per_day) : '5');
        setFollowGlobalHolidays(s.follow_public_holidays !== false);
      }
      setExcludedPublicHolidayDates(Array.isArray(excludedDates) ? excludedDates : []);
      const holidays = (ex || []).filter((e) => e.exclusion_type === 'holiday').map((e) => ({
        id: e.id,
        date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        name: e.label || '',
      }));
      const breaks = (ex || []).filter((e) => e.exclusion_type === 'break').map((e) => ({
        id: e.id,
        start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
        name: e.label || '',
      }));
      setCustomHolidays(holidays);
      setCustomBreaks(breaks);
      // Load subjects for Subject Targets section
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      setSubjects(subjectsData || []);
      const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(subjectsData || []);
      setSubjectTargets(subjectTargetsMap);
      if (firstActiveTarget) {
        setTargetScope('per_subject');
        setGoalMode(firstActiveTarget.mode);
        if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '180');
        if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '1000');
        if (!readOnly) {
          saveFamilyPlannerSettings(familyId, {
            target_scope: 'per_subject',
            default_constraint_mode: firstActiveTarget.mode,
            default_target_days: firstActiveTarget.mode === 'days' ? parsePositiveIntOrNull(firstActiveTarget.days) : null,
            default_target_hours: firstActiveTarget.mode === 'hours' ? parsePositiveFloatOrNull(firstActiveTarget.hours) : null,
          }).catch(() => {});
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to load planner settings');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  /** Keep Subject targets in sync when a subject is saved elsewhere (e.g. Edit subject modal). */
  const reloadSubjectTargetsFromDb = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      const list = subjectsData || [];
      setSubjects(list);
      const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(list);
      setSubjectTargets(subjectTargetsMap);
      if (firstActiveTarget) {
        setTargetScope('per_subject');
        setGoalMode(firstActiveTarget.mode);
        if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '180');
        if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '1000');
      }
    } catch (_) {
      /* ignore */
    }
  }, [familyId]);

  const subjectTargetsExternalReloadTimerRef = useRef(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return;
    const scheduleReload = () => {
      if (subjectTargetsExternalReloadTimerRef.current) {
        clearTimeout(subjectTargetsExternalReloadTimerRef.current);
      }
      subjectTargetsExternalReloadTimerRef.current = setTimeout(() => {
        subjectTargetsExternalReloadTimerRef.current = null;
        reloadSubjectTargetsFromDb();
      }, 150);
    };
    window.addEventListener('refreshPlanDefaults', scheduleReload);
    window.addEventListener('refreshSubjects', scheduleReload);
    return () => {
      window.removeEventListener('refreshPlanDefaults', scheduleReload);
      window.removeEventListener('refreshSubjects', scheduleReload);
      if (subjectTargetsExternalReloadTimerRef.current) {
        clearTimeout(subjectTargetsExternalReloadTimerRef.current);
      }
    };
  }, [familyId, reloadSubjectTargetsFromDb]);

  useEffect(() => {
    if (initialData) return; // Use preloaded data from FamilyPanel, skip fetch
    loadDefaults();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (subjectTargetSaveTimeoutRef.current) clearTimeout(subjectTargetSaveTimeoutRef.current);
    };
  }, [loadDefaults, initialData]);

  const persist = useCallback(
    async (updates) => {
      if (!familyId) return;
      if (readOnly) {
        toast.push('Your family admin has disabled changing planning preferences.', 'error');
        return;
      }
      const s = stateRef.current;
      setSaving(true);
      setError(null);
      try {
        const settingsPayload = {
          target_scope: s.targetScope || 'overall',
          default_constraint_mode: s.goalMode,
          default_target_days: s.goalMode === 'days' ? parseInt(s.targetDays, 10) : null,
          default_target_hours: s.goalMode === 'hours' ? parseInt(s.targetHours, 10) : null,
          default_planned_hours_per_day: s.goalMode === 'hours' ? parseFloat(s.hoursPerDay) : null,
          follow_public_holidays: s.followGlobalHolidays,
          holiday_country: s.countryCode,
          holiday_region: s.regionCode ?? null,
          ...updates,
        };
        const { error: settingsErr } = await saveFamilyPlannerSettings(familyId, settingsPayload);
        if (settingsErr) throw settingsErr;
        const { error: exErr } = await syncFamilyHolidayBreakExclusions(familyId, s.customHolidays, s.customBreaks);
        if (exErr) throw exErr;
        showSaved();
        loadDefaults(); // refresh to get new exclusion ids
        onSave?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
          window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        }
      } catch (err) {
        setError(err?.message || 'Failed to save');
        toast.push(err?.message || 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
    },
    [familyId, onSave, toast, loadDefaults, readOnly]
  );

  const debouncedPersist = useCallback(() => {
    persist({});
  }, [persist]);

  const handleTargetScopeChange = async (scope) => {
    if (readOnly) {
      toast.push('Your family admin has disabled changing planning preferences.', 'error');
      return;
    }
    setTargetScope(scope);
    const { error } = await saveFamilyPlannerSettings(familyId, { target_scope: scope });
    if (!error) {
      showSaved();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } else toast.push(error?.message || 'Failed to save', 'error');
    if (scope === 'per_subject') {
      // Prefill each subject with overall value in UI (nice UX)
      const s = stateRef.current;
      const mode = s.goalMode || 'none';
      const days = mode === 'days' ? (s.targetDays || '180') : '';
      const hours = mode === 'hours' ? (s.targetHours || '1000') : '';
      setSubjectTargets((prev) => {
        const next = { ...prev };
        subjects.forEach((subj) => {
          if (!next[subj.id] || next[subj.id].mode === 'none') {
            next[subj.id] = { mode, days, hours };
          }
        });
        return next;
      });
    }
  };

  const handleGoalChange = (mode) => {
    setGoalMode(mode);
    setTimeout(debouncedPersist, 300);
  };
  const handleTargetDaysChange = (v) => {
    setTargetDays(v);
    setTimeout(debouncedPersist, 400);
  };
  const handleTargetHoursChange = (v) => {
    setTargetHours(v);
    setTimeout(debouncedPersist, 400);
  };
  const handleHoursPerDayChange = (v) => {
    setHoursPerDay(v);
    setTimeout(debouncedPersist, 400);
  };
  const handleFollowChange = (v) => {
    setFollowGlobalHolidays(v);
    setTimeout(debouncedPersist, 300);
  };
  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      toast.push('Enter date and name.', 'error');
      return;
    }
    setCustomHolidays([
      ...customHolidays,
      { date: newHolidayDate, name: newHolidayName.trim(), type: 'CUSTOM_HOLIDAY' },
    ]);
    setNewHolidayDate('');
    setNewHolidayName('');
    setAddingHoliday(false);
    setTimeout(debouncedPersist, 300);
  };

  const removeHoliday = (index) => {
    const h = customHolidays[index];
    setCustomHolidays(customHolidays.filter((_, i) => i !== index));
    if (h?.id) {
      deleteExclusion(h.id).catch(() => {});
    }
    setTimeout(debouncedPersist, 300);
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
    setTimeout(debouncedPersist, 300);
  };

  const addBreak = () => {
    if (!newBreakStart || !newBreakEnd || !newBreakName.trim()) {
      toast.push('Enter start, end, and name.', 'error');
      return;
    }
    if (newBreakStart > newBreakEnd) {
      toast.push('End date must be on or after start.', 'error');
      return;
    }
    setCustomBreaks([
      ...customBreaks,
      { start: newBreakStart, end: newBreakEnd, name: newBreakName.trim() },
    ]);
    setNewBreakStart('');
    setNewBreakEnd('');
    setNewBreakName('');
    setAddingBreak(false);
    setTimeout(debouncedPersist, 300);
  };

  const removeBreak = (index) => {
    const b = customBreaks[index];
    setCustomBreaks(customBreaks.filter((_, i) => i !== index));
    if (b?.id) {
      deleteExclusion(b.id).catch(() => {});
    }
    setTimeout(debouncedPersist, 300);
  };

  const startEditBreak = (index) => {
    setEditingBreakIndex(index);
    setEditingBreakDraft({ start: customBreaks[index].start, end: customBreaks[index].end, name: customBreaks[index].name });
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
    setTimeout(debouncedPersist, 300);
  };

  const handleSubjectTargetChange = useCallback((subjectId, merged) => {
    setSubjectTargets((prev) => ({ ...prev, [subjectId]: merged }));
    if (subjectTargetSaveTimeoutRef.current) clearTimeout(subjectTargetSaveTimeoutRef.current);
    subjectTargetSaveTimeoutRef.current = setTimeout(async () => {
      if (readOnly) {
        toast.push('Your family admin has disabled changing planning preferences.', 'error');
        return;
      }
      const mode = merged.mode || 'none';
      const days = mode === 'days' && merged.days?.trim() ? parseInt(merged.days, 10) : null;
      const hours = mode === 'hours' && merged.hours?.trim() ? parseFloat(merged.hours) : null;
      setSaving(true);
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
        if (mode === 'days' || mode === 'hours') {
          await saveFamilyPlannerSettings(familyId, {
            target_scope: 'per_subject',
            default_constraint_mode: mode,
            default_target_days: mode === 'days' ? days : null,
            default_target_hours: mode === 'hours' ? hours : null,
          });
          setTargetScope('per_subject');
          setGoalMode(mode);
          if (mode === 'days') setTargetDays(days != null ? String(days) : '');
          if (mode === 'hours') setTargetHours(hours != null ? String(hours) : '');
        }
        showSaved();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
        }
      } catch (err) {
        toast.push(err?.message || 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
    }, 400);
  }, [toast, readOnly]);

  const sectionStyle = {
    paddingTop: 0,
    paddingBottom: 20,
    marginBottom: 20,
  };
  const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  };
  const sectionDividerStyle = {
    height: 1,
    backgroundColor: BORDER,
    marginBottom: 20,
  };
  const pageTitleStyle = {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  };
  const chip = (active) => ({
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: active ? CHIP_SELECTED_BORDER : BORDER,
    backgroundColor: active ? CHIP_SELECTED_BG : '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  });
  const chipText = (active) => ({
    fontSize: 14,
    fontWeight: active ? '600' : '500',
    color: active ? CHIP_SELECTED_BORDER : TEXT_BLACK,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  });
  const inputStyle = {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: TEXT_BLACK,
    minWidth: 72,
  };
  const toggleTrackStyle = {
    width: 52,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#d1d5db',
    paddingHorizontal: 2,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  };
  const toggleTrackOnStyle = { backgroundColor: ACCENT };
  const toggleThumbStyle = {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#94A3B8',
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }),
    ...(Platform.OS !== 'web' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 3,
    }),
  };
  const toggleThumbOnStyle = {
    transform: [{ translateX: 24 }],
    backgroundColor: '#0D9488',
  };
  const rowActionButtonsStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  };
  const rowActionButtonStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  };
  const addOutlineButtonStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ED3FF',
    backgroundColor: '#F8FCFF',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  };
  const addOutlineButtonTextStyle = {
    fontSize: 14,
    fontWeight: '600',
    color: '#5AAEF2',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  if (loading) {
    return (
      <View style={{ padding: 32, alignItems: 'center' }}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={{ marginTop: 12, fontSize: 14, color: TEXT_BLACK }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={{ paddingHorizontal: 0, paddingTop: 0 }}>
        {readOnly ? (
          <View
            style={{
              marginBottom: 24,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(79, 70, 229, 0.25)',
              backgroundColor: 'rgba(79, 70, 229, 0.06)',
            }}
          >
            <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>
              Your family admin has turned off changes to planning preferences. You can still review the settings below.
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={pageTitleStyle}>Planning Preferences</Text>
          {savedIndicator && (
            <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '500' }}>Saved</Text>
          )}
        </View>

        {/* Learning Goals */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>Learning Goals</Text>
          <View style={sectionDividerStyle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
            <Text style={sectionTitleStyle}>Target</Text>
            <View style={sectionDividerStyle} />
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
                    onChangeText={handleTargetDaysChange}
                    keyboardType="number-pad"
                    style={[inputStyle, { width: 56 }]}
                    placeholder="180"
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <Text style={{ fontSize: 14, color: TEXT_BLACK }}>days</Text>
                </View>
              )}
              {goalMode === 'hours' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    value={targetHours}
                    onChangeText={handleTargetHoursChange}
                    keyboardType="number-pad"
                    style={[inputStyle, { width: 64 }]}
                    placeholder="1000"
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <Text style={{ fontSize: 14, color: TEXT_BLACK }}>hours</Text>
                  <Text style={{ fontSize: 14, color: TEXT_BLACK, marginLeft: 4 }}>·</Text>
                  <TextInput
                    value={hoursPerDay}
                    onChangeText={handleHoursPerDayChange}
                    keyboardType="decimal-pad"
                    style={[inputStyle, { width: 48 }]}
                    placeholder="5"
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <Text style={{ fontSize: 14, color: TEXT_BLACK }}>/day</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Subject targets (only when Per subject) */}
        {targetScope === 'per_subject' && (
          <View style={sectionStyle}>
            <Text style={sectionTitleStyle}>Subject targets</Text>
            <View style={sectionDividerStyle} />
            {subjects.length === 0 ? null : (
              <View>
              {subjects.map((subj) => {
                const t = subjectTargets[subj.id] || { mode: 'none', days: '', hours: '' };
                return (
                  <View key={subj.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT_BLACK, minWidth: 100 }}>{subj.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity style={chip(t.mode === 'none')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'none' })}>
                        <Text style={chipText(t.mode === 'none')}>None</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={chip(t.mode === 'days')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'days' })}>
                        <Text style={chipText(t.mode === 'days')}>Days</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={chip(t.mode === 'hours')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'hours' })}>
                        <Text style={chipText(t.mode === 'hours')}>Hours</Text>
                      </TouchableOpacity>
                    </View>
                    {t.mode === 'days' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          value={t.days}
                          onChangeText={(v) => handleSubjectTargetChange(subj.id, { ...t, days: v })}
                          keyboardType="number-pad"
                          style={[inputStyle, { width: 56 }]}
                          placeholder="90"
                          placeholderTextColor="rgba(15,23,42,0.4)"
                        />
                        <Text style={{ fontSize: 14, color: TEXT_BLACK }}>days</Text>
                      </View>
                    )}
                    {t.mode === 'hours' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          value={t.hours}
                          onChangeText={(v) => handleSubjectTargetChange(subj.id, { ...t, hours: v })}
                          keyboardType="decimal-pad"
                          style={[inputStyle, { width: 64 }]}
                          placeholder="120"
                          placeholderTextColor="rgba(15,23,42,0.4)"
                        />
                        <Text style={{ fontSize: 14, color: TEXT_BLACK }}>hours</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              </View>
            )}
          </View>
        )}

        {/* Public holidays */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>Public holidays</Text>
          <View style={sectionDividerStyle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[toggleTrackStyle, followGlobalHolidays && toggleTrackOnStyle]}
              onPress={() => handleFollowChange(!followGlobalHolidays)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={[toggleThumbStyle, followGlobalHolidays && toggleThumbOnStyle]} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 15, color: TEXT_BLACK, marginRight: 4 }}>Follow </Text>
              <TouchableOpacity
                onPress={() => {
                  if (followGlobalHolidays) {
                    setShowPublicHolidaysPicker(true);
                    const start = new Date().toISOString().slice(0, 10);
                    const end = new Date();
                    end.setFullYear(end.getFullYear() + 1);
                    const endStr = end.toISOString().slice(0, 10);
                    setPublicHolidaysLoading(true);
                    getPublicHolidaysForRange(countryCode || 'US', start, endStr).then(({ data: res }) => {
                      setPublicHolidaysList(res?.holidays || []);
                      setPublicHolidaysLoading(false);
                    });
                  }
                }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center' }}
                {...(Platform.OS === 'web' && { cursor: followGlobalHolidays ? 'pointer' : 'default' })}
              >
                <Text style={{ fontSize: 15, color: TEXT_BLACK, textDecorationLine: followGlobalHolidays ? 'underline' : 'none' }}>U.S. public holidays</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, color: TEXT_BLACK, marginLeft: 4 }}>?</Text>
            </View>
          </View>
        </View>

        {/* U.S. public holidays picker modal */}
        {showPublicHolidaysPicker && (
          <Modal animationType="fade" transparent visible={showPublicHolidaysPicker} onRequestClose={() => setShowPublicHolidaysPicker(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} activeOpacity={1} onPress={() => setShowPublicHolidaysPicker(false)}>
              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT_BLACK }}>U.S. PUBLIC HOLIDAYS</Text>
                  <TouchableOpacity onPress={() => setShowPublicHolidaysPicker(false)} hitSlop={12} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <X size={22} color={MUTED} />
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 12 }}>Uncheck any holiday you don't want to include (they will be treated as regular instructional days).</Text>
                {publicHolidaysLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={ACCENT} />
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
                    {publicHolidaysList.map((h) => {
                      const dateStr = (h.date || '').slice(0, 10);
                      const isIncluded = !excludedPublicHolidayDates.includes(dateStr);
                      return (
                        <TouchableOpacity
                          key={`${dateStr}-${h.name}`}
                          onPress={() => {
                            if (isIncluded) {
                              setExcludedPublicHolidayDates((prev) => [...prev, dateStr]);
                            } else {
                              setExcludedPublicHolidayDates((prev) => prev.filter((d) => d !== dateStr));
                            }
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}
                          activeOpacity={0.7}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: isIncluded ? ACCENT : BORDER, backgroundColor: isIncluded ? ACCENT : 'transparent', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                            {isIncluded ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                          </View>
                          <Text style={{ flex: 1, fontSize: 14, color: TEXT_BLACK }}>{h.name}</Text>
                          <Text style={{ fontSize: 13, color: TEXT_BLACK }}>{dateStr}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {publicHolidaysList.length === 0 && !publicHolidaysLoading && (
                      <Text style={{ fontSize: 13, color: TEXT_BLACK, padding: 16 }}>No holidays in this date range. Extend range or add a custom day.</Text>
                    )}
                  </ScrollView>
                )}
                <TouchableOpacity
                  onPress={async () => {
                    const datesWithNames = excludedPublicHolidayDates.map((d) => {
                      const h = publicHolidaysList.find((x) => (x.date || '').slice(0, 10) === d);
                      return { date: d, name: h?.name || 'Holiday' };
                    });
                    const { error: saveErr } = await saveExcludedPublicHolidayDates(familyId, datesWithNames);
                    if (saveErr) toast?.push?.(saveErr?.message || 'Failed to save', 'error');
                    else {
                      toast?.push?.('Saved', 'success');
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
                        window.dispatchEvent(new CustomEvent('refreshSubjects'));
                      }
                    }
                    setShowPublicHolidaysPicker(false);
                  }}
                  style={{ marginTop: 16, backgroundColor: ACCENT, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'flex-end' }}
                  activeOpacity={0.9}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Custom days (single-date exclusions) */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>{PLANNING_PREFERENCES_UI.customDaysSectionTitle}</Text>
          <View style={sectionDividerStyle} />
          <View>
              {customHolidays.map((h, i) => (
                <View key={h.id || i} style={{ marginBottom: 8 }}>
                  {editingHolidayIndex === i ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <PlannerPreferenceDateField
                        value={editingHolidayDraft.date}
                        onChange={(v) => setEditingHolidayDraft((d) => ({ ...d, date: v }))}
                        placeholder="Select date"
                        borderColor={BORDER}
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={inputStyle}
                        width={120}
                      />
                      <TextInput
                        value={editingHolidayDraft.name}
                        onChangeText={(v) => setEditingHolidayDraft((d) => ({ ...d, name: v }))}
                        placeholder="Name"
                        style={[inputStyle, { flex: 1, minWidth: 100 }]}
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                      <TouchableOpacity
                        onPress={() => saveEditHoliday(i)}
                        style={{ padding: 8 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Check size={18} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditHoliday} style={{ padding: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <X size={18} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: TEXT_BLACK }}>
                        {h.date} — {h.name}
                      </Text>
                      <View style={rowActionButtonsStyle}>
                        <TouchableOpacity onPress={() => startEditHoliday(i)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={16} color="#374151" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeHoliday(i)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={16} color="#374151" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
              {addingHoliday ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <PlannerPreferenceDateField
                    value={newHolidayDate}
                    onChange={setNewHolidayDate}
                    placeholder="Select date"
                    borderColor={BORDER}
                    textColor={TEXT_BLACK}
                    mutedColor="rgba(15,23,42,0.4)"
                    style={inputStyle}
                    width={120}
                  />
                  <TextInput
                    value={newHolidayName}
                    onChangeText={setNewHolidayName}
                    placeholder={PLANNING_PREFERENCES_UI.dayNamePlaceholder}
                    style={[inputStyle, { flex: 1, minWidth: 120 }]}
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <TouchableOpacity onPress={addHoliday} style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: ACCENT, borderRadius: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Check size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setAddingHoliday(false); setNewHolidayDate(''); setNewHolidayName(''); }} style={{ padding: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <X size={18} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingHoliday(true)}
                  style={addOutlineButtonStyle}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#5AAEF2" />
                  <Text style={addOutlineButtonTextStyle}>{PLANNING_PREFERENCES_UI.addDay}</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        {/* Ranges (date-span exclusions) */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>{PLANNING_PREFERENCES_UI.rangesSectionTitle}</Text>
          <View style={sectionDividerStyle} />
          <View>
              {customBreaks.map((b, i) => (
                <View key={b.id || i} style={{ marginBottom: 8 }}>
                  {editingBreakIndex === i ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <PlannerPreferenceDateField
                        value={editingBreakDraft.start}
                        onChange={(v) => setEditingBreakDraft((d) => ({ ...d, start: v }))}
                        placeholder="Start"
                        borderColor={BORDER}
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={inputStyle}
                        width={100}
                      />
                      <PlannerPreferenceDateField
                        value={editingBreakDraft.end}
                        onChange={(v) => setEditingBreakDraft((d) => ({ ...d, end: v }))}
                        placeholder="End"
                        borderColor={BORDER}
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={inputStyle}
                        width={100}
                      />
                      <TextInput
                        value={editingBreakDraft.name}
                        onChangeText={(v) => setEditingBreakDraft((d) => ({ ...d, name: v }))}
                        placeholder="Name"
                        style={[inputStyle, { flex: 1, minWidth: 80 }]}
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                      <TouchableOpacity
                        onPress={() => saveEditBreak(i)}
                        style={{ padding: 8 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Check size={18} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditBreak} style={{ padding: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <X size={18} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: TEXT_BLACK }}>
                        {b.start}–{b.end} {b.name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <PlannerPreferenceDateField
                    value={newBreakStart}
                    onChange={setNewBreakStart}
                    placeholder="Start"
                    borderColor={BORDER}
                    textColor={TEXT_BLACK}
                    mutedColor="rgba(15,23,42,0.4)"
                    style={inputStyle}
                    width={100}
                  />
                  <PlannerPreferenceDateField
                    value={newBreakEnd}
                    onChange={setNewBreakEnd}
                    placeholder="End"
                    borderColor={BORDER}
                    textColor={TEXT_BLACK}
                    mutedColor="rgba(15,23,42,0.4)"
                    style={inputStyle}
                    width={100}
                  />
                  <TextInput
                    value={newBreakName}
                    onChangeText={setNewBreakName}
                    placeholder={PLANNING_PREFERENCES_UI.rangeNamePlaceholder}
                    style={[inputStyle, { flex: 1, minWidth: 80 }]}
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <TouchableOpacity onPress={addBreak} style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: ACCENT, borderRadius: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Check size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setAddingBreak(false);
                      setNewBreakStart('');
                      setNewBreakEnd('');
                      setNewBreakName('');
                    }}
                    style={{ padding: 8 }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={18} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingBreak(true)}
                  style={addOutlineButtonStyle}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#5AAEF2" />
                  <Text style={addOutlineButtonTextStyle}>{PLANNING_PREFERENCES_UI.addRange}</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        {error && <Text style={{ color: '#DC2626', fontSize: 14, marginTop: 12 }}>{error}</Text>}
      </View>

    </ScrollView>
  );
}

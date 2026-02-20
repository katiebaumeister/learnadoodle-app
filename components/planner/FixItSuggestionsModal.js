/**
 * Fix-It Suggestions Modal (Phase 6)
 * Outcome-focused suggestions: extra day/week, extend end date.
 * Selectable cards, single Apply, impact preview.
 */

import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, Platform, Alert, StyleSheet } from 'react-native';
import { X, Calendar, Plus, Check } from 'lucide-react';
import { applyFixSuggestion, invalidatePlanHealthCache } from '../../lib/services/academicYearClient';

const ACCENT = '#4285f4';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const CARD_SELECTED_BG = '#eff6ff';
const CARD_SELECTED_BORDER = ACCENT;

// Spacing scale (px)
const TITLE_MARGIN_BELOW = 16;
const DESCRIPTION_MARGIN_BELOW = 20;
const CARD_GAP = 12;
const FOOTER_LINK_MARGIN_BELOW = 20;
const BUTTONS_MARGIN_TOP = 20;

function formatDateShort(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function weeksUntilPlanEnd(planEndDateStr) {
  if (!planEndDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(planEndDateStr + 'T12:00:00');
  if (end < today) return 0;
  const ms = end - today;
  return Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

function formatNewEndDate(endDateStr, extraWeeks) {
  if (!endDateStr) return null;
  const d = new Date(endDateStr + 'T12:00:00');
  d.setDate(d.getDate() + extraWeeks * 7);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FixItSuggestionsModal({ visible, onClose, familyId, health, onSuccess }) {
  const [applying, setApplying] = useState(false);
  const [selectedId, setSelectedId] = useState('extend_end_date');

  if (!visible) return null;

  const deltaDays = (health?.constraint_mode === 'days' && health?.delta_days != null) ? -health.delta_days : 0;
  const deltaHours = (health?.constraint_mode === 'hours' && health?.delta_hours != null) ? -health.delta_hours : 0;
  const isDays = health?.constraint_mode === 'days';
  const gap = isDays ? Math.max(1, deltaDays) : Math.ceil(deltaHours / 5);
  const numWeeks = Math.min(Math.max(1, Math.ceil(gap)), 15);
  const extraWeeks = Math.max(1, Math.ceil(gap / 5));
  const planEndFormatted = formatDateShort(health?.end_date);
  const weeksRemaining = weeksUntilPlanEnd(health?.end_date);
  const weeksToOffer = Math.min(numWeeks, Math.max(1, weeksRemaining));
  // Only show single extra-day option when we have enough weeks left to fully close the gap (1 day/week × numWeeks)
  const showExtraDayOption = weeksRemaining >= numWeeks;
  // Multiple days per week: cap by weekdays not yet used (Mon–Fri; if already M–F then max 0)
  const maxExtraDaysPerWeek = Math.max(0, health?.max_extra_days_per_week ?? 0);
  const extraDaysPerWeekNeeded = Math.ceil(gap / Math.max(1, weeksRemaining));
  const extraDaysPerWeekCapped = Math.min(extraDaysPerWeekNeeded, maxExtraDaysPerWeek);
  const totalDaysFromMultiple = extraDaysPerWeekCapped * weeksRemaining;
  const showMultipleDaysOption =
    weeksRemaining >= 1 &&
    maxExtraDaysPerWeek >= 1 &&
    extraDaysPerWeekCapped >= 1 &&
    totalDaysFromMultiple >= gap;
  const extraDaysPerWeekToOffer = showMultipleDaysOption ? extraDaysPerWeekCapped : 0;
  // Use exact suggested_end_date from plan_health when available (0 days over/under); else fall back to end_date + extraWeeks
  const suggestedEndDate = health?.suggested_end_date;
  const newEndDateStr = suggestedEndDate
    ? formatDateShort(suggestedEndDate)
    : formatNewEndDate(health?.end_date, extraWeeks);

  const suggestions = [
    {
      id: 'extend_end_date',
      title: suggestedEndDate ? `Extend school year to ${newEndDateStr}` : `Extend school year by ${extraWeeks} weeks`,
      impactLine: isDays
        ? (newEndDateStr ? `New end date: ${newEndDateStr}` : 'Scheduled class days will generate into the extended range')
        : (newEndDateStr ? `Reaches your hour target by ${newEndDateStr} (same weekly schedule)` : 'Same teaching hours per week; more weeks to reach your hour target'),
      tagLine: isDays ? 'No weekly schedule changes but extends year' : 'Same average teaching hours per week; extends year to reach your hours goal',
      recommended: true,
      icon: Calendar,
      params: suggestedEndDate ? { suggested_end_date: suggestedEndDate } : { extra_weeks: extraWeeks },
    },
    ...(isDays && showExtraDayOption
      ? [
          {
            id: 'extra_day_per_week',
            title: `Add 1 extra learning day per week for the next ${weeksToOffer} weeks`,
            impactLine: planEndFormatted
              ? `Adds ${weeksToOffer} days within your current plan (by ${planEndFormatted})`
              : `Adds ~${weeksToOffer} days toward your requirement`,
            tagLine: 'Minimal schedule change, additional teaching day',
            recommended: false,
            icon: Plus,
            params: { num_weeks: weeksToOffer },
          },
        ]
      : []),
    ...(isDays && showMultipleDaysOption
      ? [
          {
            id: 'extra_days_per_week',
            title: `Add ${extraDaysPerWeekToOffer} extra learning days per week for the next ${weeksRemaining} weeks`,
            impactLine: planEndFormatted
              ? `Adds ${totalDaysFromMultiple} days within your current plan (by ${planEndFormatted})`
              : `Adds ~${totalDaysFromMultiple} days toward your requirement`,
            tagLine: 'Uses weekdays not yet in your schedule (no double-booking)',
            recommended: false,
            icon: Plus,
            params: { num_weeks: weeksRemaining, extra_days_per_week: extraDaysPerWeekToOffer },
          },
        ]
      : []),
  ];

  const handleApply = async () => {
    const s = suggestions.find((x) => x.id === selectedId);
    if (!s) return;
    setApplying(true);
    try {
      const { data, error } = await applyFixSuggestion({
        family_id: familyId,
        suggestion_type: s.id,
        params: s.params,
      });
      if (error) throw error;
      invalidatePlanHealthCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      }
      onSuccess?.();
      onClose();
      Alert.alert('Done', data?.message || `Added ${data?.created ?? 0} lessons.`);
    } catch (e) {
      Alert.alert('Error', e?.message || e?.detail || 'Failed to apply suggestion.');
    } finally {
      setApplying(false);
    }
  };

  if (!health) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading suggestions...</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  const shortfall = isDays ? `${deltaDays} learning days` : `~${Math.ceil(deltaHours)} hours`;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.smartCue}>Based on your schedule...</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={20} color={SUB} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.title, { marginTop: TITLE_MARGIN_BELOW }]}>
            You're missing {shortfall}
          </Text>
          <Text style={[styles.description, { marginTop: DESCRIPTION_MARGIN_BELOW }]}>
            Here are some suggested changes:
          </Text>

          <View style={{ marginTop: DESCRIPTION_MARGIN_BELOW }}>
            {suggestions.map((s, index) => {
              const Icon = s.icon;
              const isSelected = selectedId === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  activeOpacity={0.8}
                  onPress={() => setSelectedId(s.id)}
                  style={[
                    styles.optionCard,
                    index > 0 && { marginTop: CARD_GAP },
                    isSelected && styles.optionCardSelected,
                  ]}
                >
                  <View style={styles.optionCardInner}>
                    {s.recommended && (
                      <View style={styles.recommendedBadge}>
                        <Text style={styles.recommendedText}>Recommended</Text>
                      </View>
                    )}
                    <Text style={styles.optionTitle}>{s.title}</Text>
                    <Text style={styles.optionImpact}>{s.impactLine}</Text>
                    <Text style={styles.optionTag}>{s.tagLine}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkWrap}>
                      <Check size={20} color={ACCENT} strokeWidth={2.5} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => {
              onClose();
              if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('openPlanYearModal'));
            }}
            style={{ marginTop: FOOTER_LINK_MARGIN_BELOW }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.manualLink}>Adjust manually in Plan My Year →</Text>
          </TouchableOpacity>

          <View style={[styles.buttonRow, { marginTop: BUTTONS_MARGIN_TOP }]}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApply}
              disabled={!selectedId || applying}
              style={[styles.primaryBtn, (!selectedId || applying) && styles.primaryBtnDisabled]}
              {...(Platform.OS === 'web' && { cursor: selectedId && !applying ? 'pointer' : 'default' })}
            >
              {applying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Apply change</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderColor: BORDER,
  },
  loadingCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
  },
  loadingText: {
    fontSize: 16,
    color: SUB,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  smartCue: {
    fontSize: 14,
    color: SUB,
  },
  closeBtn: {
    padding: 4,
    marginTop: -4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: FG,
  },
  description: {
    fontSize: 14,
    color: SUB,
    lineHeight: 22,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER,
    backgroundColor: '#fafafa',
  },
  optionCardSelected: {
    borderColor: CARD_SELECTED_BORDER,
    backgroundColor: CARD_SELECTED_BG,
  },
  optionCardInner: {
    flex: 1,
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  recommendedText: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: FG,
    marginBottom: 4,
  },
  optionImpact: {
    fontSize: 14,
    color: FG,
    marginBottom: 2,
  },
  optionTag: {
    fontSize: 13,
    color: SUB,
  },
  checkWrap: {
    marginLeft: 12,
  },
  manualLink: {
    fontSize: 14,
    color: ACCENT,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 15,
    color: SUB,
  },
  primaryBtn: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  primaryBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
});

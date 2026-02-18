/**
 * Fix-It Suggestions Modal (Phase 6)
 * Suggests: add 1 extra day/week for N weeks, catch-up week, extend end date.
 */

import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { X, Calendar, Plus, Clock } from 'lucide-react';
import { applyFixSuggestion } from '../../lib/services/academicYearClient';

const ACCENT = '#4285f4';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';

export default function FixItSuggestionsModal({ visible, onClose, familyId, health, onSuccess }) {
  const [applying, setApplying] = useState(null);

  if (!visible) return null;

  const deltaDays = (health?.constraint_mode === 'days' && health?.delta_days != null) ? -health.delta_days : 0;
  const deltaHours = (health?.constraint_mode === 'hours' && health?.delta_hours != null) ? -health.delta_hours : 0;
  const isDays = health?.constraint_mode === 'days';
  const gap = isDays ? Math.max(1, deltaDays) : Math.ceil(deltaHours / 5); // rough: 5 hrs/week
  const numWeeks = Math.min(Math.max(1, Math.ceil(gap)), 15);
  const extraWeeks = Math.max(1, Math.ceil(gap / 5));

  const handleApply = async (suggestionType, params) => {
    setApplying(suggestionType);
    try {
      const { data, error } = await applyFixSuggestion({
        family_id: familyId,
        suggestion_type: suggestionType,
        params,
      });
      if (error) throw error;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshCalendar'));
      onSuccess?.();
      onClose();
      Alert.alert('Done', data?.message || `Added ${data?.created ?? 0} lessons.`);
    } catch (e) {
      Alert.alert('Error', e?.message || e?.detail || 'Failed to apply suggestion.');
    } finally {
      setApplying(null);
    }
  };

  const suggestions = [
    {
      id: 'extra_day_per_week',
      title: `Add 1 extra learning day per week for ${numWeeks} weeks`,
      desc: `Adds ~${numWeeks} days toward your requirement.`,
      icon: Plus,
      params: { num_weeks: numWeeks },
    },
    {
      id: 'extend_end_date',
      title: `Extend the school year by ${extraWeeks} weeks`,
      desc: `Blocks will generate into the extended range.`,
      icon: Calendar,
      params: { extra_weeks: extraWeeks },
    },
  ];

  if (!health) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={onClose}>
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 12 }}>
            <Text style={{ fontSize: 16, color: SUB }}>Loading suggestions...</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 20,
            width: '100%',
            maxWidth: 420,
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: FG }}>Fix-it suggestions</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={20} color={SUB} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 14, color: SUB, marginBottom: 16 }}>
            {isDays ? `You need ${deltaDays} more days` : `You need ~${Math.ceil(deltaHours)} more hours`}. Choose one:
          </Text>
          {suggestions.map((s) => {
            const Icon = s.icon;
            const isLoading = applying === s.id;
            return (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: BORDER,
                }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: FG }}>{s.title}</Text>
                  <Text style={{ fontSize: 13, color: SUB, marginTop: 2 }}>{s.desc}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleApply(s.id, s.params)}
                  disabled={!!applying}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    backgroundColor: ACCENT,
                    borderRadius: 8,
                    minWidth: 80,
                    alignItems: 'center',
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity
            onPress={() => {
              onClose();
              if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('openPlanYearModal'));
            }}
            style={{ marginTop: 16, paddingVertical: 8, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, color: ACCENT }}>Open Plan My Year to adjust manually</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

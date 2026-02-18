/**
 * Plan Health Banner — drift detection (Phase 5)
 * Shows when planned days/hours are under or over target (actual compliance from events).
 * Under = warning + "Fix it" / "Ignore for now"
 * Over = informational
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { AlertTriangle } from 'lucide-react';
import { getPlanHealth } from '../../lib/services/academicYearClient';
import FixItSuggestionsModal from './FixItSuggestionsModal';

const BANNER_BG_WARNING = '#fef3c7';
const BANNER_BORDER_WARNING = '#f59e0b';
const BANNER_TEXT_WARNING = '#92400e';
const BANNER_BG_INFO = '#dbeafe';
const BANNER_BORDER_INFO = '#3b82f6';
const BANNER_TEXT_INFO = '#1e40af';

export default function PlanHealthBanner({ familyId, visible = true }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showFixItModal, setShowFixItModal] = useState(false);

  const fetchHealth = useCallback(async () => {
    if (!familyId || !visible) return;
    setLoading(true);
    try {
      const { data, error } = await getPlanHealth(familyId);
      if (!error && data?.plan_exists) {
        setHealth(data);
        setDismissed(false);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [familyId, visible]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Refetch when calendar refreshes (e.g. after event delete)
  useEffect(() => {
    if (typeof window === 'undefined' || !visible) return;
    const onRefresh = () => fetchHealth();
    window.addEventListener('refreshCalendar', onRefresh);
    return () => window.removeEventListener('refreshCalendar', onRefresh);
  }, [fetchHealth, visible]);

  // Refetch immediately after Event Details save (e.g. counts_toward_plan toggle)
  useEffect(() => {
    if (typeof window === 'undefined' || !visible) return;
    const onPlanHealthRefresh = () => fetchHealth();
    window.addEventListener('refreshPlanHealth', onPlanHealthRefresh);
    return () => window.removeEventListener('refreshPlanHealth', onPlanHealthRefresh);
  }, [fetchHealth, visible]);

  if (!visible || loading || !health) return null;
  const isUnder = (health.constraint_mode === 'days' && health.delta_days != null && health.delta_days < 0) ||
    (health.constraint_mode === 'hours' && health.delta_hours != null && health.delta_hours < 0);
  const isOver = (health.constraint_mode === 'days' && health.delta_days != null && health.delta_days > 0) ||
    (health.constraint_mode === 'hours' && health.delta_hours != null && health.delta_hours > 0);
  if (!isUnder && !isOver) return null;
  if (dismissed) return null;

  const bg = isUnder ? BANNER_BG_WARNING : BANNER_BG_INFO;
  const border = isUnder ? BANNER_BORDER_WARNING : BANNER_BORDER_INFO;
  const textColor = isUnder ? BANNER_TEXT_WARNING : BANNER_TEXT_INFO;

  const message = isUnder
    ? health.constraint_mode === 'days'
      ? `You're ${-health.delta_days} days under your ${health.target_days}-day requirement`
      : `You're ${(-health.delta_hours).toFixed(0)} hours under your ${health.target_hours}-hour requirement`
    : health.constraint_mode === 'days'
      ? `You're scheduled for ${health.delta_days} extra days`
      : `You're scheduled for ${health.delta_hours.toFixed(0)} extra hours`;

  const handleEditPlan = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.log('[PlanHealthBanner] Edit plan clicked with health:', health);
      window.dispatchEvent(new CustomEvent('openPlanYearModal', { detail: { from: 'plan_health_over', academicYearId: health?.academic_year_id || null } }));
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: bg,
        borderBottomWidth: 1,
        borderBottomColor: border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
        {isUnder && <AlertTriangle size={18} color={border} />}
        <Text style={{ fontSize: 14, color: textColor, flex: 1 }}>{message}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {isUnder && (
          <TouchableOpacity
            onPress={() => setShowFixItModal(true)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: border,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Fix it</Text>
          </TouchableOpacity>
        )}
        {isOver && (
          <TouchableOpacity
            onPress={handleEditPlan}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: '#eff6ff',
              ...(Platform.OS === 'web' && { cursor: 'pointer' }),
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: textColor }}>Edit plan</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setDismissed(true)}
          style={{ padding: 4 }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={{ fontSize: 13, color: textColor }}>Ignore for now</Text>
        </TouchableOpacity>
      </View>
      <FixItSuggestionsModal
        visible={showFixItModal}
        onClose={() => setShowFixItModal(false)}
        familyId={familyId}
        health={health}
        onSuccess={fetchHealth}
      />
    </View>
  );
}

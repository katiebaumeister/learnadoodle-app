/**
 * Small plan health icon for the planner header.
 * Shows when plan is under or over target so users can find the notification
 * even after dismissing the banner ("Ignore for now").
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Bell } from 'lucide-react';
import { getPlanHealth, invalidatePlanHealthCache } from '../../lib/services/academicYearClient';

const BANNER_BORDER_WARNING = '#f59e0b';
const BANNER_BORDER_INFO = '#3b82f6';
const BANNER_TEXT_WARNING = '#92400e';
const BANNER_TEXT_INFO = '#1e40af';

export default function PlanHealthIcon({ familyId, visible = true, initialHealth = null }) {
  const [health, setHealth] = useState(initialHealth ?? null);
  const [loading, setLoading] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef(null);

  const fetchHealth = useCallback(async () => {
    if (!familyId || !visible) return;
    setLoading(true);
    try {
      const { data, error } = await getPlanHealth(familyId);
      if (!error && data != null) {
        setHealth(data.plan_exists ? data : null);
      }
      // On error (e.g. 429): keep previous health so icon doesn't disappear
    } finally {
      setLoading(false);
    }
  }, [familyId, visible]);

  useEffect(() => {
    if (initialHealth != null) setHealth(initialHealth);
  }, [initialHealth]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (typeof window === 'undefined' || !visible) return;
    const onRefresh = () => {
      invalidatePlanHealthCache();
      fetchHealth();
    };
    window.addEventListener('refreshCalendar', onRefresh);
    window.addEventListener('refreshPlanHealth', onRefresh);
    return () => {
      window.removeEventListener('refreshCalendar', onRefresh);
      window.removeEventListener('refreshPlanHealth', onRefresh);
    };
  }, [fetchHealth, visible]);

  const openPopover = () => {
    if (Platform.OS !== 'web' || !iconRef.current) return;
    const node = iconRef.current._nativeNode || iconRef.current;
    if (node && typeof node.getBoundingClientRect === 'function') {
      const rect = node.getBoundingClientRect();
      setPopoverPosition({ top: rect.bottom + 6, left: rect.left });
      setShowPopover(true);
    }
  };

  if (!visible || !health) return null;
  const isUnder = (health.constraint_mode === 'days' && health.delta_days != null && health.delta_days < 0) ||
    (health.constraint_mode === 'hours' && health.delta_hours != null && health.delta_hours < 0);
  const isOver = (health.constraint_mode === 'days' && health.delta_days != null && health.delta_days > 0) ||
    (health.constraint_mode === 'hours' && health.delta_hours != null && health.delta_hours > 0);
  if (!isUnder && !isOver) return null;

  const borderColor = isUnder ? BANNER_BORDER_WARNING : BANNER_BORDER_INFO;
  const textColor = isUnder ? BANNER_TEXT_WARNING : BANNER_TEXT_INFO;
  const message = isUnder
    ? health.constraint_mode === 'days'
      ? `You're ${-health.delta_days} days under your ${health.target_days}-day requirement`
      : `You're ${(-health.delta_hours).toFixed(0)} hours under your ${health.target_hours}-hour requirement`
    : health.constraint_mode === 'days'
      ? `You're scheduled for ${health.delta_days} extra days`
      : `You're scheduled for ${health.delta_hours.toFixed(0)} extra hours`;

  const handleEditPlan = () => {
    setShowPopover(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openPlanYearModal', { detail: { from: isUnder ? 'plan_health_under' : 'plan_health_over', academicYearId: health?.academic_year_id || null } }));
    }
  };

  const iconSize = 18;

  return (
    <>
      <TouchableOpacity
        ref={iconRef}
        onPress={openPopover}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: isUnder ? '#fef3c7' : '#dbeafe',
          borderWidth: 1,
          borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          ...(Platform.OS === 'web' && { cursor: 'pointer' }),
        }}
        accessibilityLabel="Plan health notification"
      >
        <Bell size={iconSize} color={borderColor} />
      </TouchableOpacity>
      {Platform.OS === 'web' && showPopover && (
        <>
          <TouchableOpacity
            activeOpacity={1}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              backgroundColor: 'transparent',
            }}
            onPress={() => setShowPopover(false)}
          />
          <View
            style={{
              position: 'fixed',
              top: popoverPosition.top,
              left: popoverPosition.left,
              backgroundColor: '#FFFFFF',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(15,23,42,0.1)',
              padding: 12,
              maxWidth: 320,
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <View style={{ flexShrink: 0, marginTop: 2 }}>
                <Bell size={18} color={borderColor} />
              </View>
              <Text style={{ fontSize: 13, color: textColor, flex: 1 }}>{message}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {(isUnder || isOver) && (
                <TouchableOpacity
                  onPress={handleEditPlan}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                    ...(isUnder ? { backgroundColor: borderColor } : { borderWidth: 1, borderColor, backgroundColor: '#eff6ff' }),
                    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isUnder ? '#fff' : textColor }}>
                    {isUnder ? 'Fix it' : 'Edit plan'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowPopover(false)}
                style={{ paddingVertical: 4, cursor: 'pointer' }}
              >
                <Text style={{ fontSize: 12, color: 'rgba(15,23,42,0.7)' }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </>
  );
}

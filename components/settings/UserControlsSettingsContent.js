/**
 * User Controls — parent-facing: what linked learners (children) and tutors are allowed to do.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Platform, ActivityIndicator } from 'react-native';
import { Info } from 'lucide-react';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';
import {
  getFamilyUserControls,
  saveFamilyUserControls,
  rowToFlagMap,
} from '../../lib/services/userControlsClient';
import { useFamilyUserControls } from '../../contexts/FamilyUserControlsContext';

const BORDER = '#E5E7EB';
const ACCENT_ON = '#AECBFA';

const CONTROL_ROWS = [
  {
    id: 'events',
    label: 'Add / edit events',
    description: 'Create and change planner events for themselves or their scope.',
  },
  {
    id: 'subjects',
    label: 'Add / edit subjects',
    description: 'Create and edit subjects and course organization.',
  },
  {
    id: 'child_profile',
    label: 'Add / edit own child profile',
    description: 'Update profile details for their learner account (name, grade, support, etc.).',
  },
  {
    id: 'materials',
    label: 'Add / edit materials',
    description: 'Add or edit library materials and attachments.',
  },
  {
    id: 'plans',
    label: 'Add / edit plans',
    description: 'Create or edit plan years and plan-linked scheduling.',
  },
  {
    id: 'planning_preferences',
    label: 'Change planning preferences',
    description: 'Adjust default planning targets, holidays, breaks, and related preferences.',
  },
];

const defaultState = () =>
  CONTROL_ROWS.reduce((acc, row) => {
    acc[row.id] = true;
    return acc;
  }, {});

export default function UserControlsSettingsContent({ familyId: propFamilyId }) {
  const toast = useToast();
  const { familyId: ctxFamilyId, refresh } = useFamilyUserControls();
  const familyId = propFamilyId || ctxFamilyId;

  const [flags, setFlags] = useState(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!familyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await getFamilyUserControls(familyId);
      if (cancelled) return;
      if (error) {
        toast.push(error.message || 'Could not load user controls', 'error');
        setFlags(defaultState());
      } else {
        setFlags(rowToFlagMap(data));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, toast]);

  const toggle = useCallback(
    async (id) => {
      if (!familyId) {
        toast.push('Family not loaded yet.', 'error');
        return;
      }
      const next = { ...flags, [id]: !flags[id] };
      setFlags(next);
      setSaving(true);
      try {
        const { error } = await saveFamilyUserControls(familyId, next);
        if (error) throw error;
        await refresh();
      } catch (e) {
        setFlags((f) => ({ ...f, [id]: !f[id] }));
        toast.push(e?.message || 'Could not save', 'error');
      } finally {
        setSaving(false);
      }
    },
    [familyId, flags, refresh, toast]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Controls</Text>
      <Text style={styles.lead}>
        Choose what invited children and tutors can do in your family. Changes apply to linked accounts
        immediately.
      </Text>

      <View style={styles.notice}>
        <Info size={18} color={colors.accent || '#4F46E5'} style={styles.noticeIcon} />
        <Text style={styles.noticeText}>
          When a permission is off, learners and tutors can still view content they already have access to — they
          just cannot add or change items in that area.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent || '#4F46E5'} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : null}

      <View style={[styles.card, saving && styles.cardSaving]}>
        <Text style={styles.cardTitle}>Permissions</Text>
        {saving ? (
          <Text style={styles.savingHint}>Saving…</Text>
        ) : null}
        {CONTROL_ROWS.map((row, index) => (
          <View
            key={row.id}
            style={[styles.row, index < CONTROL_ROWS.length - 1 && styles.rowBorder]}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowDescription}>{row.description}</Text>
            </View>
            <Switch
              value={!!flags[row.id]}
              onValueChange={() => toggle(row.id)}
              disabled={loading || !familyId}
              trackColor={{ false: BORDER, true: ACCENT_ON }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={BORDER}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  lead: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 720,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 24,
    maxWidth: 720,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    maxWidth: 720,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
    }),
  },
  cardSaving: {
    opacity: 0.92,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  savingHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

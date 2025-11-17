import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createBlackout, formatDate } from '../../lib/apiClient';

function getChildName(childId, children) {
  if (!childId) return 'All children';
  const match = children.find((c) => String(c.id) === String(childId));
  return match?.first_name || match?.name || 'Unknown';
}

export default function BlackoutPanel({ familyId, children = [] }) {
  const [existing, setExisting] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const sortedChildren = useMemo(() => {
    return [...children].sort((a, b) => (a.first_name || a.name || '').localeCompare(b.first_name || b.name || ''));
  }, [children]);

  // Only load once when familyId is available, unless data is empty
  useEffect(() => {
    if (familyId && !hasLoaded) {
      fetchBlackouts();
      setHasLoaded(true);
    }
  }, [familyId, hasLoaded]);

  const fetchBlackouts = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .order('starts_on', { ascending: true });
      if (error) throw error;
      setExisting(data || []);
    } catch (error) {
      console.error('Error loading blackouts:', error);
      Alert.alert('Error', error.message || 'Unable to load blackouts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!familyId) return;
    if (!startsOn || !endsOn) {
      Alert.alert('Missing dates', 'Please enter both start and end dates (YYYY-MM-DD).');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startsOn) || !dateRegex.test(endsOn)) {
      Alert.alert('Invalid dates', 'Use YYYY-MM-DD format (e.g., 2025-11-15).');
      return;
    }

    const startDate = new Date(startsOn);
    const endDate = new Date(endsOn);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      Alert.alert('Invalid dates', 'Please provide valid calendar dates.');
      return;
    }
    if (startDate > endDate) {
      Alert.alert('Invalid range', 'End date must be on or after start date.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await createBlackout({
        familyId,
        childId: selectedChildId,
        startsOn,
        endsOn,
        reason: reason || 'blackout',
      });
      if (error) throw error;
      setStartsOn('');
      setEndsOn('');
      setReason('');
      // Refresh blackouts after creation
      await fetchBlackouts();
    } catch (error) {
      console.error('Error creating blackout:', error);
      Alert.alert('Error', error.message || 'Unable to create blackout');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    Alert.alert('Remove blackout', 'Remove this blackout period?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('blackout_periods')
              .delete()
              .eq('id', id);
            if (error) throw error;
            await fetchBlackouts();
          } catch (error) {
            console.error('Error deleting blackout:', error);
            Alert.alert('Error', error.message || 'Unable to remove blackout');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Add blackout period</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Applies to</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            onPress={() => setSelectedChildId(null)}
            style={[styles.chip, selectedChildId === null && styles.chipActive]}
          >
            <Text style={[styles.chipText, selectedChildId === null && styles.chipTextActive]}>All children</Text>
          </TouchableOpacity>
          {sortedChildren.map((child) => {
            const active = String(selectedChildId) === String(child.id);
            return (
              <TouchableOpacity
                key={child.id}
                onPress={() => setSelectedChildId(active ? null : child.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {child.first_name || child.name || 'Unknown'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionRow}>
        <View style={styles.sectionColumn}>
          <Text style={styles.label}>Start date</Text>
          <TextInput
            value={startsOn}
            onChangeText={setStartsOn}
            placeholder="YYYY-MM-DD"
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.sectionColumn}>
          <Text style={styles.label}>End date</Text>
          <TextInput
            value={endsOn}
            onChangeText={setEndsOn}
            placeholder="YYYY-MM-DD"
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Reason (optional)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Family trip, testing week, etc."
          style={[styles.input, styles.notesInput]}
          multiline
        />
      </View>

      <TouchableOpacity
        onPress={handleCreate}
        style={styles.primaryButton}
        disabled={saving}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Add blackout'}</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={styles.heading}>Existing blackouts</Text>
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : existing.length === 0 ? (
        <Text style={styles.muted}>No blackout periods yet.</Text>
      ) : (
        existing.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{getChildName(item.child_id, sortedChildren)}</Text>
              <Text style={styles.cardSubtitle}>
                {formatDate(item.starts_on)} → {formatDate(item.ends_on)}
              </Text>
              {item.reason && (
                <Text style={styles.cardReason}>{item.reason}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item.id)}
              accessibilityLabel="Remove blackout"
            >
              <Trash2 size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  section: {
    gap: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionColumn: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f2937',
  },
  chipTextActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  muted: {
    color: '#6b7280',
    fontSize: 13,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#4b5563',
  },
  cardReason: {
    fontSize: 12,
    color: '#6b7280',
  },
  deleteButton: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    backgroundColor: 'rgba(254,226,226,0.6)',
  },
});

/**
 * Tutor-only block on event modal when a linked assignment has an active help request.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { updateAssignment } from '../../lib/services/assignmentsClient';
import { extractStudentHelpReason } from './tutorHelpUtils';
import { assignmentRowLinksEventId } from '../../lib/assignmentLinkedEventUtils';
import { colors } from '../../theme/colors';

export default function TutorEventHelpPanel({ eventId, familyId, onUpdated }) {
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!eventId || !familyId) {
        setAssignment(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from('assignments')
          .select('id, title, need_help, description, help_message_log, child_id, linked_event_ids')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(200);
        const match =
          !error && rows?.length
            ? rows.find((r) => assignmentRowLinksEventId(r, eventId)) || null
            : null;
        if (!cancelled) setAssignment(error ? null : match);
      } catch (e) {
        if (!cancelled) setAssignment(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [eventId, familyId]);

  if (loading || !assignment?.need_help) return null;

  const reason = extractStudentHelpReason(assignment);

  const appendNote = async (clearNeedHelp) => {
    if (!assignment?.id) return;
    setBusy(true);
    try {
      const block = note.trim() ? `[Tutor note]\n${note.trim()}` : '';
      const prev = (assignment.description || '').trim();
      const nextDesc = block ? (prev ? `${prev}\n\n${block}` : block) : prev;
      const payload = {};
      if (block) payload.description = nextDesc;
      if (clearNeedHelp) payload.need_help = false;
      if (Object.keys(payload).length === 0) return;
      const { error } = await updateAssignment(assignment.id, payload);
      if (!error) {
        setNote('');
        setAssignment((a) => (a ? { ...a, ...payload } : a));
        onUpdated?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Student needs help</Text>
      <View style={styles.chip}>
        <Text style={styles.chipText}>“{reason}”</Text>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Add guidance note for the parent…"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => appendNote(false)}
          disabled={busy || !note.trim()}
          {...(Platform.OS === 'web' && { cursor: busy || !note.trim() ? 'not-allowed' : 'pointer' })}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Add note</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnGhost}
          onPress={() => appendNote(true)}
          disabled={busy}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.btnGhostText}>Mark resolved</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Parents stay in charge of the schedule — suggest changes, don’t silently edit.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.15)',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  chipText: {
    fontSize: 13,
    color: '#4338ca',
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  btnPrimary: {
    backgroundColor: 'rgba(79, 70, 229, 1)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  btnGhost: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    backgroundColor: '#fff',
  },
  btnGhostText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  hint: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});

/**
 * Tutor home right rail — "What needs my input right now?"
 * Tabs: Needs help (default) · In progress · Upcoming
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getAssignments, updateAssignment } from '../../lib/services/assignmentsClient';
import { colors } from '../../theme/colors';
import { useSession } from '../../contexts/SessionContext';
import { extractStudentHelpReason, formatDueShort } from './tutorHelpUtils';
import { isSchoolWorkEventType } from '../child/childHomeRailHelpers';

const TABS = [
  { id: 'needs_help', label: 'Needs help' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'upcoming', label: 'Upcoming' },
];

function normalizeChildIds(session) {
  const raw = session?.accessible_children || [];
  return raw.map((c) => (typeof c === 'string' ? c : c?.id)).filter(Boolean);
}

export default function TutorHomeRightRail({ familyId, onOpenEvent, onOpenPlanner }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('needs_help');
  const [filterChildId, setFilterChildId] = useState('all');
  const [childrenById, setChildrenById] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [respondModal, setRespondModal] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [sending, setSending] = useState(false);

  const childIds = useMemo(() => normalizeChildIds(session), [session]);

  const load = useCallback(async () => {
    if (!familyId || childIds.length === 0) {
      setAssignments([]);
      setUpcomingEvents([]);
      setChildrenById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: kids, error: kidsErr } = await supabase
        .from('children')
        .select('id, first_name, name, avatar')
        .in('id', childIds);
      if (!kidsErr && kids) {
        const map = {};
        kids.forEach((c) => {
          map[c.id] = c;
        });
        setChildrenById(map);
      }

      const rows = [];
      for (const cid of childIds) {
        const { data, error } = await getAssignments(cid);
        if (!error && data) {
          data.forEach((a) => rows.push({ ...a, child_id: cid, child: kids?.find((k) => k.id === cid) }));
        }
      }
      setAssignments(rows);

      const now = new Date();
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + 21);
      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('id, title, start_ts, end_ts, child_id, event_type, subject_id, status')
        .eq('family_id', familyId)
        .in('child_id', childIds)
        .gte('start_ts', now.toISOString())
        .lte('start_ts', horizon.toISOString())
        .in('status', ['scheduled', 'in_progress'])
        .is('deleted_at', null)
        .order('start_ts', { ascending: true })
        .limit(40);
      if (!evErr && ev) {
        const school = ev.filter((e) => isSchoolWorkEventType(e.event_type));
        const subIds = [...new Set(school.map((e) => e.subject_id).filter(Boolean))];
        let subMap = {};
        if (subIds.length) {
          const { data: subs } = await supabase.from('subject').select('id, name').in('id', subIds);
          if (subs) subs.forEach((s) => (subMap[s.id] = s));
        }
        setUpcomingEvents(
          school.map((e) => ({
            ...e,
            subject: e.subject_id ? subMap[e.subject_id] : null,
            child: kids?.find((k) => k.id === e.child_id),
          }))
        );
      } else {
        setUpcomingEvents([]);
      }
    } catch (e) {
      console.error('[TutorHomeRightRail]', e);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [familyId, childIds.join(',')]);

  useEffect(() => {
    if (session && !session.loading) load();
  }, [session, load]);

  const childName = (cid) => childrenById[cid]?.first_name || childrenById[cid]?.name || 'Student';

  const needsHelpFiltered = useMemo(() => {
    let list = assignments.filter((a) => a.need_help === true);
    if (filterChildId !== 'all') list = list.filter((a) => a.child_id === filterChildId);
    return list.sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (da !== db) return da - db;
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
  }, [assignments, filterChildId]);

  const inProgressFiltered = useMemo(() => {
    let list = assignments.filter((a) => {
      const s = (a.status || '').toLowerCase();
      return s === 'in_progress' || s === 'not_started';
    });
    if (filterChildId !== 'all') list = list.filter((a) => a.child_id === filterChildId);
    return list.slice(0, 20);
  }, [assignments, filterChildId]);

  const upcomingFiltered = useMemo(() => {
    let list = [...upcomingEvents];
    if (filterChildId !== 'all') list = list.filter((e) => e.child_id === filterChildId);
    return list;
  }, [upcomingEvents, filterChildId]);

  const openAssignmentEvent = (a) => {
    const ids = a.linked_event_ids;
    const arr = Array.isArray(ids) ? ids : [];
    const eid = arr[0];
    if (eid && onOpenEvent) {
      onOpenEvent(String(eid));
      return;
    }
    if (onOpenPlanner) onOpenPlanner();
  };

  const sendTutorResponse = async () => {
    if (!respondModal?.id || !responseText.trim()) return;
    setSending(true);
    try {
      const prev = (respondModal.assignment.description || '').trim();
      const block = `[Tutor response]\n${responseText.trim()}`;
      const nextDesc = prev ? `${prev}\n\n${block}` : block;
      const { error } = await updateAssignment(respondModal.assignment.id, {
        description: nextDesc,
        need_help: false,
      });
      if (error) throw error;
      setRespondModal(null);
      setResponseText('');
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const markResolved = async (a) => {
    try {
      const { error } = await updateAssignment(a.id, { need_help: false });
      if (!error) load();
    } catch (e) {
      console.error(e);
    }
  };

  const formatEventWhen = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const label =
      day.getTime() === today.getTime()
        ? 'Today'
        : day.getTime() === tomorrow.getTime()
          ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${label} ${time}`;
  };

  const renderNeedsHelp = () => {
    if (needsHelpFiltered.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No help requests right now</Text>
          <Text style={styles.emptyHint}>When students ask for help, they’ll appear here.</Text>
        </View>
      );
    }
    return needsHelpFiltered.map((a) => {
      const reason = extractStudentHelpReason(a);
      const sub = a.related_subject_name || a.subject?.name || '';
      const dueLine = [formatDueShort(a.due_date), sub].filter(Boolean).join(' · ');
      return (
        <View key={a.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {childName(a.child_id)} — {a.title || 'Schoolwork'}
          </Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Asked: “{reason}”</Text>
          </View>
          {dueLine ? <Text style={styles.meta}>{dueLine}</Text> : null}
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => setRespondModal({ assignment: a, id: a.id })}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.btnPrimaryText}>Respond</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => openAssignmentEvent(a)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.btnGhostText}>Open</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    });
  };

  const renderInProgress = () => {
    if (inProgressFiltered.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing in progress</Text>
          <Text style={styles.emptyHint}>Active work from your students will show here.</Text>
        </View>
      );
    }
    return inProgressFiltered.map((a) => {
      const sub = a.related_subject_name || a.related_subject?.name || '';
      const status = (a.status || '').replace(/_/g, ' ');
      return (
        <View key={a.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {childName(a.child_id)} — {a.title || 'Assignment'}
          </Text>
          <Text style={styles.meta}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {formatDueShort(a.due_date) ? ` · ${formatDueShort(a.due_date)}` : ''}
            {sub ? ` · ${sub}` : ''}
          </Text>
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => openAssignmentEvent(a)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.btnGhostText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => setRespondModal({ assignment: a, id: a.id, noteOnly: true })}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.btnGhostText}>Add note</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    });
  };

  const renderUpcoming = () => {
    if (upcomingFiltered.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing upcoming</Text>
          <Text style={styles.emptyHint}>Scheduled lessons and deadlines appear here.</Text>
        </View>
      );
    }
    return upcomingFiltered.map((ev) => {
      const et = formatEventWhen(ev.start_ts);
      const sub = ev.subject?.name || '';
      return (
        <View key={ev.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {childName(ev.child_id)} — {ev.title || 'Event'}
          </Text>
          <Text style={styles.meta}>
            {(ev.event_type || 'Lesson').replace(/_/g, ' ')} · {et}
            {sub ? ` · ${sub}` : ''}
          </Text>
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => onOpenEvent && onOpenEvent(ev.id)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.btnPrimaryText}>Prepare</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => onOpenEvent && onOpenEvent(ev.id)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.btnGhostText}>View</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    });
  };

  if (loading && assignments.length === 0 && upcomingEvents.length === 0) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>What needs your input?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterChildId === 'all' && styles.filterChipOn]}
          onPress={() => setFilterChildId('all')}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={[styles.filterChipText, filterChildId === 'all' && styles.filterChipTextOn]}>All students</Text>
        </TouchableOpacity>
        {childIds.map((cid) => (
          <TouchableOpacity
            key={cid}
            style={[styles.filterChip, filterChildId === cid && styles.filterChipOn]}
            onPress={() => setFilterChildId(cid)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.filterChipText, filterChildId === cid && styles.filterChipTextOn]}>{childName(cid)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabOn]}
            onPress={() => setTab(t.id)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {tab === 'needs_help' && renderNeedsHelp()}
        {tab === 'in_progress' && renderInProgress()}
        {tab === 'upcoming' && renderUpcoming()}
      </ScrollView>

      <Modal visible={!!respondModal} transparent animationType="fade" onRequestClose={() => setRespondModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {respondModal?.noteOnly ? 'Add note' : `Respond to ${childName(respondModal?.assignment?.child_id)}`}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Write a short message for the family…"
              placeholderTextColor={colors.muted}
              value={responseText}
              onChangeText={setResponseText}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setRespondModal(null)}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              {!respondModal?.noteOnly && (
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => respondModal?.assignment && markResolved(respondModal.assignment)}
                >
                  <Text style={styles.btnGhostText}>Mark resolved</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={sendTutorResponse}
                disabled={sending || !responseText.trim()}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  headline: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 10,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    backgroundColor: '#f8fafc',
  },
  filterChipOn: {
    borderColor: 'rgba(79, 70, 229, 0.45)',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  filterChipTextOn: {
    color: 'rgba(79, 70, 229, 1)',
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
  },
  tabOn: {
    borderColor: 'rgba(79, 70, 229, 0.45)',
    backgroundColor: 'rgba(79, 70, 229, 0.12)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  tabTextOn: {
    color: 'rgba(79, 70, 229, 1)',
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  card: {
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 16,
  },
  chipText: {
    fontSize: 13,
    color: '#4338ca',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  btnPrimary: {
    backgroundColor: 'rgba(79, 70, 229, 1)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  btnGhost: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    backgroundColor: '#fff',
    minWidth: 88,
    alignItems: 'center',
  },
  btnGhostText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 16,
  },
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: colors.text,
  },
  modalInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});

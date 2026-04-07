/**
 * Read-only: where a material appears on the schedule (events) and which plan year / unit / lesson.
 * Used in Add/Edit Material and Material Details so attachment context stays visible app-wide.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { getMaterialLinkages } from '../../lib/services/materialsClient';

const SUB = '#6b7280';
const FG = '#111827';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const ACCENT = '#2563eb';

function lessonUnitLine(ev) {
  const unit = ((ev.curriculum_unit_title || ev.unit || '') + '').trim();
  const lesson = ((ev.lesson || '') + '').trim();
  const parts = [];
  if (unit) parts.push(unit);
  if (lesson) parts.push(lesson);
  return parts.join(' · ') || null;
}

function openEventOnWeb(eventId) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !eventId) return;
  window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId } }));
}

export default function MaterialScheduleLinksSection({
  materialId,
  familyId,
  /** Increment to refetch after save (AddMaterialModal). */
  refreshToken = 0,
  /** Attachment details: hide label + card when nothing is linked (after load). */
  hideWhenEmpty = false,
  /** When set, rendered above the card (used with hideWhenEmpty in MaterialDetailsModal). */
  categoryTitle = null,
  categoryTitleStyle = null,
  /** Fires after each load finishes: whether any calendar/plan links exist. */
  onLinkageResolved = null,
}) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [planYearById, setPlanYearById] = useState({});

  const load = useCallback(async () => {
    if (!materialId || !familyId) {
      setEvents([]);
      setPlanYearById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { events: evs, planYearById: plans } = await getMaterialLinkages(materialId, familyId);
      setEvents(evs || []);
      setPlanYearById(plans || {});
    } catch (_) {
      setEvents([]);
      setPlanYearById({});
    } finally {
      setLoading(false);
    }
  }, [materialId, familyId]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !materialId) return;
    const onSync = () => {
      load();
    };
    window.addEventListener('refreshMaterials', onSync);
    window.addEventListener('materialUpdated', onSync);
    return () => {
      window.removeEventListener('refreshMaterials', onSync);
      window.removeEventListener('materialUpdated', onSync);
    };
  }, [materialId, load]);

  useEffect(() => {
    if (!onLinkageResolved || loading) return;
    onLinkageResolved(events.length > 0);
  }, [loading, events.length, onLinkageResolved]);

  if (!materialId || !familyId) return null;

  if (hideWhenEmpty && loading) return null;

  if (hideWhenEmpty && !loading && events.length === 0) return null;

  const card = (
    <View style={styles.blockSection}>
      <TouchableOpacity
        style={[styles.sectionHeader, open && styles.sectionHeaderWithBody]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={styles.sectionTitle}>Schedule Link</Text>
        {open ? <ChevronUp size={20} color={SUB} /> : <ChevronDown size={20} color={SUB} />}
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator size="small" color={ACCENT} style={{ marginVertical: 8 }} />
          ) : events.length === 0 ? (
            <Text style={styles.hint}>
              Not linked to a calendar event yet. Attach this material from an event or lesson in the planner to
              connect it to your plan.
            </Text>
          ) : (
            events.map((ev, idx) => {
              const dateStr = (ev.date_local && String(ev.date_local).slice(0, 10)) || '';
              const planName = ev.academic_year_id ? planYearById[ev.academic_year_id] : null;
              const unitLesson = lessonUnitLine(ev);
              const roleLabel = ev.linkRole === 'primary' ? 'Primary' : 'Attachment';
              return (
                <View key={ev.id} style={[styles.row, idx === 0 && styles.rowFirst]}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowTopIcon}>
                      <Calendar size={14} color={MUTED} />
                    </View>
                    <Text style={styles.dateText}>{dateStr || '—'}</Text>
                    <Text style={styles.badge}>{roleLabel}</Text>
                  </View>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {ev.title || 'Untitled event'}
                  </Text>
                  {planName ? (
                    <Text style={styles.metaLine}>
                      <Text style={styles.metaLabel}>Plan: </Text>
                      {planName}
                    </Text>
                  ) : null}
                  {unitLesson ? (
                    <Text style={styles.metaLine}>
                      <Text style={styles.metaLabel}>Unit / lesson: </Text>
                      {unitLesson}
                    </Text>
                  ) : null}
                  {Platform.OS === 'web' ? (
                    <TouchableOpacity onPress={() => openEventOnWeb(ev.id)} style={styles.openLink}>
                      <Text style={styles.openLinkText}>Open in calendar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );

  if (categoryTitle) {
    return (
      <>
        <Text style={categoryTitleStyle}>{categoryTitle}</Text>
        {card}
      </>
    );
  }

  return card;
}

const styles = StyleSheet.create({
  /* Matches AddMaterialModal `blockSection` / `sectionHeader` / `sectionTitle` (Provider, Review, etc.) */
  blockSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    overflow: 'visible',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sectionHeaderWithBody: {
    marginBottom: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  body: {
    paddingBottom: 0,
  },
  hint: {
    fontSize: 13,
    color: SUB,
    lineHeight: 19,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  rowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowTopIcon: {
    marginRight: 6,
  },
  dateText: {
    fontSize: 12,
    color: MUTED,
    flex: 1,
  },
  badge: {
    fontSize: 11,
    color: SUB,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 4,
  },
  metaLine: {
    fontSize: 13,
    color: SUB,
    marginTop: 2,
  },
  metaLabel: {
    fontWeight: '600',
    color: MUTED,
  },
  openLink: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  openLinkText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '600',
  },
});

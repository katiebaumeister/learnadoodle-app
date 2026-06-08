import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BoardView from '../planner/BoardView';
import { addDays, startOfWeek } from '../planner/utils/date';

const SCHEDULE_VIEWS = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'agenda', label: 'Agenda' },
];

function localYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getEventAnchor(event) {
  return event?.start_ts || event?.due_ts || event?.start || null;
}

function formatAgendaDateLabel(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Upcoming';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatEventTime(event) {
  const anchor = getEventAnchor(event);
  if (!anchor) return 'All day';
  const date = new Date(anchor);
  if (Number.isNaN(date.getTime())) return '';
  const raw = String(anchor);
  if (/T00:00(?::00)?/i.test(raw)) return 'All day';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function AgendaList({ events, onEventPress }) {
  const grouped = useMemo(() => {
    const sorted = [...events]
      .filter((ev) => ev?.status !== 'canceled')
      .sort((a, b) => new Date(getEventAnchor(a) || 0) - new Date(getEventAnchor(b) || 0));
    const map = new Map();
    sorted.forEach((ev) => {
      const anchor = getEventAnchor(ev);
      const label = anchor ? formatAgendaDateLabel(anchor) : 'Unscheduled';
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(ev);
    });
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [events]);

  if (grouped.length === 0) {
    return <Text style={styles.emptyText}>No scheduled items for this subject yet.</Text>;
  }

  return (
    <View style={styles.agendaList}>
      {grouped.map((group) => (
        <View key={group.label} style={styles.agendaGroup}>
          <Text style={styles.agendaGroupLabel}>{group.label}</Text>
          {group.items.map((ev) => (
            <TouchableOpacity
              key={ev.id}
              style={styles.agendaRow}
              onPress={() => onEventPress?.(ev)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.agendaRowMain}>
                <Text style={styles.agendaRowTitle} numberOfLines={1}>
                  {ev.title || ev.event_type || 'Event'}
                </Text>
                <Text style={styles.agendaRowMeta}>
                  {[ev.event_type, formatEventTime(ev)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

function MonthList({ events, monthDate, onEventPress }) {
  const grouped = useMemo(() => {
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();
    const inMonth = events.filter((ev) => {
      const anchor = getEventAnchor(ev);
      if (!anchor) return false;
      const d = new Date(anchor);
      return d.getMonth() === month && d.getFullYear() === year && ev?.status !== 'canceled';
    });
    inMonth.sort((a, b) => new Date(getEventAnchor(a)) - new Date(getEventAnchor(b)));
    const map = new Map();
    inMonth.forEach((ev) => {
      const key = localYmd(new Date(getEventAnchor(ev)));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    });
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }, [events, monthDate]);

  if (grouped.length === 0) {
    return <Text style={styles.emptyText}>Nothing scheduled this month.</Text>;
  }

  return (
    <View style={styles.agendaList}>
      {grouped.map((group) => (
        <View key={group.key} style={styles.agendaGroup}>
          <Text style={styles.agendaGroupLabel}>
            {new Date(`${group.key}T12:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          {group.items.map((ev) => (
            <TouchableOpacity
              key={ev.id}
              style={styles.agendaRow}
              onPress={() => onEventPress?.(ev)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.agendaRowMain}>
                <Text style={styles.agendaRowTitle} numberOfLines={1}>
                  {ev.title || ev.event_type || 'Event'}
                </Text>
                <Text style={styles.agendaRowMeta}>
                  {[ev.event_type, formatEventTime(ev)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function LearningSubjectScheduleTab({
  events = [],
  children = [],
  familyId = null,
  onEventPress,
  onEventRightClick,
  onEventComplete,
}) {
  const [view, setView] = useState('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());

  const activeEvents = useMemo(
    () => (events || []).filter((ev) => ev?.status !== 'canceled' && !ev?.is_backlog),
    [events]
  );

  const periodLabel = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(anchorDate);
      const end = addDays(start, 6);
      const sameMonth = start.getMonth() === end.getMonth();
      if (sameMonth) {
        return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [view, anchorDate]);

  const shiftAnchor = (direction) => {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      if (view === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const agendaEvents = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return activeEvents.filter((ev) => {
      const anchor = getEventAnchor(ev);
      if (!anchor) return true;
      const d = new Date(anchor);
      d.setHours(0, 0, 0, 0);
      return d >= now || ev?.status !== 'done';
    });
  }, [activeEvents]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.viewToggle}>
          {SCHEDULE_VIEWS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.viewBtn, view === option.key && styles.viewBtnActive]}
              onPress={() => setView(option.key)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[styles.viewBtnText, view === option.key && styles.viewBtnTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {view !== 'agenda' ? (
          <View style={styles.periodNav}>
            <TouchableOpacity onPress={() => shiftAnchor(-1)} style={styles.navBtn}>
              <ChevronLeft size={18} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.periodLabel}>{periodLabel}</Text>
            <TouchableOpacity onPress={() => shiftAnchor(1)} style={styles.navBtn}>
              <ChevronRight size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {view === 'week' ? (
        <BoardView
          weekAnchor={anchorDate}
          events={activeEvents}
          children={children}
          familyId={familyId}
          onEventPress={onEventPress}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      ) : null}

      {view === 'month' ? (
        <MonthList events={activeEvents} monthDate={anchorDate} onEventPress={onEventPress} />
      ) : null}

      {view === 'agenda' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <AgendaList events={agendaEvents} onEventPress={onEventPress} />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  viewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  viewBtnTextActive: {
    color: '#0F172A',
  },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    minWidth: 140,
    textAlign: 'center',
  },
  agendaList: {
    gap: 16,
  },
  agendaGroup: {
    gap: 8,
  },
  agendaGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  agendaRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  agendaRowMain: {
    gap: 2,
  },
  agendaRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  agendaRowMeta: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
});

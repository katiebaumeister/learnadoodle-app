import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { ChevronLeft, ChevronRight, ChevronDown, Filter } from 'lucide-react';
import { addMonths, addWeeks } from './utils/date';
import { formatWeekRangeLabel } from './plannerSectionRouting';

import { PLANNER_EVENT_CATEGORIES } from '../../lib/planner/plannerEventCategories';

const VIEW_OPTIONS = [
  { key: 'board', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'tasks', label: 'Agenda' },
];

export default function PlannerCalendarToolbar({
  anchorDate,
  viewMode = 'board',
  onDateChange,
  onViewChange,
  children = [],
  selectedChildIds = null,
  onSelectedChildIdsChange,
  selectedEventTypes = null,
  onSelectedEventTypesChange,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const date = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? anchorDate
    : new Date();
  const normalizedView = String(viewMode || 'board').toLowerCase();
  const isWeekLike = normalizedView === 'board' || normalizedView === 'week';

  const goPrev = () => {
    const next = isWeekLike ? addWeeks(date, -1) : addMonths(date, -1);
    onDateChange?.(next);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: next }));
    }
  };

  const goNext = () => {
    const next = isWeekLike ? addWeeks(date, 1) : addMonths(date, 1);
    onDateChange?.(next);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: next }));
    }
  };

  const goToday = () => {
    const today = new Date();
    onDateChange?.(today);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: today }));
    }
  };

  const setView = (key) => {
    onViewChange?.(key);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', key);
      window.history.pushState({}, '', url);
      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: key }));
    }
  };

  const rangeLabel = isWeekLike
    ? formatWeekRangeLabel(date)
    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <TouchableOpacity style={styles.todayBtn} onPress={goToday} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <Text style={styles.todayText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goPrev} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <ChevronLeft size={18} color="#64748B" />
        </TouchableOpacity>
        <TouchableOpacity onPress={goNext} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <ChevronRight size={18} color="#64748B" />
        </TouchableOpacity>
        <View style={styles.rangePill}>
          <Text style={styles.rangeText}>{rangeLabel}</Text>
          <ChevronDown size={14} color="#64748B" />
        </View>
      </View>
      <View style={styles.right}>
        <View style={styles.viewToggle}>
          {VIEW_OPTIONS.map((opt) => {
            const active = normalizedView === opt.key || (opt.key === 'board' && normalizedView === 'week');
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.viewBtn, active && styles.viewBtnActive]}
                onPress={() => setView(opt.key)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={[styles.viewBtnText, active && styles.viewBtnTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.filterWrap}>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setShowFilters((v) => !v)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Filter size={14} color="#374151" />
            <Text style={styles.filterText}>Filter</Text>
          </TouchableOpacity>
          {showFilters ? (
            <View style={styles.filterMenu}>
              {Array.isArray(children) && children.length > 1 ? (
                <>
                  <Text style={styles.filterHeading}>Children</Text>
                  <TouchableOpacity
                    style={styles.filterRow}
                    onPress={() => onSelectedChildIdsChange?.(null)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.filterLabel}>All children</Text>
                  </TouchableOpacity>
                  {children.map((child) => {
                    const id = child.id;
                    const selected = Array.isArray(selectedChildIds) && selectedChildIds.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        style={styles.filterRow}
                        onPress={() => {
                          const current = Array.isArray(selectedChildIds) ? selectedChildIds : [];
                          const next = selected
                            ? current.filter((cid) => cid !== id)
                            : [...current, id];
                          onSelectedChildIdsChange?.(next.length > 0 ? next : null);
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[styles.filterLabel, selected && styles.filterLabelActive]}>
                          {child.first_name || child.name || 'Child'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}
              <Text style={styles.filterHeading}>Event types</Text>
              <TouchableOpacity
                style={styles.filterRow}
                onPress={() => onSelectedEventTypesChange?.(null)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.filterLabel}>All types</Text>
              </TouchableOpacity>
              {PLANNER_EVENT_CATEGORIES.map((opt) => {
                const selected = Array.isArray(selectedEventTypes) && selectedEventTypes.includes(opt.key);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.filterRow}
                    onPress={() => {
                      const current = Array.isArray(selectedEventTypes) ? selectedEventTypes : [];
                      const next = selected
                        ? current.filter((t) => t !== opt.key)
                        : [...current, opt.key];
                      onSelectedEventTypesChange?.(next.length > 0 ? next : null);
                    }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[styles.filterLabel, selected && styles.filterLabelActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
  },
  todayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  rangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rangeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
    padding: 3,
  },
  viewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewBtnActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  viewBtnTextActive: {
    color: '#2563EB',
  },
  filterWrap: {
    position: 'relative',
    zIndex: 20,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  filterMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 180,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)' }),
  },
  filterHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(15, 23, 42, 0.45)',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  filterRow: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
  },
  filterLabel: {
    fontSize: 13,
    color: '#374151',
  },
  filterLabelActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
});

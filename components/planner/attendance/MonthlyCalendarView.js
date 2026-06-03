import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ATTENDANCE_COLORS, TOKENS } from './constants';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CELL_SIZE = 40;
const CAL_GAP = 3;
const CAL_RADIUS = 10;
const MONTH_PANEL_WIDTH = 7 * (CELL_SIZE + CAL_GAP);
const SCROLL_MONTH_WINDOW = 12;
const MONTH_LABEL_HEIGHT = 28;
const DAY_HEADERS_HEIGHT = 24;
const MONTH_GRID_MAX_ROWS = 6;
const MONTH_GRID_ROW_HEIGHT = CELL_SIZE + 2;
const MONTH_GRID_HEIGHT = MONTH_GRID_MAX_ROWS * MONTH_GRID_ROW_HEIGHT;
const MONTH_PANEL_HEIGHT = MONTH_LABEL_HEIGHT + DAY_HEADERS_HEIGHT + MONTH_GRID_HEIGHT;
const MONTH_SCROLL_VIEW_HEIGHT = MONTH_PANEL_HEIGHT;

function buildMonthCells(panelMonthDate) {
  const year = panelMonthDate.getFullYear();
  const month = panelMonthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  const fullRows = Math.ceil(cells.length / 7);
  while (cells.length < fullRows * 7) cells.push(null);
  return { year, month, cells, fullRows };
}

function monthOffset(fromDate, toDate) {
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12
    + (toDate.getMonth() - fromDate.getMonth())
  );
}

function MonthCalendarGrid({
  panelMonthDate,
  dayStatusByChild = {},
  selectedChildId,
  selectedDateKey,
  onDayPress,
  children = [],
}) {
  const { year, month, cells, fullRows } = buildMonthCells(panelMonthDate);
  const [hoveredKey, setHoveredKey] = useState(null);

  const getDayKey = (day) => {
    const d = new Date(year, month, day);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  const getStatusForDay = (day) => {
    if (!day) return null;
    const key = getDayKey(day);
    const childIds = children.length > 0 ? children.map((c) => c.id) : (selectedChildId ? [selectedChildId] : []);
    let hasAny = false;
    let hasAbsent = false;
    let hasUnmarked = false;
    let hasPresent = false;
    childIds.forEach((cid) => {
      const status = dayStatusByChild[cid]?.[key];
      if (!status || status === 'noEvents') return;
      hasAny = true;
      if (status === 'absent') hasAbsent = true;
      else if (status === 'unmarked') hasUnmarked = true;
      else if (status === 'present') hasPresent = true;
    });
    if (!hasAny) return 'noEvents';
    if (hasAbsent) return 'absent';
    if (hasUnmarked) return 'unmarked';
    if (hasPresent) return 'present';
    return 'noEvents';
  };

  return (
    <View style={styles.grid}>
      {Array.from({ length: fullRows }, (_, r) => (
        <View key={r} style={styles.weekRow}>
          {cells.slice(r * 7, r * 7 + 7).map((day, c) => {
            const i = r * 7 + c;
            const status = getStatusForDay(day);
            const hasAttendance = status && status !== 'noEvents';
            const color = hasAttendance ? (ATTENDANCE_COLORS[status] || (status === 'partial' ? ATTENDANCE_COLORS.present : null)) : null;
            const key = day ? getDayKey(day) : `empty-${year}-${month}-${i}`;
            const isSelected = day && selectedDateKey === key;
            const isHovered = Platform.OS === 'web' && day && hoveredKey === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.cell,
                  !day && styles.cellEmpty,
                  day && (hasAttendance ? { backgroundColor: color, borderColor: color } : styles.cellDefault),
                  day && isSelected && styles.cellSelectedOutline,
                  Platform.OS === 'web' && day && styles.cellWeb,
                  isHovered && styles.cellHover,
                ]}
                onPress={() => day && onDayPress && onDayPress(key)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && day && {
                  onMouseEnter: () => setHoveredKey(key),
                  onMouseLeave: () => setHoveredKey(null),
                })}
              >
                {day ? (
                  <Text style={styles.cellDay}>{day}</Text>
                ) : null}
                {day && hasAttendance && !isSelected && (
                  <View style={[styles.indicator, { backgroundColor: color }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function MonthlyCalendarView({
  monthDate,
  dayStatusByChild = {},
  selectedChildId,
  selectedDateKey,
  onMonthChange,
  onDayPress,
  children = [],
  enableVerticalMonthScroll = false,
  /** @deprecated use enableVerticalMonthScroll */
  enableHorizontalMonthScroll = false,
}) {
  const monthScrollEnabled = enableVerticalMonthScroll || enableHorizontalMonthScroll;
  const monthLabel = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const [hoverPrev, setHoverPrev] = useState(false);
  const [hoverNext, setHoverNext] = useState(false);
  const scrollRef = useRef(null);
  const scrollSyncingRef = useRef(false);

  const scrollMonths = useMemo(() => {
    if (!monthScrollEnabled) return [];
    const center = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const months = [];
    for (let i = -SCROLL_MONTH_WINDOW; i <= SCROLL_MONTH_WINDOW; i += 1) {
      months.push(new Date(center.getFullYear(), center.getMonth() + i, 1));
    }
    return months;
  }, [monthScrollEnabled, monthDate]);

  const centerScrollIndex = SCROLL_MONTH_WINDOW;

  useEffect(() => {
    if (!monthScrollEnabled || !scrollRef.current) return;
    scrollSyncingRef.current = true;
    scrollRef.current.scrollTo({
      y: centerScrollIndex * MONTH_PANEL_HEIGHT,
      animated: false,
    });
    const timer = setTimeout(() => {
      scrollSyncingRef.current = false;
    }, 50);
    return () => clearTimeout(timer);
  }, [monthScrollEnabled, monthDate.getFullYear(), monthDate.getMonth(), centerScrollIndex]);

  const applyMonthFromScrollIndex = useCallback((index) => {
    if (!monthScrollEnabled || !scrollMonths.length) return;
    const clamped = Math.max(0, Math.min(scrollMonths.length - 1, index));
    const target = scrollMonths[clamped];
    const delta = monthOffset(monthDate, target);
    if (delta !== 0 && typeof onMonthChange === 'function') onMonthChange(delta);
  }, [monthScrollEnabled, scrollMonths, monthDate, onMonthChange]);

  const handleScrollEnd = useCallback((event) => {
    if (!monthScrollEnabled || scrollSyncingRef.current) return;
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    const index = Math.round(y / MONTH_PANEL_HEIGHT);
    applyMonthFromScrollIndex(index);
  }, [monthScrollEnabled, applyMonthFromScrollIndex]);

  const dayHeaders = (
    <View style={styles.dayHeaders}>
      {DAY_HEADERS.map((h) => (
        <Text key={h} style={styles.dayHeaderText}>{h}</Text>
      ))}
    </View>
  );

  const calendarGrid = monthScrollEnabled ? (
    <ScrollView
      ref={scrollRef}
      style={styles.monthStackScroll}
      contentContainerStyle={styles.monthStackContent}
      showsVerticalScrollIndicator
      decelerationRate="fast"
      snapToInterval={MONTH_PANEL_HEIGHT}
      snapToAlignment="start"
      disableIntervalMomentum
      nestedScrollEnabled
      onMomentumScrollEnd={handleScrollEnd}
      onScrollEndDrag={handleScrollEnd}
    >
      {scrollMonths.map((panelMonth) => {
        const panelKey = `${panelMonth.getFullYear()}-${panelMonth.getMonth()}`;
        const panelLabel = panelMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
        const isActivePanel = panelMonth.getFullYear() === monthDate.getFullYear()
          && panelMonth.getMonth() === monthDate.getMonth();
        return (
          <View key={panelKey} style={styles.monthStackPanel}>
            <Text style={[styles.monthStackPanelLabel, isActivePanel && styles.monthStackPanelLabelActive]}>
              {panelLabel}
            </Text>
            {dayHeaders}
            <MonthCalendarGrid
              panelMonthDate={panelMonth}
              dayStatusByChild={dayStatusByChild}
              selectedChildId={selectedChildId}
              selectedDateKey={selectedDateKey}
              onDayPress={onDayPress}
              children={children}
            />
          </View>
        );
      })}
    </ScrollView>
  ) : (
    <>
      {dayHeaders}
      <MonthCalendarGrid
        panelMonthDate={monthDate}
        dayStatusByChild={dayStatusByChild}
        selectedChildId={selectedChildId}
        selectedDateKey={selectedDateKey}
        onDayPress={onDayPress}
        children={children}
      />
    </>
  );

  return (
    <View style={styles.wrapper}>
      {!monthScrollEnabled ? (
        <View style={styles.monthNavRow}>
          <TouchableOpacity
            onPress={() => onMonthChange(-1)}
            style={[styles.monthNavBtn, hoverPrev && styles.monthNavBtnHover]}
            {...(Platform.OS === 'web' && {
              onMouseEnter: () => setHoverPrev(true),
              onMouseLeave: () => setHoverPrev(false),
            })}
          >
            <ChevronLeft size={18} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthLabel}</Text>
          <TouchableOpacity
            onPress={() => onMonthChange(1)}
            style={[styles.monthNavBtn, hoverNext && styles.monthNavBtnHover]}
            {...(Platform.OS === 'web' && {
              onMouseEnter: () => setHoverNext(true),
              onMouseLeave: () => setHoverNext(false),
            })}
          >
            <ChevronRight size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      ) : null}
      {calendarGrid}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    maxWidth: MONTH_PANEL_WIDTH,
    width: '100%',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  monthTitle: { fontSize: 15, fontWeight: '600', color: TOKENS.text },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnHover: Platform.OS === 'web' ? {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  } : {},
  monthStackScroll: {
    width: MONTH_PANEL_WIDTH,
    height: MONTH_SCROLL_VIEW_HEIGHT,
    maxWidth: '100%',
  },
  monthStackContent: {
    alignItems: 'flex-start',
  },
  monthStackPanel: {
    width: MONTH_PANEL_WIDTH,
    height: MONTH_PANEL_HEIGHT,
    justifyContent: 'flex-start',
  },
  monthStackPanelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TOKENS.textMuted,
    textAlign: 'center',
    marginBottom: 8,
    height: MONTH_LABEL_HEIGHT - 8,
  },
  monthStackPanelLabelActive: {
    color: TOKENS.text,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeaderText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    fontWeight: '500',
  },
  grid: {},
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: CAL_RADIUS,
    marginHorizontal: CAL_GAP / 2,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  cellEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  cellDefault: {
    backgroundColor: TOKENS.bgSurface,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  cellSelectedOutline: {
    borderColor: 'rgba(17,24,39,0.45)',
    borderWidth: 1,
  },
  cellWeb: {
    cursor: 'pointer',
    ...(Platform.OS === 'web' && { transition: 'background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease' }),
  },
  cellHover: Platform.OS === 'web' ? {
    backgroundColor: '#F3F7FF',
    borderColor: 'rgba(15,23,42,0.14)',
    ...TOKENS.shadow1,
  } : {},
  cellDay: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, fontWeight: '500' },
  indicator: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

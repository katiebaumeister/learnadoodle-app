import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { ATTENDANCE_COLORS, TOKENS } from './attendance/constants';
import {
  buildMonthCells,
  buildMonthsInRange,
  getDayKey,
  resolvePlannerYearRange,
} from './plannerYearRange';
import { isToday } from './utils/date';

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const EVENT_DAY_COLOR = '#6BB8E8';
const NO_EVENT_COLOR = '#F8FAFC';
const TODAY_COLOR = '#0F172A';

function getEventDateKey(event) {
  if (!event) return null;
  if (event.date_local) return String(event.date_local).slice(0, 10);
  if (event.data?.date_local) return String(event.data.date_local).slice(0, 10);
  if (event.start_ts) return String(event.start_ts).slice(0, 10);
  if (event.start) return String(event.start).slice(0, 10);
  return null;
}

function MonthMiniCalendar({
  month,
  eventCountByDate,
  onSelectDay,
  cellSize,
  gap,
  isWeb,
  hoveredCellKey,
  setHoveredCellKey,
}) {
  const { year, monthIndex, firstDay, lastDay } = month;
  const { cells, fullRows } = buildMonthCells(year, monthIndex);

  return (
    <View style={styles.monthPanel}>
      <Text style={styles.monthPanelTitle}>{month.label}</Text>
      <View style={styles.dayHeaders}>
        {DAY_HEADERS.map((h, i) => (
          <Text key={`${h}-${i}`} style={[styles.dayHeaderText, { width: cellSize, marginHorizontal: gap / 2 }]}>
            {h}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: fullRows }, (_, r) => (
          <View key={r} style={styles.weekRow}>
            {cells.slice(r * 7, r * 7 + 7).map((day, c) => {
              const i = r * 7 + c;
              if (!day) {
                return (
                  <View
                    key={`empty-${year}-${monthIndex}-${i}`}
                    style={[styles.cell, styles.cellEmpty, { width: cellSize, height: cellSize, marginHorizontal: gap / 2 }]}
                  />
                );
              }

              const inRange = day >= firstDay && day <= lastDay;
              const key = getDayKey(year, monthIndex, day);
              const cellKey = `${year}-${monthIndex}-${day}`;
              const dayDate = new Date(year, monthIndex, day);
              const hasEvents = inRange && (eventCountByDate[key] || 0) > 0;
              const isTodayCell = inRange && isToday(dayDate);
              const backgroundColor = !inRange
                ? 'transparent'
                : isTodayCell
                  ? TODAY_COLOR
                  : hasEvents
                    ? EVENT_DAY_COLOR
                    : NO_EVENT_COLOR;

              return (
                <TouchableOpacity
                  key={cellKey}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      marginHorizontal: gap / 2,
                      marginBottom: 2,
                      backgroundColor,
                    },
                    inRange && !hasEvents && !isTodayCell && styles.cellNone,
                    !inRange && styles.cellOutOfRange,
                    isWeb && inRange && styles.cellWeb,
                    isWeb && hoveredCellKey === cellKey && styles.cellHover,
                  ]}
                  activeOpacity={0.8}
                  disabled={!inRange}
                  onPress={() => onSelectDay?.(key, dayDate)}
                  {...(isWeb && inRange && {
                    onMouseEnter: () => setHoveredCellKey(cellKey),
                    onMouseLeave: () => setHoveredCellKey(null),
                  })}
                >
                  <Text
                    style={[
                      styles.cellDayText,
                      isTodayCell && styles.cellDayTextToday,
                      !inRange && styles.cellDayTextMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function PlannerYearGrid({
  anchorDate,
  events = [],
  academicYears = null,
  onSelectDay,
  embedded = false,
}) {
  const [hoveredCellKey, setHoveredCellKey] = useState(null);
  const cellSize = TOKENS.hmCell;
  const gap = TOKENS.hmGap;
  const isWeb = Platform.OS === 'web';

  const { yearStart, yearEnd } = useMemo(
    () => resolvePlannerYearRange(anchorDate, academicYears),
    [anchorDate, academicYears],
  );

  const months = useMemo(() => buildMonthsInRange(yearStart, yearEnd), [yearStart, yearEnd]);

  const eventCountByDate = useMemo(() => {
    const counts = {};
    events.forEach((event) => {
      const key = getEventDateKey(event);
      if (!key || key < yearStart || key > yearEnd) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [events, yearStart, yearEnd]);

  const gridBody = (
    <>
      <Text style={styles.sectionHelp}>
        Each month is a mini calendar for your school year. Blue days have scheduled events. Click a day to open the month view.
      </Text>
      <View style={styles.monthGrid}>
        {months.map((m) => (
          <MonthMiniCalendar
            key={`${m.year}-${m.monthIndex}`}
            month={m}
            eventCountByDate={eventCountByDate}
            onSelectDay={onSelectDay}
            cellSize={cellSize}
            gap={gap}
            isWeb={isWeb}
            hoveredCellKey={hoveredCellKey}
            setHoveredCellKey={setHoveredCellKey}
          />
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: EVENT_DAY_COLOR }]} />
          <Text style={styles.legendPillText}>Has events</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.absent }]} />
          <Text style={styles.legendPillText}>Unattended</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: NO_EVENT_COLOR, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' }]} />
          <Text style={styles.legendPillText}>No events</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: TODAY_COLOR }]} />
          <Text style={styles.legendPillText}>Today</Text>
        </View>
      </View>
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedContent}>{gridBody}</View>;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {gridBody}
    </ScrollView>
  );
}

const MONTH_PANEL_WIDTH = 7 * (TOKENS.hmCell + TOKENS.hmGap);

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  embeddedContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  sectionHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: TOKENS.s4,
    lineHeight: 18,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TOKENS.s5,
    paddingVertical: TOKENS.s2,
  },
  monthPanel: {
    width: MONTH_PANEL_WIDTH,
    minWidth: MONTH_PANEL_WIDTH,
  },
  monthPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
    justifyContent: 'center',
  },
  dayHeaderText: {
    textAlign: 'center',
    fontSize: 10,
    color: TOKENS.textMuted,
    fontWeight: '600',
  },
  grid: {},
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  cell: {
    borderRadius: TOKENS.hmRadius,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  cellNone: {
    backgroundColor: 'rgba(15,23,42,0.02)',
    borderColor: 'rgba(15,23,42,0.04)',
  },
  cellOutOfRange: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    opacity: 0.35,
  },
  cellDayText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.75)',
  },
  cellDayTextToday: {
    color: '#FFFFFF',
  },
  cellDayTextMuted: {
    color: TOKENS.textFaint,
  },
  cellWeb: {
    cursor: 'pointer',
    ...(Platform.OS === 'web' && { transition: 'transform 0.12s ease, box-shadow 0.12s ease' }),
  },
  cellHover: Platform.OS === 'web' ? {
    transform: [{ translateY: -1 }],
    ...TOKENS.shadow1,
  } : {},
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: TOKENS.s3,
    marginTop: TOKENS.s4,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOKENS.s2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: TOKENS.bgSubtle,
  },
  legendPillText: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, opacity: 0.9 },
  legendDot: { width: 8, height: 8, borderRadius: 4, opacity: 0.9 },
});

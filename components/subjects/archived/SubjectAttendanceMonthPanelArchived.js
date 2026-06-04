/**
 * ARCHIVED — previous Attendance summary panel (month calendar + attended/unattended/upcoming key).
 * Preserved for reference. Replaced by PlannerEventsListTable in ProgressTab attendance container.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SubjectAttendanceMonthDrilldown } from '../SubjectSectionDrilldownPanels';

const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export function SubjectAttendanceSummaryKeyArchived() {
  return (
    <View style={styles.attendanceSummaryWrap}>
      <View style={styles.attendanceToolbarRow}>
        <View style={styles.attendanceKeyShell}>
          <View style={styles.attendanceKeyRow}>
            <View style={styles.attendanceKeyPill}>
              <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotAttended]} />
              <Text style={styles.attendanceKeyText}>Attended</Text>
            </View>
            <View style={styles.attendanceKeyPill}>
              <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotUnattended]} />
              <Text style={styles.attendanceKeyText}>Unattended</Text>
            </View>
            <View style={styles.attendanceKeyPill}>
              <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotUpcoming]} />
              <Text style={styles.attendanceKeyText}>Upcoming</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function SubjectAttendanceMonthPanelArchived({
  attendanceRecordsForUI = [],
  attendanceEvents = [],
  onOpenEventDetails,
  onToggleEventAttendance,
  onAddEventForDate,
}) {
  return (
    <View style={styles.progressInsightsPanelWrap}>
      <SubjectAttendanceMonthDrilldown
        attendanceRecords={attendanceRecordsForUI.map((record) => ({
          ...record,
          day_date: record?.dayDate,
          event_id: record?.eventId,
        }))}
        subjectEvents={attendanceEvents}
        onOpenEventDetails={onOpenEventDetails}
        onToggleEventAttendance={onToggleEventAttendance}
        onAddEventForDate={onAddEventForDate}
        hideLegend
      />
    </View>
  );
}

const styles = StyleSheet.create({
  progressInsightsPanelWrap: {
    width: '100%',
  },
  attendanceSummaryWrap: { marginBottom: 8 },
  attendanceToolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  attendanceKeyShell: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 999, backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 6 },
  attendanceKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  attendanceKeyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#F3F4F6' },
  attendanceKeyDot: { width: 8, height: 8, borderRadius: 999 },
  attendanceKeyDotAttended: { backgroundColor: '#6BB3E8' },
  attendanceKeyDotUnattended: { backgroundColor: '#F2A0A0' },
  attendanceKeyDotUpcoming: { backgroundColor: '#C7DDF6' },
  attendanceKeyText: { fontSize: 12, color: '#6B7280', ...WEB_BODY_FONT },
});

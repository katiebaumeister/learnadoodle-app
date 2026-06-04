/**
 * ARCHIVED — standalone "All Events" table section on the Subjects / Learning page.
 * Previously rendered below the summary cards (Attendance, Grades, Learning Log, Learning Goals).
 *
 * Replaced by:
 * - Attendance expand panel → PlannerEventsListTable (planner list view)
 * - Learning Log expand panel → SubjectAllEventsSection in reviewCenterMode
 *
 * SubjectAllEventsSection.js remains in use for Learning Log review mode only.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SubjectAllEventsSection from '../SubjectAllEventsSection';

export default function SubjectAllEventsTableSectionArchived({
  events = [],
  eventOutcomes = [],
  materials = [],
  eventAttachmentMaterials = [],
  children = [],
  assignmentsByEventId = {},
  onEventPress,
  onEventRightClick,
  resolveEventAttendanceState,
  onToggleEventAttendance,
  onAttachmentPress,
  canManageEvents = true,
  sectionTitle = 'All Events',
}) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{sectionTitle}</Text>
      </View>
      <View style={styles.body}>
        <SubjectAllEventsSection
          events={events}
          eventOutcomes={eventOutcomes}
          materials={materials}
          eventAttachmentMaterials={eventAttachmentMaterials}
          children={children}
          assignmentsByEventId={assignmentsByEventId}
          onEventPress={onEventPress}
          onEventRightClick={onEventRightClick}
          resolveEventAttendanceState={resolveEventAttendanceState}
          onToggleEventAttendance={onToggleEventAttendance}
          onAttachmentPress={onAttachmentPress}
          canManageEvents={canManageEvents}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
  },
  header: {
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  body: {
    width: '100%',
  },
});

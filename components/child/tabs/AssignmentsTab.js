import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function AssignmentsTab({ child }) {
  // TODO: replace with real assignments from Supabase (type='assignment')
  const assignments = [
    {
      id: "a1",
      title: "Book report draft",
      subject: "Reading",
      due: "Thu, Nov 20",
      status: "Upcoming",
    },
    {
      id: "a2",
      title: "Fractions worksheet",
      subject: "Math",
      due: "Mon, Nov 24",
      status: "Completed",
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Assignments for {child.first_name}</Text>
        <TouchableOpacity style={styles.addButton}>
          <Plus size={14} color={colors.card} />
          <Text style={styles.addButtonText}>Add assignment</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.headerText}>Assignment</Text>
          <Text style={styles.headerText}>Subject</Text>
          <Text style={styles.headerText}>Due</Text>
          <Text style={styles.headerText}>Status</Text>
        </View>

        {assignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No assignments yet. When you add tasks with due dates, they'll show up here.
            </Text>
          </View>
        ) : (
          <View>
            {assignments.map((a, idx) => (
              <View
                key={a.id}
                style={[
                  styles.tableRow,
                  idx !== assignments.length - 1 && styles.tableRowBorder
                ]}
              >
                <View style={styles.assignmentCell}>
                  <Text style={styles.assignmentTitle}>{a.title}</Text>
                </View>
                <Text style={styles.cellText}>{a.subject}</Text>
                <Text style={styles.cellText}>{a.due}</Text>
                <View style={[
                  styles.statusBadge,
                  a.status === "Completed" ? styles.statusCompleted :
                  a.status === "Overdue" ? styles.statusOverdue :
                  styles.statusUpcoming
                ]}>
                  <Text style={[
                    styles.statusText,
                    a.status === "Completed" ? styles.statusCompletedText :
                    a.status === "Overdue" ? styles.statusOverdueText :
                    styles.statusUpcomingText
                  ]}>
                    {a.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.card,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    margin: 16,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.muted,
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  assignmentCell: {
    flex: 2,
  },
  assignmentTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  cellText: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusCompleted: {
    backgroundColor: '#D1FAE5',
  },
  statusOverdue: {
    backgroundColor: '#FEE2E2',
  },
  statusUpcoming: {
    backgroundColor: colors.bgSubtle,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusCompletedText: {
    color: '#065F46',
  },
  statusOverdueText: {
    color: '#991B1B',
  },
  statusUpcomingText: {
    color: colors.muted,
  },
  emptyState: {
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});


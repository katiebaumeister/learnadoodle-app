import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '../../../theme/colors';

export default function SyllabusTab({ child }) {
  // TODO: load from syllabus / curriculum tables
  const syllabusRows = [
    {
      id: "s1",
      subject: "Reading",
      source: "Open syllabi – Grade 2 Reading",
      linkLabel: "View PDF",
      completionPct: 10,
    },
    {
      id: "s2",
      subject: "Math",
      source: "Singapore Math 2A",
      linkLabel: "View outline",
      completionPct: 25,
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Syllabus & curriculum</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.headerText}>Subject</Text>
          <Text style={styles.headerText}>Syllabus source</Text>
          <Text style={styles.headerText}>Progress</Text>
        </View>

        {syllabusRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Link a syllabus for each subject and we'll track progress against it.
            </Text>
          </View>
        ) : (
          <View>
            {syllabusRows.map((row, idx) => (
              <View
                key={row.id}
                style={[
                  styles.tableRow,
                  idx !== syllabusRows.length - 1 && styles.tableRowBorder
                ]}
              >
                <Text style={styles.subjectCell}>{row.subject}</Text>
                <View style={styles.sourceCell}>
                  <Text style={styles.sourceText}>{row.source}</Text>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>{row.linkLabel}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.progressCell}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressPct}>{row.completionPct}% complete</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View
                      style={[styles.progressFill, { width: `${row.completionPct}%` }]}
                    />
                  </View>
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
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
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
  subjectCell: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1.2,
  },
  sourceCell: {
    flex: 2,
    gap: 4,
  },
  sourceText: {
    fontSize: 12,
    color: colors.muted,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7C3AED',
  },
  progressCell: {
    flex: 1.2,
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: {
    fontSize: 11,
    color: colors.muted,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#60A5FA',
    borderRadius: 999,
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


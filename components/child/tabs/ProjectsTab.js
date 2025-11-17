import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function ProjectsTab({ child }) {
  // TODO: load from projects table
  const projects = [
    {
      id: "p1",
      name: "Solar system model",
      subject: "Science",
      due: "Dec 5",
      progressPct: 40,
      status: "In progress",
      nextStep: "Paint the planets",
    },
    {
      id: "p2",
      name: "Family history booklet",
      subject: "Writing",
      due: "Jan 10",
      progressPct: 10,
      status: "Planned",
      nextStep: "Choose 3 relatives to interview",
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects for {child.first_name}</Text>
        <TouchableOpacity style={styles.addButton}>
          <Plus size={14} color={colors.card} />
          <Text style={styles.addButtonText}>Add project</Text>
        </TouchableOpacity>
      </View>

      {projects.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Bigger, multi-week projects will show up here with milestones and progress.
          </Text>
        </View>
      ) : (
        <View style={styles.projectsGrid}>
          {projects.map((p) => (
            <View key={p.id} style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{p.name}</Text>
                  <Text style={styles.projectMeta}>
                    {p.subject} • Due {p.due}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{p.status}</Text>
                </View>
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Progress</Text>
                  <Text style={styles.progressPct}>{p.progressPct}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${p.progressPct}%` }]}
                  />
                </View>
              </View>

              {p.nextStep && (
                <Text style={styles.nextStep}>
                  <Text style={styles.nextStepLabel}>Next step:</Text> {p.nextStep}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
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
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    margin: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  projectsGrid: {
    padding: 16,
    gap: 16,
  },
  projectCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  projectMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  statusBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.muted,
  },
  progressSection: {
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  progressPct: {
    fontSize: 12,
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
    backgroundColor: '#10B981',
    borderRadius: 999,
  },
  nextStep: {
    fontSize: 12,
    color: colors.muted,
  },
  nextStepLabel: {
    fontWeight: '600',
    color: colors.text,
  },
});


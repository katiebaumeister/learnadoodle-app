import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Target, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import SubjectPacingChart from './SubjectPacingChart';

export default function ProgressVsSyllabusCard({ pacingData, weekStart, onAddSyllabus }) {
  const isEmpty = !pacingData || pacingData.length === 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Target size={18} color={colors.blueBold} />
          <Text style={styles.title}>Progress vs Syllabus</Text>
        </View>
        <Text style={styles.description}>Compare actual progress to expected pacing</Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyState}>
          <Target size={48} color={colors.muted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No syllabus added</Text>
          <Text style={styles.emptyDescription}>
            Connect a syllabus or set a weekly target to start tracking progress.
          </Text>
          {onAddSyllabus && (
            <TouchableOpacity style={styles.emptyButton} onPress={onAddSyllabus}>
              <Plus size={16} color={colors.accentContrast} />
              <Text style={styles.emptyButtonText}>Add syllabus</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.content}>
          <SubjectPacingChart data={pacingData} weekStart={weekStart} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadows.md,
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 12,
    color: colors.muted,
  },
  content: {
    // Chart will handle its own styling
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyDescription: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});


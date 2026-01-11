/**
 * Transcripts & Credits Tab
 * Credits table, transcript preview, GPA/grade-level info
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { GraduationCap, Calendar, Award, ExternalLink, FileText } from 'lucide-react';
import { colors } from '../../../../theme/colors';
import ChildAccordion from '../ChildAccordion';
import EnhancedTranscriptModal from '../EnhancedTranscriptModal';
import CreditTracking from '../CreditTracking';

export default function TranscriptsTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  resolvedChildIds,
  recordsSummary,
  summaryLoading,
  onOpenPlanner,
}) {
  const [creditsData, setCreditsData] = useState([]);
  const [gpa, setGpa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEnhancedTranscript, setShowEnhancedTranscript] = useState(false);
  const [selectedChildForTranscript, setSelectedChildForTranscript] = useState(null);

  useEffect(() => {
    loadCreditsData();
  }, [familyId, resolvedChildIds, dateRange, recordsSummary]);

  const loadCreditsData = async () => {
    if (!recordsSummary?.perChild) {
      setCreditsData([]);
      setGpa(null);
      return;
    }
    
    setLoading(true);
    try {
      const { getCreditsSummary } = await import('../../../lib/services/recordsClient');
      const summary = await getCreditsSummary(familyId, resolvedChildIds, dateRange);
      
      // Aggregate credits data for display
      const aggregated = [];
      const subjectMap = {};
      
      Object.values(summary.perChild).forEach(childData => {
        Object.entries(childData.bySubject || {}).forEach(([subjectId, data]) => {
          if (!subjectMap[subjectId]) {
            subjectMap[subjectId] = {
              subject: data.name,
              earned: 0,
              planned: data.planned || 0,
              grade: data.grade,
            };
          }
          subjectMap[subjectId].earned += data.earned;
        });
      });
      
      setCreditsData(Object.values(subjectMap));
      
      // Calculate average GPA
      const gpas = Object.values(summary.perChild)
        .map(c => parseFloat(c.gpa))
        .filter(g => !isNaN(g));
      setGpa(gpas.length > 0 ? (gpas.reduce((a, b) => a + b, 0) / gpas.length).toFixed(2) : null);
    } catch (error) {
      setCreditsData([]);
      setGpa(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (subject) => {
    // TODO: Open modal with evidence summary, linked assignments, etc.
};

  const handleGenerateTranscript = async (childId) => {
    try {
      const { generateTranscript } = await import('../../../lib/services/recordsClient');
      const blob = await generateTranscript(childId, dateRange?.start, dateRange?.end);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const child = children.find(c => c.id === childId);
      const childName = child?.first_name || 'child';
      a.download = `transcript_${childName}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to generate transcript. Please try again.');
    }
  };

  const handleGenerateEnhancedTranscript = (childId) => {
    setSelectedChildForTranscript(childId);
    setShowEnhancedTranscript(true);
  };

  if (summaryLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  // resolvedChildIds is passed as prop from parent

  return (
    <ScrollView style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <View style={[styles.accentDot, { backgroundColor: '#a855f7' }]} />
        <GraduationCap size={20} color="#a855f7" />
        <Text style={styles.tabTitle}>Transcripts & Credits</Text>
      </View>

      {/* GPA Summary */}
      {gpa && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Award size={20} color="#a855f7" />
            <Text style={styles.sectionTitle}>GPA</Text>
          </View>
          <Text style={styles.gpaValue}>{gpa.toFixed(2)}</Text>
        </View>
      )}

      {/* Credits Table */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <GraduationCap size={20} color="#a855f7" />
          <Text style={styles.sectionTitle}>Credits Earned</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>Subject</Text>
            <Text style={styles.tableHeaderText}>Earned</Text>
            <Text style={styles.tableHeaderText}>Planned</Text>
            <Text style={styles.tableHeaderText}>Grade</Text>
          </View>
          {creditsData.length === 0 ? (
            <View style={styles.emptyState}>
              {/* Skeleton Table */}
              <View style={styles.skeletonTable}>
                {[1, 2, 3].map(i => (
                  <View key={i} style={styles.skeletonRow}>
                    <View style={styles.skeletonCell} />
                    <View style={styles.skeletonCell} />
                    <View style={styles.skeletonCell} />
                    <View style={styles.skeletonCell} />
                  </View>
                ))}
              </View>
              
              {/* CTA and Why It Matters */}
              <View style={styles.emptyContent}>
                <Text style={styles.emptyTitle}>Start tracking credits</Text>
                <Text style={styles.emptyDescription}>
                  Credits are automatically tracked from completed courses and assignments. Add courses to your planner to begin earning credits.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCTA}
                  onPress={() => resolvedChildIds.length === 1 && onOpenPlanner?.(resolvedChildIds[0])}
                >
                  <GraduationCap size={16} color={colors.white} />
                  <Text style={styles.emptyCTAText}>Open Planner</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            creditsData.map((row, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.tableRow}
              onPress={() => handleRowClick(row.subject)}
            >
              <Text style={styles.tableCell}>{row.subject}</Text>
              <Text style={styles.tableCell}>{row.earned}</Text>
              <Text style={styles.tableCell}>{row.planned}</Text>
              <Text style={styles.tableCell}>{row.grade}</Text>
            </TouchableOpacity>
            ))
          )}
        </View>
      </View>

      {/* Credit Tracking (Single Child) */}
      {resolvedChildIds.length === 1 && (
        <View style={styles.section}>
          <CreditTracking
            childId={resolvedChildIds[0]}
            familyId={familyId}
            dateRange={dateRange}
          />
        </View>
      )}

      {/* Transcript Builder */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Calendar size={20} color={colors.indigo} />
          <Text style={styles.sectionTitle}>Transcript Builder</Text>
        </View>
        <Text style={styles.description}>
          Generate official transcripts for selected children. Includes all credits, grades, and evidence.
        </Text>
        {resolvedChildIds.length === 1 ? (
          <View style={styles.transcriptActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleGenerateTranscript(resolvedChildIds[0])}
            >
              <ExternalLink size={16} color={colors.indigo} />
              <Text style={styles.actionButtonText}>Generate Transcript</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.enhancedButton]}
              onPress={() => handleGenerateEnhancedTranscript(resolvedChildIds[0])}
            >
              <FileText size={16} color={colors.violetBold} />
              <Text style={[styles.actionButtonText, { color: colors.violetBold }]}>Enhanced</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.description}>
            Select a single child to generate transcript
          </Text>
        )}
      </View>

      {/* Child-Specific: Grade Level Tracking */}
      {resolvedChildIds.length > 1 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Award size={20} color="#a855f7" />
            <Text style={styles.sectionTitle}>Per-Child Details</Text>
          </View>
          {resolvedChildIds.map(childId => {
            const child = children.find(c => c.id === childId);
            if (!child) return null;
            const childSummary = recordsSummary?.perChild?.[childId];
            return (
              <ChildAccordion
                key={childId}
                child={child}
                defaultExpanded={false}
                summary={{
                  readinessScore: childSummary?.readinessScore,
                  attendanceHours: childSummary ? Math.floor((childSummary.attendanceMinutes || 0) / 60) : undefined,
                  portfolioCount: childSummary?.portfolioCount,
                }}
              >
                <View style={styles.childContent}>
                  <View style={styles.gradeLevelCard}>
                    <Text style={styles.gradeLevelLabel}>Grade Level</Text>
                    <Text style={styles.gradeLevel}>{child.grade || 'Not set'}</Text>
                  </View>
                  {childSummary && (
                    <>
                      <View style={styles.gradeLevelCard}>
                        <Text style={styles.gradeLevelLabel}>Credits Earned</Text>
                        <Text style={styles.gradeLevel}>{childSummary.creditsEarned || 0}</Text>
                      </View>
                      {childSummary.gpa && (
                        <View style={styles.gradeLevelCard}>
                          <Text style={styles.gradeLevelLabel}>GPA</Text>
                          <Text style={styles.gradeLevel}>{parseFloat(childSummary.gpa).toFixed(2)}</Text>
                        </View>
                      )}
                    </>
                  )}
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => onOpenPlanner?.(childId)}
                  >
                    <Calendar size={14} color="#a855f7" />
                    <Text style={styles.linkButtonText}>Open in Planner</Text>
                  </TouchableOpacity>
                </View>
              </ChildAccordion>
            );
          })}
        </View>
      )}
      
      {/* Single Child: Show inline if only one child */}
      {resolvedChildIds.length === 1 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Award size={20} color="#a855f7" />
            <Text style={styles.sectionTitle}>Grade Level Tracking</Text>
          </View>
          {(() => {
            const child = children.find(c => c.id === resolvedChildIds[0]);
            if (!child) return null;
            return (
              <View style={styles.gradeLevelCard}>
                <Text style={styles.childName}>{child.first_name}</Text>
                <Text style={styles.gradeLevel}>{child.grade || 'Not set'}</Text>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => onOpenPlanner?.(resolvedChildIds[0])}
                >
                  <Calendar size={14} color="#a855f7" />
                  <Text style={styles.linkButtonText}>Open in Planner</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </View>
      )}

      {/* Enhanced Transcript Modal */}
      {selectedChildForTranscript && (
        <EnhancedTranscriptModal
          visible={showEnhancedTranscript}
          childId={selectedChildForTranscript}
          childName={children.find(c => c.id === selectedChildForTranscript)?.first_name}
          dateRange={dateRange}
          onClose={() => {
            setShowEnhancedTranscript(false);
            setSelectedChildForTranscript(null);
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  gpaValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.indigo,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  transcriptActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
  enhancedButton: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.violetBold,
  },
  childContent: {
    gap: 12,
  },
  gradeLevelCard: {
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
  },
  gradeLevelLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  gradeLevel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkButtonText: {
    fontSize: 13,
    color: '#a855f7',
    fontWeight: '500',
  },
  emptyState: {
    padding: 24,
  },
  skeletonTable: {
    marginBottom: 24,
  },
  skeletonRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  skeletonCell: {
    flex: 1,
    height: 16,
    backgroundColor: colors.panel,
    borderRadius: 4,
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 400,
    lineHeight: 20,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#a855f7',
    borderRadius: 8,
  },
  emptyCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});


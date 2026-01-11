/**
 * Compliance Tab
 * Readiness meter, compliance checklist, evidence gaps, export buttons
 * Enhanced: Uses ComplianceDashboard for single child view
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Shield, CheckCircle, AlertCircle, Download, FileText, Award, Calendar } from 'lucide-react';
import { generateTranscript, generateYearEndSummary } from '../../../lib/services/recordsClient';
import { colors } from '../../../theme/colors';
import { getChildColor, getTextColorForBackground } from '../../../utils/avatarColors';
import ComplianceDashboard from '../../compliance/ComplianceDashboard';

export default function ComplianceTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  resolvedChildIds,
  complianceStatus,
  recordsSummary,
  summaryLoading,
}) {
  const loading = summaryLoading;
  
  // Extract data from complianceStatus prop
  const readinessData = complianceStatus?.readiness || null;
  const checklist = complianceStatus?.checklist || [];
  const evidenceGaps = complianceStatus?.gaps || [];
  
  // Calculate combined readiness if multiple children
  const isMultiChild = selectedChildren === 'all' || (Array.isArray(selectedChildren) && selectedChildren.length > 1);
  const readinessScore = useMemo(() => {
    if (!recordsSummary?.perChild) return 0;
    
    if (isMultiChild) {
      // Average across all children
      const scores = Object.values(recordsSummary.perChild)
        .map(c => c.readinessScore || 0)
        .filter(s => s > 0);
      return scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    } else if (resolvedChildIds.length === 1) {
      return recordsSummary.perChild[resolvedChildIds[0]]?.readinessScore || 0;
    }
    return 0;
  }, [recordsSummary, isMultiChild, resolvedChildIds]);

  // Get child color for single child view
  const barColor = useMemo(() => {
    if (isMultiChild || resolvedChildIds.length !== 1) {
      return colors.indigo; // Default color for multi-child view
    }
    const child = children.find(c => c.id === resolvedChildIds[0]);
    return getChildColor(child);
  }, [isMultiChild, resolvedChildIds, children]);

  // Get text color for the bar (white or dark based on background)
  const barTextColor = useMemo(() => {
    return getTextColorForBackground(barColor);
  }, [barColor]);

  const handleExport = async (type) => {
    try {
      if (type === 'transcripts' && resolvedChildIds.length === 1) {
        // Generate transcript for single child
        const blob = await generateTranscript(
          resolvedChildIds[0],
          dateRange?.start,
          dateRange?.end
        );
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript_${resolvedChildIds[0]}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else if (type === 'compliance') {
        // TODO: Implement compliance packet export
} else if (type === 'portfolio') {
        // TODO: Implement portfolio ZIP export
}
    } catch (error) {
      alert('Failed to export. Please try again.');
    }
  };

  const handleYearEndSummary = async () => {
    if (resolvedChildIds.length !== 1) {
      alert('Please select a single child to generate year-end summary');
      return;
    }

    try {
      // Calculate academic year from dateRange or use current year
      const yearStart = dateRange?.start || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const yearEnd = dateRange?.end || new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0];
      
      const result = await generateYearEndSummary(
        resolvedChildIds[0],
        yearStart,
        yearEnd,
        'comprehensive'
      );
      
      if (result.message) {
        alert(result.message);
      } else {
        alert('Year-end summary generated successfully');
      }
    } catch (error) {
      alert(`Failed to generate year-end summary: ${error.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  // For single child, show enhanced ComplianceDashboard
  if (resolvedChildIds.length === 1 && !isMultiChild) {
    const child = children.find(c => c.id === resolvedChildIds[0]);
    return (
      <View style={styles.container}>
        <ComplianceDashboard
          childId={resolvedChildIds[0]}
          childName={child?.first_name || 'Student'}
          familyId={familyId}
        />
      </View>
    );
  }

  // For multiple children or all children, show summary view
  return (
    <ScrollView style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <View style={[styles.accentDot, { backgroundColor: '#3b82f6' }]} />
        <Shield size={20} color="#3b82f6" />
        <Text style={styles.tabTitle}>Compliance</Text>
      </View>

      {/* Readiness Meter */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Shield size={20} color="#3b82f6" />
          <Text style={styles.sectionTitle}>
            {isMultiChild ? 'Family Readiness' : 'Readiness Score'}
          </Text>
        </View>
        <View style={styles.meterContainer}>
          <View style={styles.meterLabelRow}>
            <Text style={styles.meterLabel}>Overall Readiness</Text>
          </View>
          <View style={styles.meterBar}>
            <View style={[styles.meterFill, { width: `${readinessScore}%`, backgroundColor: barColor }]}>
              {readinessScore > 0 && (
                <Text style={[styles.meterValueInside, { color: barTextColor }]}>{readinessScore}%</Text>
              )}
            </View>
          </View>
          {recordsSummary && (
            <View style={styles.meterDetails}>
              {isMultiChild ? (
                <Text style={styles.detailText}>
                  Combined metrics across {resolvedChildIds.length} children
                </Text>
              ) : resolvedChildIds.length === 1 && recordsSummary.perChild[resolvedChildIds[0]] ? (
                <Text style={styles.detailText}>
                  {Math.floor((recordsSummary.perChild[resolvedChildIds[0]].attendanceMinutes || 0) / 60)}h attendance • {recordsSummary.perChild[resolvedChildIds[0]].portfolioCount || 0} artifacts • {recordsSummary.perChild[resolvedChildIds[0]].creditsEarned || 0} credits
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {/* Compliance Checklist */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <CheckCircle size={20} color={colors.indigo} />
          <Text style={styles.sectionTitle}>Compliance Checklist</Text>
        </View>
        <View style={styles.checklist}>
          {checklist.map(item => (
            <View key={item.id} style={styles.checklistItem}>
              <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
                {item.completed && <CheckCircle size={16} color={colors.white} />}
              </View>
              <Text style={[styles.checklistLabel, item.completed && styles.checklistLabelCompleted]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Evidence Gaps */}
      {evidenceGaps.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AlertCircle size={20} color={colors.orange} />
            <Text style={styles.sectionTitle}>Evidence Gaps</Text>
          </View>
          <View style={styles.gapsList}>
            {evidenceGaps.map((gap, idx) => (
              <View key={idx} style={styles.gapItem}>
                <AlertCircle size={16} color={colors.orange} />
                <Text style={styles.gapText}>{gap.message || gap}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Export Buttons */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Download size={20} color={colors.indigo} />
          <Text style={styles.sectionTitle}>Export</Text>
        </View>
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('transcripts')}
          >
            <FileText size={16} color={colors.indigo} />
            <Text style={styles.exportButtonText}>Export Transcripts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('compliance')}
          >
            <Shield size={16} color={colors.indigo} />
            <Text style={styles.exportButtonText}>Export Compliance Packet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('portfolio')}
          >
            <Award size={16} color={colors.indigo} />
            <Text style={styles.exportButtonText}>Export Portfolio ZIP</Text>
          </TouchableOpacity>
          {resolvedChildIds.length === 1 && (
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleYearEndSummary}
            >
              <Calendar size={16} color={colors.indigo} />
              <Text style={styles.exportButtonText}>Year-End Summary PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  meterContainer: {
    marginTop: 8,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  meterLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  meterValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  meterBar: {
    height: 24,
    backgroundColor: colors.panel,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  meterFill: {
    height: '100%',
    backgroundColor: colors.indigo,
    borderRadius: 12,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 8,
    minWidth: 40,
  },
  meterValueInside: {
    fontSize: 13,
    fontWeight: '600',
  },
  meterDetails: {
    marginTop: 8,
  },
  detailText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  checklist: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  checklistLabel: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  checklistLabelCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  gapsList: {
    gap: 8,
  },
  gapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  gapText: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  exportButtons: {
    gap: 8,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportButtonText: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
});


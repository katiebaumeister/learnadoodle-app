/**
 * Compliance Panel
 * Right column sidebar with compliance checklist, documents, exports
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Shield, CheckCircle, FileText, Download, AlertCircle, Info } from 'lucide-react';
import { colors } from '../../theme/colors';
import { exportCompliancePacket } from '../../lib/services/recordsClient';

export default function CompliancePanel({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  complianceStatus,
  loading,
  error,
}) {
  // Extract data from complianceStatus prop
  const checklist = complianceStatus?.checklist || [];
  const requiredDocuments = complianceStatus?.documents || [];
  const evidenceGaps = complianceStatus?.gaps || [];
  const stateRules = complianceStatus?.stateRules || null;

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  
  const handleExportCompliance = async () => {
    setExporting(true);
    setExportError(null);
    
    try {
      const resolvedChildIds = selectedChildren === 'all' 
        ? children.map(c => c.id)
        : (Array.isArray(selectedChildren) ? selectedChildren : []);
      
      const { data, error } = await exportCompliancePacket({
        familyId,
        childIds: resolvedChildIds,
        dateRange,
      });
      
      if (error || !data) {
        setExportError(error?.message || 'Unable to export compliance packet');
        setExporting(false);
        return;
      }
      
      // Trigger download
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'compliance_packet.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        // Mobile: would need to use a file system API
        alert('Download started');
      }
      
      setExporting(false);
    } catch (err) {
      setExportError(err.message || 'Failed to export compliance packet');
      setExporting(false);
    }
  };
  
  const handleExport = async (type) => {
    if (type === 'compliance') {
      await handleExportCompliance();
    } else if (type === 'transcript') {
      // TODO: Handle transcript export (should be done from TranscriptsTab)
      console.log('Generate transcript');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.indigo} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Error loading compliance data</Text>
      </View>
    );
  }

  const isMultiChild = selectedChildren === 'all' || (Array.isArray(selectedChildren) && selectedChildren.length > 1);

  return (
    <ScrollView style={styles.container}>
      {/* Compliance Checklist */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Shield size={18} color={colors.indigo} />
          <Text style={styles.sectionTitle}>Compliance Checklist</Text>
        </View>
        <View style={styles.checklist}>
          {checklist.map(item => (
            <View key={item.id} style={styles.checklistItem}>
              <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
                {item.completed && <CheckCircle size={12} color={colors.white} />}
              </View>
              <Text style={[styles.checklistLabel, item.completed && styles.checklistLabelCompleted]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Required Documents */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <FileText size={18} color={colors.indigo} />
          <Text style={styles.sectionTitle}>Required Documents</Text>
        </View>
        <View style={styles.documentsList}>
          {requiredDocuments.map(doc => (
            <View key={doc.id} style={styles.documentItem}>
              <Text style={styles.documentName}>{doc.name}</Text>
              <Text style={styles.documentDue}>Due: {doc.due}</Text>
              {!doc.completed && (
                <View style={styles.documentBadge}>
                  <Text style={styles.documentBadgeText}>Pending</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Export Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Download size={18} color={colors.indigo} />
          <Text style={styles.sectionTitle}>Exports</Text>
        </View>
        <View style={styles.exportButtonContainer}>
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={handleExportCompliance}
          disabled={exporting}
        >
          {exporting ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.exportButtonText}>Preparing compliance packet…</Text>
            </>
          ) : (
            <>
              <Download size={14} color={colors.white} />
              <Text style={styles.exportButtonText}>Export compliance packet</Text>
            </>
          )}
        </TouchableOpacity>
        {exportError && (
          <Text style={styles.exportError}>{exportError}</Text>
        )}
        </View>
      </View>

      {/* Evidence Gaps */}
      {evidenceGaps.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AlertCircle size={18} color={colors.orange} />
            <Text style={styles.sectionTitle}>Missing Evidence</Text>
          </View>
          <View style={styles.gapsList}>
            {evidenceGaps.map((gap, idx) => (
              <View key={idx} style={styles.gapItem}>
                <AlertCircle size={12} color={colors.orange} />
                <Text style={styles.gapText}>{gap.message || gap}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* State Rules Summary */}
      {stateRules && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Info size={18} color={colors.indigo} />
            <Text style={styles.sectionTitle}>State Rules</Text>
          </View>
          <View style={styles.rulesList}>
            <Text style={styles.ruleText}>State: {stateRules.state}</Text>
            <Text style={styles.ruleText}>Attendance: {stateRules.attendanceHours}h/year</Text>
            <Text style={styles.ruleText}>
              Portfolio: {stateRules.portfolioRequired ? 'Required' : 'Optional'}
            </Text>
            <Text style={styles.ruleText}>
              Assessment: {stateRules.assessmentRequired ? 'Required' : 'Optional'}
            </Text>
          </View>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    // Sticky on desktop (handled via className in web)
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  checklist: {
    gap: 10,
    marginTop: 2,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
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
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  checklistLabelCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  documentsList: {
    gap: 10,
    marginTop: 2,
  },
  documentItem: {
    padding: 10,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  documentName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  documentDue: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  documentBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.orange,
    borderRadius: 4,
  },
  documentBadgeText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '600',
  },
  gapsList: {
    gap: 8,
  },
  gapItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  gapText: {
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  rulesList: {
    gap: 6,
    marginTop: 2,
  },
  exportButtonContainer: {
    marginTop: 2,
  },
  ruleText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 6,
    width: '100%',
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '600',
  },
  exportError: {
    fontSize: 11,
    color: colors.orange,
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: colors.orange,
    textAlign: 'center',
  },
});


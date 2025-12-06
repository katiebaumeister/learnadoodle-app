/**
 * Compliance Summary Card
 * Minimal compliance info shown on non-compliance tabs
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Shield, ArrowRight, Clock, FileText, BookOpen } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function ComplianceSummaryCard({
  complianceStatus,
  onOpenCompliance,
}) {
  const stateRules = complianceStatus?.stateRules || null;
  
  // Get last updated date from compliance status
  const lastUpdated = complianceStatus?.lastUpdated 
    ? new Date(complianceStatus.lastUpdated).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      })
    : null;

  if (!stateRules) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Shield size={16} color={colors.indigo} />
          <Text style={styles.title}>Compliance</Text>
        </View>
        <Text style={styles.emptyText}>No compliance data available</Text>
        <TouchableOpacity style={styles.linkButton} onPress={onOpenCompliance}>
          <Text style={styles.linkText}>Open full Compliance View</Text>
          <ArrowRight size={14} color={colors.indigo} />
        </TouchableOpacity>
      </View>
    );
  }

  // Extract state rules
  const state = stateRules.state || 'US';
  const attendanceHours = stateRules.attendanceHours || 0;
  const portfolioRequired = stateRules.portfolioRequired || false;
  const assessmentRequired = stateRules.assessmentRequired || false;
  
  // Check if state-required subjects exist in checklist
  const checklist = complianceStatus?.checklist || [];
  const hasSubjectRequirement = checklist.some(item => 
    item.label && item.label.toLowerCase().includes('subject')
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Shield size={16} color={colors.indigo} />
        <Text style={styles.title}>Compliance</Text>
      </View>

      <View style={styles.content}>
        {/* State-required subjects */}
        {hasSubjectRequirement && (
          <View style={styles.row}>
            <BookOpen size={14} color={colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.label}>State-required subjects</Text>
              <Text style={styles.value}>Required</Text>
            </View>
          </View>
        )}

        {/* Attendance minimum */}
        {attendanceHours > 0 && (
          <View style={styles.row}>
            <Clock size={14} color={colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Attendance minimum</Text>
              <Text style={styles.value}>{attendanceHours}h/year</Text>
            </View>
          </View>
        )}

        {/* Portfolio requirements */}
        <View style={styles.row}>
          <FileText size={14} color={colors.textSecondary} />
          <View style={styles.rowContent}>
            <Text style={styles.label}>Portfolio</Text>
            <Text style={styles.value}>
              {portfolioRequired ? 'Required' : 'Optional'}
            </Text>
          </View>
        </View>

        {/* Assessment requirements */}
        {assessmentRequired && (
          <View style={styles.row}>
            <Shield size={14} color={colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Assessment</Text>
              <Text style={styles.value}>Required</Text>
            </View>
          </View>
        )}

        {/* Last updated */}
        {lastUpdated && (
          <View style={styles.footer}>
            <Text style={styles.lastUpdated}>Last updated: {lastUpdated}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.linkButton} onPress={onOpenCompliance}>
        <Text style={styles.linkText}>Open full Compliance View</Text>
        <ArrowRight size={14} color={colors.indigo} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    gap: 10,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lastUpdated: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 4,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.indigo,
  },
});


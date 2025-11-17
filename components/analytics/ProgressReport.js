/**
 * Progress Report Component
 * Generates printable/exportable reports aggregating outcomes by subject
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FileText, Download, Calendar, User, BookOpen, TrendingUp, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getAnalyticsOverview } from '../../lib/services/analyticsClient';

export default function ProgressReport({ familyId, childId, children = [], onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [selectedChild, setSelectedChild] = useState(childId || null);

  useEffect(() => {
    if (familyId) {
      loadReportData();
    }
  }, [familyId, selectedChild, dateRange]);

  const loadReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalyticsOverview({
        childId: selectedChild || undefined,
        days: Math.ceil((new Date(dateRange.end) - new Date(dateRange.start)) / (1000 * 60 * 60 * 24)),
        weeks: Math.ceil((new Date(dateRange.end) - new Date(dateRange.start)) / (1000 * 60 * 60 * 24 * 7)),
      });
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to load report data');
      }
      
      setData(result.data);
    } catch (err) {
      console.error('[ProgressReport] Error:', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    
    // Generate markdown report
    const childName = selectedChild 
      ? children.find(c => c.id === selectedChild)?.first_name || 'All Children'
      : 'All Children';
    
    let report = `# Progress Report\n\n`;
    report += `**Student:** ${childName}\n`;
    report += `**Date Range:** ${new Date(dateRange.start).toLocaleDateString()} - ${new Date(dateRange.end).toLocaleDateString()}\n`;
    report += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
    
    report += `## Subject Performance Summary\n\n`;
    if (data.subject_performance && data.subject_performance.length > 0) {
      data.subject_performance.forEach(subject => {
        report += `### ${subject.subject_name}\n`;
        report += `- **Sessions:** ${subject.completed_sessions}/${subject.total_sessions} completed\n`;
        report += `- **Attendance Rate:** ${(subject.attendance_rate * 100).toFixed(0)}%\n`;
        if (subject.avg_rating) {
          report += `- **Average Rating:** ${subject.avg_rating.toFixed(1)}/5\n`;
        }
        if (subject.avg_grade) {
          report += `- **Average Grade:** ${subject.avg_grade}\n`;
        }
        if (subject.common_strengths && subject.common_strengths.length > 0) {
          report += `- **Strengths:** ${subject.common_strengths.join(', ')}\n`;
        }
        if (subject.common_struggles && subject.common_struggles.length > 0) {
          report += `- **Struggles:** ${subject.common_struggles.join(', ')}\n`;
        }
        report += `\n`;
      });
    } else {
      report += `No performance data available for this period.\n\n`;
    }
    
    report += `## Recommendations\n\n`;
    if (data.recommendations && data.recommendations.length > 0) {
      data.recommendations.forEach((rec, idx) => {
        report += `${idx + 1}. **[${rec.priority.toUpperCase()}]** ${rec.title}\n`;
        report += `   ${rec.message}\n`;
        if (rec.action) {
          report += `   *Suggested Action:* ${rec.action}\n`;
        }
        report += `\n`;
      });
    } else {
      report += `No recommendations at this time.\n\n`;
    }
    
    // Create blob and download
    if (Platform.OS === 'web') {
      const blob = new Blob([report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `progress-report-${childName}-${dateRange.start}-${dateRange.end}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // For native, show share dialog or copy to clipboard
      alert('Report generated! Copy the text below:\n\n' + report.substring(0, 500) + '...');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Progress Report</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Generating report...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Progress Report</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.errorContainer}>
          <AlertCircle size={24} color={colors.redBold || '#dc2626'} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadReportData} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const childName = selectedChild 
    ? children.find(c => c.id === selectedChild)?.first_name || 'All Children'
    : 'All Children';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FileText size={24} color={colors.accent} />
          <Text style={styles.title}>Progress Report</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleExport} style={styles.exportButton}>
            <Download size={16} color={colors.accent} />
            <Text style={styles.exportText}>Export</Text>
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {children.length > 0 && (
          <View style={styles.filterGroup}>
            <User size={16} color={colors.muted} />
            <View style={styles.selectWrapper}>
              <select
                value={selectedChild || ''}
                onChange={(e) => setSelectedChild(e.target.value || null)}
                style={styles.select}
              >
                <option value="">All Children</option>
                {children.map(child => (
                  <option key={child.id} value={child.id}>
                    {child.first_name || child.name}
                  </option>
                ))}
              </select>
            </View>
          </View>
        )}
        <View style={styles.filterGroup}>
          <Calendar size={16} color={colors.muted} />
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            style={styles.dateInput}
          />
          <Text style={styles.dateSeparator}>to</Text>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            style={styles.dateInput}
          />
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Report Header */}
        <View style={styles.reportHeader}>
          <Text style={styles.reportTitle}>Progress Report</Text>
          <Text style={styles.reportSubtitle}>{childName}</Text>
          <Text style={styles.reportDateRange}>
            {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
          </Text>
          <Text style={styles.reportGenerated}>
            Generated on {new Date().toLocaleDateString()}
          </Text>
        </View>

        {/* Subject Performance */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BookOpen size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Subject Performance</Text>
          </View>
          {data && data.subject_performance && data.subject_performance.length > 0 ? (
            data.subject_performance.map((subject, idx) => (
              <View key={idx} style={styles.subjectCard}>
                <View style={styles.subjectHeader}>
                  <Text style={styles.subjectName}>{subject.subject_name}</Text>
                  {subject.avg_rating && (
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingText}>{subject.avg_rating.toFixed(1)}/5</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.metricsGrid}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Sessions Completed</Text>
                    <Text style={styles.metricValue}>
                      {subject.completed_sessions} / {subject.total_sessions}
                    </Text>
                    <Text style={styles.metricPercent}>
                      {subject.total_sessions > 0 
                        ? Math.round((subject.completed_sessions / subject.total_sessions) * 100)
                        : 0}%
                    </Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Attendance Rate</Text>
                    <Text style={styles.metricValue}>
                      {(subject.attendance_rate * 100).toFixed(0)}%
                    </Text>
                  </View>
                  {subject.avg_grade && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>Average Grade</Text>
                      <Text style={styles.metricValue}>{subject.avg_grade}</Text>
                    </View>
                  )}
                </View>

                {subject.common_strengths && subject.common_strengths.length > 0 && (
                  <View style={styles.tagsSection}>
                    <Text style={styles.tagsLabel}>Strengths</Text>
                    <View style={styles.tags}>
                      {subject.common_strengths.map((tag, tagIdx) => (
                        <View key={tagIdx} style={styles.strengthTag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {subject.common_struggles && subject.common_struggles.length > 0 && (
                  <View style={styles.tagsSection}>
                    <Text style={styles.tagsLabel}>Areas for Improvement</Text>
                    <View style={styles.tags}>
                      {subject.common_struggles.map((tag, tagIdx) => (
                        <View key={tagIdx} style={styles.struggleTag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No performance data available for this period.</Text>
          )}
        </View>

        {/* Recommendations */}
        {data && data.recommendations && data.recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={20} color={colors.accent} />
              <Text style={styles.sectionTitle}>Recommendations</Text>
            </View>
            {data.recommendations.map((rec, idx) => (
              <View 
                key={idx} 
                style={[
                  styles.recommendationCard,
                  rec.priority === 'high' && styles.recommendationCardHigh
                ]}
              >
                <View style={styles.recommendationHeader}>
                  <View style={styles.recommendationNumber}>
                    <Text style={styles.recommendationNumberText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.recommendationContent}>
                    <View style={styles.recommendationTitleRow}>
                      <Text style={styles.recommendationTitle}>{rec.title}</Text>
                      <View style={[
                        styles.priorityBadge,
                        rec.priority === 'high' && styles.priorityBadgeHigh
                      ]}>
                        <Text style={styles.priorityText}>{rec.priority}</Text>
                      </View>
                    </View>
                    <Text style={styles.recommendationMessage}>{rec.message}</Text>
                    {rec.action && (
                      <View style={styles.actionBox}>
                        <Text style={styles.actionLabel}>Suggested Action:</Text>
                        <Text style={styles.actionText}>{rec.action}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg || '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
  },
  exportText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
    flexWrap: 'wrap',
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectWrapper: {
    position: 'relative',
  },
  select: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: colors.text || '#111827',
    backgroundColor: colors.bg || '#ffffff',
    minWidth: 150,
  },
  dateInput: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: colors.text || '#111827',
    backgroundColor: colors.bg || '#ffffff',
  },
  dateSeparator: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.redBold || '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  reportHeader: {
    padding: 24,
    backgroundColor: colors.panel || '#f6f8ff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
    alignItems: 'center',
  },
  reportTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  reportSubtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
    marginBottom: 4,
  },
  reportDateRange: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
    marginBottom: 4,
  },
  reportGenerated: {
    fontSize: 12,
    color: colors.muted || '#9ca3af',
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  subjectCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  subjectName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  ratingBadge: {
    backgroundColor: colors.accent || '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metric: {
    flex: 1,
    minWidth: 120,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  metricPercent: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    marginTop: 2,
  },
  tagsSection: {
    marginTop: 12,
  },
  tagsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  strengthTag: {
    backgroundColor: colors.greenSoft || '#d1fae5',
    borderWidth: 1,
    borderColor: colors.greenBold || '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  struggleTag: {
    backgroundColor: colors.yellowSoft || '#fef3c7',
    borderWidth: 1,
    borderColor: colors.yellowBold || '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  recommendationCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  recommendationCardHigh: {
    borderColor: colors.redBold || '#dc2626',
    borderWidth: 2,
  },
  recommendationHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  recommendationNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent || '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  recommendationContent: {
    flex: 1,
  },
  recommendationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recommendationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  priorityBadge: {
    backgroundColor: colors.muted || '#9ca3af',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityBadgeHigh: {
    backgroundColor: colors.redBold || '#dc2626',
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  recommendationMessage: {
    fontSize: 14,
    color: colors.text || '#111827',
    lineHeight: 20,
    marginBottom: 8,
  },
  actionBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent || '#3b82f6',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted || '#6b7280',
    marginBottom: 4,
  },
  actionText: {
    fontSize: 14,
    color: colors.accent || '#3b82f6',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
    textAlign: 'center',
    padding: 20,
  },
});


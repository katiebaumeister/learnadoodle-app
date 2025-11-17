/**
 * Analytics Dashboard Component
 * Displays subject performance, trends, and recommendations
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
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, BarChart3, FileText } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getAnalyticsOverview } from '../../lib/services/analyticsClient';

export default function AnalyticsDashboard({ familyId, childId, children = [], onClose, onShowReport }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('performance'); // performance, trends, recommendations

  useEffect(() => {
    if (familyId) {
      loadAnalytics();
    }
  }, [familyId, childId]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalyticsOverview({
        childId: childId || undefined,
        days: 90,
        weeks: 12,
      });
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to load analytics');
      }
      
      setData(result.data);
    } catch (err) {
      console.error('[AnalyticsDashboard] Error:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.errorContainer}>
          <AlertCircle size={24} color={colors.redBold || '#dc2626'} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadAnalytics} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No analytics data available yet.</Text>
          <Text style={styles.emptySubtext}>Complete events and add outcomes to see insights.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <View style={styles.headerActions}>
          {onShowReport && (
            <TouchableOpacity onPress={onShowReport} style={styles.reportButton}>
              <FileText size={16} color={colors.accent} />
              <Text style={styles.reportText}>Generate Report</Text>
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'performance' && styles.tabActive]}
          onPress={() => setActiveTab('performance')}
        >
          <BarChart3 size={16} color={activeTab === 'performance' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'performance' && styles.tabTextActive]}>
            Performance
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trends' && styles.tabActive]}
          onPress={() => setActiveTab('trends')}
        >
          <TrendingUp size={16} color={activeTab === 'trends' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'trends' && styles.tabTextActive]}>
            Trends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recommendations' && styles.tabActive]}
          onPress={() => setActiveTab('recommendations')}
        >
          <AlertCircle size={16} color={activeTab === 'recommendations' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'recommendations' && styles.tabTextActive]}>
            Recommendations
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'performance' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subject Performance</Text>
            {data.subject_performance && data.subject_performance.length > 0 ? (
              data.subject_performance.map((subject, idx) => (
                <View key={idx} style={styles.performanceCard}>
                  <View style={styles.performanceHeader}>
                    <Text style={styles.subjectName}>{subject.subject_name}</Text>
                    {subject.avg_rating && (
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>{subject.avg_rating.toFixed(1)}/5</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Sessions</Text>
                      <Text style={styles.statValue}>
                        {subject.completed_sessions}/{subject.total_sessions}
                      </Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Attendance</Text>
                      <Text style={styles.statValue}>
                        {(subject.attendance_rate * 100).toFixed(0)}%
                      </Text>
                    </View>
                    {subject.avg_grade && (
                      <View style={styles.stat}>
                        <Text style={styles.statLabel}>Grade</Text>
                        <Text style={styles.statValue}>{subject.avg_grade}</Text>
                      </View>
                    )}
                  </View>

                  {subject.common_strengths && subject.common_strengths.length > 0 && (
                    <View style={styles.tagsContainer}>
                      <Text style={styles.tagsLabel}>Strengths:</Text>
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
                    <View style={styles.tagsContainer}>
                      <Text style={styles.tagsLabel}>Struggles:</Text>
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
              <Text style={styles.emptyText}>No performance data available.</Text>
            )}
          </View>
        )}

        {activeTab === 'trends' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rating Trends</Text>
            {data.trends && data.trends.length > 0 ? (
              data.trends.map((trend, idx) => (
                <View key={idx} style={styles.trendCard}>
                  <Text style={styles.trendSubject}>{trend.subject_name}</Text>
                  {trend.data_points && trend.data_points.length > 0 ? (
                    <View style={styles.trendChart}>
                      {trend.data_points.map((point, pointIdx) => {
                        const height = point.avg_rating ? (point.avg_rating / 5) * 100 : 0;
                        const isIncreasing = pointIdx > 0 && 
                          point.avg_rating && 
                          trend.data_points[pointIdx - 1].avg_rating &&
                          point.avg_rating > trend.data_points[pointIdx - 1].avg_rating;
                        const isDecreasing = pointIdx > 0 && 
                          point.avg_rating && 
                          trend.data_points[pointIdx - 1].avg_rating &&
                          point.avg_rating < trend.data_points[pointIdx - 1].avg_rating;
                        
                        return (
                          <View key={pointIdx} style={styles.trendBar}>
                            <View 
                              style={[
                                styles.trendBarFill,
                                { height: `${height}%` },
                                isIncreasing && styles.trendBarIncreasing,
                                isDecreasing && styles.trendBarDecreasing
                              ]}
                            />
                            {point.avg_rating && (
                              <Text style={styles.trendBarLabel}>
                                {point.avg_rating.toFixed(1)}
                              </Text>
                            )}
                            <Text style={styles.trendBarDate}>
                              {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>No trend data available.</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No trend data available.</Text>
            )}
          </View>
        )}

        {activeTab === 'recommendations' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {data.recommendations && data.recommendations.length > 0 ? (
              data.recommendations.map((rec, idx) => (
                <View 
                  key={idx} 
                  style={[
                    styles.recommendationCard,
                    rec.priority === 'high' && styles.recommendationCardHigh
                  ]}
                >
                  <View style={styles.recommendationHeader}>
                    {rec.priority === 'high' ? (
                      <AlertCircle size={20} color={colors.redBold || '#dc2626'} />
                    ) : (
                      <CheckCircle2 size={20} color={colors.accent} />
                    )}
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
                    <View style={styles.actionContainer}>
                      <Text style={styles.actionLabel}>Suggested action:</Text>
                      <Text style={styles.actionText}>{rec.action}</Text>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No recommendations at this time.</Text>
            )}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
  },
  reportText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.muted || '#6b7280',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.muted || '#9ca3af',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent || '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted || '#6b7280',
  },
  tabTextActive: {
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
    marginBottom: 16,
  },
  performanceCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  performanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  tagsContainer: {
    marginTop: 8,
  },
  tagsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 6,
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
  trendCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  trendSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 12,
  },
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 120,
    paddingVertical: 8,
  },
  trendBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  trendBarFill: {
    width: '100%',
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 4,
    minHeight: 4,
    marginBottom: 4,
  },
  trendBarIncreasing: {
    backgroundColor: colors.greenBold || '#10b981',
  },
  trendBarDecreasing: {
    backgroundColor: colors.redBold || '#dc2626',
  },
  trendBarLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 2,
  },
  trendBarDate: {
    fontSize: 9,
    color: colors.muted || '#6b7280',
    transform: [{ rotate: '-45deg' }],
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
    alignItems: 'center',
    gap: 8,
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
  actionContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
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
});


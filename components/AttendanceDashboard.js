import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

const AttendanceDashboard = ({ visible, onClose, childId, familyId }) => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [creditData, setCreditData] = useState([]);
  const [coverageData, setCoverageData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    if (visible && childId) {
      loadAttendanceData();
      loadCreditData();
      loadCoverageData();
    }
  }, [visible, childId, selectedPeriod]);

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    
    switch (selectedPeriod) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setDate(start.getDate() - 30);
        break;
      case 'quarter':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const loadAttendanceData = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();
      const { data, error } = await supabase.rpc('get_child_attendance', {
        p_child_id: childId,
        p_start_date: start,
        p_end_date: end,
      });

      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      // Compute summary-like fields expected by UI
      const mapped = arr.map(d => ({
        date: d.date,
        total_minutes: d.minutes_present || 0,
        total_events: 0,
        completed_events: 0,
        completion_rate: 0,
        subjects_covered: [],
      }));
      setAttendanceData(mapped);
    } catch (error) {
      console.error('Error loading attendance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCreditData = async () => {
    try {
      const { start, end } = getDateRange();
      
      const { data, error } = await supabase
        .rpc('get_credit_ledger_summary', {
          p_child_id: childId,
          p_start_date: start,
          p_end_date: end,
        });

      if (error) throw error;
      setCreditData(data || []);
    } catch (error) {
      console.error('Error loading credit data:', error);
    }
  };

  const loadCoverageData = async () => {
    try {
      const { start, end } = getDateRange();
      
      const { data, error } = await supabase
        .rpc('get_state_coverage_view', {
          p_child_id: childId,
          p_start_date: start,
          p_end_date: end,
        });

      if (error) throw error;
      setCoverageData(data || []);
    } catch (error) {
      console.error('Error loading coverage data:', error);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatMinutes = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const renderAttendanceSummary = () => {
    const totalMinutes = attendanceData.reduce((sum, day) => sum + (day.total_minutes || 0), 0);
    const totalEvents = attendanceData.reduce((sum, day) => sum + (day.total_events || 0), 0);
    const completedEvents = attendanceData.reduce((sum, day) => sum + (day.completed_events || 0), 0);
    const completionRate = totalEvents > 0 ? (completedEvents / totalEvents) * 100 : 0;

    return (
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Attendance Summary</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{formatMinutes(totalMinutes)}</Text>
            <Text style={styles.summaryLabel}>Total Time</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{totalEvents}</Text>
            <Text style={styles.summaryLabel}>Total Events</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{completedEvents}</Text>
            <Text style={styles.summaryLabel}>Completed</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{completionRate.toFixed(1)}%</Text>
            <Text style={styles.summaryLabel}>Completion Rate</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderDailyAttendance = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Daily Attendance</Text>
      <View style={styles.dailyList}>
        {attendanceData.map((day) => (
          <View key={day.date} style={styles.dailyItem}>
            <View style={styles.dailyHeader}>
              <Text style={styles.dailyDate}>{formatDate(day.date)}</Text>
              <View style={styles.dailyStats}>
                <Text style={styles.dailyMinutes}>{formatMinutes(day.total_minutes)}</Text>
                <Text style={styles.dailyEvents}>{day.total_events} events</Text>
              </View>
            </View>
            <View style={styles.dailyProgress}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${day.completion_rate || 0}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {day.completed_events}/{day.total_events} completed
              </Text>
            </View>
            {day.subjects_covered && day.subjects_covered.length > 0 && (
              <Text style={styles.subjectsText}>
                Subjects: {day.subjects_covered.join(', ')}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );

  const renderCreditSummary = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Credit Ledger</Text>
      <View style={styles.creditList}>
        {creditData.map((credit) => (
          <View key={credit.subject_id} style={styles.creditItem}>
            <View style={styles.creditHeader}>
              <Text style={styles.creditSubject}>{credit.subject_id}</Text>
              <Text style={styles.creditMinutes}>{formatMinutes(credit.total_minutes)}</Text>
            </View>
            <View style={styles.creditDetails}>
              <Text style={styles.creditDetail}>
                {credit.completed_event_minutes} from events
              </Text>
              {credit.bonus_minutes > 0 && (
                <Text style={styles.creditDetail}>
                  +{credit.bonus_minutes} bonus
                </Text>
              )}
              <Text style={styles.creditDetail}>
                {credit.total_credits} credits
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderCoverageView = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>State Coverage</Text>
      <View style={styles.coverageList}>
        {coverageData.map((coverage) => (
          <View key={coverage.subject_id} style={styles.coverageItem}>
            <View style={styles.coverageHeader}>
              <Text style={styles.coverageSubject}>{coverage.subject_id}</Text>
              <View style={styles.coverageStatus}>
                {coverage.requirements_met ? (
                  <Text style={styles.requirementsMet}>✓ Met</Text>
                ) : (
                  <Text style={styles.requirementsNotMet}>⚠ Needs Work</Text>
                )}
              </View>
            </View>
            <View style={styles.coverageProgress}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${Math.min(coverage.coverage_percentage || 0, 100)}%` }
                  ]} 
                />
              </View>
              <Text style={styles.coverageText}>
                {coverage.actual_minutes} / {coverage.goal_minutes} minutes
              </Text>
            </View>
            <Text style={styles.coveragePercentage}>
              {coverage.coverage_percentage}% complete
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderPeriodSelector = () => (
    <View style={styles.periodSelector}>
      {['week', 'month', 'quarter'].map((period) => (
        <TouchableOpacity
          key={period}
          style={[
            styles.periodButton,
            selectedPeriod === period && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedPeriod(period)}
        >
          <Text
            style={[
              styles.periodButtonText,
              selectedPeriod === period && styles.periodButtonTextActive,
            ]}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const handleExportPDF = () => {
    showAlert('Export PDF', 'PDF export functionality would be implemented here');
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Attendance Dashboard</Text>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => setShowExport(true)}
          >
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {renderPeriodSelector()}
          
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {renderAttendanceSummary()}
            {renderDailyAttendance()}
            {renderCreditSummary()}
            {renderCoverageView()}
          </ScrollView>
        </View>

        {showExport && (
          <View style={styles.exportModal}>
            <View style={styles.exportContent}>
              <Text style={styles.exportTitle}>Export Options</Text>
              <TouchableOpacity
                style={styles.exportOption}
                onPress={handleExportPDF}
              >
                <Text style={styles.exportOptionText}>📄 Attendance Report PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exportOption}
                onPress={() => showAlert('Transcript Export', 'Transcript PDF export would be implemented here')}
              >
                <Text style={styles.exportOptionText}>🎓 Academic Transcript PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelExportButton}
                onPress={() => setShowExport(false)}
              >
                <Text style={styles.cancelExportButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  exportButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#3b82f6',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  periodButtonTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#f9fafb',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  dailyList: {
    gap: 12,
  },
  dailyItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dailyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dailyDate: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  dailyStats: {
    alignItems: 'flex-end',
  },
  dailyMinutes: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  dailyEvents: {
    fontSize: 12,
    color: '#6b7280',
  },
  dailyProgress: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  subjectsText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
  creditList: {
    gap: 12,
  },
  creditItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  creditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  creditSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  creditMinutes: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  creditDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  creditDetail: {
    fontSize: 12,
    color: '#6b7280',
  },
  coverageList: {
    gap: 12,
  },
  coverageItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  coverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  coverageSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  coverageStatus: {
    alignItems: 'flex-end',
  },
  requirementsMet: {
    fontSize: 12,
    fontWeight: '500',
    color: '#059669',
  },
  requirementsNotMet: {
    fontSize: 12,
    fontWeight: '500',
    color: '#dc2626',
  },
  coverageProgress: {
    marginTop: 8,
  },
  coverageText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  coveragePercentage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginTop: 8,
  },
  exportModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    margin: 20,
    minWidth: 300,
  },
  exportTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  exportOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginBottom: 12,
  },
  exportOptionText: {
    fontSize: 16,
    color: '#111827',
  },
  cancelExportButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    marginTop: 8,
  },
  cancelExportButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
});

export default AttendanceDashboard;

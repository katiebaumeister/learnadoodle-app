/**
 * Web Child Records Tab
 * Shows records (compliance, transcripts, portfolio, etc.) for a single child
 * Reuses the records tab components but pre-filters to the specific child
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { getRecordsSummary, getComplianceStatus } from '../../../lib/services/recordsClient';
import { colors } from '../../../theme/colors';
import TabBar from '../../ui/TabBar';
import AppContainer from '../../ui/AppContainer';
import EmptyState from '../../ui/EmptyState';
import ComplianceTab from '../../records/tabs/ComplianceTab';
import TranscriptsTab from '../../records/tabs/TranscriptsTab';
import PortfolioEvidenceTab from '../../records/tabs/PortfolioEvidenceTab';
import AttendanceLogsTab from '../../records/tabs/AttendanceLogsTab';
import CoursesSyllabiTab from '../../records/tabs/CoursesSyllabiTab';
import NotesTab from '../../records/tabs/NotesTab';
import GradebookMasteryTab from '../../records/tabs/GradebookMasteryTab';
import { Shield, GraduationCap, FileText, Clock, BookOpen, StickyNote, Calculator } from 'lucide-react';

const TABS = [
  { id: 'compliance', label: 'Compliance', icon: Shield },
  { id: 'transcripts', label: 'Transcripts & Credits', icon: GraduationCap },
  { id: 'gradebook', label: 'Gradebook & Mastery', icon: Calculator },
  { id: 'portfolio', label: 'Portfolio & Evidence', icon: FileText },
  { id: 'attendance', label: 'Attendance & Logs', icon: Clock },
  { id: 'courses', label: 'Courses & Syllabi', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: StickyNote },
];

export default function WebChildRecordsTab({ childId, familyId, childName, onNavigate }) {
  const [activeTab, setActiveTab] = useState('compliance');
  const [children, setChildren] = useState([]);
  const [recordsSummary, setRecordsSummary] = useState(null);
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [timeframe, setTimeframe] = useState('thisYear');
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 1);
    return { start, end: today };
  });

  // Load child data - use props as fallback to avoid unnecessary queries
  useEffect(() => {
    if (!familyId || !childId) return;
    
    // Create minimal child object from props immediately (no loading needed)
    setChildren([{
      id: childId,
      first_name: childName,
      name: childName,
    }]);
    setLoading(false);
    
    // Optionally try to load full child data in background (non-blocking)
    const loadChild = async () => {
      try {
        let { data, error } = await supabase
          .from('children')
          .select('id, first_name, name, avatar, grade')
          .eq('id', childId)
          .eq('family_id', familyId)
          .maybeSingle();
        
        // If archived column exists, try with it
        if (error && (error.code === '400' || error.code === 'PGRST301' || error.code === '42703')) {
          const retry = await supabase
            .from('children')
            .select('id, first_name, name, avatar, grade')
            .eq('id', childId)
            .eq('family_id', familyId)
            .eq('archived', false)
            .maybeSingle();
          if (!retry.error) {
            data = retry.data;
            error = null;
          }
        }
        
        if (!error && data) {
          setChildren([data]);
        }
        // Silently ignore errors - we already have fallback data
      } catch (err) {
        // Silently ignore - we already have fallback data
      }
    };
    
    // Load in background without blocking
    loadChild();
  }, [familyId, childId, childName]);

  // Load records summary (pre-filtered to this child)
  useEffect(() => {
    if (!familyId || !childId || !children.length) return;
    
    const loadSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      
      try {
        const calculatedDateRange = timeframe === 'thisYear'
          ? { start: new Date(new Date().getFullYear(), 0, 1), end: new Date() }
          : timeframe === 'last90Days'
          ? { start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), end: new Date() }
          : dateRange;
        
        const [summaryResult, complianceResult] = await Promise.all([
          getRecordsSummary({
            familyId,
            childIds: [childId],
            dateRange: calculatedDateRange,
          }),
          getComplianceStatus({
            familyId,
            childIds: [childId],
          }),
        ]);
        
        if (summaryResult.success) {
          setRecordsSummary(summaryResult.data);
        } else {
          setSummaryError(summaryResult.error);
        }
        
        if (complianceResult.success) {
          setComplianceStatus(complianceResult.data);
        }
      } catch (err) {
        setSummaryError(err.message);
      } finally {
        setSummaryLoading(false);
      }
    };
    
    loadSummary();
  }, [familyId, childId, children, timeframe, dateRange]);

  const calculatedDateRange = useMemo(() => {
    if (timeframe === 'thisYear') {
      return { start: new Date(new Date().getFullYear(), 0, 1), end: new Date() };
    } else if (timeframe === 'last90Days') {
      return { start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), end: new Date() };
    }
    return dateRange;
  }, [timeframe, dateRange]);

  const resolvedChildIds = [childId];

  const renderTabContent = () => {
    const commonProps = {
      familyId,
      selectedChildren: [childId], // Pre-filtered to this child
      children,
      dateRange: calculatedDateRange,
      resolvedChildIds,
      recordsSummary,
      complianceStatus,
      summaryLoading,
      summaryError,
      onOpenPlanner: () => onNavigate?.('planner'),
      onOpenAnalytics: () => onNavigate?.('intelligence'),
      onOpenPortfolio: () => onNavigate?.('portfolio'),
      // onOpenExplore: () => onNavigate?.('explore'), // Archived - explore page removed
      onUploadEvidence: () => {
        // Handle evidence upload
      },
      onAddNote: () => {
        // Handle note addition
      },
      onRefresh: () => {
        setSummaryLoading(true);
      },
    };

    switch (activeTab) {
      case 'compliance':
        return <ComplianceTab {...commonProps} />;
      case 'transcripts':
        return <TranscriptsTab {...commonProps} />;
      case 'gradebook':
        return <GradebookMasteryTab {...commonProps} />;
      case 'portfolio':
        return <PortfolioEvidenceTab {...commonProps} />;
      case 'attendance':
        return <AttendanceLogsTab {...commonProps} />;
      case 'courses':
        return <CoursesSyllabiTab {...commonProps} />;
      case 'notes':
        return <NotesTab {...commonProps} />;
      default:
        return <ComplianceTab {...commonProps} />;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
        <Text style={styles.loadingText}>Loading records...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Bar */}
      <View style={styles.tabBarContainer}>
        <TabBar
          tabs={TABS.map(tab => ({
            id: tab.id,
            label: tab.label,
            icon: tab.icon,
          }))}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </View>

      {/* Tab Content */}
      <AppContainer fullWidth noPadding>
        <View style={styles.content}>
          {renderTabContent()}
        </View>
      </AppContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBarContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  content: {
    flex: 1,
    padding: 20,
  },
});


/**
 * Web Records Screen
 * Main Records component with two-column layout, tabs, and filters
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { getRecordsSummary, getComplianceStatus } from '../../lib/services/recordsClient';
import { colors } from '../../theme/colors';
import { buildPlannerLink, isPlannerNavigationHref } from '../../lib/url';
import UnifiedRecordsTopBar from './UnifiedRecordsTopBar';
import AppContainer from '../ui/AppContainer';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import CompliancePanel from './CompliancePanel';
import ComplianceSummaryCard from './ComplianceSummaryCard';
import ChildSummaryCard from './ChildSummaryCard';
import ComplianceTab from './tabs/ComplianceTab';
import TranscriptsTab from './tabs/TranscriptsTab';
import PortfolioEvidenceTab from './tabs/PortfolioEvidenceTab';
import AttendanceLogsTab from './tabs/AttendanceLogsTab';
import CoursesSyllabiTab from './tabs/CoursesSyllabiTab';
import NotesTab from './tabs/NotesTab';
import GradebookMasteryTab from './tabs/GradebookMasteryTab';
import TemplatesPage from '../templates/TemplatesPage';
import DigitalBinder from '../content/DigitalBinder';
import YearTimeline from '../timeline/YearTimeline';
import { useSession } from '../../contexts/SessionContext';

export default function WebRecordsScreen({ familyId, navigation }) {
  const session = useSession();
  // State management
  const [children, setChildren] = useState([]);
  const [selectedChildren, setSelectedChildren] = useState('all');
  const [timeframe, setTimeframe] = useState('thisYear');
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 1);
    return { start, end: today };
  });
  const [activeTab, setActiveTab] = useState('compliance');
  const [loading, setLoading] = useState(true);
  const [recordsSummary, setRecordsSummary] = useState(null);
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  // Load children
  useEffect(() => {
    if (!familyId) return;
    
    const loadChildren = async () => {
      // Try API endpoint first (bypasses RLS)
      let childrenData = [];
      
      try {
        const { apiRequest } = await import('../../lib/apiClient');
        const { data: apiData, error: apiError } = await apiRequest(`/api/onboarding/children`, { 
          method: 'GET' 
        });
        
        if (!apiError && apiData && Array.isArray(apiData)) {
          childrenData = apiData.map(child => ({
            id: child.id,
            first_name: child.first_name || child.name,
            grade: child.grade,
            avatar: child.avatar || 'prof1',
          }));
        } else if (apiError?.status !== 404) {
          // Only log non-404 errors
          if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
          }
        }
      } catch (apiErr) {
        // API unavailable, try fallback
        if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
        }
      }
      
      // Fallback: Try direct Supabase query if API didn't work
      if (childrenData.length === 0) {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, grade, avatar')
        .eq('family_id', familyId)
        .eq('archived', false)
        .order('first_name');
      
      if (error) {
          // Handle RLS/permission errors gracefully
          const isExpectedError = error.code === '42501' || 
                                 error.code === 'PGRST301' ||
                                 error.code === '400' ||
                                 error.message?.includes('permission') ||
                                 error.message?.includes('RLS');
          if (!isExpectedError) {
          }
        setChildren([]);
      } else {
        setChildren(data || []);
        }
      } else {
        setChildren(childrenData);
      }
      setLoading(false);
    };
    
    loadChildren();
  }, [familyId]);

  // Calculate date range from timeframe
  const calculatedDateRange = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    
    switch (timeframe) {
      case 'thisYear':
        start.setMonth(0);
        start.setDate(1);
        return { start, end: today };
      case 'last90Days':
        start.setDate(start.getDate() - 90);
        return { start, end: today };
      case 'custom':
        return dateRange;
      default:
        return { start, end: today };
    }
  }, [timeframe, dateRange]);

  // Resolve child IDs
  const resolvedChildIds = useMemo(() => {
    if (selectedChildren === 'all') {
      return children.map(c => c.id);
    }
    return Array.isArray(selectedChildren) ? selectedChildren : [];
  }, [selectedChildren, children]);

  // Load records summary and compliance status when filters change
  // NOTE: This must come AFTER resolvedChildIds and calculatedDateRange are declared
  useEffect(() => {
    if (!familyId || resolvedChildIds.length === 0) {
      setRecordsSummary(null);
      setComplianceStatus(null);
      return;
    }
    
    const loadSummaryData = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      
      try {
        const [summary, compliance] = await Promise.all([
          getRecordsSummary(familyId, resolvedChildIds, calculatedDateRange).catch(err => {
            // Fallback already handled in function, but catch any unexpected errors
            return { perChild: {}, global: {} };
          }),
          getComplianceStatus(familyId, resolvedChildIds, calculatedDateRange).catch(err => {
            // Fallback already handled in function, but catch any unexpected errors
            return { checklist: [], readiness: {}, gaps: [], documents: [], stateRules: null };
          }),
        ]);
        
        setRecordsSummary(summary);
        setComplianceStatus(compliance);
        setSummaryError(null); // Clear any previous errors
      } catch (error) {
        // Only log unexpected errors (not 404s which are expected)
        if (error?.status !== 404) {
          setSummaryError(error.message);
        }
      } finally {
        setSummaryLoading(false);
      }
    };
    
    loadSummaryData();
  }, [familyId, resolvedChildIds, calculatedDateRange]);

  // Navigation helpers
  const handleNavigate = (path) => {
    if (navigation && typeof navigation === 'function') {
      navigation(path);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Keep address bar on `/` — Expo web refresh blanks on shell deep paths.
      window.history.replaceState({}, '', '/');
      const href = String(path || '');
      if (isPlannerNavigationHref(href)) {
        let view = 'month';
        try {
          view = new URL(href, 'https://learnadoodle.local').searchParams.get('view') || 'month';
        } catch (_) {}
        window.dispatchEvent(new CustomEvent('navigateToPlanner', { detail: { view } }));
      }
    }
  };

  const handleOpenPlanner = (childId) => {
    handleNavigate(buildPlannerLink({ view: 'week', childId }));
  };

  const handleOpenAnalytics = (childId) => {
    handleNavigate(`/intelligence?tab=analytics&child=${childId}`);
  };

  const handleOpenPortfolio = (childId) => {
    handleNavigate(`/records?tab=portfolio&child=${childId}`);
  };

  // const handleOpenExplore = (provider) => { // Archived - explore page removed
  //   handleNavigate(`/explore?provider=${provider}`);
  // };

  // Quick actions
  const handleUploadEvidence = () => {
    // Switch to portfolio tab where upload button is available
    setActiveTab('portfolio');
    // TODO: Could also open a modal directly, but for now just navigate to tab
  };

  const handleAddNote = (evidenceId) => {
    // Switch to notes tab
    setActiveTab('notes');
    // TODO: Could also trigger the note editor modal directly with linkedEvidenceId = evidenceId
    // For now, just navigate to notes tab - the NotesTab can check URL params for evidenceId
    if (evidenceId && Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('evidenceId', evidenceId);
      window.history.pushState({}, '', url);
    }
  };

  const handleExportTranscript = async () => {
    if (resolvedChildIds.length === 1) {
      // Generate transcript for single child
      try {
        const { generateTranscript } = await import('../../lib/services/recordsClient');
        const blob = await generateTranscript(
          resolvedChildIds[0],
          calculatedDateRange.start,
          calculatedDateRange.end
        );
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const child = children.find(c => c.id === resolvedChildIds[0]);
        const childName = child?.first_name || 'child';
        a.download = `transcript_${childName}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        alert('Failed to generate transcript. Please try again.');
      }
    } else {
      alert('Please select a single child to export transcript.');
    }
  };

  const handleExportCompliancePacket = async () => {
    try {
      const { exportCompliancePacket } = await import('../../lib/services/recordsClient');
      const { data, error } = await exportCompliancePacket({
        familyId,
        childIds: resolvedChildIds,
        dateRange: calculatedDateRange,
      });
      
      if (error || !data) {
        alert(error?.message || 'Unable to export compliance packet');
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
      }
    } catch (err) {
      alert('Failed to export compliance packet. Please try again.');
    }
  };

  // Render tab content
  const renderTabContent = () => {
    const commonProps = {
      familyId,
      selectedChildren,
      children,
      dateRange: calculatedDateRange,
      resolvedChildIds,
      recordsSummary,
      complianceStatus,
      summaryLoading,
      summaryError,
      onOpenPlanner: handleOpenPlanner,
      onOpenAnalytics: handleOpenAnalytics,
      onOpenPortfolio: handleOpenPortfolio,
      // onOpenExplore: handleOpenExplore, // Archived - explore page removed
      onUploadEvidence: handleUploadEvidence,
      onAddNote: handleAddNote,
      onRefresh: () => {
        // Trigger refresh by updating a dependency
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
      case 'binder':
        return (
          <View style={{ flex: 1, padding: 16 }}>
            {resolvedChildIds.length === 1 ? (
              <DigitalBinder childId={resolvedChildIds[0]} familyId={familyId} />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center', marginBottom: 8 }}>
                  Select a child to view their Digital Binder
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
                  The Digital Binder organizes documents by section (Syllabus, Assignments, Portfolio, etc.)
                </Text>
              </View>
            )}
          </View>
        );
      case 'attendance':
        return <AttendanceLogsTab {...commonProps} />;
      case 'courses':
        return <CoursesSyllabiTab {...commonProps} /* onOpenExplore={handleOpenExplore} */ />; // Archived - explore page removed
      case 'notes':
        return <NotesTab {...commonProps} />;
      case 'timeline':
        return (
          <View style={{ flex: 1 }}>
            <YearTimeline 
              familyId={familyId} 
              childId={resolvedChildIds.length === 1 ? resolvedChildIds[0] : null}
              session={session}
            />
          </View>
        );
      case 'templates':
        return <TemplatesPage familyId={familyId} children={children} />;
      default:
        return <ComplianceTab {...commonProps} />;
    }
  };

  // Get child summary data from recordsSummary
  const getChildSummary = (childId) => {
    if (!recordsSummary?.perChild?.[childId]) {
      return {
        readinessScore: 0,
        attendanceDays: 0,
        attendanceMinutes: 0,
        creditsEarned: 0,
        creditsPlanned: 0,
        portfolioCount: 0,
        gapWarnings: [],
      };
    }
    
    const childData = recordsSummary.perChild[childId];
    const gaps = complianceStatus?.gaps?.filter(g => g.childId === childId).map(g => g.message) || [];
    
    return {
      readinessScore: childData.readinessScore || 0,
      attendanceDays: childData.attendanceDays || 0,
      attendanceMinutes: childData.attendanceMinutes || 0,
      creditsEarned: childData.creditsEarned || 0,
      creditsPlanned: childData.creditsPlanned || 0,
      portfolioCount: childData.portfolioCount || 0,
      gapWarnings: gaps,
    };
  };

  // Render left column content
  const renderLeftColumn = () => {
    // When "All" is selected and on Compliance tab, show child summary cards
    // For other tabs, show tab content for all children
    if (selectedChildren === 'all' && activeTab === 'compliance') {
      if (summaryLoading) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.indigo} />
            <Text style={styles.loadingText}>Loading records...</Text>
          </View>
        );
      }
      
      return (
        <ScrollView style={styles.leftColumn} contentContainerStyle={styles.leftColumnContent}>
          {children.map(child => {
            const summary = getChildSummary(child.id);
            return (
              <ChildSummaryCard
                key={child.id}
                child={child}
                {...summary}
                onOpenPlanner={handleOpenPlanner}
                onOpenAnalytics={handleOpenAnalytics}
                onOpenPortfolio={handleOpenPortfolio}
              />
            );
          })}
        </ScrollView>
      );
    }

    // Show tab content (works for both single child and "All" selections)
    return (
      <ScrollView style={styles.leftColumn} contentContainerStyle={styles.leftColumnContent}>
        {renderTabContent()}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Unified Top Bar */}
      <UnifiedRecordsTopBar
        children={children}
        selectedChildren={selectedChildren}
        onChildrenChange={setSelectedChildren}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onUploadEvidence={handleUploadEvidence}
        onAddNote={handleAddNote}
        onExportTranscript={handleExportTranscript}
        onExportCompliancePacket={handleExportCompliancePacket}
        complianceStatus={complianceStatus}
      />

      {/* Two-Column Layout */}
      {activeTab === 'templates' ? (
        // Templates uses full-width layout
        <AppContainer fullWidth noPadding>
        <View style={styles.content}>
          {renderTabContent()}
        </View>
        </AppContainer>
      ) : (
        <AppContainer fullWidth noPadding>
        <View style={styles.content}>
          {/* Left Column */}
          {renderLeftColumn()}

          {/* Right Column - Dynamic based on active tab */}
          <View style={styles.rightColumn}>
            {activeTab === 'compliance' ? (
              <CompliancePanel
                familyId={familyId}
                selectedChildren={selectedChildren}
                children={children}
                dateRange={calculatedDateRange}
                complianceStatus={complianceStatus}
                loading={summaryLoading}
                error={summaryError}
              />
            ) : (
              <ComplianceSummaryCard
                complianceStatus={complianceStatus}
                onOpenCompliance={() => setActiveTab('compliance')}
              />
            )}
          </View>
        </View>
        </AppContainer>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc', // colors.background equivalent
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 12,
  },
  content: {
    flex: 1,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    padding: 16,
    gap: 16,
  },
  leftColumn: {
    flex: 2,
    minWidth: 0, // Allows flexbox to shrink
  },
  leftColumnContent: {
    paddingBottom: 20,
  },
  rightColumn: {
    flex: 1,
    minWidth: 300,
    maxWidth: Platform.OS === 'web' ? 400 : undefined,
    // Sticky positioning for web (handled via className in actual web implementation)
  },
});


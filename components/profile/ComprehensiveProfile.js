import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert } from 'react-native';
import { 
  BookOpen, FileText, 
  User, CheckCircle2, Plus, Calendar, AlertCircle, TrendingUp, Clock, Target, Link as LinkIcon, Upload, BarChart3
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { designTokens } from '../../theme/designTokens';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';
import AddSubjectModal from '../AddSubjectModal';
import PlanYearWizard from '../year/PlanYearWizard';
import SubjectDetailModal from '../subjects/SubjectDetailModal';

// Import all profile feature components
import PrintablePortfolioView from './PrintablePortfolioView';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

export default function ComprehensiveProfile({ childId, familyId, children = [], onOpenSettings, onOpenFeedback, onTabChange, onEditChild }) {
  const { user } = useAuth();
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const styles = createStyles(tokens);
  
  // Default to "All Children" (null) unless a specific childId is provided
  const [selectedChildId, setSelectedChildId] = useState(childId || null);
  const [child, setChild] = useState(null);
  
  // Get selected child for background color
  // Use effectiveChildId (which defaults to first child alphabetically if no childId)
  const sortedChildren = [...children].sort((a, b) => {
    const nameA = (a.first_name || a.name || '').toLowerCase();
    const nameB = (b.first_name || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  const effectiveChildId = selectedChildId || (sortedChildren.length > 0 ? sortedChildren[0].id : null);
  
  // Get the effective child based on selectedChildId or first child
  // If selectedChildId is set, use child state (from children array or loaded) or find in sortedChildren
  // If selectedChildId is null, use the first child from sortedChildren
  const effectiveChild = effectiveChildId 
    ? (child || sortedChildren.find(c => c.id === effectiveChildId))
    : (sortedChildren.length > 0 ? sortedChildren[0] : null);
  
  // Use normal white background for the page
  const backgroundColor = tokens.bg || '#ffffff';

  useEffect(() => {
    // Only update if a specific childId is provided, otherwise keep "All Children"
    if (childId) {
      setSelectedChildId(childId);
    }
    // If childId is null/undefined, keep selectedChildId as null (All Children)
  }, [childId]);

  // Try to get child from children array first (non-blocking)
  useEffect(() => {
    if (selectedChildId && children && children.length > 0) {
      const foundChild = children.find(c => c.id === selectedChildId);
      if (foundChild) {
        setChild(foundChild);
        return; // Use child from array, no need to fetch
      }
    } else if (!selectedChildId) {
      setChild(null);
      return;
    }
    
    // If not found in array, load it in background (non-blocking)
    if (selectedChildId) {
      loadChild();
    }
  }, [selectedChildId, children]);

  const loadChild = async () => {
    if (!selectedChildId) {
      setChild(null);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('id', selectedChildId)
        .single();
      
      if (error) throw error;
      setChild(data);
    } catch (error) {
      console.error('Error loading child:', error);
      setChild(null);
    }
  };

  const renderTabContent = () => {
    // If we have children and familyId, show the subjects view (works for both specific child and all children)
    // When selectedChildId is null, we show "All Children"
    if (children && children.length > 0 && familyId) {
      return <PrintablePortfolioView childId={selectedChildId} familyId={familyId} child={child} children={children} onOpenSettings={onOpenSettings} onOpenFeedback={onOpenFeedback} onChildChange={setSelectedChildId} backgroundColor={backgroundColor} onTabChange={onTabChange} onEditChild={onEditChild} />;
    }
    
    // Show child selector if no children found
    if (!children || children.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No children found. Add a child to view their profile.
          </Text>
        </View>
      );
    }
    
    // Fallback: show subjects view anyway
    return <PrintablePortfolioView childId={selectedChildId} familyId={familyId} child={child} children={children} onOpenSettings={onOpenSettings} onOpenFeedback={onOpenFeedback} onChildChange={setSelectedChildId} backgroundColor={backgroundColor} onTabChange={onTabChange} />;
  };

  // Don't block rendering - let PrintablePortfolioView handle its own loading
  // Only show error if we specifically tried to load and failed (not just missing from array)

  return (
    <View style={[styles.container, { backgroundColor: backgroundColor }]}>
      {/* Content */}
      <ScrollView 
        style={[styles.content, { backgroundColor: backgroundColor }]}
        contentContainerStyle={[styles.contentContainer, { backgroundColor: backgroundColor }]}
        showsVerticalScrollIndicator={false}
      >
        {renderTabContent()}
      </ScrollView>
    </View>
  );
}

// Simple cache for ProfileOverview data (keyed by childId-familyId)
const profileOverviewCache = new Map();

function createOverviewStyles(tokens) {
  return StyleSheet.create({
    overview: {
      gap: spacing.lg,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      ...Platform.select({
        web: {
          width: '100%',
        },
      }),
    },
    headerLeft: {
      flex: 1,
    },
    headerText: {
      fontSize: 26,
      fontWeight: '700',
      color: tokens.text || '#111827',
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    divider: {
      height: 1,
      backgroundColor: tokens.border || 'rgba(0, 0, 0, 0.1)',
      marginVertical: spacing.lg,
    },
    tabsContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border || 'rgba(0, 0, 0, 0.1)',
    },
    tab: {
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      marginBottom: -1,
    },
    tabActive: {
      borderBottomColor: tokens.accent || colors.accent,
    },
    tabText: {
      fontSize: 15,
      fontWeight: '500',
      color: tokens.textSecondary || '#6b7280',
      ...Platform.select({
        web: {
          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    tabTextActive: {
      color: tokens.text || '#111827',
      fontWeight: '600',
    },
    tabContent: {
      marginTop: spacing.md,
    },
    placeholderText: {
      fontSize: 14,
      color: tokens.textSecondary,
      fontStyle: 'italic',
      padding: spacing.lg,
      textAlign: 'center',
    },
    // Chart Tab Styles
    subjectGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    subjectTile: {
      backgroundColor: tokens.bg || '#ffffff',
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      minWidth: 280,
      maxWidth: 320,
      flex: 1,
    },
    tileHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
    },
    tileTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: tokens.text,
      flex: 1,
    },
    needsInputBadge: {
      backgroundColor: '#fef3c7',
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.sm,
      marginLeft: spacing.xs,
    },
    needsInputText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#92400e',
      textTransform: 'uppercase',
    },
    tileProgress: {
      marginBottom: spacing.sm,
    },
    progressBar: {
      height: 8,
      backgroundColor: tokens.border || '#e5e7eb',
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: spacing.xs,
    },
    progressFill: {
      height: '100%',
      backgroundColor: tokens.accent || colors.accent,
      borderRadius: 4,
    },
    progressText: {
      fontSize: 12,
      color: tokens.textSecondary,
    },
    tileFocus: {
      marginBottom: spacing.sm,
    },
    tileLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: tokens.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    tileValue: {
      fontSize: 14,
      color: tokens.text,
      fontWeight: '500',
    },
    tileDate: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    tileDateText: {
      fontSize: 12,
      color: tokens.textSecondary,
    },
    tileConfidence: {
      marginTop: spacing.xs,
    },
    confidenceBars: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 4,
    },
    confidenceBar: {
      height: 4,
      borderRadius: 2,
    },
    diagnosticsRow: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: tokens.border || '#e5e7eb',
    },
    diagnosticsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.text,
      marginBottom: spacing.sm,
    },
    diagnosticsScroll: {
      flexGrow: 0,
    },
    diagnosticsChips: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    diagnosticChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    diagnosticChipText: {
      fontSize: 12,
      fontWeight: '500',
    },
    // Reading Tab Styles
    readingContent: {
      flex: 1,
    },
    readingSection: {
      marginBottom: spacing.xl,
    },
    readingSectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: tokens.text,
      marginBottom: spacing.sm,
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    readingSectionText: {
      fontSize: 15,
      lineHeight: 24,
      color: tokens.text,
      ...Platform.select({
        web: {
          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    promptPanel: {
      backgroundColor: tokens.bgSubtle || '#f9fafb',
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      alignItems: 'center',
    },
    promptText: {
      fontSize: 14,
      color: tokens.textSecondary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    promptButton: {
      backgroundColor: tokens.accent || colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    promptButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    bulletList: {
      gap: spacing.xs,
    },
    bulletItem: {
      fontSize: 15,
      lineHeight: 24,
      color: tokens.text,
      ...Platform.select({
        web: {
          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    linksStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: tokens.border || '#e5e7eb',
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      backgroundColor: tokens.bg || '#ffffff',
    },
    linkButtonText: {
      fontSize: 13,
      fontWeight: '500',
      color: tokens.text,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexShrink: 0,
    },
    headerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    headerButtonSecondary: {
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    headerButtonText: {
      fontSize: 13,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
    },
    headerButtonTextSecondary: {
      // Text color is set inline based on accent color
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    statItem: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      minWidth: 120,
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: designTokens.fonts.sans,
      textAlign: 'center',
      color: tokens.textSecondary,
    },
    subjectsList: {
      gap: spacing.md,
    },
    subjectsContainer: {
      gap: spacing.xl,
    },
    actionButtonsContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
      flexWrap: 'wrap',
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    createButtonText: {
      fontSize: 14,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
    },
    termBuilderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    termBuilderButtonText: {
      fontSize: 14,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
    },
    subjectGroup: {
      marginBottom: spacing.xl,
    },
    groupTitle: {
      fontSize: 18,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      marginBottom: spacing.md,
      color: tokens.text,
    },
    subjectsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      ...Platform.select({
        web: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        },
      }),
    },
    subjectCard: {
      flex: 1,
      minWidth: 320,
      maxWidth: 400,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    subjectCardContent: {
      gap: spacing.sm,
      padding: spacing.md,
    },
    subjectHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.xs,
    },
    subjectHeaderLeft: {
      flex: 1,
      gap: spacing.xs,
    },
    subjectName: {
      fontSize: 18,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
    },
    scopeBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    scopeBadgeText: {
      fontSize: 11,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    statusIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    subjectMetadata: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    assignedChildren: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    childAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#f3f4f6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    childAvatarText: {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    familyWideIndicator: {
      paddingHorizontal: spacing.xs,
    },
    familyWideText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    gradeText: {
      fontSize: 12,
      fontWeight: '400',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    weeklyStats: {
      paddingHorizontal: spacing.xs,
    },
    weeklyStatsText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    cognitiveLoadTag: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    cognitiveLoadText: {
      fontSize: 11,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
    },
    quickActionsContainer: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    quickActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    quickActionText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    insightRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
    },
    insightText: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      fontStyle: 'italic',
      lineHeight: 18,
      color: tokens.textSecondary,
    },
    subjectItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
    },
    familyWideLabel: {
      fontSize: 14,
      fontWeight: '400',
      fontFamily: designTokens.fonts.sans,
      fontStyle: 'italic',
      color: tokens.textSecondary,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
    loadingText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    emptyContainer: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      textAlign: 'center',
      color: tokens.textSecondary,
    },
  });
}

// Overview Component - Current Subjects List
function ProfileOverview({ child, familyId, children = [] }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const overviewStyles = createOverviewStyles(tokens);
  
  // Get all children for the year planning wizard
  const allChildren = children.length > 0 ? children : (child ? [child] : []);
  
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubjectId, setExpandedSubjectId] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showPlanYearWizard, setShowPlanYearWizard] = useState(false);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart'

  useEffect(() => {
    if (child?.id && familyId) {
      const key = `${child.id}-${familyId}`;
      const cached = profileOverviewCache.get(key);
      
      // If we have cached data, use it immediately and don't show loading
      if (cached) {
        setSubjects(cached.subjects);
        setLoading(false);
      } else {
        // Otherwise, load the data
        loadCurrentSubjects();
      }
    }
  }, [child?.id, familyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCurrentSubjects = async () => {
    if (!child?.id || !familyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Get unique subject IDs from events for this child
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('subject_id')
        .eq('child_id', child.id)
        .eq('family_id', familyId)
        .not('subject_id', 'is', null);

      if (eventsError) {
        console.warn('[ProfileOverview] Error loading events:', eventsError);
        setSubjects([]);
        setLoading(false);
        return;
      }

      // Get unique subject IDs from child's events
      const childSubjectIds = [...new Set((eventsData || []).map(e => e.subject_id).filter(Boolean))];

      // Fetch child-specific subjects with all fields
      let childSubjects = [];
      if (childSubjectIds.length > 0) {
        const { data: childSubjectsData, error: childSubjectsError } = await supabase
          .from('subject')
          .select('id, name, child_id, grade, notes, family_year_id, created_at, updated_at')
          .eq('family_id', familyId)
          .in('id', childSubjectIds)
          .order('name');

        if (!childSubjectsError && childSubjectsData) {
          childSubjects = childSubjectsData.map(s => ({ ...s, isFamilyWide: false }));
        }
      }

      // Fetch family-wide subjects (child_id IS NULL)
      const { data: familyWideSubjectsData, error: familyWideError } = await supabase
        .from('subject')
        .select('id, name, child_id, grade, notes, family_year_id, created_at, updated_at')
        .eq('family_id', familyId)
        .is('child_id', null)
        .order('name');

      let familyWideSubjects = [];
      if (!familyWideError && familyWideSubjectsData) {
        familyWideSubjects = familyWideSubjectsData.map(s => ({ ...s, isFamilyWide: true }));
      }

      // Combine and deduplicate
      const allSubjects = [...childSubjects, ...familyWideSubjects];
      const uniqueSubjects = [];
      const seenIds = new Set();
      
      for (const subject of allSubjects) {
        if (!seenIds.has(subject.id)) {
          seenIds.add(subject.id);
          const existing = uniqueSubjects.find(s => s.id === subject.id);
          if (existing) {
            existing.isFamilyWide = existing.isFamilyWide || subject.isFamilyWide;
          } else {
            uniqueSubjects.push(subject);
          }
        }
      }

      const subjectIds = uniqueSubjects.map(s => s.id);
      const allDisplayedSubjectIds = uniqueSubjects.map(s => s.id);

      // Fetch coverage tracking data
      const { data: coverageData } = await supabase
        .from('subject_coverage_tracking')
        .select('*')
        .eq('child_id', child.id)
        .in('subject_id', subjectIds)
        .order('computed_for_date', { ascending: false });

      // Fetch cognitive load
      const { data: cognitiveLoadData } = await supabase
        .from('subject_cognitive_load')
        .select('*')
        .in('subject_id', subjectIds);

      // Fetch goals
      const { data: goalsData } = await supabase
        .from('subject_goals')
        .select('*')
        .eq('child_id', child.id)
        .in('subject_id', subjectIds);

      // Fetch materials count
      const { data: materialsData } = await supabase
        .from('materials')
        .select('subject_id')
        .eq('family_id', familyId)
        .in('subject_id', subjectIds);

      // Fetch events count (for scheduled class days)
      const { data: eventsCountData } = await supabase
        .from('events')
        .select('subject_id')
        .eq('child_id', child.id)
        .eq('family_id', familyId)
        .in('subject_id', subjectIds)
        .gte('start_ts', new Date().toISOString());

      // Fetch syllabi for this child and ALL subjects (not just those with events)
      const { data: syllabiData, error: syllabiError } = await supabase
        .from('syllabi')
        .select('id, subject_id, title, upload_id')
        .eq('child_id', child.id)
        .eq('family_id', familyId)
        .in('subject_id', allDisplayedSubjectIds.length > 0 ? allDisplayedSubjectIds : [])
        .order('created_at', { ascending: false });

      if (syllabiError) {
        console.warn('[ProfileOverview] Error loading syllabi:', syllabiError);
      }

      // Fetch lesson plans for ALL displayed subjects
      const { data: lessonPlansData, error: lessonPlansError } = await supabase
        .from('lesson_plans')
        .select('id, subject_id, title')
        .eq('family_id', familyId)
        .in('subject_id', allDisplayedSubjectIds.length > 0 ? allDisplayedSubjectIds : []);

      if (lessonPlansError) {
        console.warn('[ProfileOverview] Error loading lesson plans:', lessonPlansError);
      }

      // Combine all data
      const enrichedSubjects = uniqueSubjects.map(subject => {
        const coverage = coverageData?.find(c => c.subject_id === subject.id);
        const cognitiveLoad = cognitiveLoadData?.find(cl => cl.subject_id === subject.id);
        const goal = goalsData?.find(g => g.subject_id === subject.id);
        const materialsCount = materialsData?.filter(m => m.subject_id === subject.id).length || 0;
        const upcomingEventsCount = eventsCountData?.filter(e => e.subject_id === subject.id).length || 0;
        const syllabus = syllabiData?.find(s => s.subject_id === subject.id);
        const lessonPlan = lessonPlansData?.find(lp => lp.subject_id === subject.id);
        
        // Debug logging
        if (subject.name === 'Algebra' && syllabus) {
          console.log('[ProfileOverview] Found syllabus for Algebra:', syllabus);
        }

        // Get children assigned to this subject (for family-wide)
        let assignedChildren = [];
        if (subject.isFamilyWide) {
          // For family-wide subjects, we'll show all children (or check events if needed)
          assignedChildren = children;
        } else {
          // For child-specific, find which child this belongs to
          const subjectChild = children.find(c => c.id === subject.child_id) || child;
          assignedChildren = subjectChild ? [subjectChild] : [child];
        }

        return {
          ...subject,
          coverage: coverage || null,
          cognitiveLoad: cognitiveLoad?.load_level || 'medium',
          goal: goal || null,
          materialsCount,
          upcomingEventsCount,
          assignedChildren,
          syllabus: syllabus || null,
          lessonPlan: lessonPlan || null,
          // Generate insight
          insight: generateInsight(subject, coverage, goal, materialsCount, upcomingEventsCount),
        };
      });

      const sortedSubjects = enrichedSubjects.sort((a, b) => a.name.localeCompare(b.name));
      setSubjects(sortedSubjects);
      
      // Cache the loaded data
      if (child?.id && familyId) {
        const key = `${child.id}-${familyId}`;
        profileOverviewCache.set(key, { subjects: sortedSubjects });
        // Limit cache size to prevent memory leaks (keep last 10 entries)
        if (profileOverviewCache.size > 10) {
          const firstKey = profileOverviewCache.keys().next().value;
          profileOverviewCache.delete(firstKey);
        }
      }
    } catch (error) {
      console.warn('[ProfileOverview] Error loading subjects:', error);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const generateInsight = (subject, coverage, goal, materialsCount, upcomingEventsCount) => {
    if (!coverage && !goal) return null;
    
    const target = goal?.goal_minutes_per_week || goal?.minutes_per_week || coverage?.target_minutes_per_week || 0;
    const actual = coverage?.actual_minutes_last_7_days || 0;
    const diff = actual - target;
    const status = coverage?.coverage_status || 'on_track';

    if (status === 'low' && diff < 0) {
      return `${subject.name} is slightly under target this week (${diff} min).`;
    } else if (status === 'ahead' && diff > 0) {
      return `${subject.name} is ahead — consider lighter days next week.`;
    } else if (materialsCount === 0) {
      return `${subject.name} has no materials attached.`;
    } else if (upcomingEventsCount === 0) {
      return `${subject.name} has no upcoming events scheduled.`;
    }
    return null;
  };

  const handleOpenSyllabus = async (syllabus) => {
    if (!syllabus?.upload_id) {
      console.warn('[ProfileOverview] Syllabus missing upload_id:', syllabus);
      return;
    }

    try {
      // Fetch the material record (upload_id now points to materials.id)
      const { data: material, error: materialError } = await supabase
        .from('materials')
        .select('id, title, storage_path, url, mime')
        .eq('id', syllabus.upload_id)
        .is('deleted_at', null)
        .single();

      if (materialError) {
        console.error('[ProfileOverview] Error fetching material:', materialError);
        return;
      }

      if (!material) {
        console.warn('[ProfileOverview] Material not found for syllabus:', syllabus.upload_id);
        return;
      }

      // Get the file URL
      let fileUrl = material.url;
      
      // If no URL but we have storage_path, get signed URL (better for private buckets)
      if (!fileUrl && material.storage_path) {
        try {
          // Try to get a signed URL first (this will properly detect bucket errors)
          const { data: signedData, error: signedError } = await supabase.storage
            .from('evidence')
            .createSignedUrl(material.storage_path, 3600); // 1 hour expiry
          
          if (signedError) {
            // Check if it's a bucket not found error
            const isBucketError = 
              signedError.message?.includes('Bucket not found') ||
              signedError.message?.includes('bucket') ||
              signedError.error === 'Bucket not found' ||
              signedError.statusCode === 404 ||
              (signedError.statusCode && String(signedError.statusCode).startsWith('4'));
            
            console.error('[ProfileOverview] Storage error:', signedError);
            Alert.alert(
              'Storage Error',
              'The storage bucket is not configured or cannot be accessed. Please check your Supabase storage setup or contact support.'
            );
            return;
          }
          
          if (signedData?.signedUrl) {
            fileUrl = signedData.signedUrl;
          } else {
            // Fallback to public URL (but this shouldn't be needed if signed URL worked)
            const { data: urlData } = supabase.storage
              .from('evidence')
              .getPublicUrl(material.storage_path);
            fileUrl = urlData?.publicUrl;
          }
        } catch (error) {
          console.error('[ProfileOverview] Error accessing storage:', error);
          Alert.alert(
            'Storage Error',
            `Unable to access file: ${error.message || 'Storage bucket not configured'}. Please check your Supabase storage setup.`
          );
          return;
        }
      }

      if (!fileUrl) {
        console.warn('[ProfileOverview] No file URL found for material:', material);
        Alert.alert('Error', 'No file URL available for this syllabus');
        return;
      }

      // Open in new tab/window
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(fileUrl, '_blank');
      }
    } catch (error) {
      console.error('[ProfileOverview] Error opening syllabus:', error);
    }
  };

  const handleOpenLessonPlan = (lessonPlan) => {
    // TODO: Navigate to lesson plan view or open lesson plan modal
    console.log('Open lesson plan:', lessonPlan);
    // This would typically navigate to a lesson plan detail view or open a modal
  };

  // Group subjects by category
  const groupSubjects = (subjects) => {
    const groups = {
      'Core Academics': [],
      'Enrichment': [],
      'Physical / Life Skills': [],
      'Family-Wide Learning': [],
    };

    const coreKeywords = ['math', 'reading', 'writing', 'science', 'history', 'social studies', 'language', 'english', 'literature'];
    const enrichmentKeywords = ['art', 'music', 'drama', 'theater', 'dance', 'drama', 'creative'];
    const physicalKeywords = ['pe', 'physical', 'gym', 'sports', 'health', 'cooking', 'life skills'];

    subjects.forEach(subject => {
      const nameLower = subject.name.toLowerCase();
      
      if (subject.isFamilyWide) {
        groups['Family-Wide Learning'].push(subject);
      } else if (coreKeywords.some(kw => nameLower.includes(kw))) {
        groups['Core Academics'].push(subject);
      } else if (enrichmentKeywords.some(kw => nameLower.includes(kw))) {
        groups['Enrichment'].push(subject);
      } else if (physicalKeywords.some(kw => nameLower.includes(kw))) {
        groups['Physical / Life Skills'].push(subject);
      } else {
        groups['Core Academics'].push(subject); // Default to Core Academics
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, subjects]) => subjects.length > 0);
  };

  const groupedSubjects = groupSubjects(subjects);

  const handleSubjectAdded = (newSubject) => {
    // Reload subjects after a new one is added
    loadCurrentSubjects();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'on_track': return '#10b981'; // green
      case 'low': return '#ef4444'; // red
      case 'ahead': return '#3b82f6'; // blue
      default: return tokens.textSecondary;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'on_track': return 'On Track';
      case 'low': return 'Low';
      case 'ahead': return 'Ahead';
      default: return 'Unknown';
    }
  };

  const getCognitiveLoadColor = (load) => {
    switch (load) {
      case 'light': return '#94a3b8';
      case 'medium': return '#f59e0b';
      case 'heavy': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  // Get term and school year for header (matching planner style)
  const getTermAndYear = () => {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    
    // Determine term based on month (matching planner: Spring/Summer/Fall only)
    let termName = 'Fall Term';
    if (month >= 0 && month <= 4) termName = 'Spring Term'; // January - May
    else if (month >= 5 && month <= 7) termName = 'Summer Term'; // June - August
    else if (month >= 8 && month <= 11) termName = 'Fall Term'; // September - December
    
    // Determine school year (e.g., 25/26 for 2025-2026)
    // School year typically runs from Aug/Sep to May/Jun
    let schoolYearStart = year;
    if (month >= 8) { // Sep-Dec, use current year as start
      schoolYearStart = year;
    } else { // Jan-Aug, use previous year as start
      schoolYearStart = year - 1;
    }
    const schoolYearEnd = schoolYearStart + 1;
    
    return { termName, schoolYearStart, schoolYearEnd };
  };

  const { termName, schoolYearStart, schoolYearEnd } = getTermAndYear();
  const childName = child?.first_name || child?.name || '';

  return (
    <View style={overviewStyles.overview}>
      {/* Content */}
      {loading ? (
        <View style={overviewStyles.loadingContainer}>
          <ActivityIndicator size="small" color={tokens.accent} />
          <Text style={overviewStyles.loadingText}>Loading subjects...</Text>
        </View>
      ) : (
        <View style={overviewStyles.tabContent}>
          {/* Chart Tab: Subject Overview Grid */}
          {subjects.length === 0 ? (
            <View style={overviewStyles.emptyContainer}>
              <Text style={overviewStyles.emptyText}>
                No subjects found. Add events with subjects to see them here.
              </Text>
            </View>
          ) : (
            <>
              {/* Header - Term and Year */}
              <View style={overviewStyles.headerContainer}>
                <View style={overviewStyles.headerLeft}>
                  <Text style={overviewStyles.headerText}>
                    {termName} {schoolYearEnd} - {childName}
                  </Text>
                </View>
              </View>
              
              {/* Subject Overview Grid */}
              <View style={overviewStyles.subjectGrid}>
                {subjects.map((subject) => {
                  // Calculate progress (placeholder - would need actual data)
                  const progress = 65; // percentage
                  const hasSyllabus = subject.syllabus || false;
                  const hasGoal = subject.goal || false;
                  
                  return (
                    <TouchableOpacity 
                      key={subject.id} 
                      style={overviewStyles.subjectTile}
                      onPress={() => {
                        setSelectedSubjectId(subject.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={overviewStyles.tileHeader}>
                        <Text style={overviewStyles.tileTitle}>{subject.name}</Text>
                        {(!hasSyllabus || !hasGoal) && (
                          <View style={overviewStyles.needsInputBadge}>
                            <Text style={overviewStyles.needsInputText}>Needs input</Text>
                          </View>
                        )}
                      </View>
                      
                      {/* Progress Ring/Bar */}
                      <View style={overviewStyles.tileProgress}>
                        <View style={overviewStyles.progressBar}>
                          <View style={[overviewStyles.progressFill, { width: `${progress}%` }]} />
                        </View>
                        <Text style={overviewStyles.progressText}>{progress}% pace vs plan</Text>
                      </View>
                      
                      {/* Current Focus */}
                      <View style={overviewStyles.tileFocus}>
                        <Text style={overviewStyles.tileLabel}>Current focus</Text>
                        <Text style={overviewStyles.tileValue}>{subject.currentUnit || 'Unit 3: Algebra Basics'}</Text>
                      </View>
                      
                      {/* Next Key Date */}
                      <View style={overviewStyles.tileDate}>
                        <Clock size={14} color={tokens.textSecondary} />
                        <Text style={overviewStyles.tileDateText}>Next: Assessment on Mar 15</Text>
                      </View>
                      
                      {/* Confidence Indicator */}
                      <View style={overviewStyles.tileConfidence}>
                        <Text style={overviewStyles.tileLabel}>Confidence</Text>
                        <View style={overviewStyles.confidenceBars}>
                          <View style={[overviewStyles.confidenceBar, { width: '70%', backgroundColor: '#10b981' }]} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              {/* Quick Diagnostics Row */}
              <View style={overviewStyles.diagnosticsRow}>
                <Text style={overviewStyles.diagnosticsTitle}>Quick Diagnostics</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={overviewStyles.diagnosticsScroll}>
                  <View style={overviewStyles.diagnosticsChips}>
                    <View style={[overviewStyles.diagnosticChip, { backgroundColor: '#10b98120', borderColor: '#10b981' }]}>
                      <Text style={[overviewStyles.diagnosticChipText, { color: '#10b981' }]}>On track</Text>
                    </View>
                    <View style={[overviewStyles.diagnosticChip, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b' }]}>
                      <Text style={[overviewStyles.diagnosticChipText, { color: '#f59e0b' }]}>Balanced</Text>
                    </View>
                    <View style={[overviewStyles.diagnosticChip, { backgroundColor: '#ef444420', borderColor: '#ef4444' }]}>
                      <Text style={[overviewStyles.diagnosticChipText, { color: '#ef4444' }]}>Evidence missing</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </>
          )}
        </View>
      )}


      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => setShowAddSubjectModal(false)}
        onSubjectAdded={handleSubjectAdded}
        familyId={familyId}
      />

      <PlanYearWizard
        visible={showPlanYearWizard}
        onClose={() => setShowPlanYearWizard(false)}
        familyId={familyId}
        children={allChildren}
        onComplete={() => {
          setShowPlanYearWizard(false);
          // Optionally reload subjects after year plan creation
          loadCurrentSubjects();
        }}
      />

      <SubjectDetailModal
        visible={!!selectedSubjectId}
        onClose={() => setSelectedSubjectId(null)}
        subjectId={selectedSubjectId}
        familyId={familyId}
        children={allChildren}
      />
    </View>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    pageHeader: {
      marginBottom: spacing.lg,
    },
    pageTitle: {
      fontSize: 24,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      marginBottom: 4,
      color: tokens.text,
    },
    pageSubtitle: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
  childChipsRow: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  childrenLabelContainer: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  childrenLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipScroll: {
    flexGrow: 0,
  },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: '#ffffff',
    marginRight: 8,
    minHeight: 36,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  childChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#f0f5ff',
  },
  childChipText: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    color: '#3c4043',
    fontWeight: '400',
  },
  childChipTextActive: {
    color: '#4285f4',
    fontWeight: '600',
  },
  tabChipsRow: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  tabChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  tabChipText: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
    color: tokens.textSecondary,
    fontWeight: '400',
  },
  tabChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing['4xl'],
    flexGrow: 1,
    ...Platform.select({
      web: {
        minHeight: '100%',
      },
    }),
  },
  errorText: {
    fontSize: 16,
    fontFamily: designTokens.fonts.sans,
    textAlign: 'center',
    padding: spacing.xl,
    color: tokens.text,
  },
  childSelector: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
    marginBottom: spacing.lg,
    color: tokens.text,
  },
  childrenList: {
    width: '100%',
    maxWidth: 400,
    gap: spacing.md,
  },
  childOption: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  childOptionText: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
    color: tokens.text,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  });
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { Shield, CheckCircle, Clock, FileText, Award, TrendingUp, Download, AlertCircle, Settings, ExternalLink, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { apiRequest } from '../../lib/apiClient';
import { verifyStateRequirement } from '../../lib/services/recordsClient';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';
import StateRequirementsToggle from './StateRequirementsToggle';
import PortfolioTracking from './PortfolioTracking';
import SkillCoverageMap from '../records/SkillCoverageMap';

// Cache for compliance data (keyed by childId + stateCode)
const complianceCache = new Map();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export default function ComplianceDashboard({ childId, childName, familyId }) {
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [stateCode, setStateCode] = useState('US'); // Default to generic US requirements
  const [exporting, setExporting] = useState(false);
  const [initializing, setInitializing] = useState(false); // Track initialization state
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'portfolio', 'skills'
  const lastLoadRef = useRef(null);
  const loadingInProgressRef = useRef(false); // Track if a load is in progress
  const toast = useToast();
  
  // Generate cache key
  const cacheKey = useMemo(() => {
    return `${childId}-${stateCode}`;
  }, [childId, stateCode]);

  useEffect(() => {
    // Reset loading state when childId or stateCode changes
    loadingInProgressRef.current = false;
    loadComplianceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, stateCode]); // Removed cacheKey - it's redundant since it depends on childId and stateCode

  const loadComplianceData = async () => {
    if (!childId || !familyId) return;
    
    // Prevent duplicate concurrent loads
    if (loadingInProgressRef.current) {
      return;
    }
    
    // Check cache first
    const cached = complianceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setReadiness(cached.readiness);
      setChecklist(cached.checklist);
      setLoading(false);
      return;
    }
    
    // Prevent rapid successive calls
    const now = Date.now();
    if (lastLoadRef.current && now - lastLoadRef.current < 1000) {
      return;
    }
    lastLoadRef.current = now;
    loadingInProgressRef.current = true;
    
    setLoading(true);
    try {
      // Try API endpoint first (bypasses RLS)
      let readinessData = null;
      try {
        const { data, error } = await apiRequest(`/api/compliance/readiness/${childId}`, {
          method: 'GET',
        });
        
        if (!error && data) {
          readinessData = data;
        } else if (error?.status !== 404) {
          // Only log non-404 errors (404 means endpoint doesn't exist yet)
          if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
          }
        }
      } catch (apiErr) {
        // API unavailable, try fallback
        if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
        }
      }
      
      // Fallback: Try direct Supabase query if API didn't work
      if (!readinessData) {
        const { data: supabaseData, error: readinessError } = await supabase
        .from('compliance_readiness')
        .select('*')
        .eq('child_id', childId)
        .maybeSingle();

      if (readinessError) {
          // Only log unexpected errors (not permission/RLS errors)
          const isExpectedError = readinessError.code === '42501' || 
                                 readinessError.code === 'PGRST301' ||
                                 readinessError.message?.includes('permission') ||
                                 readinessError.message?.includes('RLS');
          if (!isExpectedError && (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production')) {
          }
        // Don't throw - just set to null and continue
        setReadiness(null);
        } else {
          readinessData = supabaseData;
          setReadiness(readinessData);
        }
      } else {
        setReadiness(readinessData);
      }

      // Load compliance checklist
      // Try API endpoint first (bypasses RLS)
      let checklistData = null;
      let checklistError = null;
      
      try {
        // Try API endpoint first (bypasses RLS)
        const { data: apiData, error: apiError } = await apiRequest(
          `/api/compliance/checklist/${encodeURIComponent(childId)}?state_code=${encodeURIComponent(stateCode)}`,
          { method: 'GET' }
        );
        
        if (!apiError && apiData && Array.isArray(apiData)) {
          // API returns ChecklistItemOut format, map to expected format
          checklistData = apiData.map(item => ({
            id: item.id,
            requirement_id: item.requirement_id,
            title: item.requirement?.requirement_title || item.requirement?.title || 'N/A',
            requirement: item.requirement || null,
            created_at: item.created_at || new Date().toISOString(),
            status: item.status || 'pending',
            completed_at: item.completed_at,
            notes: item.notes,
          }));
          checklistError = null;
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
      if (!checklistData) {
      try {
        // First try simple query without join to avoid RLS issues
        const result = await supabase
          .from('family_compliance_checklist')
          .select('*')
          .eq('child_id', childId)
          .eq('state_code', stateCode)
          .order('created_at', { ascending: true });
        
        checklistData = result.data;
        checklistError = result.error;
        
        // If we got data, try to fetch requirements separately
        if (checklistData && checklistData.length > 0 && !checklistError) {
          const requirementIds = checklistData
            .map(item => item.requirement_id)
            .filter(id => id);
          
          if (requirementIds.length > 0) {
            try {
              const { data: requirements } = await supabase
                .from('state_requirements')
                .select('*')
                .in('id', requirementIds);
              
              // Attach requirements to checklist items
              if (requirements) {
                const reqMap = {};
                requirements.forEach(req => { reqMap[req.id] = req; });
                checklistData = checklistData.map(item => ({
                  ...item,
                  requirement: reqMap[item.requirement_id] || null
                }));
              }
            } catch (reqErr) {
              // Silently ignore requirement fetch errors
}
          }
        }
      } catch (err) {
        // If query fails completely, just set empty array
        
        checklistData = [];
        checklistError = err;
      }
      } // Close if (!checklistData) block

      // Handle errors gracefully - don't crash the component
      if (checklistError) {
        // Check if it's a permission/RLS error or table doesn't exist
        const errorMsg = checklistError.message || String(checklistError);
        const isPermissionError = errorMsg.includes('permission') || 
                                  errorMsg.includes('RLS') ||
                                  errorMsg.includes('does not exist') ||
                                  checklistError.code === '42501' ||
                                  checklistError.code === '42P01';
        
        // Only log unexpected errors in development
        if (!isPermissionError && __DEV__) {
        }
        setChecklist([]);
      } else {
        // Log raw data for debugging (only in development)
        if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
        const rawItems = (checklistData || []).map(item => ({
          id: item.id,
          requirement_id: item.requirement_id,
          title: item.requirement?.requirement_title || item.title || 'N/A',
          created_at: item.created_at,
          status: item.status
        }));
}
        
        // Deduplicate checklist items by title (since same requirements can have different IDs)
        // Use a Map for O(1) lookup and keep the most recent one if duplicates exist
        const deduplicationMap = new Map();
        const duplicateCounts = {};
        const keyToItems = {}; // Track all items for each key
        
        (checklistData || []).forEach((item, index) => {
          // Get title and normalize it for comparison
          const requirementTitle = item.requirement?.requirement_title || item.title || '';
          const normalizedTitle = requirementTitle.toLowerCase().trim();
          
          // Use normalized title + child_id + state_code as the key
          // This ensures items with the same title (even if different requirement_id) are deduplicated
          const key = normalizedTitle && normalizedTitle !== 'n/a' 
            ? `title_${normalizedTitle}_${childId}_${stateCode}`
            : `id_${item.id}`; // Fallback to id if no title
          
          // Track items by key for debugging
          if (!keyToItems[key]) {
            keyToItems[key] = [];
          }
          keyToItems[key].push({ 
            id: item.id, 
            requirement_id: item.requirement_id,
            title: requirementTitle, 
            created_at: item.created_at 
          });
          
          const existing = deduplicationMap.get(key);
          
          if (!existing) {
            // New item, add it
            deduplicationMap.set(key, item);
            duplicateCounts[key] = 1;
          } else {
            // Duplicate found - keep the one with the most recent created_at
            duplicateCounts[key] = (duplicateCounts[key] || 1) + 1;
            const existingDate = new Date(existing.created_at || 0);
            const itemDate = new Date(item.created_at || 0);
            
            if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
            }
            
            if (itemDate > existingDate) {
              // Replace with newer item
              deduplicationMap.set(key, item);
            }
            // Otherwise keep the existing one
          }
        });
        
        const deduplicated = Array.from(deduplicationMap.values());
        
        // Log deduplication results (only in development)
        if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
        const duplicatesFound = Object.entries(duplicateCounts).filter(([_, count]) => count > 1);
        if (duplicatesFound.length > 0) {
        }
}
        
        setChecklist(deduplicated);
        
        // Cache the results
        complianceCache.set(cacheKey, {
          readiness,
          checklist: deduplicated,
          timestamp: Date.now()
        });
      }

      // If no checklist items, initialize from state requirements
      // Only initialize if we have no items AND no error (to avoid duplicates)
      if ((!checklistData || checklistData.length === 0) && stateCode && !checklistError && !initializing) {
        setInitializing(true);
        await initializeChecklist();
        setInitializing(false);
      }
    } catch (error) {
      // Only log unexpected errors
      const isExpectedError = error.code === '42501' || 
                             error.code === 'PGRST301' ||
                             error.message?.includes('permission') ||
                             error.message?.includes('RLS') ||
                             error.message?.includes('not found');
      if (!isExpectedError) {
      // Only show toast for unexpected errors, not for missing data
      if (error.message && !error.message.includes('permission') && !error.message.includes('not found')) {
        toast.push('Failed to load Learning Goals data', 'error');
      }
      }
      // Set defaults to prevent crashes
      setReadiness(null);
      setChecklist([]);
    } finally {
      setLoading(false);
      loadingInProgressRef.current = false;
    }
  };

  const initializeChecklist = async () => {
    try {
      // First check if items already exist to prevent duplicates
      const { data: existingItems, error: checkError } = await supabase
        .from('family_compliance_checklist')
        .select('id')
        .eq('child_id', childId)
        .eq('state_code', stateCode);
      
      // If check fails due to permissions, skip initialization
      if (checkError) {
        return;
      }
      
      if (existingItems && existingItems.length > 0) {
        // Items already exist, don't create duplicates
        return;
      }

      // Get state requirements
      const { data: requirements, error: reqError } = await supabase
        .from('state_requirements')
        .select('*')
        .eq('state_code', stateCode)
        .eq('is_common', true);

      if (reqError) throw reqError;

      if (requirements && requirements.length > 0) {
        // Create checklist items
        const checklistItems = requirements.map(req => ({
          family_id: familyId,
          child_id: childId,
          state_code: stateCode,
          requirement_id: req.id,
          status: 'pending',
        }));

        const { error: insertError } = await supabase
          .from('family_compliance_checklist')
          .insert(checklistItems);

        if (insertError) {
          // If insert fails due to duplicates, that's okay - just reload
          if (!insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
            throw insertError;
          }
        }

        // Reload checklist data without re-initializing
        const { data: reloadedData } = await supabase
          .from('family_compliance_checklist')
          .select('*')
          .eq('child_id', childId)
          .eq('state_code', stateCode)
          .order('created_at', { ascending: true });
        
        if (reloadedData) {
          setChecklist(reloadedData);
        }
      }
    } catch (error) {
      // Don't show error to user - just log it
    }
  };

  const updateChecklistItem = async (itemId, status) => {
    try {
      const { error } = await supabase
        .from('family_compliance_checklist')
        .update({
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      // Invalidate cache
      complianceCache.delete(cacheKey);
      
      toast.push('Checklist updated', 'success');
      loadComplianceData();
    } catch (error) {
      toast.push('Failed to update checklist', 'error');
    }
  };

  const handleMarkVerified = async (requirementId) => {
    if (!requirementId) return;
    try {
      await verifyStateRequirement(requirementId);
      complianceCache.delete(cacheKey);
      toast.push('Requirement marked as verified', 'success');
      loadComplianceData();
    } catch (error) {
      toast.push(error?.message || 'Failed to mark verified', 'error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // This would call a backend endpoint to generate the export packet
      // For now, we'll show a placeholder
      toast.push('Export feature coming soon', 'info');
      // TODO: Implement export packet generation
    } catch (error) {
      toast.push('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  };

  const calculateReadinessScore = () => {
    if (!readiness) return 0;
    
    // Calculate from checklist completion
    const total = checklist.length;
    const completed = checklist.filter(item => item.status === 'completed').length;
    
    if (total === 0) return 100; // No requirements = 100%
    return Math.round((completed / total) * 100);
  };

  // State-specific requirements interpretation (not used when compliance is only on Subjects page)
  const getStateRequirementsSummary = () => {
    if (!readiness || !stateCode) return null;

    const commonRequirements = {
      'CA': { hours: 175, subjects: ['English', 'Math', 'Science', 'Social Studies'] },
      'NY': { hours: 180, subjects: ['English', 'Math', 'Science', 'Social Studies', 'Arts'] },
      'TX': { hours: 180, subjects: ['English', 'Math', 'Science', 'Social Studies'] },
      'FL': { hours: 180, subjects: ['English', 'Math', 'Science', 'Social Studies'] },
      'US': { hours: 180, subjects: ['English', 'Math', 'Science', 'Social Studies'] },
    };

    const reqs = commonRequirements[stateCode] || commonRequirements['US'];
    const attendanceHours = Math.round((readiness.attendance_minutes_this_year || 0) / 60);
    const hoursPercentage = Math.round((attendanceHours / reqs.hours) * 100);
    
    // Count subjects with evidence
    const subjectsWithEvidence = readiness.credits_by_subject 
      ? Object.keys(readiness.credits_by_subject).length 
      : 0;
    const coreSubjectsCovered = reqs.subjects.filter(subj => 
      readiness.credits_by_subject && readiness.credits_by_subject[subj]
    ).length;
    const subjectsPercentage = Math.round((coreSubjectsCovered / reqs.subjects.length) * 100);

    return {
      expectedHours: reqs.hours,
      documentedHours: attendanceHours,
      hoursPercentage: Math.min(100, hoursPercentage),
      expectedSubjects: reqs.subjects.length,
      documentedSubjects: coreSubjectsCovered,
      subjectsPercentage: Math.min(100, subjectsPercentage),
      stateName: stateCode,
    };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const readinessScore = calculateReadinessScore();
  const attendanceHours = readiness ? Math.round((readiness.attendance_minutes_this_year || 0) / 60) : 0;
  const portfolioCount = readiness ? (readiness.portfolio_artifacts_this_year || 0) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Shield size={24} color="#3b82f6" />
        <Text style={styles.title}>Learning Goals Dashboard</Text>
        <Text style={styles.subtitle}>{childName || 'Student'} - {stateCode}</Text>
      </View>

      {/* State Requirements Interpretation */}
      {getStateRequirementsSummary() && (() => {
        const summary = getStateRequirementsSummary();
        return (
          <View style={styles.stateRequirementsCard}>
            <View style={styles.stateRequirementsHeader}>
              <Shield size={20} color="#3b82f6" />
              <Text style={styles.stateRequirementsTitle}>
                {summary.stateName} Common Requirements
              </Text>
            </View>
            <Text style={styles.stateRequirementsNote}>
              Note: This is general guidance, not legal advice. Check your state's official requirements.
            </Text>
            <View style={styles.stateRequirementsGrid}>
              <View style={styles.stateRequirementItem}>
                <Text style={styles.stateRequirementLabel}>Hours Expected:</Text>
                <Text style={styles.stateRequirementValue}>{summary.expectedHours} hours</Text>
              </View>
              <View style={styles.stateRequirementItem}>
                <Text style={styles.stateRequirementLabel}>You Have Documented:</Text>
                <Text style={styles.stateRequirementValue}>
                  {summary.documentedHours} hours ({summary.hoursPercentage}%)
                </Text>
              </View>
              <View style={styles.stateRequirementItem}>
                <Text style={styles.stateRequirementLabel}>Core Areas Expected:</Text>
                <Text style={styles.stateRequirementValue}>{summary.expectedSubjects} subjects</Text>
              </View>
              <View style={styles.stateRequirementItem}>
                <Text style={styles.stateRequirementLabel}>Core Areas Covered:</Text>
                <Text style={styles.stateRequirementValue}>
                  {summary.documentedSubjects} subjects ({summary.subjectsPercentage}%)
                </Text>
              </View>
            </View>
            <View style={styles.stateRequirementsMessage}>
              <Text style={styles.stateRequirementsMessageText}>
                {summary.hoursPercentage >= 100 && summary.subjectsPercentage >= 100
                  ? 'You have documented 100% of expected hours and all core subject areas. Excellent work!'
                  : summary.hoursPercentage >= 80 && summary.subjectsPercentage >= 80
                  ? `You have documented ${summary.hoursPercentage}% of expected hours and ${summary.subjectsPercentage}% of core areas. You're in great shape!`
                  : summary.hoursPercentage >= 60 && summary.subjectsPercentage >= 60
                  ? `You have documented ${summary.hoursPercentage}% of expected hours and ${summary.subjectsPercentage}% of core areas. Keep building your documentation.`
                  : `You have documented ${summary.hoursPercentage}% of expected hours and ${summary.subjectsPercentage}% of core areas. Consider logging more frequently to build your documentation.`}
              </Text>
            </View>
          </View>
        );
      })()}

      {/* Readiness Meter */}
      <View style={styles.readinessCard}>
        <View style={styles.readinessHeader}>
          <Text style={styles.readinessTitle}>Readiness Meter</Text>
          <Text style={styles.readinessScore}>{readinessScore}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${readinessScore}%` }]} />
        </View>
        <Text style={styles.readinessSubtext}>
          {readinessScore >= 80 ? 'You\'re in great shape!' :
           readinessScore >= 60 ? 'Almost there!' :
           'Keep working on it!'}
        </Text>
      </View>

      {/* Key Metrics */}
      <View style={styles.metricsGrid}>
        <MetricCard
          icon={<Clock size={24} color="#3b82f6" />}
          label="Attendance"
          value={`${attendanceHours}h`}
          subtitle={`${readiness?.attendance_days_this_year || 0} days`}
        />
        <MetricCard
          icon={<FileText size={24} color="#10b981" />}
          label="Portfolio"
          value={portfolioCount}
          subtitle="artifacts"
        />
        <MetricCard
          icon={<Award size={24} color="#f59e0b" />}
          label="Credits"
          value={readiness?.credits_by_subject ? Object.keys(readiness.credits_by_subject).length : 0}
          subtitle="subjects"
        />
        <MetricCard
          icon={<CheckCircle size={24} color="#8b5cf6" />}
          label="Checklist"
          value={`${checklist.filter(item => item.status === 'completed').length}/${checklist.length}`}
          subtitle="complete"
        />
      </View>

      {/* Learning Goals Checklist */}
      <View style={styles.checklistSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Learning Goals Checklist</Text>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={handleExport}
            disabled={exporting}
          >
            <Download size={16} color="#3b82f6" />
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
        </View>

        {checklist.length === 0 ? (
          <View style={styles.emptyState}>
            <AlertCircle size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No checklist items</Text>
            <Text style={styles.emptySubtext}>Select a state to see requirements</Text>
          </View>
        ) : (
          checklist.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              onStatusChange={(status) => updateChecklistItem(item.id, status)}
              onMarkVerified={handleMarkVerified}
            />
          ))
        )}
      </View>

      {/* Credits by Subject */}
      {readiness?.credits_by_subject && Object.keys(readiness.credits_by_subject).length > 0 && (
        <View style={styles.creditsSection}>
          <Text style={styles.sectionTitle}>Credits by Subject</Text>
          {Object.entries(readiness.credits_by_subject).map(([subject, credits]) => (
            <View key={subject} style={styles.creditRow}>
              <Text style={styles.creditSubject}>{subject}</Text>
              <Text style={styles.creditValue}>{credits} credits</Text>
            </View>
          ))}
        </View>
      )}

      {/* Portfolio by Subject */}
      {readiness?.portfolio_by_subject && Object.keys(readiness.portfolio_by_subject).length > 0 && (
        <View style={styles.portfolioSection}>
          <Text style={styles.sectionTitle}>Portfolio Evidence</Text>
          {Object.entries(readiness.portfolio_by_subject).map(([subject, count]) => (
            <View key={subject} style={styles.portfolioRow}>
              <Text style={styles.portfolioSubject}>{subject}</Text>
              <Text style={styles.portfolioCount}>{count} artifacts</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tab Navigation */}
      <View style={styles.tabNavigation}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'overview' && styles.tabButtonActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Shield size={16} color={activeTab === 'overview' ? colors.white : colors.textSecondary} />
          <Text style={[styles.tabButtonText, activeTab === 'overview' && styles.tabButtonTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'portfolio' && styles.tabButtonActive]}
          onPress={() => setActiveTab('portfolio')}
        >
          <FileText size={16} color={activeTab === 'portfolio' ? colors.white : colors.textSecondary} />
          <Text style={[styles.tabButtonText, activeTab === 'portfolio' && styles.tabButtonTextActive]}>
            Portfolio
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'skills' && styles.tabButtonActive]}
          onPress={() => setActiveTab('skills')}
        >
          <TrendingUp size={16} color={activeTab === 'skills' ? colors.white : colors.textSecondary} />
          <Text style={[styles.tabButtonText, activeTab === 'skills' && styles.tabButtonTextActive]}>
            Skills
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* State Requirements Toggle */}
          <View style={styles.section}>
            <StateRequirementsToggle
              childId={childId}
              familyId={familyId}
              stateCode={stateCode}
              onSettingsChange={(method) => {
                toast.push(`Tracking method set to ${method}`, 'success');
                loadComplianceData();
              }}
            />
          </View>
        </>
      )}

      {activeTab === 'portfolio' && (
        <PortfolioTracking
          childId={childId}
          familyId={familyId}
          stateCode={stateCode}
        />
      )}

      {activeTab === 'skills' && (
        <SkillCoverageMap
          childId={childId}
          familyId={familyId}
        />
      )}
    </ScrollView>
  );
}

function MetricCard({ icon, label, value, subtitle }) {
  return (
    <View style={styles.metricCard}>
      {icon}
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricSubtitle}>{subtitle}</Text>
    </View>
  );
}

function formatVerifiedDate(verifiedAt, lastVerifiedDate) {
  if (verifiedAt) {
    try {
      const d = new Date(verifiedAt);
      return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return null; }
  }
  if (lastVerifiedDate) {
    try {
      const d = new Date(lastVerifiedDate);
      return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return null; }
  }
  return null;
}

function ChecklistItem({ item, onStatusChange, onMarkVerified }) {
  const requirement = item.requirement || {};
  const requirementId = item.requirement_id || requirement.id;
  const sourceUrl = requirement.source_url || null;
  const lastVerifiedStr = formatVerifiedDate(requirement.verified_at, requirement.last_verified_date);
  const statusColors = {
    completed: '#10b981',
    in_progress: '#f59e0b',
    pending: '#6b7280',
    not_applicable: '#9ca3af',
  };

  const openSource = () => {
    const url = sourceUrl && (sourceUrl.startsWith('http') ? sourceUrl : `https://${sourceUrl}`);
    if (url && (typeof Linking !== 'undefined' && Linking.openURL)) Linking.openURL(url);
    else if (url && typeof window !== 'undefined') window.open(url, '_blank');
  };

  return (
    <View style={styles.checklistItem}>
      <View style={styles.checklistItemHeader}>
        <View style={styles.checklistItemInfo}>
          <Text style={styles.checklistItemTitle}>
            {requirement.requirement_title || 'Requirement'}
          </Text>
          <Text style={styles.checklistItemDescription}>
            {requirement.requirement_description || ''}
          </Text>
          <Text style={styles.checklistItemType}>
            {requirement.requirement_type || 'other'}
          </Text>
          {(sourceUrl || lastVerifiedStr) && (
            <View style={styles.requirementProvenance}>
              {sourceUrl && (
                <TouchableOpacity onPress={openSource} style={styles.sourceLinkRow}>
                  <ExternalLink size={14} color={colors.indigo || '#4f46e5'} />
                  <Text style={styles.sourceLinkText}>Source</Text>
                </TouchableOpacity>
              )}
              {lastVerifiedStr && (
                <Text style={styles.lastVerifiedText}>Last verified: {lastVerifiedStr}</Text>
              )}
            </View>
          )}
          <Text style={styles.requirementDisclaimer}>
            Informational only. Verify with your state's official requirements.
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] || '#6b7280' }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.checklistActions}>
        {['pending', 'in_progress', 'completed', 'not_applicable'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.statusButton,
              item.status === status && styles.statusButtonActive
            ]}
            onPress={() => onStatusChange(status)}
          >
            <Text style={[
              styles.statusButtonText,
              item.status === status && styles.statusButtonTextActive
            ]}>
              {status.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {onMarkVerified && requirementId && (
        <TouchableOpacity
          style={styles.markVerifiedButton}
          onPress={() => onMarkVerified(requirementId)}
        >
          <Check size={16} color="#fff" />
          <Text style={styles.markVerifiedButtonText}>Mark verified</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  readinessCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  readinessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  readinessTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  readinessScore: {
    fontSize: 32,
    fontWeight: '700',
    color: '#3b82f6',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  readinessSubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginTop: 4,
  },
  metricSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  checklistSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  checklistItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  checklistItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checklistItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  checklistItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  checklistItemDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  checklistItemType: {
    fontSize: 12,
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  requirementProvenance: {
    marginTop: 8,
    gap: 4,
  },
  sourceLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sourceLinkText: {
    fontSize: 13,
    color: colors.indigo || '#4f46e5',
    textDecorationLine: 'underline',
  },
  lastVerifiedText: {
    fontSize: 12,
    color: '#6b7280',
  },
  requirementDisclaimer: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 6,
  },
  markVerifiedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#059669',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  markVerifiedButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  checklistActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'capitalize',
  },
  statusButtonTextActive: {
    color: '#ffffff',
  },
  creditsSection: {
    marginBottom: 24,
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  creditSubject: {
    fontSize: 14,
    color: '#111827',
  },
  creditValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  portfolioSection: {
    marginBottom: 24,
  },
  portfolioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  portfolioSubject: {
    fontSize: 14,
    color: '#111827',
  },
  portfolioCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10b981',
  },
  stateRequirementsCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  stateRequirementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stateRequirementsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400e',
  },
  stateRequirementsNote: {
    fontSize: 12,
    color: '#92400e',
    fontStyle: 'italic',
    marginBottom: 16,
    opacity: 0.8,
  },
  stateRequirementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  stateRequirementItem: {
    width: '48%',
  },
  stateRequirementLabel: {
    fontSize: 13,
    color: '#92400e',
    marginBottom: 4,
    opacity: 0.9,
  },
  stateRequirementValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
  },
  stateRequirementsMessage: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  stateRequirementsMessageText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  tabNavigation: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingTop: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tabButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
});


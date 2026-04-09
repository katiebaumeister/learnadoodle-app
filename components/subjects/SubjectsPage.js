import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  Search,
  Plus,
  BookOpen,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Calendar,
  Clock,
  GraduationCap,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectsWithOverview, getSubjectDetail } from '../../lib/services/subjectsClient';
import { getAttendanceLogs } from '../../lib/services/recordsClient';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { useSession } from '../../contexts/SessionContext';
import SubjectOverviewCard from './SubjectOverviewCard';
import SubjectDetailPage from './SubjectDetailPage';
import ComplianceRequirementModal from '../compliance/ComplianceRequirementModal';

export default function SubjectsPage({
  familyId,
  children = [],
  preloadedSubjects = null,
  preloadedSubjectDetailCache = {},
  onSubjectsUpdate = null,
  onSubjectDetailUpdate = null,
  onAddSubject,
  onAddSyllabus,
  onAddEvent,
  onAddMaterial,
  onEditSubject,
  onNavigateToPlanner,
  onNavigateToPlannerAttendance,
  userRole = 'parent',
  accessibleChildren = [],
}) {
  // Get session context for role-based filtering
  const session = useSession();
  const safeChildren = Array.isArray(children) ? children : [];
  const safeAccessibleChildren = Array.isArray(accessibleChildren) ? accessibleChildren : [];
  
  // Determine if this is a child/student view
  const isChildView = userRole === 'child' || userRole === 'student';
  const childId = isChildView && safeAccessibleChildren.length > 0 ? (safeAccessibleChildren[0]?.id ?? safeAccessibleChildren[0]) : null;
  
  const [subjects, setSubjects] = useState(preloadedSubjects || []);
  const [loading, setLoading] = useState(!preloadedSubjects);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Auto-set child filter for child/student role
  const [selectedChildFilter, setSelectedChildFilter] = useState(
    isChildView && childId ? childId : 'all'
  );
  const [selectedYearFilter, setSelectedYearFilter] = useState('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [subjectDetailCache, setSubjectDetailCache] = useState(preloadedSubjectDetailCache || {});
  const [pendingScrollToSectionId, setPendingScrollToSectionId] = useState(null);
  const [expandedSummaryMetric, setExpandedSummaryMetric] = useState(null);
  const [openComplianceRequirement, setOpenComplianceRequirement] = useState(null);
  const [complianceRowHoverKey, setComplianceRowHoverKey] = useState(null);
  const [attendanceByChildForCompliance, setAttendanceByChildForCompliance] = useState(null); // { [childId]: { daysPresent } }
  const loadingRef = useRef(false);
  const preloadingRef = useRef(false);

  // Update local cache when prop changes
  useEffect(() => {
    if (preloadedSubjectDetailCache) {
      setSubjectDetailCache(preloadedSubjectDetailCache);
    }
  }, [preloadedSubjectDetailCache]);

  // Load subjects
  const loadSubjects = useCallback(async () => {
    if (!familyId || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const childId = selectedChildFilter === 'all' ? null : selectedChildFilter;
      // Pass session for role-based filtering (preferred) or fallback to childId
      const data = await getSubjectsWithOverview(familyId, childId, session);
      setSubjects(data);
      const idSet = new Set((data || []).map((s) => s.id));
      setSelectedSubjectId((prev) => (prev && idSet.has(prev) ? prev : null));
      setSubjectDetailCache((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (!idSet.has(k)) delete next[k];
        }
        return next;
      });

      if (onSubjectsUpdate) {
        onSubjectsUpdate(data);
      }

      // Preload subject detail data for all subjects (only if not already cached)
      if (data && data.length > 0 && !preloadingRef.current) {
        preloadingRef.current = true;
        // Preload in background without blocking
        Promise.all(
          data.map(async (subject) => {
            // Skip if already cached
            if (subjectDetailCache[subject.id]) return;
            
            try {
              // Pass session for role-based filtering
              const detailData = await getSubjectDetail(subject.id, familyId, null, session);
              if (detailData == null) return;
              const updatedCache = {
                ...subjectDetailCache,
                [subject.id]: detailData,
              };
              setSubjectDetailCache(updatedCache);
              
              // Update parent cache if callback provided
              if (onSubjectDetailUpdate) {
                onSubjectDetailUpdate(subject.id, detailData);
              }
            } catch (err) {
              // Silently fail - we'll load on demand if needed
              console.warn(`[SubjectsPage] Failed to preload detail for subject ${subject.id}:`, err);
            }
          })
        ).finally(() => {
          preloadingRef.current = false;
        });
      }
    } catch (err) {
      console.error('[SubjectsPage] Error loading subjects:', err);
      setError(err.message || 'Failed to load subjects');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [familyId, selectedChildFilter, onSubjectsUpdate]);

  // Lock child filter for child/student view
  useEffect(() => {
    if (isChildView && childId && selectedChildFilter !== childId) {
      setSelectedChildFilter(childId);
    }
  }, [isChildView, childId, selectedChildFilter]);

  useEffect(() => {
    if (!preloadedSubjects) {
      loadSubjects();
    }
  }, [familyId, selectedChildFilter]);

  // Listen for subject updates
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleSubjectUpdate = () => {
      loadSubjects();
    };

    window.addEventListener('subjectUpdated', handleSubjectUpdate);
    window.addEventListener('subjectCreated', handleSubjectUpdate);
    window.addEventListener('refreshSubjects', handleSubjectUpdate);
    
    return () => {
      window.removeEventListener('subjectUpdated', handleSubjectUpdate);
      window.removeEventListener('subjectCreated', handleSubjectUpdate);
      window.removeEventListener('refreshSubjects', handleSubjectUpdate);
    };
  }, [loadSubjects]);

  // When parent passes a new preloaded list (e.g. after its cache reloads), stay in sync
  useEffect(() => {
    if (Array.isArray(preloadedSubjects)) {
      setSubjects(preloadedSubjects);
      setLoading(false);
    }
  }, [preloadedSubjects]);

  // Filter subjects by search query
  const filteredSubjects = useMemo(() => {
    if (!subjects || subjects.length === 0) return [];
    
    let filtered = subjects;
    
    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(subject => 
        subject.name?.toLowerCase().includes(query) ||
        subject.description?.toLowerCase().includes(query)
      );
    }
    
    // Filter by child
    if (selectedChildFilter !== 'all') {
      filtered = filtered.filter(subject => {
        if (!subject.assignedChildren || subject.assignedChildren.length === 0) {
          return true; // Subjects with no assigned children show for all
        }
        return subject.assignedChildren.includes(selectedChildFilter);
      });
    }

    // Filter by school year
    if (selectedYearFilter !== 'all') {
      filtered = filtered.filter(subject => (subject.school_year || '2025/26') === selectedYearFilter);
    }
    
    return filtered;
  }, [subjects, searchQuery, selectedChildFilter, selectedYearFilter]);

  // Years that have at least one subject (for chip row - only show chips for registered years)
  const registeredYears = useMemo(() => {
    if (!subjects || subjects.length === 0) return [];
    const years = [...new Set(subjects.map(s => s.school_year || '2025/26').filter(Boolean))];
    return years.sort();
  }, [subjects]);

  // Overall averages across filtered subjects (for compact summary card)
  const overallSummary = useMemo(() => {
    const list = filteredSubjects || [];
    if (list.length === 0) return null;

    const progressValues = list.map(s => s.progressPercent).filter(v => v != null && !Number.isNaN(v));
    const progress = progressValues.length > 0
      ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
      : null;

    let attendance = null;
    let grades = null;
    let complianceMet = 0;
    let complianceTotal = 0;
    list.forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (detail) {
        if (detail.attendanceRate30 != null && !Number.isNaN(detail.attendanceRate30)) {
          attendance = (attendance ?? 0) + detail.attendanceRate30;
        }
        if (detail.avgGradePercent != null && !Number.isNaN(detail.avgGradePercent)) {
          grades = (grades ?? 0) + detail.avgGradePercent;
        }
        if (detail.complianceReady && typeof detail.complianceReady.met === 'number' && typeof detail.complianceReady.total === 'number') {
          complianceMet += detail.complianceReady.met;
          complianceTotal += detail.complianceReady.total;
        }
      }
    });
    const attendanceCount = list.filter(s => {
      const d = subjectDetailCache[s.id];
      return d && d.attendanceRate30 != null && !Number.isNaN(d.attendanceRate30);
    }).length;
    const gradesCount = list.filter(s => {
      const d = subjectDetailCache[s.id];
      return d && d.avgGradePercent != null && !Number.isNaN(d.avgGradePercent);
    }).length;
    attendance = attendanceCount > 0 ? Math.round(attendance / attendanceCount) : null;
    grades = gradesCount > 0 ? Math.round(grades / gradesCount) : null;

    const contextLabel = selectedChildFilter === 'all'
      ? 'All children'
      : (safeChildren.find(c => c.id === selectedChildFilter)?.first_name || safeChildren.find(c => c.id === selectedChildFilter)?.name || 'Child');

    return {
      progress,
      attendance,
      grades,
      compliance: complianceTotal > 0 ? { met: complianceMet, total: complianceTotal } : null,
      contextLabel,
    };
  }, [filteredSubjects, subjectDetailCache, selectedChildFilter, safeChildren]);

  const getChildName = useCallback((childId) => {
    const c = safeChildren.find(x => x.id === childId);
    return c?.first_name || c?.name || 'Unknown';
  }, [safeChildren]);

  // Saved state(s) for selected child/children (from child settings) — only show compliance for these
  const effectiveComplianceStateCodes = useMemo(() => {
    const list = selectedChildFilter === 'all'
      ? safeChildren
      : safeChildren.filter(c => c.id === selectedChildFilter);
    const codes = new Set();
    list.forEach(c => {
      const state = c.standards_state || c.standards || c.state_code || c.state;
      if (state && String(state).trim()) codes.add(String(state).trim().toUpperCase());
    });
    return [...codes];
  }, [safeChildren, selectedChildFilter]);

  // Child IDs we show compliance for (used for loading attendance to derive "met" for attendance requirement)
  const complianceChildIds = useMemo(() => {
    const list = selectedChildFilter === 'all' ? safeChildren : safeChildren.filter(c => c.id === selectedChildFilter);
    return list.map(c => c.id).filter(Boolean);
  }, [safeChildren, selectedChildFilter]);

  const complianceChildIdsKey = useMemo(() => complianceChildIds.slice().sort().join(','), [complianceChildIds]);

  // Load attendance summary so we can show checkmarks for "Attendance tracking" when a child has any attendance
  useEffect(() => {
    if (!familyId || !complianceChildIdsKey) {
      setAttendanceByChildForCompliance(null);
      return;
    }
    const childIdsToFetch = complianceChildIdsKey.split(',').filter(Boolean);
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
    getAttendanceLogs(familyId, childIdsToFetch, {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    })
      .then((logs) => {
        const byChild = {};
        (logs || []).forEach((log) => {
          const cid = log.child_id;
          if (!cid) return;
          if (!byChild[cid]) byChild[cid] = { present: new Set(), absent: new Set() };
          const day = (log.day_date || '').slice(0, 10);
          if (!day) return;
          const status = (log.status || '').toLowerCase();
          if (status === 'present' || status === 'partial') byChild[cid].present.add(day);
          else if (status === 'absent') byChild[cid].absent.add(day);
        });
        const summary = {};
        Object.keys(byChild).forEach((cid) => {
          summary[cid] = { daysPresent: byChild[cid].present.size };
        });
        setAttendanceByChildForCompliance(summary);
      })
      .catch(() => setAttendanceByChildForCompliance(null));
  }, [familyId, complianceChildIdsKey]);

  // Preview data for expanded summary sections
  const summaryProgressDetail = useMemo(() => {
    const list = filteredSubjects || [];
    let earliestNext = null;
    let currentFocus = null;
    let coreGoal = null;
    list.forEach(s => {
      if (s.nextItem && s.nextItem.dueDate) {
        const d = new Date(s.nextItem.dueDate);
        if (!earliestNext || d < new Date(earliestNext.dueDate)) {
          earliestNext = { ...s.nextItem, subjectName: s.name, subjectId: s.id };
        }
      }
      if (s.currentFocus && !currentFocus) currentFocus = s.currentFocus;
      if (s.coreGoal && !coreGoal) coreGoal = s.coreGoal;
    });
    return {
      progress: overallSummary?.progress ?? null,
      nextItem: earliestNext,
      currentFocus,
      coreGoal,
    };
  }, [filteredSubjects, overallSummary]);

  const summaryAttendanceDetail = useMemo(() => {
    const merged = [];
    (filteredSubjects || []).forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (!detail?.attendanceRecords?.length || !detail?.events?.length) return;
      const eventMap = (detail.events || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
      detail.attendanceRecords.forEach(ar => {
        const event = eventMap[ar.event_id];
        merged.push({
          day_date: ar.day_date,
          minutes: ar.minutes || 0,
          status: ar.status,
          eventTitle: event?.title || 'Lesson',
          subjectName: subject.name,
          subjectId: subject.id,
        });
      });
    });
    merged.sort((a, b) => (b.day_date || '').localeCompare(a.day_date || ''));
    return merged.slice(0, 5);
  }, [filteredSubjects, subjectDetailCache]);

  const summaryGradesDetail = useMemo(() => {
    const merged = [];
    const subjectMap = (filteredSubjects || []).reduce((acc, s) => { acc[s.id] = s.name; return acc; }, {});
    (filteredSubjects || []).forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (!detail) return;
      (detail.grades || []).forEach(g => {
        const date = g.created_at || g.day_date;
        const possible = g.possible != null && g.possible > 0 ? g.possible : null;
        const score = g.score != null ? g.score : null;
        const percent = possible && score != null ? Math.round((score / possible) * 100) : null;
        merged.push({
          date,
          score,
          possible,
          grade: g.grade,
          percent,
          subjectName: subject.name,
          subjectId: subject.id,
        });
      });
      (detail.eventOutcomes || []).filter(eo => eo.grade != null).forEach(eo => {
        merged.push({
          date: eo.created_at,
          score: null,
          possible: null,
          grade: eo.grade,
          percent: null,
          subjectName: subject.name,
          subjectId: subject.id,
        });
      });
    });
    merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return merged.slice(0, 5);
  }, [filteredSubjects, subjectDetailCache]);

  // One row per requirement type per state; dedupe by (state, type, child) so total = requirement types × children (e.g. 4 × 3 = 12).
  // Only include states that are saved for the selected child/children (effectiveComplianceStateCodes).
  const summaryComplianceDetail = useMemo(() => {
    const savedStateSet = new Set((effectiveComplianceStateCodes || []).map(s => s.toUpperCase()));
    const filterByChildId = selectedChildFilter !== 'all' ? selectedChildFilter : null;
    const byState = {};
    const seen = new Set(); // key: stateCode|type|child_id — so we count each (state, type, child) once
    let totalMet = 0;
    let totalTotal = 0;
    const stateCodes = new Set();
    const childIds = new Set();
    (filteredSubjects || []).forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (!detail?.complianceItems?.length) return;
      detail.complianceItems.forEach(item => {
        if (filterByChildId && item.child_id !== filterByChildId) return;
        const req = item.state_requirements;
        if (!req) return;
        const stateCode = (item.state_code || '').toUpperCase() || 'Other';
        if (savedStateSet.size > 0 && !savedStateSet.has(stateCode)) return;
        const type = (req.requirement_type || 'Other').toLowerCase();
        const key = `${stateCode}|${type}|${item.child_id || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        stateCodes.add(stateCode);
        if (item.child_id) childIds.add(item.child_id);
        if (!byState[stateCode]) byState[stateCode] = {};
        if (!byState[stateCode][type]) {
          byState[stateCode][type] = {
            title: req.requirement_title,
            description: req.requirement_description,
            byChild: {}, // { [childId]: isMet }
          };
        }
        const row = byState[stateCode][type];
        const cid = item.child_id || '';
        const checklistMet = item.status === 'met' || item.status === 'on_track' || item.status === 'completed';
        const hasAttendanceData = type === 'attendance' && (attendanceByChildForCompliance?.[cid]?.daysPresent ?? 0) > 0;
        const isMet = checklistMet || hasAttendanceData;
        if (!Object.prototype.hasOwnProperty.call(row.byChild, cid)) {
          row.byChild[cid] = isMet;
        }
        totalTotal += 1;
        if (isMet) totalMet += 1;
      });
    });
    // Derive metCount/totalCount per row from byChild for backward compatibility with progress dots
    Object.values(byState).forEach(byType => {
      Object.values(byType).forEach(row => {
        const ids = Object.keys(row.byChild).filter(Boolean);
        row.totalCount = ids.length;
        row.metCount = ids.filter(id => row.byChild[id]).length;
      });
    });
    const stateLabel = [...stateCodes].sort().join(', ') || '';
    const sortedChildIds = [...childIds].sort((a, b) => getChildName(a).localeCompare(getChildName(b)));
    const studentLabel = sortedChildIds.map(id => getChildName(id)).filter(Boolean).join(', ') || '';

    const statesTotal = Object.keys(byState).length;
    let statesComplete = 0;
    let typesComplete = 0;
    let typesTotal = 0;
    Object.values(byState).forEach(byType => {
      let stateComplete = true;
      Object.values(byType).forEach(row => {
        typesTotal += 1;
        if (row.totalCount > 0 && row.metCount >= row.totalCount) typesComplete += 1;
        else stateComplete = false;
      });
      if (stateComplete && Object.keys(byType).length > 0) statesComplete += 1;
    });

    return {
      byState,
      sortedChildIds,
      summary: { met: totalMet, total: totalTotal, stateLabel, studentLabel },
      summaryTop: { statesComplete, statesTotal, typesComplete, typesTotal },
      hasData: totalTotal > 0,
    };
  }, [filteredSubjects, subjectDetailCache, getChildName, effectiveComplianceStateCodes, selectedChildFilter, attendanceByChildForCompliance]);

  const handleSubjectClick = (subject) => {
    setSelectedSubjectId(subject.id);
  };

  const handleBack = () => {
    setSelectedSubjectId(null);
    setPendingScrollToSectionId(null);
  };

  const openSubjectToSection = (subjectId, sectionId) => {
    setPendingScrollToSectionId(sectionId);
    setSelectedSubjectId(subjectId);
    setExpandedSummaryMetric(null);
  };

  // Map API requirement_type + title to modal config key (seed id)
  const getRequirementKey = (type, title) => {
    const t = (type || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();
    if (t === 'attendance') return 'attendance';
    if (t === 'notification') return 'notice';
    if (t === 'portfolio') return 'portfolio';
    if (t === 'testing') return 'testing';
    if (t === 'record_keeping') {
      if (titleLower.includes('curriculum')) return 'curriculum';
      return 'hours';
    }
    if (t === 'other') {
      if (titleLower.includes('quarterly')) return 'quarterly_reports';
      if (titleLower.includes('annual assessment')) return 'annual_assessment';
      return 'annual_assessment';
    }
    return t || 'other';
  };

  const handleAddSyllabus = (subject) => {
    if (onAddSyllabus) {
      onAddSyllabus(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openSyllabusUpload', {
        detail: { subjectId: subject.id }
      }));
    }
  };

  const handleAddEvent = (subject) => {
    // Get first assigned child ID for defaulting in modals
    const assignedChildren = subject.assignedChildren || [];
    const firstAssignedChildId = assignedChildren.length > 0 ? assignedChildren[0] : null;
    
    if (onAddEvent) {
      onAddEvent(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Dispatch openTaskModal event (handled by both WebContent and WebLayout)
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: { 
          subjectId: subject.id, 
          eventType: 'Lesson', 
          date: new Date(),
          childId: firstAssignedChildId
        }
      }));
    }
  };

  const handleNavigateToPlanner = (params) => {
    if (onNavigateToPlanner) {
      onNavigateToPlanner(params);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const view = params.view || 'month';
      const queryParams = new URLSearchParams();
      if (params.subjectId) queryParams.set('subjectId', params.subjectId);
      if (params.childId) queryParams.set('childId', params.childId);
      if (params.date) queryParams.set('date', params.date);
      queryParams.set('view', view);
      window.location.href = `/planner?${queryParams.toString()}`;
    }
  };

  // If a subject is selected, show detail view
  if (selectedSubjectId) {
    return (
      <SubjectDetailPage
        subjectId={selectedSubjectId}
        familyId={familyId}
        children={safeChildren}
        preloadedSubjectData={subjectDetailCache[selectedSubjectId]}
        initialScrollToSectionId={pendingScrollToSectionId}
        onSubjectDataUpdate={(data) => {
          const updatedCache = {
            ...subjectDetailCache,
            [selectedSubjectId]: data,
          };
          setSubjectDetailCache(updatedCache);
          
          // Update parent cache if callback provided
          if (onSubjectDetailUpdate) {
            onSubjectDetailUpdate(selectedSubjectId, data);
          }
        }}
        onBack={handleBack}
        onEditSubject={onEditSubject}
      />
    );
  }

  const childDisplayName = safeAccessibleChildren[0]?.first_name || safeAccessibleChildren[0]?.name || 'Your';
  const subjectsHeaderTitle = isChildView && childId
    ? (childDisplayName === 'Your' ? 'Your Subjects' : `${childDisplayName}'s Subjects`)
    : "Your Family's Subjects";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{subjectsHeaderTitle}</Text>
        <View style={styles.headerActions}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color={colors.muted} />
              </TouchableOpacity>
            ) : (
              <View style={styles.searchIconContainer}>
                <Search size={18} color={colors.muted} />
              </View>
            )}
          </View>
          {/* Hide + NEW button for child/student view */}
          {!isChildView && (
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => {
                if (onAddSubject) {
                  onAddSubject();
                } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                }
              }}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
              })}
            >
              <Text style={styles.newButtonText}>+ NEW</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.divider} />

      {/* Children Filter Chips - Hide for child/student view */}
      {!isChildView && (
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Children</Text>
          <View style={styles.filterChipsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterChips}
              contentContainerStyle={styles.filterChipsContent}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  selectedChildFilter === 'all' && styles.filterChipActive,
                ]}
                onPress={() => setSelectedChildFilter('all')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedChildFilter === 'all' && styles.filterChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  All Children
                </Text>
              </TouchableOpacity>
              {safeChildren.map((child) => {
                const childColor = getChildColorFromAvatar(child.avatar);
                const isActive = selectedChildFilter === child.id;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.filterChip,
                      isActive && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedChildFilter(child.id)}
                  >
                    <View
                      style={[
                        styles.childDotSmall,
                        { backgroundColor: childColor, marginRight: 6 },
                      ]}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        isActive && styles.filterChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {child.name || child.first_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Year Filter Chips - only show when we have at least one year */}
      {registeredYears.length > 0 && (
        <View
          style={[
            styles.filterRow,
            !isChildView && styles.filterRowBelowChildren,
          ]}
        >
          <Text style={styles.filterLabel}>Year</Text>
          <View style={styles.filterChipsWrapYear}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterChipsYear}
              contentContainerStyle={styles.filterChipsContent}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  selectedYearFilter === 'all' && styles.filterChipActive,
                ]}
                onPress={() => setSelectedYearFilter('all')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedYearFilter === 'all' && styles.filterChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  All years
                </Text>
              </TouchableOpacity>
              {registeredYears.map((year) => {
                const isActive = selectedYearFilter === year;
                return (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.filterChip,
                      isActive && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedYearFilter(year)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isActive && styles.filterChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading subjects...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSubjects}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredSubjects.length === 0 ? (
        <View style={styles.emptyContainer}>
          <BookOpen size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No subjects found' : 'No subjects yet'}
          </Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'Try adjusting your search'
              : 'Create subjects to organize learning by topic, course, or area of study.'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => {
                if (onAddSubject) {
                  onAddSubject();
                } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                }
              }}
            >
              <Plus size={18} color="#60a5fa" />
              <Text style={styles.emptyButtonText}>Create your first subject</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.subjectsList}
          contentContainerStyle={styles.subjectsListContent}
          showsVerticalScrollIndicator={false}
        >
          {(filteredSubjects || []).filter(s => s?.id).map((subject) => (
            <SubjectOverviewCard
              key={subject.id}
              subject={subject}
              children={safeChildren}
              selectedChildFilter={selectedChildFilter}
              onCardClick={handleSubjectClick}
              onNeedsHelpPress={(s) => openSubjectToSection(s.id, 'needs-help-section')}
              onNavigateToPlanner={handleNavigateToPlanner}
              onAddSyllabus={handleAddSyllabus}
              onAddEvent={handleAddEvent}
              onAddMaterial={onAddMaterial}
            />
          ))}
        </ScrollView>
      )}
      <ComplianceRequirementModal
        open={openComplianceRequirement != null}
        onClose={() => setOpenComplianceRequirement(null)}
        requirement={openComplianceRequirement}
        familyId={familyId}
        children={safeChildren}
        onOpenAttendanceView={onNavigateToPlannerAttendance}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 250,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    height: 40,
    ...Platform.select({
      web: {
        cursor: 'text',
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  clearButton: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  searchIconContainer: {
    padding: 4,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#000000',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginTop: 0,
    marginBottom: 0,
    marginHorizontal: 24,
  },
  summaryCard: {
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  summaryCardContext: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    opacity: 0.9,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  summaryCardItem: {
    flex: 1,
    paddingVertical: 4,
  },
  summaryCardLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardValuePrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardItemExpanded: {
    borderRadius: 6,
    padding: 4,
  },
  summaryCardLabelExpanded: {
    color: '#6BB3E8',
  },
  summaryCardValueExpanded: {
    color: '#6BB3E8',
  },
  summaryExpandPanel: {
    marginTop: 20,
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
  },
  summaryExpandTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryExpandValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  summaryExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  summaryExpandRowAttendance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'default',
      transition: 'background-color 0.15s ease',
    }),
  },
  summaryExpandMinutes: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  summaryExpandSubjectChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  summaryExpandSubjectChipText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryGradesEmpty: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  summaryGradesEmptyText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  summaryGradesEmptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 260,
  },
  summaryExpandText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  summaryExpandSub: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  summaryExpandMuted: {
    fontSize: 11,
    color: '#94A3B8',
  },
  summaryExpandLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  summaryExpandLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60a5fa',
  },
  summaryComplianceSummary: {
    marginBottom: 12,
  },
  summaryComplianceProgressWrap: {
    marginTop: 6,
  },
  summaryComplianceProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
  },
  summaryComplianceProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#6366F1',
  },
  summaryComplianceDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  summaryComplianceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.4)',
  },
  summaryComplianceDotComplete: {
    backgroundColor: '#6366F1',
  },
  summaryComplianceSection: {
    marginTop: 12,
  },
  summaryComplianceSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryComplianceTableWrap: {
    marginBottom: 8,
  },
  summaryComplianceTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.3)',
  },
  summaryComplianceTableLabelCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingRight: 8,
  },
  summaryComplianceTableHeaderCell: {
    width: 56,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  summaryComplianceTableCheckboxCell: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  summaryComplianceGroup: {
    marginBottom: 8,
    gap: 8,
  },
  summaryComplianceGroupTitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
  summaryComplianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    minHeight: 44,
  },
  summaryComplianceCheckboxWrap: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  summaryComplianceRowPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingRight: 4,
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  summaryComplianceRowPressableHover: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  summaryComplianceCheckbox: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  summaryComplianceRowContent: {
    flexShrink: 1,
  },
  summaryComplianceRowTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  summaryComplianceRowSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  /** Match MaterialsLibrary `childrenFilterRow` / `subjectsFilterRow` */
  filterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  filterRowBelowChildren: {
    marginTop: 0,
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipsWrap: {
    flex: 1,
    minWidth: 0,
  },
  filterChipsWrapYear: {
    flex: 1,
    minWidth: 0,
  },
  filterChips: {
    flex: 1,
  },
  filterChipsYear: {
    flexGrow: 0,
  },
  filterChipsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  /** Match MaterialsLibrary `childrenFilterChip` */
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  filterChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
  },
  filterChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold || '#EF4444',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#60a5fa',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#60a5fa',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectsList: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  subjectsListContent: {
    paddingBottom: 40,
  },
});

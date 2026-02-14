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
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectsWithOverview, getSubjectDetail } from '../../lib/services/subjectsClient';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import SubjectOverviewCard from './SubjectOverviewCard';
import SubjectDetailPage from './SubjectDetailPage';

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
  onEditSubject,
  onNavigateToPlanner,
  onNavigateToLibrary,
  userRole = 'parent',
  accessibleChildren = [],
}) {
  // Determine if this is a child/student view
  const isChildView = userRole === 'child' || userRole === 'student';
  const childId = isChildView && accessibleChildren.length > 0 ? accessibleChildren[0].id : null;
  
  const [subjects, setSubjects] = useState(preloadedSubjects || []);
  const [loading, setLoading] = useState(!preloadedSubjects);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Auto-set child filter for child/student role
  const [selectedChildFilter, setSelectedChildFilter] = useState(
    isChildView && childId ? childId : 'all'
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [subjectDetailCache, setSubjectDetailCache] = useState(preloadedSubjectDetailCache || {});
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
      const data = await getSubjectsWithOverview(familyId, childId);
      setSubjects(data);
      
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
              const detailData = await getSubjectDetail(subject.id, familyId);
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
    
    return () => {
      window.removeEventListener('subjectUpdated', handleSubjectUpdate);
      window.removeEventListener('subjectCreated', handleSubjectUpdate);
    };
  }, [loadSubjects]);

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
    
    return filtered;
  }, [subjects, searchQuery, selectedChildFilter]);

  const handleSubjectClick = (subject) => {
    setSelectedSubjectId(subject.id);
  };

  const handleBack = () => {
    setSelectedSubjectId(null);
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
      const queryParams = new URLSearchParams();
      if (params.subjectId) queryParams.set('subjectId', params.subjectId);
      if (params.childId) queryParams.set('childId', params.childId);
      if (params.date) queryParams.set('date', params.date);
      window.location.href = `/planner?${queryParams.toString()}`;
    }
  };

  // If a subject is selected, show detail view
  if (selectedSubjectId) {
    return (
      <SubjectDetailPage
        subjectId={selectedSubjectId}
        familyId={familyId}
        children={children}
        preloadedSubjectData={subjectDetailCache[selectedSubjectId]}
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
        onNavigateToPlanner={handleNavigateToPlanner}
        onNavigateToLibrary={onNavigateToLibrary}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isChildView && childId 
            ? `${accessibleChildren[0]?.first_name || accessibleChildren[0]?.name || 'Your'} Subjects`
            : "Your Family's Subjects"}
        </Text>
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
              <Text style={[
                styles.filterChipText,
                selectedChildFilter === 'all' && styles.filterChipTextActive,
              ]}>
                All Children
              </Text>
            </TouchableOpacity>
            {children.map((child) => {
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
                      { backgroundColor: childColor, marginRight: 6 }
                    ]} 
                  />
                  <Text style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}>
                    {child.name || child.first_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
          {filteredSubjects.map((subject) => (
            <SubjectOverviewCard
              key={subject.id}
              subject={subject}
              children={children}
              selectedChildFilter={selectedChildFilter}
              onCardClick={handleSubjectClick}
              onNavigateToPlanner={handleNavigateToPlanner}
              onAddSyllabus={handleAddSyllabus}
              onAddEvent={handleAddEvent}
            />
          ))}
        </ScrollView>
      )}
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    // Match Materials Library spacing from divider to chip row
    marginTop: 24,
    backgroundColor: '#FFFFFF',
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChips: {
    flex: 1,
  },
  filterChipsContent: {
    gap: 8,
    paddingRight: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'transparent',
    marginRight: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  filterChipActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#eff6ff',
  },
  filterChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#60a5fa',
    fontWeight: '500',
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
    paddingTop: 20,
  },
  subjectsListContent: {
    paddingBottom: 40,
  },
});

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
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectsWithOverview } from '../../lib/services/subjectsClient';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import SubjectOverviewCard from './SubjectOverviewCard';
import SubjectDetailPage from './SubjectDetailPage';

export default function SubjectsPage({
  familyId,
  children = [],
  preloadedSubjects = null,
  onSubjectsUpdate = null,
  onAddSubject,
  onAddSyllabus,
  onAddEvent,
  onEditSubject,
  onNavigateToPlanner,
  onNavigateToLibrary,
}) {
  const [subjects, setSubjects] = useState(preloadedSubjects || []);
  const [loading, setLoading] = useState(!preloadedSubjects);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChildFilter, setSelectedChildFilter] = useState('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const loadingRef = useRef(false);

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
    } catch (err) {
      console.error('[SubjectsPage] Error loading subjects:', err);
      setError(err.message || 'Failed to load subjects');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [familyId, selectedChildFilter, onSubjectsUpdate]);

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
    if (onAddEvent) {
      onAddEvent(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskCreateModal', {
        detail: { subjectId: subject.id }
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
        <Text style={styles.headerTitle}>Your Family's Subjects</Text>
        <View style={styles.headerActions}>
          <View style={styles.searchContainer}>
            <Search size={18} color={colors.muted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects..."
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => {
              if (onAddSubject) {
                onAddSubject();
              } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
              }
            }}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.newButtonText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Children Filter Chips */}
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
                    { backgroundColor: childColor }
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

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
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
              <Plus size={18} color={colors.accent} />
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    minWidth: 200,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
    }),
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent || '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
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
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  filterChipActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#0284C7',
  },
  childDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    backgroundColor: colors.accent || '#4F46E5',
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
    color: colors.accent || '#4F46E5',
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

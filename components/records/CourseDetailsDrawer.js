/**
 * Course Details Drawer
 * Right-side drawer for viewing course details with units, progress, evidence, and planner links
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, Modal, TextInput, Alert } from 'react-native';
import { X, BookOpen, Calendar, FileText, ExternalLink, CheckCircle2, Clock, AlertCircle, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { getCourseDetails } from '../../lib/services/recordsClient';
import { autoScheduleCourseFromSyllabus } from '../../lib/services/plannerClient';
import { colors } from '../../theme/colors';

export default function CourseDetailsDrawer({
  isOpen,
  courseId,
  familyId,
  children = [],
  onClose,
  onNavigateToPlanner,
  onNavigateToPortfolio,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [course, setCourse] = useState(null);
  const [unitFilter, setUnitFilter] = useState('all'); // 'all' | 'on_track' | 'behind'
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState(false);
  const [autoScheduleLoading, setAutoScheduleLoading] = useState(false);
  const [autoScheduleStartDate, setAutoScheduleStartDate] = useState('');
  const [autoScheduleEndDate, setAutoScheduleEndDate] = useState('');
  const [autoScheduleStrategy, setAutoScheduleStrategy] = useState('even');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  
  const isWeb = Platform.OS === 'web';
  
  useEffect(() => {
    if (isOpen && courseId && familyId) {
      loadCourseDetails();
      // Initialize child selection from course
      if (course?.child_ids) {
        setSelectedChildIds(course.child_ids);
      }
    } else {
      setCourse(null);
    }
  }, [isOpen, courseId, familyId]);

  useEffect(() => {
    if (course?.child_ids) {
      setSelectedChildIds(course.child_ids);
    }
  }, [course]);
  
  const loadCourseDetails = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await getCourseDetails(courseId, familyId);
      
      if (fetchError) {
        setError(fetchError.message || 'Unable to load course details');
      } else if (data) {
        setCourse(data);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'not_started':
        return 'Not Started';
      default:
        return 'Unknown';
    }
  };
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return colors.green;
      case 'in_progress':
        return colors.blue;
      case 'not_started':
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  const getPacingStatus = (unit) => {
    if (!unit.target_date) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = unit.target_date ? new Date(unit.target_date) : null;
    const completedAt = unit.completed_at ? new Date(unit.completed_at) : null;
    
    if (completedAt && targetDate) {
      const daysDiff = Math.floor((completedAt - targetDate) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 0) return { label: 'On track', color: colors.green };
      if (daysDiff <= 7) return { label: 'Slightly behind', color: colors.orange };
      return { label: 'Behind', color: colors.red };
    }
    
    if (!completedAt && targetDate) {
      const daysDiff = Math.floor((today - targetDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 7) return { label: 'Behind', color: colors.red };
      if (daysDiff > 0) return { label: 'Slightly behind', color: colors.orange };
      return { label: 'On track', color: colors.green };
    }
    
    return null;
  };

  const handleAutoSchedule = async () => {
    if (!autoScheduleStartDate || !autoScheduleEndDate || selectedChildIds.length === 0) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setAutoScheduleLoading(true);
    try {
      const { data, error } = await autoScheduleCourseFromSyllabus({
        familyId,
        courseId: course.id,
        childIds: selectedChildIds,
        startDate: autoScheduleStartDate,
        endDate: autoScheduleEndDate,
        strategy: autoScheduleStrategy,
      });
      
      if (error) {
        Alert.alert('Error', error.message || 'Failed to generate schedule');
      } else {
        Alert.alert(
          'Success',
          `Created ${data?.created_events_count || 0} events for ${data?.units_scheduled || 0} units.${data?.conflicts?.length > 0 ? `\n\nConflicts: ${data.conflicts.join(', ')}` : ''}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setShowAutoScheduleModal(false);
                if (onNavigateToPlanner) {
                  onNavigateToPlanner({ courseId: course.id });
                }
              }
            }
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to generate schedule');
    } finally {
      setAutoScheduleLoading(false);
    }
  };

  const filteredUnits = course?.units?.filter(unit => {
    if (unitFilter === 'all') return true;
    const pacing = getPacingStatus(unit);
    if (unitFilter === 'on_track') {
      return pacing?.label === 'On track' || (!pacing && unit.status === 'completed');
    }
    if (unitFilter === 'behind') {
      return pacing?.label === 'Behind' || pacing?.label === 'Slightly behind';
    }
    return true;
  }) || [];
  
  if (!isOpen) return null;
  
  const content = (
    <View style={styles.drawerContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <BookOpen size={20} color={colors.indigo} />
          <Text style={styles.headerTitle}>
            {course?.title || 'Course Details'}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <X size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      {/* Content */}
      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.indigo} />
            <Text style={styles.loadingText}>Loading course details...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <AlertCircle size={20} color={colors.orange} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : course ? (
          <View style={styles.contentInner}>
            {/* Course Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Course Information</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Provider:</Text>
                <Text style={styles.infoValue}>{course.provider || 'Custom'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Subject:</Text>
                <Text style={styles.infoValue}>{course.subject || 'Unassigned'}</Text>
              </View>
              {course.child_ids && course.child_ids.length > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Children:</Text>
                  <View style={styles.childChips}>
                    {course.child_ids.map(childId => {
                      const child = children.find(c => c.id === childId);
                      return child ? (
                        <View key={childId} style={styles.childChip}>
                          <Text style={styles.childChipText}>
                            {child.first_name || child.name}
                          </Text>
                        </View>
                      ) : null;
                    })}
                  </View>
                </View>
              )}
            </View>
            
            {/* Units */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Units</Text>
                {course.units && course.units.length > 0 && (
                  <View style={styles.unitFilters}>
                    <TouchableOpacity
                      style={[styles.filterButton, unitFilter === 'all' && styles.filterButtonActive]}
                      onPress={() => setUnitFilter('all')}
                    >
                      <Text style={[styles.filterButtonText, unitFilter === 'all' && styles.filterButtonTextActive]}>
                        All
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterButton, unitFilter === 'on_track' && styles.filterButtonActive]}
                      onPress={() => setUnitFilter('on_track')}
                    >
                      <Text style={[styles.filterButtonText, unitFilter === 'on_track' && styles.filterButtonTextActive]}>
                        On Track
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterButton, unitFilter === 'behind' && styles.filterButtonActive]}
                      onPress={() => setUnitFilter('behind')}
                    >
                      <Text style={[styles.filterButtonText, unitFilter === 'behind' && styles.filterButtonTextActive]}>
                        Behind
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {filteredUnits.length > 0 ? (
                <View style={styles.unitsList}>
                  {filteredUnits.map((unit) => {
                    const pacing = getPacingStatus(unit);
                    return (
                    <View key={unit.id} style={styles.unitCard}>
                      <View style={styles.unitHeader}>
                        <View style={styles.unitTitleRow}>
                          <Text style={styles.unitTitle}>{unit.title}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(unit.status) + '20' }]}>
                            <Text style={[styles.statusText, { color: getStatusColor(unit.status) }]}>
                              {getStatusLabel(unit.status)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      
                      <View style={styles.unitMeta}>
                        <Text style={styles.unitMetaText}>
                          {unit.evidence_ids?.length || 0} artifacts • {unit.planner_event_ids?.length || 0} events
                        </Text>
                        {pacing && (
                          <View style={styles.pacingRow}>
                            <View style={[styles.pacingBadge, { backgroundColor: pacing.color + '20' }]}>
                              <Text style={[styles.pacingText, { color: pacing.color }]}>
                                {pacing.label}
                              </Text>
                            </View>
                            {unit.target_date && (
                              <Text style={styles.pacingMeta}>
                                Target: {new Date(unit.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {unit.completed_at && ` • Completed: ${new Date(unit.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              </Text>
                            )}
                          </View>
                        )}
                        {(unit.planned_minutes || unit.actual_minutes) && (
                          <View style={styles.minutesRow}>
                            <Text style={styles.minutesLabel}>
                              Planned: {unit.planned_minutes || 0} min
                              {unit.actual_minutes > 0 && ` • Actual: ${unit.actual_minutes} min`}
                            </Text>
                            {unit.planned_minutes > 0 && unit.actual_minutes > 0 && (
                              <View style={styles.progressBar}>
                                <View 
                                  style={[
                                    styles.progressFill, 
                                    { 
                                      width: `${Math.min(100, (unit.actual_minutes / unit.planned_minutes) * 100)}%`,
                                      backgroundColor: unit.actual_minutes >= unit.planned_minutes ? colors.green : colors.orange
                                    }
                                  ]} 
                                />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.unitActions}>
                        <TouchableOpacity
                          style={styles.unitActionButton}
                          onPress={() => {
                            if (onNavigateToPlanner) {
                              onNavigateToPlanner({ courseId: course.id, unitId: unit.id });
                            }
                          }}
                        >
                          <ExternalLink size={12} color={colors.indigo} />
                          <Text style={styles.unitActionText}>Open in Planner</Text>
                        </TouchableOpacity>
                        
                        {unit.evidence_ids && unit.evidence_ids.length > 0 && (
                          <TouchableOpacity
                            style={styles.unitActionButton}
                            onPress={() => {
                              if (onNavigateToPortfolio) {
                                onNavigateToPortfolio({ courseId: course.id, unitId: unit.id });
                              }
                            }}
                          >
                            <FileText size={12} color={colors.indigo} />
                            <Text style={styles.unitActionText}>View evidence</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  {unitFilter !== 'all' ? 'No units match this filter.' : 'No units found for this course.'}
                </Text>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
      
      {/* Footer */}
      {course && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={() => {
              if (onNavigateToPlanner) {
                onNavigateToPlanner({ courseId: course.id });
              }
            }}
          >
            <Calendar size={16} color={colors.indigo} />
            <Text style={styles.footerButtonText}>Open full course in Planner</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.footerButton, styles.footerButtonSecondary]}
            onPress={() => setShowAutoScheduleModal(true)}
          >
            <Zap size={16} color={colors.indigo} />
            <Text style={[styles.footerButtonText, styles.footerButtonSecondaryText]}>Auto-generate schedule</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-Schedule Modal */}
      <Modal
        visible={showAutoScheduleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAutoScheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto-generate Schedule</Text>
              <TouchableOpacity onPress={() => setShowAutoScheduleModal(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Start Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={autoScheduleStartDate}
                    onChange={(e) => setAutoScheduleStartDate(e.target.value)}
                    style={styles.dateInput}
                  />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={autoScheduleStartDate}
                    onChangeText={setAutoScheduleStartDate}
                    placeholder="YYYY-MM-DD"
                  />
                )}
              </View>
              
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>End Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={autoScheduleEndDate}
                    onChange={(e) => setAutoScheduleEndDate(e.target.value)}
                    style={styles.dateInput}
                  />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={autoScheduleEndDate}
                    onChangeText={setAutoScheduleEndDate}
                    placeholder="YYYY-MM-DD"
                  />
                )}
              </View>
              
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Strategy</Text>
                <View style={styles.strategyButtons}>
                  <TouchableOpacity
                    style={[styles.strategyButton, autoScheduleStrategy === 'even' && styles.strategyButtonActive]}
                    onPress={() => setAutoScheduleStrategy('even')}
                  >
                    <Text style={[styles.strategyButtonText, autoScheduleStrategy === 'even' && styles.strategyButtonTextActive]}>
                      Evenly distribute
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.strategyButton, autoScheduleStrategy === 'use_target_dates' && styles.strategyButtonActive]}
                    onPress={() => setAutoScheduleStrategy('use_target_dates')}
                  >
                    <Text style={[styles.strategyButtonText, autoScheduleStrategy === 'use_target_dates' && styles.strategyButtonTextActive]}>
                      Use target dates
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {children.length > 0 && (
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Children</Text>
                  <View style={styles.childSelectRow}>
                    {children.map(child => {
                      const isSelected = selectedChildIds.includes(child.id);
                      return (
                        <TouchableOpacity
                          key={child.id}
                          style={[styles.childSelectChip, isSelected && styles.childSelectChipActive]}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedChildIds(selectedChildIds.filter(id => id !== child.id));
                            } else {
                              setSelectedChildIds([...selectedChildIds, child.id]);
                            }
                          }}
                        >
                          <Text style={[styles.childSelectChipText, isSelected && styles.childSelectChipTextActive]}>
                            {child.first_name || child.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowAutoScheduleModal(false)}
                disabled={autoScheduleLoading}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, autoScheduleLoading && styles.modalConfirmButtonDisabled]}
                onPress={handleAutoSchedule}
                disabled={autoScheduleLoading || !autoScheduleStartDate || !autoScheduleEndDate || selectedChildIds.length === 0}
              >
                {autoScheduleLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Generate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
  
  if (isWeb) {
    // Web: Right-side drawer
    return (
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.drawer}>
          {content}
        </View>
      </View>
    );
  } else {
    // Mobile: Modal
    return (
      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
          <View style={styles.drawer}>
            {content}
          </View>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    flexDirection: 'row',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  drawer: {
    width: Platform.OS === 'web' ? 400 : '100%',
    maxWidth: Platform.OS === 'web' ? 400 : '100%',
    backgroundColor: colors.card,
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderTopLeftRadius: Platform.OS === 'web' ? 0 : 16,
    borderTopRightRadius: Platform.OS === 'web' ? 0 : 16,
    borderTopWidth: Platform.OS === 'web' ? 0 : 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: Platform.OS === 'web' ? '100%' : '90%',
  },
  drawerContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorContainer: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.orange,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unitFilters: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  filterButtonText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginRight: 8,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
  },
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  childChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childChipText: {
    fontSize: 12,
    color: colors.text,
  },
  unitsList: {
    gap: 12,
  },
  unitCard: {
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitHeader: {
    marginBottom: 8,
  },
  unitTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  unitTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  unitMeta: {
    marginBottom: 8,
  },
  unitMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  pacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  pacingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pacingText: {
    fontSize: 10,
    fontWeight: '600',
  },
  pacingMeta: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  minutesRow: {
    marginTop: 6,
  },
  minutesLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  unitActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  unitActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unitActionText: {
    fontSize: 11,
    color: colors.indigo,
    textDecorationLine: 'underline',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  footerButtonSecondary: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.indigo,
    marginTop: 8,
  },
  footerButtonSecondaryText: {
    color: colors.indigo,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalBody: {
    padding: 16,
    maxHeight: 400,
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.panel,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.panel,
    fontFamily: 'inherit',
  },
  strategyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  strategyButton: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  strategyButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  strategyButtonText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  strategyButtonTextActive: {
    color: colors.white,
  },
  childSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childSelectChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childSelectChipText: {
    fontSize: 12,
    color: colors.text,
  },
  childSelectChipTextActive: {
    color: colors.white,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  modalConfirmButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    opacity: 0.5,
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});


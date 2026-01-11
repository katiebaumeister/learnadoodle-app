/**
 * SubjectDetailModal Component
 * Shows detailed information about a subject when clicked from family/academics
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import {
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  Upload,
  Link as LinkIcon,
  BookOpen,
  Target,
  Settings,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { typography, getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import AddMaterialModal from '../materials/AddMaterialModal';
import SyllabusUploadModal from '../planner/SyllabusUploadModal';
import StandardsSearchModal from '../standards/StandardsSearchModal';

export default function SubjectDetailModal({
  visible,
  onClose,
  subjectId,
  familyId,
  children = [],
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const styles = createStyles(tokens);

  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState(null);
  const [assignedChildren, setAssignedChildren] = useState([]);
  const [cognitiveLoad, setCognitiveLoad] = useState(null);
  const [goals, setGoals] = useState([]);
  const [docTarget, setDocTarget] = useState(null);
  const [linkedSyllabus, setLinkedSyllabus] = useState(null);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [linkedStandards, setLinkedStandards] = useState([]);
  const [showNotes, setShowNotes] = useState(false);
  const [showStandards, setShowStandards] = useState(false);

  // Modal states
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showUploadSyllabusModal, setShowUploadSyllabusModal] = useState(false);
  const [showStandardsModal, setShowStandardsModal] = useState(false);

  // Goals editing
  const [editingGoals, setEditingGoals] = useState({});
  const [goalInputValues, setGoalInputValues] = useState({});
  const [yearlyGoal, setYearlyGoal] = useState(null);

  useEffect(() => {
    if (visible && subjectId && familyId) {
      loadSubjectData();
    }
  }, [visible, subjectId, familyId]);

  const loadSubjectData = async () => {
    if (!subjectId || !familyId) {
      return;
    }
    setLoading(true);
    try {
      // Load subject
      const { data: subjectData, error: subjectError } = await supabase
        .from('subject')
        .select('*')
        .eq('id', subjectId)
        .single();

      if (subjectError) {
        console.error('[SubjectDetailModal] Error loading subject:', subjectError);
        throw subjectError;
      }
      setSubject(subjectData);

      // Determine assigned children (use children prop if available, otherwise try database)
      let assignedChildrenList = [];
      if (children && children.length > 0) {
        // Use the children prop passed to the component
        if (subjectData.child_id) {
          // Child-specific: find the specific child
          const child = children.find(c => c.id === subjectData.child_id);
          assignedChildrenList = child ? [child] : [];
        } else {
          // Family-wide: use all children
          assignedChildrenList = children;
        }
      } else {
        // Fallback: try to load from database if children prop not available
        try {
          if (subjectData.child_id) {
            const { data: childData, error: childError } = await supabase
              .from('children')
              .select('id, name')
              .eq('id', subjectData.child_id)
              .single();
            
            if (childError && childError.code !== 'PGRST116' && childError.code !== 'PGRST301' && childError.status !== 403 && childError.status !== 400) {
              throw childError;
            }
            assignedChildrenList = childData ? [childData] : [];
          } else {
            const { data: childrenData, error: childrenError } = await supabase
              .from('children')
              .select('id, name')
              .eq('family_id', familyId);
            
            if (childrenError && childrenError.code !== 'PGRST301' && childrenError.status !== 403 && childrenError.status !== 400) {
              throw childrenError;
            }
            assignedChildrenList = childrenData || [];
          }
        } catch (err) {
          console.warn('[SubjectDetailModal] Could not load children:', err);
          assignedChildrenList = [];
        }
      }
      setAssignedChildren(assignedChildrenList);

      // Load cognitive load
      try {
        const { data: loadData } = await supabase
          .from('subject_cognitive_load')
          .select('load_level, notes')
          .eq('subject_id', subjectId)
          .single();
        setCognitiveLoad(loadData);
      } catch (err) {
        // Silently handle permission errors
        console.warn('[SubjectDetailModal] Could not load cognitive load:', err);
        setCognitiveLoad(null);
      }

      // Load goals (for all assigned children)
      try {
        const childIdsForGoals = assignedChildrenList.map(c => c.id);
        
        if (childIdsForGoals.length > 0) {
          const { data: goalsData, error: goalsError } = await supabase
            .from('subject_goals')
            .select('*, children(id, name)')
            .eq('subject_id', subjectId)
            .in('child_id', childIdsForGoals);
          
          if (goalsError && goalsError.code !== 'PGRST301' && goalsError.status !== 403 && goalsError.status !== 400) {
            throw goalsError;
          }
          setGoals(goalsData || []);
        } else {
          setGoals([]);
        }
      } catch (err) {
        console.warn('[SubjectDetailModal] Could not load goals:', err);
        setGoals([]);
      }

      // Load doc target
      try {
        const { data: docTargetData, error: docTargetError } = await supabase
          .from('subject_doc_targets')
          .select('monthly_target_files')
          .eq('subject_id', subjectId)
          .eq('family_id', familyId)
          .single();
        
        if (docTargetError && docTargetError.code !== 'PGRST116' && docTargetError.code !== 'PGRST301' && docTargetError.status !== 403) {
          throw docTargetError;
        }
        setDocTarget(docTargetData);
      } catch (err) {
        console.warn('[SubjectDetailModal] Could not load doc target:', err);
        setDocTarget(null);
      }

      // Load linked syllabus
      try {
        const { data: syllabusData, error: syllabusError } = await supabase
          .from('syllabi')
          .select('id, title, upload_id')
          .eq('subject_id', subjectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (syllabusError && syllabusError.code !== 'PGRST116' && syllabusError.code !== 'PGRST301' && syllabusError.status !== 403) {
          throw syllabusError;
        }
        setLinkedSyllabus(syllabusData);
      } catch (err) {
        console.warn('[SubjectDetailModal] Could not load syllabus:', err);
        setLinkedSyllabus(null);
      }

      // Load materials count
      try {
        const { data: materialsData, count, error: materialsError } = await supabase
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .eq('subject_id', subjectId)
          .eq('family_id', familyId)
          .is('deleted_at', null);
        
        if (materialsError && materialsError.code !== 'PGRST301' && materialsError.status !== 403) {
          throw materialsError;
        }
        setMaterialsCount(count || 0);
      } catch (err) {
        console.warn('[SubjectDetailModal] Could not load materials count:', err);
        setMaterialsCount(0);
      }

      // Load linked standards
      try {
        const { data: standardsData, error: standardsError } = await supabase
          .from('standards')
          .select('id, standard_code, standard_text')
          .eq('subject_id', subjectId)
          .eq('family_id', familyId);
        
        if (standardsError && standardsError.code !== 'PGRST301' && standardsError.status !== 403 && standardsError.status !== 400) {
          throw standardsError;
        }
        setLinkedStandards(standardsData || []);
      } catch (err) {
        console.warn('[SubjectDetailModal] Could not load standards:', err);
        setLinkedStandards([]);
      }

      // Load yearly goal from year_subjects (if any)
      try {
        const childIdsForYearly = assignedChildrenList.map(c => c.id);
        
        if (childIdsForYearly.length > 0) {
          const { data: yearSubjectData, error: yearError } = await supabase
            .from('year_subjects')
            .select('plan_expected_weekly_minutes')
            .eq('subject_id', subjectId)
            .in('child_id', childIdsForYearly)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (yearError && yearError.code !== 'PGRST301' && yearError.status !== 403 && yearError.status !== 404) {
            throw yearError;
          }
          
          if (yearSubjectData?.plan_expected_weekly_minutes) {
            // Convert weekly minutes to yearly hours estimate (assuming ~36 weeks)
            const yearlyHours = Math.round((yearSubjectData.plan_expected_weekly_minutes * 36) / 60);
            setYearlyGoal(yearlyHours);
          } else {
            setYearlyGoal(null);
          }
        } else {
          setYearlyGoal(null);
        }
      } catch (err) {
        console.warn('[SubjectDetailModal] Could not load yearly goal:', err);
        setYearlyGoal(null);
      }
    } catch (error) {
      console.error('[SubjectDetailModal] Error loading subject data:', error);
      // Set subject to null so we can show an error state
      setSubject(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGoal = async (childId, minutesPerWeek) => {
    try {
      const minutes = parseInt(minutesPerWeek) || 0;
      if (minutes === 0) {
        // Delete goal if set to 0
        const { error } = await supabase
          .from('subject_goals')
          .delete()
          .eq('child_id', childId)
          .eq('subject_id', subjectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('subject_goals')
          .upsert({
            child_id: childId,
            subject_id: subjectId,
            goal_minutes_per_week: minutes,
          }, {
            onConflict: 'child_id,subject_id',
          });

        if (error) throw error;
      }
      await loadSubjectData();
    } catch (error) {
      console.error('Error updating goal:', error);
    }
  };

  const handleUpdateDocTarget = async (targetFiles) => {
    try {
      const { error } = await supabase
        .from('subject_doc_targets')
        .upsert({
          family_id: familyId,
          subject_id: subjectId,
          monthly_target_files: targetFiles,
        }, {
          onConflict: 'family_id,subject_id',
        });

      if (error) throw error;
      await loadSubjectData();
    } catch (error) {
      console.error('Error updating doc target:', error);
    }
  };

  const handleAttachStandards = async (selectedStandards) => {
    try {
      // Remove existing standards for this subject
      await supabase
        .from('standards')
        .update({ subject_id: null })
        .eq('subject_id', subjectId)
        .eq('family_id', familyId);

      // Attach new standards
      if (selectedStandards.length > 0) {
        const standardIds = selectedStandards.map(s => s.id);
        await supabase
          .from('standards')
          .update({ subject_id: subjectId })
          .in('id', standardIds)
          .eq('family_id', familyId);
      }

      await loadSubjectData();
    } catch (error) {
      console.error('Error attaching standards:', error);
    }
  };

  const calculateSessionsPerWeek = (minutesPerWeek) => {
    if (!minutesPerWeek) return 0;
    // Assume average session is 30 minutes
    return Math.round(minutesPerWeek / 30);
  };

  useEffect(() => {
    if (visible && subjectId && familyId) {
      loadSubjectData();
    }
  }, [visible, subjectId, familyId]);

  if (!visible) {
    return null;
  }


  const isFamilyWide = subject ? !subject.child_id : false;
  const childScope = isFamilyWide ? 'Family-wide' : 'Child-specific';

  const modalContent = (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{subject?.name || 'Subject Details'}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={tokens.accent} />
                <Text style={styles.loadingText}>Loading subject details...</Text>
              </View>
            ) : !subject ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.errorText}>Error loading subject. Please try again.</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={loadSubjectData}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* 1. Basics Section */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Basics</Text>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Subject name</Text>
                    <Text style={styles.fieldValue}>{subject.name}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Child scope</Text>
                    <Text style={styles.fieldValue}>{childScope}</Text>
                  </View>
                  {assignedChildren.length > 0 && (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Assigned child(ren)</Text>
                      <View style={styles.childrenList}>
                        {assignedChildren.map((child) => (
                          <Text key={child.id} style={styles.fieldValue}>
                            {child.name}
                          </Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {subject.grade && (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Grade / level</Text>
                      <Text style={styles.fieldValue}>{subject.grade}</Text>
                    </View>
                  )}
                  {cognitiveLoad && (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Cognitive load</Text>
                      <Text style={styles.fieldValue}>
                        {cognitiveLoad.load_level.charAt(0).toUpperCase() + cognitiveLoad.load_level.slice(1)}
                      </Text>
                    </View>
                  )}
                  {subject.notes && (
                    <View style={styles.field}>
                      <TouchableOpacity
                        onPress={() => setShowNotes(!showNotes)}
                        style={styles.collapsibleHeader}
                      >
                        <Text style={styles.fieldLabel}>Notes</Text>
                        {showNotes ? (
                          <ChevronUp size={16} color={tokens.textSecondary} />
                        ) : (
                          <ChevronDown size={16} color={tokens.textSecondary} />
                        )}
                      </TouchableOpacity>
                      {showNotes && (
                        <Text style={styles.fieldValue}>{subject.notes}</Text>
                      )}
                    </View>
                  )}
                </View>

                {/* 2. Goals & Expectations Section */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Goals & expectations</Text>
                  
                  {/* Weekly target minutes */}
                  {assignedChildren.length > 0 ? (
                    <View style={styles.goalsContainer}>
                      {assignedChildren.map((child) => {
                        const childGoal = goals.find(g => g.child_id === child.id);
                        const currentMinutes = childGoal?.goal_minutes_per_week || childGoal?.minutes_per_week || 0;
                        const isEditing = editingGoals[child.id];
                        const sessionsPerWeek = calculateSessionsPerWeek(currentMinutes);

                        return (
                          <View key={child.id} style={styles.goalItem}>
                            <Text style={styles.goalChildName}>{child.name}</Text>
                            {isEditing ? (
                              <View style={styles.goalInputRow}>
                                <TextInput
                                  style={styles.goalInput}
                                  value={String(goalInputValues[child.id] ?? currentMinutes)}
                                  onChangeText={(text) => {
                                    setGoalInputValues({ ...goalInputValues, [child.id]: text });
                                  }}
                                  keyboardType="numeric"
                                  placeholder="Minutes per week"
                                />
                                <TouchableOpacity
                                  onPress={() => {
                                    const minutes = parseInt(goalInputValues[child.id] || currentMinutes) || 0;
                                    handleUpdateGoal(child.id, minutes);
                                    setEditingGoals({ ...editingGoals, [child.id]: false });
                                  }}
                                  style={styles.saveButton}
                                >
                                  <Text style={styles.saveButtonText}>Save</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => {
                                    setEditingGoals({ ...editingGoals, [child.id]: false });
                                    setGoalInputValues({ ...goalInputValues, [child.id]: undefined });
                                  }}
                                  style={styles.cancelButton}
                                >
                                  <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <View style={styles.goalDisplayRow}>
                                <Text style={styles.goalValue}>
                                  {currentMinutes > 0 ? `${currentMinutes} min/week` : 'Not set'}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    setEditingGoals({ ...editingGoals, [child.id]: true });
                                    setGoalInputValues({ ...goalInputValues, [child.id]: String(currentMinutes) });
                                  }}
                                  style={styles.editButton}
                                >
                                  <Text style={styles.editButtonText}>Edit</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                            {currentMinutes > 0 && (
                              <Text style={styles.goalPreview}>
                                Planner will aim for ~{sessionsPerWeek} session{sessionsPerWeek !== 1 ? 's' : ''} / week
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.field}>
                      <Text style={styles.fieldValue}>
                        No children assigned. Goals can be set once children are assigned to this subject.
                      </Text>
                    </View>
                  )}

                  {/* Yearly goal */}
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Optional yearly goal</Text>
                    <Text style={styles.fieldValue}>
                      {yearlyGoal ? `${yearlyGoal} hours` : 'Not set'}
                    </Text>
                  </View>

                  {/* Evidence target */}
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Evidence target</Text>
                    <View style={styles.docTargetRow}>
                      <Text style={styles.fieldValue}>
                        {docTarget?.monthly_target_files || 4} docs per month
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          const newTarget = prompt('Enter monthly target files:', docTarget?.monthly_target_files || 4);
                          if (newTarget) {
                            handleUpdateDocTarget(parseInt(newTarget));
                          }
                        }}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* 3. Scheduling Linkage */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Scheduling linkage</Text>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      // Navigate to planner - use window navigation if available
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        const navHandler = window.navigateToRoute || window.parent?.navigateToRoute;
                        if (navHandler) {
                          navHandler('planner', null, { subjectId });
                        } else {
                          // Fallback: try to open planner in new tab or navigate
                          window.location.href = '/planner';
                        }
                      }
                      onClose();
                    }}
                  >
                    <Calendar size={16} color={colors.accentContrast || '#ffffff'} />
                    <Text style={styles.actionButtonText}>Add to schedule</Text>
                  </TouchableOpacity>
                </View>

                {/* 4. Materials & Syllabus */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Materials & syllabus</Text>
                  
                  {linkedSyllabus && (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Linked syllabus</Text>
                      <Text style={styles.fieldValue}>{linkedSyllabus.title}</Text>
                    </View>
                  )}
                  
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Attached materials count</Text>
                    <Text style={styles.fieldValue}>{materialsCount}</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setShowAddMaterialModal(true)}
                    >
                      <FileText size={16} color={colors.accentContrast || '#ffffff'} />
                      <Text style={styles.actionButtonText}>Attach material</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setShowUploadSyllabusModal(true)}
                    >
                      <Upload size={16} color={colors.accentContrast || '#ffffff'} />
                      <Text style={styles.actionButtonText}>Upload syllabus</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 5. Standards (Advanced, Collapsible) */}
                <View style={styles.section}>
                  <TouchableOpacity
                    onPress={() => setShowStandards(!showStandards)}
                    style={styles.collapsibleHeader}
                  >
                    <Text style={styles.sectionTitle}>Standards</Text>
                    {showStandards ? (
                      <ChevronUp size={20} color={tokens.textSecondary} />
                    ) : (
                      <ChevronDown size={20} color={tokens.textSecondary} />
                    )}
                  </TouchableOpacity>
                  {showStandards && (
                    <>
                      <Text style={styles.fieldValue}>
                        Standards coverage is tracked automatically
                      </Text>
                      {linkedStandards.length > 0 && (
                        <View style={styles.standardsList}>
                          {linkedStandards.map((standard) => (
                            <Text key={standard.id} style={styles.standardItem}>
                              {standard.standard_code || 'Standard'}
                            </Text>
                          ))}
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => setShowStandardsModal(true)}
                      >
                        <Settings size={16} color={colors.accentContrast || '#ffffff'} />
                        <Text style={styles.actionButtonText}>Manage standards</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </ScrollView>
            )}
      </View>
    </View>
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        {...Platform.select({
          web: {
            // On web, ensure modal is rendered at root level
            style: { zIndex: 9999 },
          },
        })}
      >
        {modalContent}
      </Modal>

      {/* Add Material Modal */}
      <AddMaterialModal
        visible={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        onSaved={() => {
          setShowAddMaterialModal(false);
          loadSubjectData();
        }}
        familyId={familyId}
        children={children}
      />

      {/* Upload Syllabus Modal */}
      <SyllabusUploadModal
        visible={showUploadSyllabusModal}
        onClose={() => setShowUploadSyllabusModal(false)}
        familyId={familyId}
        children={children}
        subjects={subject ? [subject] : []}
        onPlanCreated={() => {
          setShowUploadSyllabusModal(false);
          loadSubjectData();
        }}
      />

      {/* Standards Search Modal */}
      <StandardsSearchModal
        visible={showStandardsModal}
        onClose={() => setShowStandardsModal(false)}
        onSelect={handleAttachStandards}
        subjectId={subjectId}
        initialSelected={linkedStandards}
      />
    </>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    overlay: {
      position: Platform.OS === 'web' ? 'fixed' : 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: Platform.OS === 'web' ? '100vw' : '100%',
      height: Platform.OS === 'web' ? '100vh' : '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: Platform.OS === 'web' ? 9999 : 1000,
      ...Platform.select({
        web: {
          position: 'fixed',
        },
      }),
    },
    container: {
      backgroundColor: tokens.bg,
      borderRadius: 16,
      width: '90%',
      maxWidth: 600,
      maxHeight: Platform.OS === 'web' ? '85vh' : '85%',
      zIndex: Platform.OS === 'web' ? 10000 : 1001,
      ...Platform.select({
        web: {
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          position: 'relative',
          maxHeight: '85vh',
          overflow: 'hidden',
        },
      }),
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
    },
    closeButton: {
      padding: 4,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
    },
    errorText: {
      fontSize: 14,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 6,
      backgroundColor: colors.accent || '#B8D7F9',
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: colors.accentContrast || '#1e40af',
    },
    content: {
      flex: 1,
    },
    section: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginBottom: 12,
    },
    field: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldValue: {
      fontSize: 14,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    childrenList: {
      gap: 4,
    },
    collapsibleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    goalsContainer: {
      gap: 16,
      marginBottom: 16,
    },
    goalItem: {
      padding: 12,
      backgroundColor: tokens.bgSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    goalChildName: {
      fontSize: 14,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginBottom: 8,
    },
    goalDisplayRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    goalValue: {
      fontSize: 14,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    goalInputRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    goalInput: {
      flex: 1,
      padding: 8,
      backgroundColor: tokens.bg,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: tokens.border,
      fontSize: 14,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    goalPreview: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginTop: 4,
      fontStyle: 'italic',
    },
    docTargetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.accent || '#B8D7F9',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: colors.accentContrast || '#1e40af',
    },
    editButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      backgroundColor: tokens.bgSubtle,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    editButtonText: {
      fontSize: 12,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    cancelButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      backgroundColor: tokens.bgSubtle,
    },
    cancelButtonText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
    },
    saveButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      backgroundColor: colors.accent || '#B8D7F9',
    },
    saveButtonText: {
      fontSize: 12,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: colors.accentContrast || '#1e40af',
    },
    standardsList: {
      marginTop: 8,
      gap: 4,
    },
    standardItem: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      padding: 4,
    },
  });
}


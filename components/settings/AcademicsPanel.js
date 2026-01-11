import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { BookOpen, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { typography, getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import AddSubjectModal from '../AddSubjectModal';
import SubjectDetailModal from '../subjects/SubjectDetailModal';

export default function AcademicsPanel({ user }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [children, setChildren] = useState([]);

  const styles = createStyles(tokens);

  useEffect(() => {
    const loadFamilyId = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', authUser.id)
            .maybeSingle();
          if (profile?.family_id) {
            setFamilyId(profile.family_id);
          }
        }
      } catch (err) {
        console.error('Error loading family ID:', err);
      }
    };
    loadFamilyId();
  }, []);

  useEffect(() => {
    if (familyId) {
      loadSubjects();
      loadChildren();
    }
  }, [familyId]);

  const loadChildren = async () => {
    if (!familyId) return;
    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (error) throw error;
      setChildren(data || []);
    } catch (err) {
      console.error('Error loading children:', err);
    }
  };

  const loadSubjects = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name, grade, notes, child_id, created_at')
        .eq('family_id', familyId)
        .order('name');
      
      if (error) throw error;
      setSubjects(data || []);
    } catch (err) {
      console.error('Error loading subjects:', err);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectAdded = (newSubject) => {
    loadSubjects();
  };

  if (loading && !familyId) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Academics</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={tokens.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }


  // TEST: Add visible indicator that component is rendering
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.testAcademicsPanelRendered = true;
  }

  return (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.sectionTitle}>Academics</Text>
          <Text style={styles.sectionSubtitle}>
            Manage subjects for your family. Subjects can be shared across all children or assigned to specific children.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowAddSubjectModal(true)}
          activeOpacity={0.7}
        >
          <Plus size={16} color={colors.accentContrast || '#ffffff'} />
          <Text style={styles.createButtonText}>Create Subject</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={tokens.accent} />
          <Text style={styles.loadingText}>Loading subjects...</Text>
        </View>
      ) : subjects.length === 0 ? (
        <View style={styles.emptyState}>
          <BookOpen size={48} color={tokens.textMuted} />
          <Text style={styles.emptyTitle}>No subjects yet</Text>
          <Text style={styles.emptyText}>
            Create your first subject to get started. Subjects help organize your learning activities and track progress.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowAddSubjectModal(true)}
            activeOpacity={0.7}
          >
            <Plus size={16} color={colors.accentContrast || '#ffffff'} />
            <Text style={styles.emptyButtonText}>Create Subject</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.subjectsList} showsVerticalScrollIndicator={false}>
          {subjects.map((subject) => {
            const handleClick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              setSelectedSubjectId(subject.id);
            };
            
            return (
              <TouchableOpacity
                key={subject.id}
                style={styles.subjectItem}
                onPress={handleClick}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && {
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClick(e);
                  },
                })}
              >
              <View style={styles.subjectContent}>
                <View style={styles.subjectHeader}>
                  <BookOpen size={16} color={tokens.accent} />
                  <Text style={styles.subjectName}>{subject.name}</Text>
                </View>
                {(subject.grade || subject.notes) && (
                  <View style={styles.subjectDetails}>
                    {subject.grade && (
                      <Text style={styles.subjectDetail}>Grade: {subject.grade}</Text>
                    )}
                    {subject.notes && (
                      <Text style={styles.subjectNotes} numberOfLines={2}>
                        {subject.notes}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => setShowAddSubjectModal(false)}
        onSubjectAdded={handleSubjectAdded}
        familyId={familyId}
      />

      <SubjectDetailModal
        visible={!!selectedSubjectId}
        onClose={() => {
          setSelectedSubjectId(null);
        }}
        subjectId={selectedSubjectId}
        familyId={familyId}
        children={children}
      />
    </View>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
      gap: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      maxWidth: 400,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.accent || '#B8D7F9',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    createButtonText: {
      fontSize: 13,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: colors.accentContrast || '#1e40af',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
      justifyContent: 'center',
    },
    loadingText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
      maxWidth: 400,
      lineHeight: 20,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: colors.accent || '#B8D7F9',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    emptyButtonText: {
      fontSize: 14,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: colors.accentContrast || '#1e40af',
    },
    subjectsList: {
      marginTop: 8,
    },
    subjectItem: {
      backgroundColor: tokens.bgSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      padding: 12,
      marginBottom: 8,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    subjectContent: {
      flex: 1,
    },
    subjectHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    subjectName: {
      fontSize: 14,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      flex: 1,
    },
    subjectDetails: {
      marginTop: 8,
      gap: 4,
    },
    subjectDetail: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
    },
    subjectNotes: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      fontStyle: 'italic',
      marginTop: 4,
    },
  });
}




/**
 * Learning Biography Component
 * Auto-generates a learning biography based on student data
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { BookOpen, RefreshCw, Download, FileText, Edit } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { supabase } from '../../../lib/supabase';
import NoteEditorModal from '../../records/NoteEditorModal';

export default function LearningBiography({ childId, childName }) {
  const [biography, setBiography] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (childId) {
      loadBiography();
    }
  }, [childId]);

  const loadBiography = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get child data
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .single();

      if (childError) throw childError;

      // Get skills
      const { data: skillsData } = await supabase.rpc('infer_skills', {
        p_child_id: childId
      });

      // Get mastery data
      const { data: masteryData } = await supabase
        .from('student_standard_mastery')
        .select(`
          *,
          standard:standards!student_standard_mastery_standard_id_fkey(
            id,
            standard_code,
            standard_text,
            subject
          )
        `)
        .eq('student_id', childId)
        .order('updated_at', { ascending: false })
        .limit(50);

      // Get attendance summary
      const currentYear = new Date().getFullYear();
      const { data: attendanceData } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('child_id', childId)
        .gte('day_date', `${currentYear}-01-01`)
        .order('day_date', { ascending: false });

      // Get portfolio items
      const { data: portfolioData } = await supabase
        .from('uploads')
        .select('*')
        .eq('child_id', childId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get grades
      const { data: gradesData } = await supabase
        .from('grades')
        .select(`
          *,
          subject:subject!grades_subject_id_fkey(id, name)
        `)
        .eq('child_id', childId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get extracurricular/volunteer data from college readiness
      const { data: readinessData } = await supabase
        .from('college_readiness')
        .select('readiness_data')
        .eq('child_id', childId)
        .single();

      // Generate biography
      const generatedBiography = generateBiography({
        child: childData,
        skills: skillsData || [],
        mastery: masteryData || [],
        attendance: attendanceData || [],
        portfolio: portfolioData || [],
        grades: gradesData || [],
        readiness: readinessData?.readiness_data || {}
      });

      setBiography(generatedBiography);
    } catch (err) {
      console.error('Error loading biography:', err);
      setError(err.message || 'Failed to load biography');
    } finally {
      setLoading(false);
    }
  };

  const generateBiography = (data) => {
    const { child, skills, mastery, attendance, portfolio, grades, readiness } = data;
    const name = child?.first_name || child?.name || childName || 'Student';
    const currentYear = new Date().getFullYear();

    // Calculate statistics
    const totalHours = Math.round((attendance.reduce((sum, a) => sum + (a.minutes || 0), 0)) / 60);
    const attendanceDays = attendance.filter(a => a.status === 'present' || a.status === 'partial').length;
    const masteredCount = mastery.filter(m => m.mastery_level === 'mastered').length;
    const totalMastery = mastery.length;
    const masteryPercentage = totalMastery > 0 ? Math.round((masteredCount / totalMastery) * 100) : 0;

    // Top skills
    const topSkills = skills
      .sort((a, b) => (b.level || 0) - (a.level || 0))
      .slice(0, 5)
      .map(s => s.skill);

    // Subject breakdown
    const subjectMap = {};
    mastery.forEach(m => {
      const subject = m.standard?.subject || 'Other';
      if (!subjectMap[subject]) {
        subjectMap[subject] = { total: 0, mastered: 0 };
      }
      subjectMap[subject].total++;
      if (m.mastery_level === 'mastered') {
        subjectMap[subject].mastered++;
      }
    });

    const topSubjects = Object.entries(subjectMap)
      .map(([subject, stats]) => ({
        subject,
        percentage: stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3)
      .map(s => s.subject);

    // Extracurricular activities
    const extracurriculars = readiness.extracurriculars || {};
    const activities = Array.isArray(extracurriculars.activities) 
      ? extracurriculars.activities 
      : (extracurriculars.activities ? [extracurriculars.activities] : []);
    const volunteerHours = extracurriculars.volunteer_hours || 0;

    // Build biography sections
    const sections = [];

    // Introduction
    sections.push({
      title: 'Learning Journey',
      content: `${name} has demonstrated a strong commitment to learning throughout ${currentYear}. With ${attendanceDays} days of active learning and over ${totalHours} hours of dedicated study time, ${name} has shown consistent engagement and growth.`
    });

    // Skills section
    if (topSkills.length > 0) {
      sections.push({
        title: 'Strengths and Skills',
        content: `${name} has developed strong competencies in ${topSkills.slice(0, 3).join(', ')}${topSkills.length > 3 ? `, and ${topSkills.length - 3} other areas` : ''}. These skills reflect ${name}'s dedication to continuous improvement and mastery.`
      });
    }

    // Academic progress
    if (topSubjects.length > 0) {
      sections.push({
        title: 'Academic Progress',
        content: `In ${currentYear}, ${name} has made significant progress across multiple subjects, with particular strength in ${topSubjects.join(', ')}. ${name} has achieved mastery in ${masteredCount} out of ${totalMastery} standards assessed (${masteryPercentage}% mastery rate), demonstrating a solid foundation across the curriculum.`
      });
    }

    // Portfolio and evidence
    if (portfolio.length > 0) {
      sections.push({
        title: 'Portfolio and Evidence',
        content: `${name} has created ${portfolio.length} portfolio artifacts this year, showcasing work across various subjects and demonstrating growth through tangible evidence of learning.`
      });
    }

    // Extracurriculars
    if (activities.length > 0 || volunteerHours > 0) {
      const activityText = activities.length > 0 
        ? `participated in ${activities.join(', ')}` 
        : '';
      const volunteerText = volunteerHours > 0 
        ? `${activityText ? ' and ' : ''}completed ${volunteerHours} volunteer hours` 
        : '';
      sections.push({
        title: 'Beyond the Classroom',
        content: `${name} ${activityText}${volunteerText}, showing engagement in learning opportunities beyond traditional academics.`
      });
    }

    // Growth and future
    sections.push({
      title: 'Looking Forward',
      content: `As ${name} continues on this learning journey, the foundation built in ${currentYear} provides a strong base for future growth. With continued dedication and the skills already developed, ${name} is well-positioned for continued success.`
    });

    return {
      name,
      year: currentYear,
      sections,
      stats: {
        totalHours,
        attendanceDays,
        masteredCount,
        totalMastery,
        masteryPercentage,
        portfolioCount: portfolio.length,
        topSkills,
        topSubjects
      }
    };
  };

  const handleExport = () => {
    if (!biography) return;

    const text = [
      `Learning Biography: ${biography.name}`,
      `Academic Year: ${biography.year}`,
      '',
      ...biography.sections.map(s => `${s.title}\n${s.content}\n`),
      '',
      'Statistics:',
      `- Total Learning Hours: ${biography.stats.totalHours}`,
      `- Attendance Days: ${biography.stats.attendanceDays}`,
      `- Standards Mastered: ${biography.stats.masteredCount}/${biography.stats.totalMastery} (${biography.stats.masteryPercentage}%)`,
      `- Portfolio Artifacts: ${biography.stats.portfolioCount}`,
      `- Top Skills: ${biography.stats.topSkills.join(', ')}`,
      `- Top Subjects: ${biography.stats.topSubjects.join(', ')}`
    ].join('\n');

    // For web, create download
    if (typeof window !== 'undefined') {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learning_biography_${biography.name}_${biography.year}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Generating biography...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadBiography}>
            <RefreshCw size={16} color={colors.card} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!biography) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <BookOpen size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No Biography Available</Text>
          <Text style={styles.emptyText}>
            Generate a learning biography based on your student's data.
          </Text>
        </View>
      </View>
    );
  }

  const [showEditor, setShowEditor] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [editedBiography, setEditedBiography] = useState(null);

  const handleEditSection = (section, index) => {
    setEditingSection({ ...section, index });
    setShowEditor(true);
  };

  const handleSaveEdit = (editedText) => {
    if (editingSection !== null && biography) {
      const updatedSections = [...biography.sections];
      updatedSections[editingSection.index] = {
        ...updatedSections[editingSection.index],
        content: editedText,
      };
      setEditedBiography({
        ...biography,
        sections: updatedSections,
      });
      setShowEditor(false);
      setEditingSection(null);
    }
  };

  const displayBiography = editedBiography || biography;

  return (
    <>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BookOpen size={24} color={colors.primary} />
            <View>
              <Text style={styles.title}>Learning Biography</Text>
              <Text style={styles.subtitle}>{displayBiography?.name} • {displayBiography?.year}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.actionButton} onPress={loadBiography}>
              <RefreshCw size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleExport}>
              <Download size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Biography Content */}
        <View style={styles.content}>
          {displayBiography?.sections.map((section, index) => (
            <View key={index} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEditSection(section, index)}
                >
                  <Edit size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionContent}>{section.content}</Text>
            </View>
          ))}

        {/* Statistics */}
        <View style={styles.statsSection}>
          <Text style={styles.statsTitle}>Key Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{displayBiography?.stats.totalHours}</Text>
              <Text style={styles.statLabel}>Learning Hours</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{displayBiography?.stats.attendanceDays}</Text>
              <Text style={styles.statLabel}>Days Active</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{displayBiography?.stats.masteryPercentage}%</Text>
              <Text style={styles.statLabel}>Mastery Rate</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{displayBiography?.stats.portfolioCount}</Text>
              <Text style={styles.statLabel}>Portfolio Items</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>

    {/* Rich Text Editor Modal */}
    {showEditor && editingSection && (
      <NoteEditorModal
        visible={showEditor}
        onClose={() => {
          setShowEditor(false);
          setEditingSection(null);
        }}
        onSaved={(note) => {
          if (note?.text) {
            handleSaveEdit(note.text);
          }
        }}
        familyId={null}
        defaultChildId={childId}
        defaultText={editingSection.content}
        editingNoteId={null}
        children={[]}
      />
    )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  editButton: {
    padding: 8,
  },
  sectionContent: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
  },
  statsSection: {
    marginTop: 8,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
});


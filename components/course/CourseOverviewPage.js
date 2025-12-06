/**
 * Course Overview Page
 * Shows skills, materials, pacing, and progress for a course/subject
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { 
  BookOpen, Target, Clock, FileText, TrendingUp, Calendar, 
  CheckCircle, Circle, ArrowRight, Download, Edit
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import SkillHeatmap from '../analytics/SkillHeatmap';

export default function CourseOverviewPage({
  childId,
  subjectId,
  familyId,
  onEdit,
  onNavigate,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, skills, materials, pacing

  useEffect(() => {
    if (childId && subjectId && familyId) {
      loadCourseData();
    }
  }, [childId, subjectId, familyId]);

  const loadCourseData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load subject info
      const { data: subject, error: subjectError } = await supabase
        .from('subject')
        .select('*')
        .eq('id', subjectId)
        .eq('family_id', familyId)
        .single();

      if (subjectError) throw subjectError;

      // Load syllabus
      const { data: syllabi, error: syllabiError } = await supabase
        .from('syllabi')
        .select('*')
        .eq('child_id', childId)
        .eq('subject_id', subjectId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (syllabiError) throw syllabiError;

      // Load events for progress
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('child_id', childId)
        .eq('subject_id', subjectId)
        .order('start_ts', { ascending: false });

      if (eventsError) throw eventsError;

      // Load skills
      const { data: skills, error: skillsError } = await supabase
        .from('skills')
        .select('*, skill_evidence(*)')
        .eq('subject_id', subjectId);

      if (skillsError) throw skillsError;

      // Load materials
      const { data: materials, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .eq('subject_id', subjectId)
        .eq('family_id', familyId);

      if (materialsError) throw materialsError;

      // Calculate progress
      const totalEvents = events?.length || 0;
      const completedEvents = events?.filter(e => e.status === 'done').length || 0;
      const totalMinutes = events?.reduce((sum, e) => sum + (e.minutes || 0), 0) || 0;
      const completedMinutes = events?.filter(e => e.status === 'done')
        .reduce((sum, e) => sum + (e.minutes || 0), 0) || 0;

      // Calculate skill mastery
      const skillStats = skills?.map(skill => {
        const evidence = skill.skill_evidence || [];
        const avgConfidence = evidence.length > 0
          ? evidence.reduce((sum, e) => sum + (e.confidence_score || 0), 0) / evidence.length
          : 0;
        return {
          ...skill,
          evidenceCount: evidence.length,
          avgConfidence,
        };
      }) || [];

      setCourseData({
        subject,
        syllabus: syllabi?.[0] || null,
        events,
        skills: skillStats,
        materials: materials || [],
        progress: {
          totalEvents,
          completedEvents,
          completionRate: totalEvents > 0 ? (completedEvents / totalEvents) * 100 : 0,
          totalMinutes,
          completedMinutes,
          minutesRate: totalMinutes > 0 ? (completedMinutes / totalMinutes) * 100 : 0,
        },
      });
    } catch (err) {
      console.error('[CourseOverviewPage] Error:', err);
      setError(err.message || 'Failed to load course data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent || '#3b82f6'} />
          <Text style={styles.loadingText}>Loading course overview...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!courseData) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No course data available.</Text>
        </View>
      </View>
    );
  }

  const { subject, syllabus, events, skills, materials, progress } = courseData;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BookOpen size={24} color={colors.accent || '#3b82f6'} />
          <View style={styles.headerText}>
            <Text style={styles.title}>{subject.name}</Text>
            {syllabus && (
              <Text style={styles.subtitle}>{syllabus.course_title || 'Course'}</Text>
            )}
          </View>
        </View>
        {onEdit && (
          <TouchableOpacity onPress={() => onEdit(subject)} style={styles.editButton}>
            <Edit size={16} color={colors.accent || '#3b82f6'} />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { id: 'overview', label: 'Overview', icon: BookOpen },
          { id: 'skills', label: 'Skills', icon: Target },
          { id: 'materials', label: 'Materials', icon: FileText },
          { id: 'pacing', label: 'Pacing', icon: Clock },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Icon size={16} color={activeTab === tab.id ? colors.accent : colors.muted} />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'overview' && (
          <View style={styles.section}>
            {/* Progress Cards */}
            <View style={styles.progressGrid}>
              <View style={styles.progressCard}>
                <View style={styles.progressCardHeader}>
                  <CheckCircle size={20} color={colors.greenBold || '#10b981'} />
                  <Text style={styles.progressCardTitle}>Completion</Text>
                </View>
                <Text style={styles.progressCardValue}>
                  {progress.completedEvents}/{progress.totalEvents}
                </Text>
                <Text style={styles.progressCardSubtext}>
                  {progress.completionRate.toFixed(0)}% complete
                </Text>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressCardHeader}>
                  <Clock size={20} color={colors.accent || '#3b82f6'} />
                  <Text style={styles.progressCardTitle}>Time</Text>
                </View>
                <Text style={styles.progressCardValue}>
                  {Math.round(progress.completedMinutes)}/{Math.round(progress.totalMinutes)} min
                </Text>
                <Text style={styles.progressCardSubtext}>
                  {progress.minutesRate.toFixed(0)}% complete
                </Text>
              </View>
            </View>

            {/* Skills Summary */}
            {skills.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Skills Overview</Text>
                <View style={styles.skillsSummary}>
                  <View style={styles.skillStat}>
                    <Text style={styles.skillStatValue}>{skills.length}</Text>
                    <Text style={styles.skillStatLabel}>Total Skills</Text>
                  </View>
                  <View style={styles.skillStat}>
                    <Text style={styles.skillStatValue}>
                      {skills.filter(s => s.evidenceCount > 0).length}
                    </Text>
                    <Text style={styles.skillStatLabel}>With Evidence</Text>
                  </View>
                  <View style={styles.skillStat}>
                    <Text style={styles.skillStatValue}>
                      {skills.filter(s => s.avgConfidence >= 4).length}
                    </Text>
                    <Text style={styles.skillStatLabel}>Proficient</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Materials Summary */}
            {materials.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Materials</Text>
                <Text style={styles.materialsCount}>
                  {materials.length} material{materials.length !== 1 ? 's' : ''} available
                </Text>
              </View>
            )}

            {/* Recent Activity */}
            {events && events.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                {events.slice(0, 5).map((event, idx) => (
                  <View key={idx} style={styles.activityItem}>
                    <View style={[
                      styles.activityStatus,
                      event.status === 'done' && styles.activityStatusDone,
                    ]}>
                      {event.status === 'done' ? (
                        <CheckCircle size={14} color={colors.greenBold || '#10b981'} />
                      ) : (
                        <Circle size={14} color={colors.muted || '#6b7280'} />
                      )}
                    </View>
                    <View style={styles.activityContent}>
                      <Text style={styles.activityTitle}>{event.title}</Text>
                      <Text style={styles.activityDate}>
                        {new Date(event.start_ts).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                    {event.minutes && (
                      <Text style={styles.activityMinutes}>{event.minutes} min</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'skills' && (
          <View style={styles.section}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Skill Mastery</Text>
              {skills.length > 0 ? (
                <>
                  <SkillHeatmap childId={childId} subjectId={subjectId} daysBack={180} />
                  <View style={styles.skillsList}>
                    {skills.map((skill, idx) => (
                      <View key={idx} style={styles.skillCard}>
                        <View style={styles.skillHeader}>
                          <Text style={styles.skillName}>{skill.name}</Text>
                          {skill.evidenceCount > 0 && (
                            <View style={styles.skillBadge}>
                              <Text style={styles.skillBadgeText}>
                                {skill.avgConfidence.toFixed(1)}/5
                              </Text>
                            </View>
                          )}
                        </View>
                        {skill.description && (
                          <Text style={styles.skillDescription}>{skill.description}</Text>
                        )}
                        <View style={styles.skillMeta}>
                          <Text style={styles.skillMetaText}>
                            {skill.evidenceCount} evidence{skill.evidenceCount !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>No skills defined for this course.</Text>
              )}
            </View>
          </View>
        )}

        {activeTab === 'materials' && (
          <View style={styles.section}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Course Materials</Text>
              {materials.length > 0 ? (
                <View style={styles.materialsList}>
                  {materials.map((material, idx) => (
                    <View key={idx} style={styles.materialCard}>
                      <FileText size={20} color={colors.accent || '#3b82f6'} />
                      <View style={styles.materialContent}>
                        <Text style={styles.materialTitle}>{material.title || 'Untitled'}</Text>
                        {material.description && (
                          <Text style={styles.materialDescription}>{material.description}</Text>
                        )}
                        {material.url && (
                          <TouchableOpacity
                            style={styles.materialLink}
                            onPress={() => {
                              if (typeof window !== 'undefined') {
                                window.open(material.url, '_blank');
                              }
                            }}
                          >
                            <Text style={styles.materialLinkText}>Open</Text>
                            <ArrowRight size={14} color={colors.accent || '#3b82f6'} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No materials added yet.</Text>
              )}
            </View>
          </View>
        )}

        {activeTab === 'pacing' && (
          <View style={styles.section}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Course Pacing</Text>
              {syllabus ? (
                <View style={styles.pacingInfo}>
                  {syllabus.start_date && syllabus.end_date && (
                    <View style={styles.pacingItem}>
                      <Calendar size={16} color={colors.muted || '#6b7280'} />
                      <Text style={styles.pacingText}>
                        {new Date(syllabus.start_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })} - {new Date(syllabus.end_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  )}
                  {syllabus.expected_weekly_minutes && (
                    <View style={styles.pacingItem}>
                      <Clock size={16} color={colors.muted || '#6b7280'} />
                      <Text style={styles.pacingText}>
                        {syllabus.expected_weekly_minutes} minutes per week
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={styles.emptyText}>No pacing information available.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg || '#ffffff',
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
    color: colors.muted || '#6b7280',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold || '#dc2626',
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
    marginTop: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
  },
  editText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent || '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted || '#6b7280',
  },
  tabTextActive: {
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  progressGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  progressCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  progressCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  progressCardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  progressCardSubtext: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  sectionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 16,
  },
  skillsSummary: {
    flexDirection: 'row',
    gap: 16,
  },
  skillStat: {
    flex: 1,
    alignItems: 'center',
  },
  skillStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  skillStatLabel: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  materialsCount: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  activityStatus: {
    marginRight: 12,
  },
  activityStatusDone: {
    // Additional styling if needed
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  activityDate: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  activityMinutes: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  skillsList: {
    marginTop: 16,
    gap: 12,
  },
  skillCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  skillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  skillName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text || '#111827',
    flex: 1,
  },
  skillBadge: {
    backgroundColor: colors.blueSoft || '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  skillDescription: {
    fontSize: 13,
    color: colors.muted || '#6b7280',
    marginBottom: 8,
    lineHeight: 18,
  },
  skillMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skillMetaText: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  materialsList: {
    gap: 12,
  },
  materialCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  materialContent: {
    flex: 1,
    marginLeft: 12,
  },
  materialTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  materialDescription: {
    fontSize: 13,
    color: colors.muted || '#6b7280',
    marginBottom: 8,
    lineHeight: 18,
  },
  materialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  materialLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  pacingInfo: {
    gap: 12,
  },
  pacingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pacingText: {
    fontSize: 14,
    color: colors.text || '#111827',
  },
});


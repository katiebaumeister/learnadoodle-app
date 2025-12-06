import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Printer, Download, FileText, Award, BookOpen, Calendar, BarChart3, User } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { exportStudentProfile } from '../../lib/services/studentProfileExport';
import GeistCard from '../GeistCard';

const PORTFOLIO_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'academics', label: 'Academics', icon: BookOpen },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'attendance', label: 'Attendance', icon: Calendar },
  { id: 'skills', label: 'Skills', icon: BarChart3 },
  { id: 'documents', label: 'Documents', icon: FileText },
];

export default function PrintablePortfolioView({ childId, familyId, child }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [activeSection, setActiveSection] = useState('overview');
  const [portfolioData, setPortfolioData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPortfolioData();
  }, [childId]);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      const data = await exportStudentProfile(childId, 'json');
      setPortfolioData(data);
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportStudentProfile(childId, 'json');
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${child?.first_name || 'student'}_portfolio_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const renderSectionContent = () => {
    if (loading || !portfolioData) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: tokens.textSecondary }]}>Loading portfolio...</Text>
        </View>
      );
    }

    switch (activeSection) {
      case 'overview':
        return (
          <View style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Student Overview</Text>
            <GeistCard variant="medium" style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: tokens.textSecondary }]}>Name:</Text>
                <Text style={[styles.infoValue, { color: tokens.text }]}>
                  {child?.first_name || child?.name || 'N/A'}
                </Text>
              </View>
              {child?.grade && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: tokens.textSecondary }]}>Grade:</Text>
                  <Text style={[styles.infoValue, { color: tokens.text }]}>{child.grade}</Text>
                </View>
              )}
              {child?.date_of_birth && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: tokens.textSecondary }]}>Date of Birth:</Text>
                  <Text style={[styles.infoValue, { color: tokens.text }]}>
                    {new Date(child.date_of_birth).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </GeistCard>
          </View>
        );

      case 'academics':
        return (
          <View style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Academic Performance</Text>
            {portfolioData.grades && portfolioData.grades.length > 0 ? (
              <View style={styles.gradesList}>
                {portfolioData.grades.map((grade, idx) => (
                  <GeistCard key={idx} variant="small" style={styles.gradeCard}>
                    <Text style={[styles.gradeSubject, { color: tokens.text }]}>
                      {grade.subject?.name || 'Subject'}
                    </Text>
                    <Text style={[styles.gradeValue, { color: tokens.text }]}>
                      {grade.grade || grade.score || 'N/A'}
                    </Text>
                    {grade.term_label && (
                      <Text style={[styles.gradeTerm, { color: tokens.textSecondary }]}>
                        {grade.term_label}
                      </Text>
                    )}
                  </GeistCard>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>No grades recorded</Text>
            )}
          </View>
        );

      case 'achievements':
        return (
          <View style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Achievements & Awards</Text>
            {portfolioData.achievements && portfolioData.achievements.length > 0 ? (
              <View style={styles.achievementsList}>
                {portfolioData.achievements.map((achievement, idx) => (
                  <GeistCard key={idx} variant="small" style={styles.achievementCard}>
                    <Award size={24} color={tokens.accent} />
                    <View style={styles.achievementInfo}>
                      <Text style={[styles.achievementTitle, { color: tokens.text }]}>
                        {achievement.title || 'Achievement'}
                      </Text>
                      {achievement.date && (
                        <Text style={[styles.achievementDate, { color: tokens.textSecondary }]}>
                          {new Date(achievement.date).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </GeistCard>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>No achievements recorded</Text>
            )}
          </View>
        );

      case 'attendance':
        return (
          <View style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Attendance</Text>
            {portfolioData.attendance && portfolioData.attendance.length > 0 ? (
              <View style={styles.attendanceSummary}>
                <GeistCard variant="medium" style={styles.summaryCard}>
                  <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Total Days</Text>
                  <Text style={[styles.summaryValue, { color: tokens.text }]}>
                    {portfolioData.attendance.length}
                  </Text>
                </GeistCard>
                <GeistCard variant="medium" style={styles.summaryCard}>
                  <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Total Hours</Text>
                  <Text style={[styles.summaryValue, { color: tokens.text }]}>
                    {portfolioData.attendance.reduce((sum, r) => sum + (r.hours || r.total_minutes / 60 || 0), 0).toFixed(1)}
                  </Text>
                </GeistCard>
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>No attendance records</Text>
            )}
          </View>
        );

      case 'skills':
        return (
          <View style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Skills & Mastery</Text>
            {portfolioData.skills && portfolioData.skills.length > 0 ? (
              <View style={styles.skillsList}>
                {portfolioData.skills.map((skill, idx) => (
                  <GeistCard key={idx} variant="small" style={styles.skillCard}>
                    <Text style={[styles.skillName, { color: tokens.text }]}>
                      {skill.name || skill.skill_name || 'Skill'}
                    </Text>
                    {skill.value !== undefined && (
                      <View style={styles.skillBar}>
                        <View
                          style={[
                            styles.skillBarFill,
                            {
                              width: `${Math.min(100, Math.max(0, skill.value))}%`,
                              backgroundColor: tokens.accent,
                            }
                          ]}
                        />
                      </View>
                    )}
                    {skill.mastery && (
                      <Text style={[styles.skillMastery, { color: tokens.textSecondary }]}>
                        {skill.mastery}
                      </Text>
                    )}
                  </GeistCard>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>No skills data</Text>
            )}
          </View>
        );

      case 'documents':
        return (
          <View style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Documents & Evidence</Text>
            {portfolioData.documents && portfolioData.documents.length > 0 ? (
              <View style={styles.documentsList}>
                {portfolioData.documents.map((doc, idx) => (
                  <GeistCard key={idx} variant="small" style={styles.documentCard}>
                    <FileText size={20} color={tokens.accent} />
                    <View style={styles.documentInfo}>
                      <Text style={[styles.documentTitle, { color: tokens.text }]}>
                        {doc.title || doc.name || 'Document'}
                      </Text>
                      {doc.created_at && (
                        <Text style={[styles.documentDate, { color: tokens.textSecondary }]}>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </GeistCard>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>No documents</Text>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {/* Header with Actions */}
      <View style={[styles.header, { backgroundColor: tokens.surface }]}>
        <View>
          <Text style={[styles.headerTitle, { color: tokens.text }]}>Printable Portfolio</Text>
          <Text style={[styles.headerSubtitle, { color: tokens.textSecondary }]}>
            {child?.first_name || child?.name || 'Student'} - Complete Learning Portfolio
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: tokens.border }]}
            onPress={handleExport}
          >
            <Download size={16} color={tokens.iconMuted} />
            <Text style={[styles.actionText, { color: tokens.textSecondary }]}>Export</Text>
          </TouchableOpacity>
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: tokens.border }]}
              onPress={handlePrint}
            >
              <Printer size={16} color={tokens.iconMuted} />
              <Text style={[styles.actionText, { color: tokens.textSecondary }]}>Print</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {/* Sidebar */}
        <View style={[styles.sidebar, { backgroundColor: tokens.surface, borderRightColor: tokens.border }]}>
          <Text style={[styles.sidebarTitle, { color: tokens.text }]}>Portfolio Sections</Text>
          <ScrollView style={styles.sidebarList}>
            {PORTFOLIO_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <TouchableOpacity
                  key={section.id}
                  style={[
                    styles.sidebarItem,
                    activeSection === section.id && { backgroundColor: tokens.accentSoft },
                  ]}
                  onPress={() => setActiveSection(section.id)}
                >
                  <Icon size={18} color={activeSection === section.id ? tokens.accent : tokens.iconMuted} />
                  <Text
                    style={[
                      styles.sidebarItemText,
                      {
                        color: activeSection === section.id ? tokens.accent : tokens.text,
                        fontWeight: activeSection === section.id ? '600' : '400',
                      }
                    ]}
                  >
                    {section.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {renderSectionContent()}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 220,
    borderRightWidth: 1,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      height: 'calc(100vh - 100px)',
    }),
  },
  sidebarTitle: {
    fontSize: 14,
    fontWeight: '600',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sidebarList: {
    flex: 1,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    paddingLeft: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sidebarItemText: {
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.xl,
  },
  sectionContent: {
    gap: spacing.lg,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
    fontSize: 14,
  },
  infoCard: {
    padding: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
  },
  gradesList: {
    gap: spacing.md,
  },
  gradeCard: {
    padding: spacing.md,
  },
  gradeSubject: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  gradeValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  gradeTerm: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  achievementsList: {
    gap: spacing.md,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  achievementDate: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  attendanceSummary: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryCard: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  skillsList: {
    gap: spacing.md,
  },
  skillCard: {
    padding: spacing.md,
  },
  skillName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  skillBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  skillBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  skillMastery: {
    fontSize: 12,
  },
  documentsList: {
    gap: spacing.md,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  documentDate: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
});

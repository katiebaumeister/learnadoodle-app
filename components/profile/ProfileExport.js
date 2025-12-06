import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { Download, FileText, BookOpen, Calendar, Award, BarChart3, FileArchive } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { exportStudentProfile } from '../../lib/services/studentProfileExport';
import { apiRequest } from '../../lib/apiClient';
import GeistCard from '../GeistCard';

const EXPORT_TYPES = [
  { id: 'portfolio', label: 'Portfolio Book', icon: BookOpen, description: 'Complete portfolio with all evidence' },
  { id: 'year-end', label: 'Year-End Summary', icon: FileText, description: 'Annual learning summary report' },
  { id: 'transcript', label: 'Transcript', icon: FileText, description: 'Academic transcript with grades' },
  { id: 'attendance', label: 'Attendance Log', icon: Calendar, description: 'Complete attendance records' },
  { id: 'skill-map', label: 'Skill Map', icon: BarChart3, description: 'Visual skill progression map' },
  { id: 'all', label: 'Complete Export (ZIP)', icon: FileArchive, description: 'All data in one package' },
];

export default function ProfileExport({ childId, familyId, child }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [exporting, setExporting] = useState(null);

  const handleExport = async (exportType) => {
    if (!childId) {
      Alert.alert('Error', 'No student selected');
      return;
    }

    setExporting(exportType);

    try {
      if (exportType === 'all') {
        // Complete export - use the export service
        const data = await exportStudentProfile(childId, 'json');
        
        // Convert to JSON and download
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${child?.first_name || child?.name || 'student'}_complete_export_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'Complete profile exported successfully');
      } else if (exportType === 'transcript') {
        // Try API endpoint for transcript
        try {
          const { data, error } = await apiRequest(`/api/records/transcript/${childId}`, {
            method: 'GET',
          });

          if (error) throw error;

          if (data?.export_url) {
            // Open transcript URL
            window.open(data.export_url, '_blank');
          } else {
            // Fallback: generate transcript data
            const transcriptData = await exportStudentProfile(childId, 'json');
            const jsonStr = JSON.stringify({
              student: {
                name: child?.first_name || child?.name,
                grade: child?.grade,
              },
              grades: transcriptData.grades || [],
              courses: transcriptData.courses || [],
            }, null, 2);
            
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${child?.first_name || 'student'}_transcript_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
          }
        } catch (apiError) {
          // Fallback to direct export
          const transcriptData = await exportStudentProfile(childId, 'json');
          const jsonStr = JSON.stringify({
            student: {
              name: child?.first_name || child?.name,
              grade: child?.grade,
            },
            grades: transcriptData.grades || [],
            courses: transcriptData.courses || [],
          }, null, 2);
          
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${child?.first_name || 'student'}_transcript_${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          URL.revokeObjectURL(url);
        }
        
        Alert.alert('Success', 'Transcript exported successfully');
      } else if (exportType === 'attendance') {
        // Export attendance log
        const profileData = await exportStudentProfile(childId, 'json');
        const attendanceData = profileData.attendance || [];
        
        // Create CSV
        const csvRows = [
          ['Date', 'Status', 'Hours', 'Notes'],
          ...attendanceData.map(record => [
            record.day_date || record.date || '',
            record.status || 'present',
            record.hours || record.total_minutes ? (record.total_minutes / 60).toFixed(2) : '',
            record.notes || '',
          ])
        ];
        
        const csv = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${child?.first_name || 'student'}_attendance_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'Attendance log exported successfully');
      } else if (exportType === 'portfolio') {
        // Export portfolio
        const profileData = await exportStudentProfile(childId, 'json');
        const portfolioData = {
          student: {
            name: child?.first_name || child?.name,
            grade: child?.grade,
          },
          documents: profileData.documents || [],
          portfolio: profileData.portfolio || [],
          evidence: profileData.evidence || [],
        };
        
        const jsonStr = JSON.stringify(portfolioData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${child?.first_name || 'student'}_portfolio_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'Portfolio exported successfully');
      } else if (exportType === 'year-end') {
        // Export year-end summary
        const profileData = await exportStudentProfile(childId, 'json');
        const summaryData = {
          student: {
            name: child?.first_name || child?.name,
            grade: child?.grade,
          },
          summary: {
            total_days: profileData.attendance?.length || 0,
            total_hours: profileData.attendance?.reduce((sum, r) => sum + (r.hours || r.total_minutes / 60 || 0), 0) || 0,
            subjects_covered: [...new Set((profileData.grades || []).map(g => g.subject?.name).filter(Boolean))],
            skills_mastered: (profileData.skills || []).filter(s => s.mastery === 'mastered' || s.mastery === 'exceeded').length,
          },
          grades: profileData.grades || [],
          skills: profileData.skills || [],
          achievements: profileData.achievements || [],
        };
        
        const jsonStr = JSON.stringify(summaryData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${child?.first_name || 'student'}_year_end_summary_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'Year-end summary exported successfully');
      } else if (exportType === 'skill-map') {
        // Export skill map
        const profileData = await exportStudentProfile(childId, 'json');
        const skillMapData = {
          student: {
            name: child?.first_name || child?.name,
            grade: child?.grade,
          },
          skills: profileData.skills || [],
          mastery: profileData.mastery || [],
          skill_coverage: profileData.skill_coverage || [],
        };
        
        const jsonStr = JSON.stringify(skillMapData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${child?.first_name || 'student'}_skill_map_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'Skill map exported successfully');
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', `Failed to export ${exportType}. Please try again.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: tokens.text }]}>Export Profile</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
            Export student data in various formats
          </Text>
        </View>
      </View>

      <ScrollView style={styles.exportsList}>
        {EXPORT_TYPES.map((exportType) => (
          <GeistCard
            key={exportType.id}
            variant="medium"
            hoverable
            onPress={() => !exporting && handleExport(exportType.id)}
            style={[styles.exportCard, exporting === exportType.id && styles.exportCardDisabled]}
          >
            <View style={styles.exportContent}>
              <View style={[styles.exportIcon, { backgroundColor: tokens.accentSoft }]}>
                <exportType.icon size={24} color={tokens.accent} />
              </View>
              <View style={styles.exportInfo}>
                <Text style={[styles.exportLabel, { color: tokens.text }]}>
                  {exportType.label}
                </Text>
                <Text style={[styles.exportDescription, { color: tokens.textSecondary }]}>
                  {exportType.description}
                </Text>
              </View>
              {exporting === exportType.id ? (
                <ActivityIndicator size="small" color={tokens.accent} />
              ) : (
                <Download size={20} color={tokens.iconMuted} />
              )}
            </View>
          </GeistCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
  },
  exportsList: {
    flex: 1,
    gap: spacing.md,
  },
  exportCard: {
    marginBottom: spacing.md,
  },
  exportCardDisabled: {
    opacity: 0.6,
  },
  exportContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  exportIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  exportLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  exportDescription: {
    fontSize: 13,
  },
});

/**
 * Export Menu Component
 * Provides UI for accessing all export options
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { Download, FileText, Calendar, Users, BookOpen, GraduationCap, Clock, Map, Book, User, FileCheck } from 'lucide-react';
import { colors } from '../../theme/colors';
import WeeklyPlanExportModal from './WeeklyPlanExportModal';
import DailyPrintoutExportModal from './DailyPrintoutExportModal';
import SubstitutePacketExportModal from './SubstitutePacketExportModal';
import PortfolioBookExportModal from './PortfolioBookExportModal';
import YearEndSummaryExportModal from './YearEndSummaryExportModal';
import TranscriptExportModal from './TranscriptExportModal';
import AttendanceLogExportModal from './AttendanceLogExportModal';
import SkillMapExportModal from './SkillMapExportModal';
import CurriculumPlanExportModal from './CurriculumPlanExportModal';
import ProgressReportExportModal from './ProgressReportExportModal';
import CaregiverPacketExportModal from './CaregiverPacketExportModal';

const EXPORT_OPTIONS = [
  {
    id: 'weekly-plan',
    title: 'Weekly Plan',
    description: 'Export weekly learning schedule and assignments',
    icon: Calendar,
    color: '#3b82f6',
  },
  {
    id: 'daily-printout',
    title: 'Daily Printout',
    description: 'Print-friendly daily schedule',
    icon: FileText,
    color: '#10b981',
  },
  {
    id: 'substitute-packet',
    title: 'Substitute Teacher Packet',
    description: 'Complete packet for substitute teachers',
    icon: Users,
    color: '#f59e0b',
  },
  {
    id: 'portfolio-book',
    title: 'Portfolio Book',
    description: 'Complete portfolio with evidence, grades, and attendance',
    icon: BookOpen,
    color: '#8b5cf6',
  },
  {
    id: 'year-end-summary',
    title: 'Year-End Summary',
    description: 'Comprehensive year-end academic summary',
    icon: GraduationCap,
    color: '#ec4899',
  },
  {
    id: 'transcript',
    title: 'Transcript (HS)',
    description: 'Enhanced high school transcript with GPA',
    icon: FileCheck,
    color: '#06b6d4',
  },
  {
    id: 'attendance-log',
    title: 'Attendance Log',
    description: 'Formatted attendance log with summaries',
    icon: Clock,
    color: '#f97316',
  },
  {
    id: 'skill-map',
    title: 'Skill Map',
    description: 'Visual skill progression map',
    icon: Map,
    color: '#14b8a6',
  },
  {
    id: 'curriculum-plan',
    title: 'Curriculum Plan',
    description: 'Complete curriculum plan with units and lessons',
    icon: Book,
    color: '#6366f1',
  },
  {
    id: 'progress-report',
    title: 'Progress Report',
    description: 'Personalized student progress report',
    icon: User,
    color: '#a855f7',
  },
  {
    id: 'caregiver-packet',
    title: 'Caregiver/Tutor Packet',
    description: 'PDF packet for caregivers and tutors',
    icon: Users,
    color: '#ef4444',
  },
];

export default function ExportMenu({ 
  isOpen, 
  onClose, 
  familyId, 
  children = [],
  defaultChildId = null 
}) {
  const [selectedExport, setSelectedExport] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(defaultChildId);

  const handleExportSelect = (exportId) => {
    setSelectedExport(exportId);
  };

  const handleCloseModal = () => {
    setSelectedExport(null);
  };

  const handleExportComplete = () => {
    setSelectedExport(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        visible={isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <Text style={styles.title}>Export Documents</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.subtitle}>Select an export type:</Text>
              
              <View style={styles.optionsGrid}>
                {EXPORT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.optionCard}
                      onPress={() => handleExportSelect(option.id)}
                    >
                      <View style={[styles.iconContainer, { backgroundColor: `${option.color}15` }]}>
                        <Icon size={24} color={option.color} />
                      </View>
                      <Text style={styles.optionTitle}>{option.title}</Text>
                      <Text style={styles.optionDescription} numberOfLines={2}>
                        {option.description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Export Modals */}
      {selectedExport === 'weekly-plan' && (
        <WeeklyPlanExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'daily-printout' && (
        <DailyPrintoutExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'substitute-packet' && (
        <SubstitutePacketExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
        />
      )}

      {selectedExport === 'portfolio-book' && (
        <PortfolioBookExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'year-end-summary' && (
        <YearEndSummaryExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'transcript' && (
        <TranscriptExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'attendance-log' && (
        <AttendanceLogExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'skill-map' && (
        <SkillMapExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'curriculum-plan' && (
        <CurriculumPlanExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'progress-report' && (
        <ProgressReportExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}

      {selectedExport === 'caregiver-packet' && (
        <CaregiverPacketExportModal
          isOpen={true}
          onClose={handleCloseModal}
          onComplete={handleExportComplete}
          familyId={familyId}
          children={children}
          defaultChildId={selectedChildId}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 800,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#6b7280',
    lineHeight: 28,
  },
  content: {
    padding: 20,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
});


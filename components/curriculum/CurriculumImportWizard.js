/**
 * Curriculum Import Wizard
 * Multi-step wizard for importing and parsing PDF syllabi
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Upload, FileText, CheckCircle, ArrowRight, ArrowLeft, X, Lightbulb } from 'lucide-react';
import { colors } from '../../theme/colors';
import { parseSyllabusPDF } from '../../lib/services/curriculumAIClient';
import { supabase } from '../../lib/supabase';
import UnitsReview from './UnitsReview';
import PacingGenerator from './PacingGenerator';

const STEPS = {
  UPLOAD: 'upload',
  PARSING: 'parsing',
  REVIEW: 'review',
  PACING: 'pacing',
  COMPLETE: 'complete',
};

export default function CurriculumImportWizard({
  visible,
  onClose,
  familyId,
  childId,
  subjectId,
  children = [],
  subjects = [],
}) {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [file, setFile] = useState(null);
  const [syllabusTitle, setSyllabusTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expectedWeeklyMinutes, setExpectedWeeklyMinutes] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(childId || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjectId || '');
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = () => {
    if (typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = async (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (selectedFile.type !== 'application/pdf') {
          setError('Please select a PDF file');
          return;
        }

        setFile(selectedFile);
        setError(null);
        
        // Auto-fill title from filename
        if (!syllabusTitle) {
          const nameWithoutExt = selectedFile.name.replace(/\.pdf$/i, '');
          setSyllabusTitle(nameWithoutExt);
        }
      };
      input.click();
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    if (!selectedChildId || !selectedSubjectId) {
      setError('Please select a child and subject');
      return;
    }

    if (!syllabusTitle.trim()) {
      setError('Please enter a syllabus title');
      return;
    }

    try {
      setParsing(true);
      setError(null);
      setStep(STEPS.PARSING);

      // Upload file to Supabase storage
      const fileName = `${familyId}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(fileName, file, {
          contentType: 'application/pdf',
          metadata: { family_id: familyId, child_id: selectedChildId },
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fileName);
      const pdfUrl = urlData.publicUrl;

      // Parse syllabus using AI
      const { data, error: parseError } = await parseSyllabusPDF({
        pdfUrl,
        familyId,
        childId: selectedChildId,
        subjectId: selectedSubjectId,
        syllabusTitle: syllabusTitle.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        expectedWeeklyMinutes: expectedWeeklyMinutes ? parseInt(expectedWeeklyMinutes) : null,
      });

      if (parseError) throw parseError;

      setParsedData(data);
      setStep(STEPS.REVIEW);
    } catch (err) {
      setError(err.message || 'Failed to upload and parse syllabus');
      setStep(STEPS.UPLOAD);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmUnits = () => {
    setStep(STEPS.PACING);
  };

  const handleComplete = () => {
    setStep(STEPS.COMPLETE);
    // Reset form after a delay
    setTimeout(() => {
      onClose();
      // Reset state
      setStep(STEPS.UPLOAD);
      setFile(null);
      setSyllabusTitle('');
      setStartDate('');
      setEndDate('');
      setExpectedWeeklyMinutes('');
      setParsedData(null);
      setError(null);
    }, 2000);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Lightbulb size={24} color={colors.primary} />
              <Text style={styles.title}>Curriculum AI Wizard</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressBar}>
            {Object.values(STEPS).map((stepName, idx) => {
              const stepIndex = Object.values(STEPS).indexOf(step);
              const isActive = idx <= stepIndex;
              const isCurrent = stepName === step;
              return (
                <View key={stepName} style={styles.progressStep}>
                  <View style={[styles.progressDot, isActive && styles.progressDotActive, isCurrent && styles.progressDotCurrent]} />
                  {idx < Object.values(STEPS).length - 1 && (
                    <View style={[styles.progressLine, isActive && styles.progressLineActive]} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {step === STEPS.UPLOAD && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Upload PDF Syllabus</Text>
                <Text style={styles.stepDescription}>
                  Upload your course syllabus PDF. We'll automatically parse it into units, extract skills, and recommend pacing.
                </Text>

                {/* Child Selection */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Child</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                    {children.map((child) => (
                      <TouchableOpacity
                        key={child.id}
                        style={[styles.chip, selectedChildId === child.id && styles.chipActive]}
                        onPress={() => setSelectedChildId(child.id)}
                      >
                        <Text style={[styles.chipText, selectedChildId === child.id && styles.chipTextActive]}>
                          {child.first_name || 'Child'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Subject Selection */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Subject</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                    {subjects.map((subject) => (
                      <TouchableOpacity
                        key={subject.id}
                        style={[styles.chip, selectedSubjectId === subject.id && styles.chipActive]}
                        onPress={() => setSelectedSubjectId(subject.id)}
                      >
                        <Text style={[styles.chipText, selectedSubjectId === subject.id && styles.chipTextActive]}>
                          {subject.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* File Upload */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>PDF File</Text>
                  <TouchableOpacity
                    style={[styles.uploadButton, file && styles.uploadButtonActive]}
                    onPress={handleFileSelect}
                  >
                    {file ? (
                      <>
                        <FileText size={20} color={colors.primary} />
                        <Text style={styles.uploadButtonText}>{file.name}</Text>
                      </>
                    ) : (
                      <>
                        <Upload size={20} color={colors.muted} />
                        <Text style={styles.uploadButtonText}>Select PDF File</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Syllabus Title */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Syllabus Title</Text>
                  <TextInput
                    style={styles.input}
                    value={syllabusTitle}
                    onChangeText={setSyllabusTitle}
                    placeholder="e.g., Algebra I Course Syllabus"
                  />
                </View>

                {/* Optional: Dates and Weekly Minutes */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Start Date (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>End Date (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Expected Weekly Minutes (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={expectedWeeklyMinutes}
                    onChangeText={setExpectedWeeklyMinutes}
                    placeholder="e.g., 180"
                    keyboardType="numeric"
                  />
                </View>

                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.primaryButton} onPress={handleUpload}>
                  <Text style={styles.primaryButtonText}>Upload & Parse</Text>
                  <ArrowRight size={16} color={colors.card} />
                </TouchableOpacity>
              </View>
            )}

            {step === STEPS.PARSING && (
              <View style={styles.stepContent}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.parsingText}>Parsing syllabus...</Text>
                <Text style={styles.parsingSubtext}>
                  Extracting units, skills, and difficulty levels. This may take a minute.
                </Text>
              </View>
            )}

            {step === STEPS.REVIEW && parsedData && (
              <UnitsReview
                syllabusId={parsedData.syllabus_id}
                units={parsedData.units || []}
                onConfirm={handleConfirmUnits}
                onBack={() => setStep(STEPS.UPLOAD)}
              />
            )}

            {step === STEPS.PACING && parsedData && (
              <PacingGenerator
                syllabusId={parsedData.syllabus_id}
                startDate={startDate}
                endDate={endDate}
                onComplete={handleComplete}
                onBack={() => setStep(STEPS.REVIEW)}
              />
            )}

            {step === STEPS.COMPLETE && (
              <View style={styles.stepContent}>
                <CheckCircle size={64} color={colors.greenBold} />
                <Text style={styles.completeTitle}>Curriculum Imported!</Text>
                <Text style={styles.completeText}>
                  Your syllabus has been parsed, units created, and pacing generated.
                </Text>
              </View>
            )}
          </ScrollView>
      </TouchableOpacity>
    </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 800,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressDotCurrent: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  progressLineActive: {
    backgroundColor: colors.primary,
  },
  content: {
    flex: 1,
  },
  stepContent: {
    padding: 20,
    alignItems: 'center',
    minHeight: 400,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: 20,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.card,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.bgSubtle,
  },
  uploadButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.blueSoft,
  },
  uploadButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
  parsingText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  parsingSubtext: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  completeText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
});


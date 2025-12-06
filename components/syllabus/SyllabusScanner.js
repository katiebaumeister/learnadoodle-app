/**
 * Enhanced Syllabus Scanner & Unit Builder
 * Full-featured scanner with interactive unit builder
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { 
  FileText, Upload, Scan, Plus, Edit, Trash2, Save, 
  CheckCircle, AlertCircle, ArrowRight, GripVertical
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { parseSyllabusPDF } from '../../lib/services/curriculumAIClient';
import { supabase } from '../../lib/supabase';

export default function SyllabusScanner({
  visible,
  onClose,
  familyId,
  childId,
  subjectId,
  onComplete,
}) {
  const [step, setStep] = useState('upload'); // upload, scanning, review, builder
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [units, setUnits] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleFileSelect = () => {
    if (typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.txt';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          setFile(file);
          setStep('scanning');
          handleScan(file);
        }
      };
      input.click();
    }
  };

  const handleScan = async (fileToScan) => {
    setScanning(true);
    setError(null);

    try {
      // Upload file first
      const formData = new FormData();
      formData.append('file', fileToScan);

      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;

      const uploadResponse = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const { url: fileUrl } = await uploadResponse.json();

      // Parse syllabus
      const result = await parseSyllabusPDF({
        pdfUrl: fileUrl,
        familyId,
        childId,
        subjectId,
        syllabusTitle: fileToScan.name,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // Extract units from parsed data
      const extractedUnits = result.data?.units || [];
      setScannedData(result.data);
      setUnits(extractedUnits);
      setStep('review');
    } catch (err) {
      console.error('[SyllabusScanner] Error:', err);
      setError(err.message || 'Failed to scan syllabus');
      setStep('upload');
    } finally {
      setScanning(false);
    }
  };

  const handleAddUnit = () => {
    setUnits([...units, {
      id: Date.now().toString(),
      title: 'New Unit',
      lessons: [],
      estimatedDays: 0,
    }]);
  };

  const handleUpdateUnit = (unitId, updates) => {
    setUnits(units.map(u => 
      u.id === unitId ? { ...u, ...updates } : u
    ));
  };

  const handleDeleteUnit = (unitId) => {
    setUnits(units.filter(u => u.id !== unitId));
  };

  const handleAddLesson = (unitId) => {
    setUnits(units.map(u => 
      u.id === unitId 
        ? { ...u, lessons: [...(u.lessons || []), { title: 'New Lesson', estimatedDays: 1 }] }
        : u
    ));
  };

  const handleUpdateLesson = (unitId, lessonIndex, updates) => {
    setUnits(units.map(u => 
      u.id === unitId
        ? {
            ...u,
            lessons: u.lessons.map((l, idx) => 
              idx === lessonIndex ? { ...l, ...updates } : l
            ),
          }
        : u
    ));
  };

  const handleDeleteLesson = (unitId, lessonIndex) => {
    setUnits(units.map(u => 
      u.id === unitId
        ? { ...u, lessons: u.lessons.filter((_, idx) => idx !== lessonIndex) }
        : u
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Save to syllabus table
      const { data, error: saveError } = await supabase
        .from('syllabi')
        .insert({
          family_id: familyId,
          child_id: childId,
          subject_id: subjectId,
          course_title: scannedData?.title || 'Scanned Course',
          course_outline: JSON.stringify({ units }),
          course_outline_raw: scannedData?.rawText || '',
        })
        .select()
        .single();

      if (saveError) throw saveError;

      if (onComplete) {
        onComplete(data);
      }
      onClose();
    } catch (err) {
      console.error('[SyllabusScanner] Error saving:', err);
      setError(err.message || 'Failed to save syllabus');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Scan size={20} color={colors.accent || '#3b82f6'} />
              <Text style={styles.title}>Syllabus Scanner & Unit Builder</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {step === 'upload' && (
            <View style={styles.uploadStep}>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleFileSelect}
              >
                <Upload size={32} color={colors.accent || '#3b82f6'} />
                <Text style={styles.uploadButtonText}>Select PDF or Document</Text>
                <Text style={styles.uploadHint}>
                  Supports PDF, DOC, DOCX, and TXT files
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'scanning' && (
            <View style={styles.scanningStep}>
              <ActivityIndicator size="large" color={colors.accent || '#3b82f6'} />
              <Text style={styles.scanningText}>Scanning syllabus...</Text>
              <Text style={styles.scanningSubtext}>
                Extracting units, lessons, and structure
              </Text>
            </View>
          )}

          {step === 'review' && (
            <View style={styles.reviewStep}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewTitle}>Review & Edit Units</Text>
                <TouchableOpacity
                  style={styles.addUnitButton}
                  onPress={handleAddUnit}
                >
                  <Plus size={16} color={colors.accent || '#3b82f6'} />
                  <Text style={styles.addUnitText}>Add Unit</Text>
                </TouchableOpacity>
              </View>

              {error && (
                <View style={styles.errorContainer}>
                  <AlertCircle size={16} color={colors.redBold || '#dc2626'} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <ScrollView style={styles.unitsList}>
                {units.map((unit, unitIdx) => (
                  <UnitCard
                    key={unit.id || unitIdx}
                    unit={unit}
                    onUpdate={(updates) => handleUpdateUnit(unit.id || unitIdx, updates)}
                    onDelete={() => handleDeleteUnit(unit.id || unitIdx)}
                    onAddLesson={() => handleAddLesson(unit.id || unitIdx)}
                    onUpdateLesson={(lessonIdx, updates) => 
                      handleUpdateLesson(unit.id || unitIdx, lessonIdx, updates)
                    }
                    onDeleteLesson={(lessonIdx) => 
                      handleDeleteLesson(unit.id || unitIdx, lessonIdx)
                    }
                  />
                ))}

                {units.length === 0 && (
                  <View style={styles.emptyState}>
                    <FileText size={48} color={colors.muted || '#9ca3af'} />
                    <Text style={styles.emptyText}>No units found</Text>
                    <Text style={styles.emptySubtext}>
                      Add units manually or try scanning again
                    </Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                  disabled={saving}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving || units.length === 0}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Save size={16} color="#ffffff" />
                      <Text style={styles.saveText}>Save Syllabus</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function UnitCard({ unit, onUpdate, onDelete, onAddLesson, onUpdateLesson, onDeleteLesson }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(unit.title || '');
  const [estimatedDays, setEstimatedDays] = useState(unit.estimatedDays?.toString() || '0');

  const handleSave = () => {
    onUpdate({
      title,
      estimatedDays: parseInt(estimatedDays) || 0,
    });
    setIsEditing(false);
  };

  return (
    <View style={styles.unitCard}>
      <View style={styles.unitHeader}>
        {isEditing ? (
          <View style={styles.unitHeaderEdit}>
            <TextInput
              style={styles.unitTitleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Unit title"
              autoFocus
            />
            <TextInput
              style={styles.unitDaysInput}
              value={estimatedDays}
              onChangeText={setEstimatedDays}
              placeholder="Days"
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={handleSave} style={styles.saveEditButton}>
              <CheckCircle size={16} color={colors.greenBold || '#10b981'} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.unitHeaderView}>
            <GripVertical size={16} color={colors.muted || '#6b7280'} />
            <Text style={styles.unitTitle}>{unit.title || 'Untitled Unit'}</Text>
            {unit.estimatedDays > 0 && (
              <Text style={styles.unitDays}>{unit.estimatedDays} days</Text>
            )}
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editButton}>
              <Edit size={14} color={colors.muted || '#6b7280'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
              <Trash2 size={14} color={colors.redBold || '#dc2626'} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.lessonsContainer}>
        {(unit.lessons || []).map((lesson, lessonIdx) => (
          <LessonItem
            key={lessonIdx}
            lesson={lesson}
            onUpdate={(updates) => onUpdateLesson(lessonIdx, updates)}
            onDelete={() => onDeleteLesson(lessonIdx)}
          />
        ))}
        <TouchableOpacity
          style={styles.addLessonButton}
          onPress={onAddLesson}
        >
          <Plus size={14} color={colors.accent || '#3b82f6'} />
          <Text style={styles.addLessonText}>Add Lesson</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LessonItem({ lesson, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title || '');
  const [estimatedDays, setEstimatedDays] = useState(lesson.estimatedDays?.toString() || '1');

  const handleSave = () => {
    onUpdate({
      title,
      estimatedDays: parseInt(estimatedDays) || 1,
    });
    setIsEditing(false);
  };

  return (
    <View style={styles.lessonItem}>
      {isEditing ? (
        <View style={styles.lessonEdit}>
          <TextInput
            style={styles.lessonTitleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Lesson title"
            autoFocus
          />
          <TextInput
            style={styles.lessonDaysInput}
            value={estimatedDays}
            onChangeText={setEstimatedDays}
            placeholder="Days"
            keyboardType="numeric"
          />
          <TouchableOpacity onPress={handleSave} style={styles.saveEditButton}>
            <CheckCircle size={14} color={colors.greenBold || '#10b981'} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.lessonView}>
          <ArrowRight size={12} color={colors.muted || '#6b7280'} />
          <Text style={styles.lessonTitle}>{lesson.title || 'Untitled Lesson'}</Text>
          {lesson.estimatedDays > 0 && (
            <Text style={styles.lessonDays}>{lesson.estimatedDays}d</Text>
          )}
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editButton}>
            <Edit size={12} color={colors.muted || '#6b7280'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
            <Trash2 size={12} color={colors.redBold || '#dc2626'} />
          </TouchableOpacity>
        </View>
      )}
    </View>
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
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    color: colors.muted || '#6b7280',
  },
  uploadStep: {
    padding: 40,
    alignItems: 'center',
  },
  uploadButton: {
    alignItems: 'center',
    padding: 40,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginTop: 12,
  },
  uploadHint: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    marginTop: 4,
  },
  scanningStep: {
    padding: 40,
    alignItems: 'center',
  },
  scanningText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  scanningSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  reviewStep: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  addUnitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
  },
  addUnitText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    margin: 20,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.redBold || '#dc2626',
  },
  unitsList: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.muted || '#6b7280',
    textAlign: 'center',
  },
  unitCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  unitHeader: {
    marginBottom: 12,
  },
  unitHeaderView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitHeaderEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  unitTitleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: colors.text || '#111827',
  },
  unitDays: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  unitDaysInput: {
    width: 60,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: colors.text || '#111827',
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  saveEditButton: {
    padding: 4,
  },
  lessonsContainer: {
    marginLeft: 24,
    gap: 8,
  },
  lessonItem: {
    marginBottom: 4,
  },
  lessonView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lessonEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lessonTitle: {
    flex: 1,
    fontSize: 14,
    color: colors.text || '#111827',
  },
  lessonTitleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 6,
    padding: 6,
    fontSize: 14,
    color: colors.text || '#111827',
  },
  lessonDays: {
    fontSize: 11,
    color: colors.muted || '#6b7280',
  },
  lessonDaysInput: {
    width: 50,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 6,
    padding: 6,
    fontSize: 12,
    color: colors.text || '#111827',
  },
  addLessonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addLessonText: {
    fontSize: 13,
    color: colors.accent || '#3b82f6',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted || '#6b7280',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});


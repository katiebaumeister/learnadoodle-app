import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Upload, FileText, X, CheckCircle, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { processAndSaveSyllabus } from '../lib/syllabusProcessor';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

// Icon component for consistency
const Icon = ({ name, size = 16, color = '#37352f' }) => {
  const icons = {
    upload: Upload,
    fileText: FileText,
    x: X,
    checkCircle: CheckCircle,
    alertCircle: AlertCircle,
    link: LinkIcon,
  };
  
  const IconComponent = icons[name] || Upload;
  return <IconComponent size={size} color={color} />;
};

export default function SyllabusUpload({ visible, onClose, onSyllabusProcessed, child, familyId }) {
  // Upload method: 'link', 'file', or 'text' (AI processing)
  const [uploadMethod, setUploadMethod] = useState('link');
  
  // Common fields
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [syllabusTitle, setSyllabusTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expectedWeeklyMinutes, setExpectedWeeklyMinutes] = useState('');
  
  // Link method fields
  const [fileUrl, setFileUrl] = useState('');
  
  // File upload fields
  const [uploadedFileId, setUploadedFileId] = useState(null);
  
  // Text/AI processing fields
  const [courseTitle, setCourseTitle] = useState('');
  const [providerName, setProviderName] = useState('');
  const [courseOutlineRaw, setCourseOutlineRaw] = useState('');
  const [unitStart, setUnitStart] = useState('1');
  
  // Advanced options for AI processing
  const [autoPace, setAutoPace] = useState(false);
  const [teachingDays, setTeachingDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri
  const [addToCalendar, setAddToCalendar] = useState(false);
  
  // State management
  const [isProcessing, setIsProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processedOutline, setProcessedOutline] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [existingSubjects, setExistingSubjects] = useState([]); // For AI processing subject chips

  // Fetch subjects when modal opens
  useEffect(() => {
    if (visible && familyId) {
      fetchSubjects();
      if (uploadMethod === 'text') {
        fetchExistingSubjects();
      }
    }
  }, [visible, familyId, uploadMethod]);

  const fetchSubjects = async () => {
    if (!familyId) return;
    
    try {
      setLoadingSubjects(true);
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name', { ascending: true });
      
      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load subjects');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const fetchExistingSubjects = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();

      if (!profile?.family_id) return;

      const { data: subjects, error } = await supabase
        .from('subject')
        .select('id, name, grade_band, subject_category')
        .eq('family_id', profile.family_id);

      if (error) {
        return;
      }

      setExistingSubjects(subjects || []);
    } catch (error) {
    }
  };

  const handleFileUpload = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.txt';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
          setSaving(true);
          const fileName = `${familyId}/${Date.now()}_${file.name}`;
          
          // Upload to Supabase storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('evidence')
            .upload(fileName, file, {
              contentType: file.type,
              metadata: { family_id: familyId, child_id: child?.id }
            });
          
          if (uploadError) throw uploadError;
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('evidence')
            .getPublicUrl(fileName);
          
          // Create material record (replaces uploads table)
          const { createFileMaterial } = await import('../lib/services/materialsClient');
          const uploadRecord = await createFileMaterial({
            familyId,
            storagePath: fileName,
            title: file.name,
            mime: file.type,
            bytes: file.size,
            childId: child?.id || null,
            subjectId: selectedSubjectId || null,
            tags: ['role:syllabus'],
            url: urlData.publicUrl,
          });
          
          if (!uploadRecord || !uploadRecord.id) {
            throw new Error('Failed to create material record');
          }
          
          setUploadedFileId(uploadRecord.id);
          Alert.alert('File Uploaded', 'File uploaded successfully! Fill in the form and click Save.');
        } catch (error) {
          Alert.alert('Error', 'Failed to upload file: ' + error.message);
        } finally {
          setSaving(false);
        }
      };
      input.click();
    } else {
      Alert.alert('File Upload', 'File upload is currently only supported on web. Please use a link instead.');
    }
  };

  const createSyllabusRecord = async () => {
    if (!selectedSubjectId || !syllabusTitle.trim()) {
      Alert.alert('Missing Information', 'Please select a subject and enter a title.');
      return;
    }

    try {
      setSaving(true);
      
      let finalUploadId = uploadedFileId;
      
      // If using link method and no upload yet, create a material record
      if (!finalUploadId && uploadMethod === 'link' && fileUrl.trim()) {
        const { createMaterial } = await import('../lib/services/materialsClient');
        const linkMaterial = await createMaterial({
          familyId,
          title: fileUrl,
          type: 'other',
          url: fileUrl,
          subjectId: selectedSubjectId,
          tags: ['role:syllabus'],
        });
        
        if (!linkMaterial || !linkMaterial.id) {
          throw new Error('Failed to create material record for link');
        }
        finalUploadId = linkMaterial.id;
      }
      
      if (!finalUploadId && uploadMethod !== 'text') {
        Alert.alert('Error', 'Please upload a file or provide a link.');
        return;
      }

      // Create syllabus record
      const { error: syllabusError } = await supabase
        .from('syllabi')
        .insert({
          family_id: familyId,
          child_id: child?.id || null,
          subject_id: selectedSubjectId,
          upload_id: finalUploadId || null,
          title: syllabusTitle.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          expected_weekly_minutes: expectedWeeklyMinutes ? parseInt(expectedWeeklyMinutes) : null
        });
      
      if (syllabusError) throw syllabusError;
      
      Alert.alert('Success', 'Syllabus added successfully!');
      
      if (onSyllabusProcessed) {
        onSyllabusProcessed({ success: true });
      }
      
      resetForm();
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to create syllabus: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const processSyllabusWithAI = async () => {
    if (!courseTitle.trim() || !providerName.trim() || !courseOutlineRaw.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }
    
    if (existingSubjects.length === 0) {
      Alert.alert('No Subjects Available', 'Please add subjects to your family before uploading a syllabus.');
      return;
    }

    setIsProcessing(true);
    
    try {
      const options = {
        autoPace,
        startDate: startDate ? new Date(startDate).toISOString().split('T')[0] : null,
        endDate: endDate ? new Date(endDate).toISOString().split('T')[0] : null,
        teachingDays,
        addToCalendar: autoPace && addToCalendar,
      };

      const result = await processAndSaveSyllabus(courseTitle, providerName, courseOutlineRaw, options);
      
      setProcessedOutline(result);
      
      if (onSyllabusProcessed) {
        onSyllabusProcessed(result);
      }
      
      Alert.alert('Success', 'Syllabus processed successfully!');
      resetForm();
      setTimeout(() => {
        onClose();
      }, 1000);
} catch (error) {
      Alert.alert('Error', 'Failed to process syllabus. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (uploadMethod === 'text') {
      await processSyllabusWithAI();
    } else {
      await createSyllabusRecord();
    }
  };

  const resetForm = () => {
    setUploadMethod('link');
    setSelectedSubjectId('');
    setSyllabusTitle('');
    setStartDate('');
    setEndDate('');
    setExpectedWeeklyMinutes('');
    setFileUrl('');
    setUploadedFileId(null);
    setCourseTitle('');
    setProviderName('');
    setCourseOutlineRaw('');
    setUnitStart('1');
    setAutoPace(false);
    setTeachingDays([1, 2, 3, 4, 5]);
    setAddToCalendar(false);
    setProcessedOutline(null);
  };

  const renderUploadMethod = () => (
    <View style={styles.uploadMethodContainer}>
      <Text style={styles.sectionTitle}>Source</Text>
      <View style={styles.methodButtons}>
        <TouchableOpacity
          style={[
            styles.methodButton,
            uploadMethod === 'link' && styles.activeMethodButton
          ]}
          onPress={() => setUploadMethod('link')}
        >
          <Icon name="link" size={16} />
          <Text style={[
            styles.methodButtonText,
            uploadMethod === 'link' && styles.activeMethodButtonText
          ]}>
            Link
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.methodButton,
            uploadMethod === 'file' && styles.activeMethodButton
          ]}
          onPress={() => setUploadMethod('file')}
        >
          <Icon name="upload" size={16} />
          <Text style={[
            styles.methodButtonText,
            uploadMethod === 'file' && styles.activeMethodButtonText
          ]}>
            Upload File
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.methodButton,
            uploadMethod === 'text' && styles.activeMethodButton
          ]}
          onPress={() => setUploadMethod('text')}
        >
          <Icon name="fileText" size={16} />
          <Text style={[
            styles.methodButtonText,
            uploadMethod === 'text' && styles.activeMethodButtonText
          ]}>
            Paste Text
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSubjectSelection = () => {
    if (uploadMethod === 'text') {
      // For AI processing, show subject chips
      if (loadingSubjects) {
        return <ActivityIndicator size="small" color={colors.accent} />;
      }
      
      if (existingSubjects && existingSubjects.length > 0) {
        return (
          <View style={styles.chipContainer}>
            {existingSubjects.map((subject) => (
              <TouchableOpacity
                key={subject.id}
                style={[
                  styles.chip,
                  courseTitle === subject.name && styles.chipSelected
                ]}
                onPress={() => {
                  setCourseTitle(subject.name);
                  // Also set selectedSubjectId for consistency
                  const matchingSubject = subjects.find(s => s.name === subject.name);
                  if (matchingSubject) {
                    setSelectedSubjectId(matchingSubject.id);
                  }
                }}
              >
                <Text style={[
                  styles.chipText,
                  courseTitle === subject.name && styles.chipTextSelected
                ]}>
                  {subject.name} {subject.grade_band ? '(' + subject.grade_band + ')' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      }
      
      return <Text style={styles.noSubjectsText}>No subjects found. Please add subjects first.</Text>;
    } else {
      // For link/file, show dropdown list
      if (loadingSubjects) {
        return <ActivityIndicator size="small" color={colors.text} />;
      }
      
      return (
        <ScrollView style={styles.subjectList} nestedScrollEnabled>
          {subjects.map((subject) => (
            <TouchableOpacity
              key={subject.id}
              style={[
                styles.subjectOption,
                selectedSubjectId === subject.id && styles.subjectOptionSelected
              ]}
              onPress={() => setSelectedSubjectId(subject.id)}
            >
              <Text style={[
                styles.subjectOptionText,
                selectedSubjectId === subject.id && styles.subjectOptionTextSelected
              ]}>
                {subject.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
  };

  const renderLinkMethod = () => (
    <View style={styles.inputSection}>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Subject *</Text>
        {renderSubjectSelection()}
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Title *</Text>
        <TextInput
          style={styles.textInput}
          value={syllabusTitle}
          onChangeText={setSyllabusTitle}
          placeholder="e.g., Algebra I Syllabus"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>URL *</Text>
        <TextInput
          style={styles.textInput}
          value={fileUrl}
          onChangeText={setFileUrl}
          placeholder="https://example.com/syllabus.pdf"
          keyboardType="url"
          autoCapitalize="none"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Start Date (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>End Date (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Expected Weekly Minutes (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={expectedWeeklyMinutes}
          onChangeText={setExpectedWeeklyMinutes}
          placeholder="e.g., 300"
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  const renderFileMethod = () => (
    <View style={styles.inputSection}>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Subject *</Text>
        {renderSubjectSelection()}
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Title *</Text>
        <TextInput
          style={styles.textInput}
          value={syllabusTitle}
          onChangeText={setSyllabusTitle}
          placeholder="e.g., Algebra I Syllabus"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>File</Text>
        <TouchableOpacity 
          style={styles.fileUploadButton} 
          onPress={handleFileUpload}
          disabled={saving}
        >
          <Icon name="upload" size={24} />
          <Text style={styles.fileUploadText}>
            {uploadedFileId ? 'File Uploaded ✓' : 'Choose File'}
          </Text>
          <Text style={styles.fileUploadSubtext}>PDF, TXT, or DOC files supported</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Start Date (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>End Date (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Expected Weekly Minutes (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={expectedWeeklyMinutes}
          onChangeText={setExpectedWeeklyMinutes}
          placeholder="e.g., 300"
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  const renderTextMethod = () => (
    <View style={styles.inputSection}>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Course Title *</Text>
        {renderSubjectSelection()}
        {courseTitle && (
          <Text style={styles.selectedSubjectText}>
            Selected: {courseTitle}
          </Text>
        )}
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Provider Name *</Text>
        <TextInput
          style={styles.textInput}
          value={providerName}
          onChangeText={setProviderName}
          placeholder="e.g., Khan Academy, Outschool, Local School"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Unit to Start From</Text>
        <TextInput
          style={styles.textInput}
          value={unitStart}
          onChangeText={setUnitStart}
          placeholder="1"
          keyboardType="numeric"
        />
        <Text style={styles.helpText}>
          If your child is starting mid-course, specify which unit to begin with (default: 1)
        </Text>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Course Outline/Syllabus *</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={courseOutlineRaw}
          onChangeText={setCourseOutlineRaw}
          placeholder="Paste your course outline or syllabus here..."
          multiline
          numberOfLines={10}
          textAlignVertical="top"
        />
        <Text style={styles.helpText}>
          Paste the raw text from your course provider. We'll clean and format it automatically.
        </Text>
      </View>

      {/* Advanced Options - Always Visible */}
      <View style={styles.advancedSection}>
        <Text style={styles.advancedSectionTitle}>Auto-Pacing & Calendar</Text>
        
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.checkbox, autoPace && styles.checkboxChecked]}
            onPress={() => setAutoPace(!autoPace)}
          >
            {autoPace && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <Text style={styles.optionLabel}>Enable auto-pacing</Text>
        </View>

        {autoPace && (
          <>
            <View style={styles.dateRow}>
              <View style={styles.dateInput}>
                <Text style={styles.dateLabel}>Start Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={styles.dateInput}>
                <Text style={styles.dateLabel}>End Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>

            <Text style={styles.dateLabel}>Teaching Days</Text>
            <View style={styles.teachingDaysContainer}>
              {[0, 1, 2, 3, 4, 5, 6].map(day => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayButton,
                    teachingDays.includes(day) && styles.dayButtonActive
                  ]}
                  onPress={() => {
                    setTeachingDays(prev => 
                      prev.includes(day) 
                        ? prev.filter(d => d !== day)
                        : [...prev, day].sort()
                    );
                  }}
                >
                  <Text style={[
                    styles.dayButtonText,
                    teachingDays.includes(day) && styles.dayButtonTextActive
                  ]}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.checkbox, addToCalendar && styles.checkboxChecked]}
                onPress={() => setAddToCalendar(!addToCalendar)}
              >
                {addToCalendar && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
              <Text style={styles.optionLabel}>Add lessons to calendar</Text>
            </View>

            <Text style={styles.helpText}>
              When enabled, lessons will be automatically scheduled on your teaching days and added to your calendar.
            </Text>
          </>
        )}
      </View>
    </View>
  );

  const renderProcessedResult = () => {
    if (!processedOutline) return null;
    
    return (
      <View style={styles.resultSection}>
        <Text style={styles.sectionTitle}>Processed Syllabus</Text>
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Icon name="checkCircle" size={16} color="#10b981" />
            <Text style={styles.resultTitle}>Successfully Processed</Text>
          </View>
          <Text style={styles.resultText}>{processedOutline.course_title}</Text>
          <Text style={styles.resultSubtext}>{processedOutline.provider_name}</Text>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  const canSave = uploadMethod === 'text' 
    ? (courseTitle.trim() && providerName.trim() && courseOutlineRaw.trim())
    : (selectedSubjectId && syllabusTitle.trim() && (uploadMethod === 'link' ? fileUrl.trim() : uploadedFileId));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Syllabus</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => { resetForm(); onClose(); }}>
              <Icon name="x" size={20} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {renderUploadMethod()}
            
            {uploadMethod === 'link' && renderLinkMethod()}
            {uploadMethod === 'file' && renderFileMethod()}
            {uploadMethod === 'text' && renderTextMethod()}
            
            {renderProcessedResult()}
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => { resetForm(); onClose(); }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.saveButton, (!canSave || isProcessing || saving) && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!canSave || isProcessing || saving}
              >
                {isProcessing || saving ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.saveButtonText}>
                      {uploadMethod === 'text' ? 'Processing with AI...' : 'Saving...'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.saveButtonText}>
                    {uploadMethod === 'text' ? 'Process Syllabus' : 'Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#37352f',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  uploadMethodContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 16,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flex: 1,
  },
  activeMethodButton: {
    borderColor: '#38B6FF',
    backgroundColor: '#f0f8ff',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
  },
  activeMethodButtonText: {
    color: '#38B6FF',
  },
  inputSection: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#37352f',
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 12,
    color: '#787774',
    marginTop: 4,
  },
  subjectList: {
    maxHeight: 150,
  },
  subjectOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  subjectOptionSelected: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  subjectOptionText: {
    fontSize: 14,
    color: '#37352f',
  },
  subjectOptionTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  fileUploadButton: {
    borderWidth: 2,
    borderColor: '#e1e1e1',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  fileUploadText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#37352f',
    marginTop: 8,
  },
  fileUploadSubtext: {
    fontSize: 12,
    color: '#787774',
    marginTop: 4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipSelected: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  chipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  noSubjectsText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  selectedSubjectText: {
    fontSize: 14,
    color: '#38B6FF',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  advancedSection: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  advancedSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  checkboxChecked: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  checkmark: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  optionLabel: {
    fontSize: 16,
    color: '#333',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  dateInput: {
    flex: 1,
    marginRight: 10,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  teachingDaysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: 'white',
  },
  dayButtonActive: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  dayButtonTextActive: {
    color: 'white',
  },
  resultSection: {
    marginBottom: 24,
  },
  resultCard: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10b981',
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
  },
  resultSubtext: {
    fontSize: 14,
    color: '#787774',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#38B6FF',
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#a0a0a0',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
});

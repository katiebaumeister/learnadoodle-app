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
} from 'react-native';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { processAndSaveSyllabus } from '../lib/syllabusProcessor';
import { supabase } from '../lib/supabase';

// Icon component for consistency
const Icon = ({ name, size = 16, color = '#37352f' }) => {
  const icons = {
    upload: Upload,
    fileText: FileText,
    x: X,
    checkCircle: CheckCircle,
    alertCircle: AlertCircle,
  };
  
  const IconComponent = icons[name] || Upload;
  return <IconComponent size={size} color={color} />;
};

export default function SyllabusUpload({ visible, onClose, onSyllabusProcessed }) {
  const [courseTitle, setCourseTitle] = useState('');
  const [providerName, setProviderName] = useState('');
  const [courseOutlineRaw, setCourseOutlineRaw] = useState('');
  const [unitStart, setUnitStart] = useState('1'); // Unit to start from
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedOutline, setProcessedOutline] = useState(null);
  const [uploadMethod, setUploadMethod] = useState('text'); // 'text' or 'file'
  const [existingSubjects, setExistingSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  
  // Advanced options for auto-pacing and calendar integration
  const [autoPace, setAutoPace] = useState(false);
  const [startDate, setStartDate] = useState('2025-08-01');
  const [endDate, setEndDate] = useState('2026-06-30');
  const [teachingDays, setTeachingDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri
  const [addToCalendar, setAddToCalendar] = useState(false);

  // Fetch existing subjects when component mounts
  useEffect(() => {
    if (visible) {
      fetchExistingSubjects();
    }
  }, [visible]);

  // Debug logging for render state changes
  useEffect(() => {
    console.log('Course title section state changed:', { 
      loadingSubjects, 
      existingSubjects: existingSubjects?.length, 
      courseTitle 
    });
  }, [loadingSubjects, existingSubjects, courseTitle]);

  const fetchExistingSubjects = async () => {
    try {
      setLoadingSubjects(true);
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
        console.error('Error fetching subjects:', error);
        return;
      }

      console.log('Fetched subjects:', subjects);
      setExistingSubjects(subjects || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  // Sanitize syllabus text (similar to your Python sanitize_syllabus function)
  const sanitizeSyllabus = (text) => {
    // Step 1: Split into lines and strip leading/trailing whitespace
    let lines = text.split('\n').map(line => line.trim());
    
    // Step 2: Replace tabs with spaces
    lines = lines.map(line => line.replace(/\t/g, ' '));
    
    // Step 3: Filter out empty lines and platform tags
    lines = lines.filter(line => {
      // Remove empty lines
      if (!line || line.trim() === '') return false;
      
      // Remove common platform tags
      const platformTags = [
        /unit mastery:\s*\d+%/i,
        /progress:\s*\d+%/i,
        /completion:\s*\d+%/i,
        /score:\s*\d+%/i,
        /grade:\s*[a-f]/i,
      ];
      
      return !platformTags.some(tag => tag.test(line));
    });
    
    // Step 4: Join lines with \n
    let singleLine = lines.join('\n');
    
    // Step 5: Escape double quotes
    singleLine = singleLine.replace(/"/g, '\\"');
    
    return singleLine;
  };

  // Process syllabus with AI using the service
  const processSyllabusWithAI = async (courseTitle, providerName, rawText) => {
    try {
      const options = {
        autoPace,
        startDate: startDate ? new Date(startDate).toISOString().split('T')[0] : null,
        endDate: endDate ? new Date(endDate).toISOString().split('T')[0] : null,
        teachingDays,
        addToCalendar: autoPace && addToCalendar,
      };

      console.log('Upload options being sent:', options);
      
      const result = await processAndSaveSyllabus(courseTitle, providerName, rawText, options);
      return result;
    } catch (error) {
      console.error('Error processing syllabus:', error);
      throw error;
    }
  };

  const handleUpload = async () => {
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
      const result = await processSyllabusWithAI(courseTitle, providerName, courseOutlineRaw);
      
      setProcessedOutline(result);
      
      // Call the callback to save the processed syllabus
      if (onSyllabusProcessed) {
        onSyllabusProcessed(result);
      }
      
      Alert.alert('Success', 'Syllabus processed successfully!');
      
    } catch (error) {
      console.error('Error processing syllabus:', error);
      Alert.alert('Error', 'Failed to process syllabus. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = () => {
    // In a real implementation, this would handle file picker
    Alert.alert('File Upload', 'File upload functionality would be implemented here.');
  };

  const resetForm = () => {
    setCourseTitle('');
    setProviderName('');
    setCourseOutlineRaw('');
    setUnitStart('1');
    setProcessedOutline(null);
    setUploadMethod('text');
  };

  const renderUploadMethod = () => (
    <View style={styles.uploadMethodContainer}>
      <Text style={styles.sectionTitle}>Upload Method</Text>
      <View style={styles.methodButtons}>
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
      </View>
    </View>
  );

  const renderTextInput = () => (
    <View style={styles.inputSection}>
      <Text style={styles.sectionTitle}>Course Information</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Course Title *</Text>
        {(() => {
          if (loadingSubjects) {
            return <ActivityIndicator size="small" color="#007AFF" />;
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
                    onPress={() => setCourseTitle(subject.name)}
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
        })()}
        
        {courseTitle ? (
          <Text style={styles.selectedSubjectText}>
            Selected: {courseTitle}
          </Text>
        ) : null}
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
        
        {/* Auto-pacing toggle */}
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
            {/* Date selection */}
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

            {/* Teaching days */}
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

              {/* Calendar integration */}
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

  const renderFileUpload = () => (
    <View style={styles.inputSection}>
      <Text style={styles.sectionTitle}>Upload File</Text>
      
      <View style={styles.fileUploadArea}>
        <TouchableOpacity style={styles.fileUploadButton} onPress={handleFileUpload}>
          <Icon name="upload" size={24} />
          <Text style={styles.fileUploadText}>Choose File</Text>
          <Text style={styles.fileUploadSubtext}>PDF, TXT, or DOC files supported</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Course Title *</Text>
        <TextInput
          style={styles.textInput}
          value={courseTitle}
          onChangeText={setCourseTitle}
          placeholder="e.g., Algebra 1, World History, Biology"
        />
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
          {processedOutline.unit_start && (
            <Text style={styles.resultSubtext}>Starting from Unit {processedOutline.unit_start}</Text>
          )}
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Preview:</Text>
            <Text style={styles.previewText} numberOfLines={5}>
              {processedOutline.course_outline}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Upload Course Syllabus</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Icon name="x" size={20} />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {renderUploadMethod()}
          
          {uploadMethod === 'text' ? renderTextInput() : renderFileUpload()}
          
          {renderProcessedResult()}
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.resetButton} onPress={resetForm}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.processButton, isProcessing && styles.disabledButton]}
              onPress={handleUpload}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.processButtonText}>Processing with AI...</Text>
                </>
              ) : (
                <>
                  <Icon name="fileText" size={16} color="#ffffff" />
                  <Text style={styles.processButtonText}>Process Syllabus</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    width: '90%',
    maxWidth: 800,
    maxHeight: '85%',
    minHeight: 400,
    backgroundColor: '#ffffff',
    borderRadius: 12,
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
    paddingBottom: 24,
  },
  uploadMethodContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 12,
    color: '#787774',
    marginTop: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  fileUploadArea: {
    marginBottom: 20,
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  fileUploadSubtext: {
    fontSize: 12,
    color: '#787774',
    marginTop: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resultSubtext: {
    fontSize: 14,
    color: '#787774',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  previewSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  previewText: {
    fontSize: 12,
    color: '#787774',
    lineHeight: 16,
    fontFamily: 'monospace',
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  processButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#38B6FF',
    borderRadius: 6,
  },
  disabledButton: {
    backgroundColor: '#a0a0a0',
  },
  processButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  
  // Advanced options styles
  advancedToggleContainer: {
    marginBottom: 15,
  },
  advancedToggle: {
    padding: 15,
    backgroundColor: '#e8f4fd',
    borderRadius: 10,
    marginBottom: 5,
  },
  advancedToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066cc',
    textAlign: 'center',
  },
  advancedToggleHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
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
    backgroundColor: '#0066cc',
    borderColor: '#0066cc',
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
    backgroundColor: '#0066cc',
    borderColor: '#0066cc',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  dayButtonTextActive: {
    color: 'white',
  },
  
  // Chip selection styles
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
}); 
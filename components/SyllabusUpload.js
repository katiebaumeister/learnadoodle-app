import React, { useState } from 'react';
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
  const processSyllabusWithAI = async (courseTitle, providerName, rawText, unitStart) => {
    try {
      const result = await processAndSaveSyllabus(courseTitle, providerName, rawText, parseInt(unitStart) || 1);
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

    setIsProcessing(true);
    
    try {
      const result = await processSyllabusWithAI(courseTitle, providerName, courseOutlineRaw, unitStart);
      
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
}); 
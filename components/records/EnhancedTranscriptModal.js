/**
 * Enhanced Transcript Modal
 * Generate transcripts with weighted/unweighted GPA, course rigor notes, and syllabus attachments
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator, TextInput } from 'react-native';
import { X, FileText, Download, GraduationCap, Settings, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function EnhancedTranscriptModal({
  visible,
  childId,
  childName,
  dateRange,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [gpaType, setGpaType] = useState('unweighted'); // 'weighted' or 'unweighted'
  const [includeRigor, setIncludeRigor] = useState(true);
  const [includeSyllabi, setIncludeSyllabi] = useState(true);
  const [transcriptSettings, setTranscriptSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      loadTranscriptSettings();
    }
  }, [visible, childId]);

  const loadTranscriptSettings = async () => {
    if (!childId) return;

    try {
      const { data, error } = await supabase
        .from('transcript_settings')
        .select('*')
        .eq('child_id', childId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading transcript settings:', error);
      }

      if (data) {
        setTranscriptSettings(data);
        setGpaType(data.default_gpa_type || 'unweighted');
        setIncludeRigor(data.include_course_rigor !== false);
        setIncludeSyllabi(data.include_syllabi !== false);
      }
    } catch (error) {
      console.error('Error loading transcript settings:', error);
    }
  };

  const saveSettings = async () => {
    if (!childId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('transcript_settings')
        .upsert({
          child_id: childId,
          default_gpa_type: gpaType,
          include_course_rigor: includeRigor,
          include_syllabi: includeSyllabi,
        }, {
          onConflict: 'child_id',
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!childId) {
      setError('Child ID is required');
      return;
    }

    const startDate = dateRange?.start?.toISOString().split('T')[0] || '';
    const endDate = dateRange?.end?.toISOString().split('T')[0] || '';

    if (!startDate || !endDate) {
      setError('Please select a valid date range');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      // Save settings first
      await saveSettings();

      // Generate enhanced transcript
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      const response = await fetch(
        `${apiBase}/api/records/generate_transcript_enhanced?child_id=${encodeURIComponent(childId)}&range_start=${startDate}&range_end=${endDate}&gpa_type=${gpaType}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = `transcript_enhanced_${childName || 'student'}_${startDate}_${endDate}.csv`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      console.error('Error generating transcript:', err);
      setError(err.message || 'Failed to generate transcript');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Enhanced Transcript</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* GPA Type Selector */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Award size={20} color={colors.indigo} />
              <Text style={styles.sectionTitle}>GPA Calculation</Text>
            </View>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optionButton, gpaType === 'unweighted' && styles.optionButtonActive]}
                onPress={() => setGpaType('unweighted')}
              >
                <Text style={[styles.optionText, gpaType === 'unweighted' && styles.optionTextActive]}>
                  Unweighted
                </Text>
                <Text style={styles.optionSubtext}>Standard 4.0 scale</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionButton, gpaType === 'weighted' && styles.optionButtonActive]}
                onPress={() => setGpaType('weighted')}
              >
                <Text style={[styles.optionText, gpaType === 'weighted' && styles.optionTextActive]}>
                  Weighted
                </Text>
                <Text style={styles.optionSubtext}>Honors/AP courses weighted</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Include Options */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Settings size={20} color={colors.indigo} />
              <Text style={styles.sectionTitle}>Transcript Options</Text>
            </View>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setIncludeRigor(!includeRigor)}
            >
              <View style={[styles.checkbox, includeRigor && styles.checkboxChecked]}>
                {includeRigor && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.checkboxContent}>
                <Text style={styles.checkboxLabel}>Include Course Rigor Notes</Text>
                <Text style={styles.checkboxDescription}>
                  Show notes about course difficulty and rigor
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setIncludeSyllabi(!includeSyllabi)}
            >
              <View style={[styles.checkbox, includeSyllabi && styles.checkboxChecked]}>
                {includeSyllabi && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.checkboxContent}>
                <Text style={styles.checkboxLabel}>Include Syllabus Attachments</Text>
                <Text style={styles.checkboxDescription}>
                  Link to attached syllabi for each course
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Preview Info */}
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Transcript will include:</Text>
            <View style={styles.previewList}>
              <Text style={styles.previewItem}>• All grades and credits</Text>
              <Text style={styles.previewItem}>
                • {gpaType === 'weighted' ? 'Weighted' : 'Unweighted'} GPA calculation
              </Text>
              {includeRigor && <Text style={styles.previewItem}>• Course rigor notes</Text>}
              {includeSyllabi && <Text style={styles.previewItem}>• Syllabus attachments</Text>}
              <Text style={styles.previewItem}>• Attendance summary</Text>
              <Text style={styles.previewItem}>• Date range: {dateRange?.start?.toISOString().split('T')[0]} to {dateRange?.end?.toISOString().split('T')[0]}</Text>
            </View>
          </View>

          {/* Generate Button */}
          <TouchableOpacity
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.generateButtonText}>Generating...</Text>
              </>
            ) : (
              <>
                <Download size={18} color={colors.white} />
                <Text style={styles.generateButtonText}>Generate Enhanced Transcript</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  errorContainer: {
    backgroundColor: colors.error + '20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  optionTextActive: {
    color: colors.white,
  },
  optionSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  checkmark: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxContent: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  checkboxDescription: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  previewSection: {
    backgroundColor: colors.panel,
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  previewList: {
    gap: 4,
  },
  previewItem: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    paddingVertical: 14,
    borderRadius: 8,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});


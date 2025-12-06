/**
 * Attendance Reports Modal
 * Generate formatted attendance reports (PDF, CSV)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import { X, FileText, Download, Calendar } from 'lucide-react';
import { generateAttendanceReport } from '../../lib/services/attendanceClient';
import { colors } from '../../theme/colors';

export default function AttendanceReportsModal({
  visible,
  childId,
  childName,
  dateRange,
  onClose,
}) {
  const [reportType, setReportType] = useState('monthly'); // 'daily', 'weekly', 'monthly', 'yearly', 'custom'
  const [format, setFormat] = useState('pdf'); // 'pdf', 'csv'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const getDateRange = () => {
    const today = new Date();
    let start, end;

    switch (reportType) {
      case 'daily':
        start = today.toISOString().split('T')[0];
        end = today.toISOString().split('T')[0];
        break;
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        start = weekStart.toISOString().split('T')[0];
        end = today.toISOString().split('T')[0];
        break;
      case 'monthly':
        start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        end = today.toISOString().split('T')[0];
        break;
      case 'yearly':
        start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
        end = today.toISOString().split('T')[0];
        break;
      case 'custom':
        start = customStartDate || dateRange?.start?.toISOString().split('T')[0] || '';
        end = customEndDate || dateRange?.end?.toISOString().split('T')[0] || '';
        break;
      default:
        start = dateRange?.start?.toISOString().split('T')[0] || '';
        end = dateRange?.end?.toISOString().split('T')[0] || '';
    }

    return { start, end };
  };

  const handleGenerate = async () => {
    if (!childId) {
      setError('Child ID is required');
      return;
    }

    const { start, end } = getDateRange();
    if (!start || !end) {
      setError('Please select a valid date range');
      return;
    }

    if (reportType === 'custom' && (!customStartDate || !customEndDate)) {
      setError('Please enter both start and end dates for custom range');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const blob = await generateAttendanceReport({
        child_id: childId,
        report_type: reportType,
        date_range_start: start,
        date_range_end: end,
        format: format,
      });

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = `attendance_report_${childName || 'student'}_${start}_${end}.${format}`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err.message || 'Failed to generate report');
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
          <Text style={styles.title}>Generate Attendance Report</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Report Type Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Report Period</Text>
            <View style={styles.typeGrid}>
              {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeCard,
                    reportType === type && styles.typeCardActive,
                  ]}
                  onPress={() => setReportType(type)}
                >
                  <Calendar size={20} color={reportType === type ? colors.white : colors.textSecondary} />
                  <Text
                    style={[
                      styles.typeCardText,
                      reportType === type && styles.typeCardTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Custom Date Range */}
          {reportType === 'custom' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Custom Date Range</Text>
              <View style={styles.dateInputs}>
                <View style={styles.dateInput}>
                  <Text style={styles.dateLabel}>Start Date</Text>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    style={styles.datePicker}
                  />
                </View>
                <View style={styles.dateInput}>
                  <Text style={styles.dateLabel}>End Date</Text>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    style={styles.datePicker}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Format Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Format</Text>
            <View style={styles.formatSelector}>
              {['pdf', 'csv'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.formatButton,
                    format === f && styles.formatButtonActive,
                  ]}
                  onPress={() => setFormat(f)}
                >
                  <FileText size={18} color={format === f ? colors.white : colors.textSecondary} />
                  <Text
                    style={[
                      styles.formatButtonText,
                      format === f && styles.formatButtonTextActive,
                    ]}
                  >
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Preview */}
          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>Report will include:</Text>
            <View style={styles.previewList}>
              <Text style={styles.previewItem}>• Attendance summary (total days, hours, minutes)</Text>
              <Text style={styles.previewItem}>• Event-based attendance records</Text>
              <Text style={styles.previewItem}>• Manual attendance records</Text>
              <Text style={styles.previewItem}>• Check-in/out records</Text>
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
                <Text style={styles.generateButtonText}>Generate Report</Text>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    flex: 1,
    minWidth: '30%',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  typeCardActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  typeCardText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  typeCardTextActive: {
    color: colors.white,
  },
  dateInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  datePicker: {
    width: '100%',
    padding: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    fontSize: 16,
    color: colors.text,
  },
  formatSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formatButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  formatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  formatButtonTextActive: {
    color: colors.white,
  },
  previewSection: {
    backgroundColor: colors.panel,
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  previewLabel: {
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


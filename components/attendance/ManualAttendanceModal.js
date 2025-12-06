/**
 * Manual Attendance Modal
 * For adding day/hour-based attendance records (independent of events)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Platform } from 'react-native';
import { X, Save, Calendar, Clock } from 'lucide-react';
import { addManualAttendance } from '../../lib/services/attendanceClient';
import { colors } from '../../theme/colors';

export default function ManualAttendanceModal({
  visible,
  childId,
  defaultDate,
  onClose,
  onSaved,
}) {
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [attendanceType, setAttendanceType] = useState('hours'); // 'day', 'hours', 'minutes'
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('present');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setDate(defaultDate || new Date().toISOString().split('T')[0]);
      setValue('');
      setNote('');
      setStatus('present');
      setAttendanceType('hours');
      setError(null);
    }
  }, [visible, defaultDate]);

  const handleSave = async () => {
    if (!childId) {
      setError('Child ID is required');
      return;
    }

    if (!date) {
      setError('Please select a date');
      return;
    }

    const valueNum = parseFloat(value);
    if (isNaN(valueNum) || valueNum < 0) {
      setError(`Please enter a valid ${attendanceType === 'day' ? 'number of days' : attendanceType === 'hours' ? 'number of hours' : 'number of minutes'}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await addManualAttendance({
        child_id: childId,
        day_date: date,
        attendance_type: attendanceType,
        value: valueNum,
        status: status,
        note: note.trim() || null,
      });

      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (err) {
      console.error('Error saving manual attendance:', err);
      setError(err.message || 'Failed to save attendance record');
    } finally {
      setLoading(false);
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
          <Text style={styles.title}>Manual Attendance</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Date Input */}
          <View style={styles.field}>
            <Text style={styles.label}>
              <Calendar size={16} color={colors.textSecondary} /> Date
            </Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Attendance Type Selector */}
          <View style={styles.field}>
            <Text style={styles.label}>Tracking Method</Text>
            <View style={styles.typeSelector}>
              {['day', 'hours', 'minutes'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    attendanceType === type && styles.typeButtonActive,
                  ]}
                  onPress={() => {
                    setAttendanceType(type);
                    setValue('');
                  }}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      attendanceType === type && styles.typeButtonTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Value Input */}
          <View style={styles.field}>
            <Text style={styles.label}>
              {attendanceType === 'day'
                ? 'Number of Days'
                : attendanceType === 'hours'
                ? 'Number of Hours'
                : 'Number of Minutes'}
            </Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={`Enter ${attendanceType === 'day' ? 'days' : attendanceType === 'hours' ? 'hours' : 'minutes'}`}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          {/* Status Selector */}
          <View style={styles.field}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusSelector}>
              {['present', 'partial', 'absent'].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusButton,
                    status === s && styles.statusButtonActive,
                  ]}
                  onPress={() => setStatus(s)}
                >
                  <Text
                    style={[
                      styles.statusButtonText,
                      status === s && styles.statusButtonTextActive,
                    ]}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Note Input */}
          <View style={styles.field}>
            <Text style={styles.label}>Note (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note about this attendance record..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <Text style={styles.saveButtonText}>Saving...</Text>
            ) : (
              <>
                <Save size={18} color={colors.white} />
                <Text style={styles.saveButtonText}>Save Attendance</Text>
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
    backgroundColor: colors.bg || '#ffffff',
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
    backgroundColor: colors.redSoft || '#fde2e4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: colors.redBold || '#e2556a',
    fontSize: 14,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text || '#111827',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.indigoBold || colors.accent,
    borderColor: colors.indigoBold || colors.accent,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  statusSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: colors.greenBold,
    borderColor: colors.greenBold,
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  statusButtonTextActive: {
    color: '#ffffff',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigoBold || colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});


/**
 * Attendance Log Editor Modal
 * Modal for creating and editing attendance logs
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Platform } from 'react-native';
import { X, Save, Calendar, Clock } from 'lucide-react';
import { createAttendanceLog, updateAttendanceLog } from '../../lib/services/recordsClient';
import { colors } from '../../theme/colors';

export default function AttendanceLogEditorModal({
  isOpen,
  mode, // 'create' | 'edit'
  initialLog, // null or existing log object
  familyId,
  defaultDate, // date string
  defaultChildId,
  children = [],
  subjects = [],
  onClose,
  onSaved,
}) {
  const [childId, setChildId] = useState(defaultChildId || null);
  const [date, setDate] = useState(defaultDate || '');
  const [minutes, setMinutes] = useState('');
  const [subjectsInput, setSubjectsInput] = useState(''); // comma-separated string
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('present');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize state from initialLog if editing
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialLog) {
        setChildId(initialLog.child_id || defaultChildId);
        setDate(initialLog.day_date || initialLog.date || defaultDate || '');
        setMinutes(String(initialLog.minutes || 0));
        // Handle subjects - could be array or string
        const subjectsArray = Array.isArray(initialLog.subjects) 
          ? initialLog.subjects 
          : (initialLog.subjects ? [initialLog.subjects] : []);
        setSubjectsInput(subjectsArray.join(', '));
        setNotes(initialLog.note || initialLog.notes || '');
        setStatus(initialLog.status || 'present');
      } else {
        // Create mode - use defaults
        setChildId(defaultChildId || null);
        setDate(defaultDate || new Date().toISOString().split('T')[0]);
        setMinutes('');
        setSubjectsInput('');
        setNotes('');
        setStatus('present');
      }
      setError(null);
    }
  }, [isOpen, mode, initialLog, defaultDate, defaultChildId]);

  const handleSave = async () => {
    if (!childId) {
      setError('Please select a child');
      return;
    }
    
    if (!date) {
      setError('Please select a date');
      return;
    }

    const minutesNum = Number(minutes) || 0;
    if (minutesNum < 0) {
      setError('Minutes must be a positive number');
      return;
    }

    setLoading(true);
    setError(null);

    // Normalize subjects from comma-separated string
    const subjectsArray = subjectsInput
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const payload = {
      family_id: familyId,
      child_id: childId,
      day_date: date,
      minutes: minutesNum,
      note: notes.trim() || null,
      status: status,
    };

    // Add subjects if provided (as JSON array or comma-separated in note)
    if (subjectsArray.length > 0) {
      // Store subjects in note field as JSON or append to note
      if (payload.note) {
        payload.note = `${payload.note}\n\nSubjects: ${subjectsArray.join(', ')}`;
      } else {
        payload.note = `Subjects: ${subjectsArray.join(', ')}`;
      }
    }

    try {
      const result = mode === 'edit' && initialLog
        ? await updateAttendanceLog(initialLog.id, payload)
        : await createAttendanceLog(payload);

      if (result.error) {
        setError(result.error.message || 'Unable to save attendance log');
      } else {
        if (onSaved) onSaved(result.data);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'An error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const statusOptions = [
    { value: 'present', label: 'Present' },
    { value: 'partial', label: 'Partial' },
    { value: 'absent', label: 'Absent' },
    { value: 'excused', label: 'Excused' },
  ];

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'edit' ? 'Edit Attendance Log' : 'New Attendance Log'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Child selector */}
            {children.length > 1 && (
              <View style={styles.field}>
                <Text style={styles.label}>Child</Text>
                <View style={styles.childChips}>
                  {children.map(child => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childChip,
                        childId === child.id && styles.childChipActive
                      ]}
                      onPress={() => setChildId(child.id)}
                    >
                      <Text style={[
                        styles.childChipText,
                        childId === child.id && styles.childChipTextActive
                      ]}>
                        {child.first_name || child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Date picker */}
            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${colors.border}`,
                    fontSize: '14px',
                    backgroundColor: colors.panel,
                    color: colors.text,
                  }}
                />
              ) : (
                <TextInput
                  style={styles.input}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              )}
            </View>

            {/* Minutes input */}
            <View style={styles.field}>
              <Text style={styles.label}>Minutes</Text>
              <View style={styles.inputWithIcon}>
                <Clock size={16} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={minutes}
                  onChangeText={setMinutes}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Status dropdown */}
            <View style={styles.field}>
              <Text style={styles.label}>Status</Text>
              {Platform.OS === 'web' ? (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${colors.border}`,
                    fontSize: '14px',
                    backgroundColor: colors.panel,
                    color: colors.text,
                  }}
                >
                  {statusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <View style={styles.statusChips}>
                  {statusOptions.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.statusChip,
                        status === opt.value && styles.statusChipActive
                      ]}
                      onPress={() => setStatus(opt.value)}
                    >
                      <Text style={[
                        styles.statusChipText,
                        status === opt.value && styles.statusChipTextActive
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Subjects input */}
            <View style={styles.field}>
              <Text style={styles.label}>Subjects (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={subjectsInput}
                onChangeText={setSubjectsInput}
                placeholder="Math, Reading, Science"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Notes textarea */}
            <View style={styles.field}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes about this attendance log"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              <Save size={14} color={colors.white} />
              <Text style={styles.saveButtonText}>
                {loading ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    padding: 16,
    maxHeight: 500,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: colors.orangeSoft,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: colors.orange,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.panel,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.panel,
  },
  inputIcon: {
    marginLeft: 10,
    marginRight: 4,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childChipText: {
    fontSize: 13,
    color: colors.text,
  },
  childChipTextActive: {
    color: colors.white,
  },
  statusChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  statusChipText: {
    fontSize: 13,
    color: colors.text,
  },
  statusChipTextActive: {
    color: colors.white,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});


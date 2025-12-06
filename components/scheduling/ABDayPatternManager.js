/**
 * A/B Day Pattern Manager Component
 * Manages A/B day schedules, rotating blocks, and custom school patterns
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Calendar, Plus, X, Edit2, Trash2, RotateCcw, Settings } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function ABDayPatternManager({ familyId, yearPlanId = null, childId = null, children = [] }) {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [editingPattern, setEditingPattern] = useState(null);
  
  // Form state
  const [patternName, setPatternName] = useState('');
  const [patternType, setPatternType] = useState('ab_day'); // 'ab_day', 'rotating_blocks', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [abDayCycle, setAbDayCycle] = useState('2_day'); // '2_day', '3_day', '4_day', 'custom'
  const [abDayStart, setAbDayStart] = useState('A');
  const [patternDays, setPatternDays] = useState({
    Monday: null,
    Tuesday: null,
    Wednesday: null,
    Thursday: null,
    Friday: null,
    Saturday: null,
    Sunday: null,
  });

  useEffect(() => {
    if (familyId) {
      loadPatterns();
    }
  }, [familyId, yearPlanId, childId]);

  const loadPatterns = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('schedule_patterns')
        .select('*')
        .eq('family_id', familyId)
        .order('start_date', { ascending: false });

      if (yearPlanId) {
        query = query.eq('year_plan_id', yearPlanId);
      }
      
      if (childId) {
        query = query.eq('child_id', childId);
      } else {
        query = query.is('child_id', null); // Family-wide only
      }

      const { data, error } = await query;

      if (error) throw error;

      setPatterns(data || []);
    } catch (error) {
      console.error('Error loading patterns:', error);
      Alert.alert('Error', 'Failed to load A/B day patterns');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePattern = async () => {
    if (!patternName.trim() || !startDate || !endDate) {
      Alert.alert('Validation Error', 'Please fill in all required fields');
      return;
    }

    try {
      const patternData = {
        family_id: familyId,
        year_plan_id: yearPlanId,
        child_id: childId,
        pattern_type: patternType,
        pattern_name: patternName.trim(),
        start_date: startDate,
        end_date: endDate,
        pattern_days: patternDays,
        is_active: true,
        priority: 100,
      };

      if (patternType === 'ab_day') {
        patternData.ab_day_cycle = abDayCycle;
        patternData.ab_day_start = abDayStart;
        
        // Auto-generate pattern_days if not manually set
        if (!Object.values(patternDays).some(v => v !== null)) {
          const generatedDays = generateABDayPattern(startDate, abDayCycle, abDayStart);
          patternData.pattern_days = generatedDays;
        }
      }

      if (editingPattern) {
        const { error } = await supabase
          .from('schedule_patterns')
          .update(patternData)
          .eq('id', editingPattern.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('schedule_patterns')
          .insert([patternData]);

        if (error) throw error;
      }

      setShowPatternModal(false);
      resetForm();
      loadPatterns();
      
      // Refresh calendar cache
      if (familyId) {
        try {
          await supabase.rpc('refresh_calendar_days_cache', {
            _family_id: familyId,
            _from: startDate,
            _to: endDate,
          });
        } catch (err) {
          console.warn('Error refreshing calendar cache:', err);
        }
      }
    } catch (error) {
      console.error('Error saving pattern:', error);
      Alert.alert('Error', 'Failed to save pattern: ' + error.message);
    }
  };

  const generateABDayPattern = (startDateStr, cycle, startDay) => {
    const start = new Date(startDateStr);
    const days = {
      Monday: null,
      Tuesday: null,
      Wednesday: null,
      Thursday: null,
      Friday: null,
      Saturday: null,
      Sunday: null,
    };

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const cycleLength = parseInt(cycle.split('_')[0]);
    const dayLetters = ['A', 'B', 'C', 'D'].slice(0, cycleLength);
    
    // Find starting position
    let startIndex = dayLetters.indexOf(startDay);
    if (startIndex === -1) startIndex = 0;

    // Generate pattern for each day of week
    dayNames.forEach((dayName, dayIndex) => {
      // Calculate which day of cycle this is
      // For simplicity, assume Monday is day 0 of cycle
      const mondayIndex = 1; // Monday is index 1 in dayNames array
      const dayOffset = (dayIndex - mondayIndex + 7) % 7;
      const cycleDay = (dayOffset + startIndex) % cycleLength;
      days[dayName] = dayLetters[cycleDay];
    });

    return days;
  };

  const handleDeletePattern = async (patternId) => {
    Alert.alert(
      'Delete Pattern',
      'Are you sure you want to delete this pattern?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('schedule_patterns')
                .delete()
                .eq('id', patternId);

              if (error) throw error;

              loadPatterns();
            } catch (error) {
              console.error('Error deleting pattern:', error);
              Alert.alert('Error', 'Failed to delete pattern');
            }
          },
        },
      ]
    );
  };

  const handleEditPattern = (pattern) => {
    setEditingPattern(pattern);
    setPatternName(pattern.pattern_name);
    setPatternType(pattern.pattern_type);
    setStartDate(pattern.start_date);
    setEndDate(pattern.end_date);
    setPatternDays(pattern.pattern_days || {
      Monday: null,
      Tuesday: null,
      Wednesday: null,
      Thursday: null,
      Friday: null,
      Saturday: null,
      Sunday: null,
    });
    
    if (pattern.pattern_type === 'ab_day') {
      setAbDayCycle(pattern.ab_day_cycle || '2_day');
      setAbDayStart(pattern.ab_day_start || 'A');
    }
    
    setShowPatternModal(true);
  };

  const resetForm = () => {
    setEditingPattern(null);
    setPatternName('');
    setPatternType('ab_day');
    setStartDate('');
    setEndDate('');
    setAbDayCycle('2_day');
    setAbDayStart('A');
    setPatternDays({
      Monday: null,
      Tuesday: null,
      Wednesday: null,
      Thursday: null,
      Friday: null,
      Saturday: null,
      Sunday: null,
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading patterns...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Calendar size={20} color={colors.primary} />
          <Text style={styles.headerTitle}>A/B Day Patterns</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowPatternModal(true);
          }}
        >
          <Plus size={16} color={colors.card} />
          <Text style={styles.addButtonText}>Add Pattern</Text>
        </TouchableOpacity>
      </View>

      {patterns.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No A/B day patterns configured. Create one to enable rotating block schedules.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.patternsList}>
          {patterns.map((pattern) => (
            <View key={pattern.id} style={styles.patternCard}>
              <View style={styles.patternHeader}>
                <View style={styles.patternInfo}>
                  <Text style={styles.patternName}>{pattern.pattern_name}</Text>
                  <Text style={styles.patternMeta}>
                    {formatDate(pattern.start_date)} - {formatDate(pattern.end_date)}
                  </Text>
                  <Text style={styles.patternType}>
                    {pattern.pattern_type === 'ab_day' 
                      ? `A/B Day (${pattern.ab_day_cycle})`
                      : pattern.pattern_type === 'rotating_blocks'
                      ? 'Rotating Blocks'
                      : 'Custom Pattern'}
                  </Text>
                </View>
                <View style={styles.patternActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEditPattern(pattern)}
                  >
                    <Edit2 size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeletePattern(pattern.id)}
                  >
                    <Trash2 size={16} color={colors.redBold} />
                  </TouchableOpacity>
                </View>
              </View>
              
              {pattern.pattern_days && (
                <View style={styles.patternDays}>
                  {Object.entries(pattern.pattern_days).map(([day, letter]) => {
                    if (letter === null) return null;
                    return (
                      <View key={day} style={styles.dayBadge}>
                        <Text style={styles.dayBadgeText}>{day.substring(0, 3)}: {letter}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Pattern Modal */}
      <Modal
        visible={showPatternModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowPatternModal(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPattern ? 'Edit Pattern' : 'New A/B Day Pattern'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowPatternModal(false);
                  resetForm();
                }}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Pattern Name *</Text>
                <TextInput
                  style={styles.input}
                  value={patternName}
                  onChangeText={setPatternName}
                  placeholder="e.g., Fall Semester A/B Days"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Pattern Type *</Text>
                <View style={styles.typeSelector}>
                  {['ab_day', 'rotating_blocks', 'custom'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        patternType === type && styles.typeButtonActive,
                      ]}
                      onPress={() => setPatternType(type)}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          patternType === type && styles.typeButtonTextActive,
                        ]}
                      >
                        {type === 'ab_day' ? 'A/B Day' : type === 'rotating_blocks' ? 'Rotating Blocks' : 'Custom'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {patternType === 'ab_day' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Cycle Length *</Text>
                    <View style={styles.cycleSelector}>
                      {['2_day', '3_day', '4_day'].map((cycle) => (
                        <TouchableOpacity
                          key={cycle}
                          style={[
                            styles.cycleButton,
                            abDayCycle === cycle && styles.cycleButtonActive,
                          ]}
                          onPress={() => setAbDayCycle(cycle)}
                        >
                          <Text
                            style={[
                              styles.cycleButtonText,
                              abDayCycle === cycle && styles.cycleButtonTextActive,
                            ]}
                          >
                            {cycle === '2_day' ? '2-Day (A/B)' : cycle === '3_day' ? '3-Day (A/B/C)' : '4-Day (A/B/C/D)'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Start Day *</Text>
                    <View style={styles.startDaySelector}>
                      {['A', 'B', 'C', 'D'].slice(0, parseInt(abDayCycle.split('_')[0])).map((day) => (
                        <TouchableOpacity
                          key={day}
                          style={[
                            styles.startDayButton,
                            abDayStart === day && styles.startDayButtonActive,
                          ]}
                          onPress={() => setAbDayStart(day)}
                        >
                          <Text
                            style={[
                              styles.startDayButtonText,
                              abDayStart === day && styles.startDayButtonTextActive,
                            ]}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Start Date *</Text>
                <TextInput
                  style={styles.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>End Date *</Text>
                <TextInput
                  style={styles.input}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              {patternType === 'ab_day' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Day Assignments (Optional)</Text>
                  <Text style={styles.helpText}>
                    Leave blank to auto-generate based on cycle, or manually assign days
                  </Text>
                  {Object.keys(patternDays).map((day) => {
                    const cycleLength = parseInt(abDayCycle.split('_')[0]);
                    const dayLetters = ['A', 'B', 'C', 'D'].slice(0, cycleLength);
                    return (
                      <View key={day} style={styles.dayAssignment}>
                        <Text style={styles.dayLabel}>{day}</Text>
                        <View style={styles.dayLetterSelector}>
                          <TouchableOpacity
                            style={[
                              styles.dayLetterButton,
                              patternDays[day] === null && styles.dayLetterButtonActive,
                            ]}
                            onPress={() => {
                              setPatternDays({ ...patternDays, [day]: null });
                            }}
                          >
                            <Text style={styles.dayLetterButtonText}>-</Text>
                          </TouchableOpacity>
                          {dayLetters.map((letter) => (
                            <TouchableOpacity
                              key={letter}
                              style={[
                                styles.dayLetterButton,
                                patternDays[day] === letter && styles.dayLetterButtonActive,
                              ]}
                              onPress={() => {
                                setPatternDays({ ...patternDays, [day]: letter });
                              }}
                            >
                              <Text style={styles.dayLetterButtonText}>{letter}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowPatternModal(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSavePattern}
              >
                <Text style={styles.saveButtonText}>Save Pattern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  patternsList: {
    flex: 1,
    padding: 16,
  },
  patternCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  patternHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  patternInfo: {
    flex: 1,
  },
  patternName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  patternMeta: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  patternType: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  patternActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  patternDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
  },
  dayBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  modalBody: {
    padding: 16,
    maxHeight: 600,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.panel,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.card,
  },
  cycleSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  cycleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cycleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cycleButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  cycleButtonTextActive: {
    color: colors.card,
  },
  startDaySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  startDayButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startDayButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  startDayButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  startDayButtonTextActive: {
    color: colors.card,
  },
  dayAssignment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayLabel: {
    fontSize: 14,
    color: colors.text,
    width: 100,
  },
  dayLetterSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  dayLetterButton: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLetterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayLetterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
});


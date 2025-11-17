import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Calendar, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function YearPlannerWizard({ familyId, currentYearEnd, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  
  // Step 1: Dates
  const [nextStart, setNextStart] = useState('');
  const [nextEnd, setNextEnd] = useState('');
  
  // Step 2: Subjects by child
  const [yearSubjects, setYearSubjects] = useState({}); // { childId: { subjectId: weeklyMinutes } }

  useEffect(() => {
    if (familyId) {
      loadChildren();
      loadSubjects();
    }
  }, [familyId]);

  const loadChildren = async () => {
    const { data } = await supabase
      .from('children')
      .select('id, first_name')
      .eq('family_id', familyId)
      .eq('archived', false);
    
    if (data) {
      setChildren(data);
      // Initialize yearSubjects
      const initial = {};
      data.forEach(child => {
        initial[child.id] = {};
      });
      setYearSubjects(initial);
    }
  };

  const loadSubjects = async () => {
    const { data } = await supabase
      .from('subject')
      .select('id, name')
      .eq('family_id', familyId);
    
    if (data) setSubjects(data);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!nextStart || !nextEnd) {
        alert('Please enter both start and end dates');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    try {
      setLoading(true);
      
      const res = await fetch('/api/years/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_id: familyId,
          current_end: currentYearEnd,
          next_start: nextStart,
          next_end: nextEnd
        })
      });

      const data = await res.json();
      if (data.success) {
        // Update year_subjects with custom weekly minutes
        const yearId = data.year_id;
        
        for (const [childId, childSubjects] of Object.entries(yearSubjects)) {
          for (const [subjectId, weeklyMinutes] of Object.entries(childSubjects)) {
            if (weeklyMinutes && weeklyMinutes > 0) {
              await supabase
                .from('year_subjects')
                .update({ plan_expected_weekly_minutes: weeklyMinutes })
                .eq('school_year_id', yearId)
                .eq('child_id', childId)
                .eq('subject_id', subjectId);
            }
          }
        }

        onComplete?.(yearId);
      } else {
        alert('Error creating year: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error creating year:', err);
      alert('Failed to create year');
    } finally {
      setLoading(false);
    }
  };

  const updateWeeklyMinutes = (childId, subjectId, minutes) => {
    setYearSubjects(prev => ({
      ...prev,
      [childId]: {
        ...prev[childId],
        [subjectId]: minutes ? parseInt(minutes) : null
      }
    }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Plan Your Year</Text>
        {onCancel && (
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]}>
          <Text style={styles.progressStepText}>1. Dates</Text>
        </View>
        <ChevronRight size={16} color={colors.muted} />
        <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]}>
          <Text style={styles.progressStepText}>2. Subjects</Text>
        </View>
        <ChevronRight size={16} color={colors.muted} />
        <View style={[styles.progressStep, step >= 3 && styles.progressStepActive]}>
          <Text style={styles.progressStepText}>3. Confirm</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>School Year Dates</Text>
            <Text style={styles.stepDescription}>
              Define the start and end dates for the next school year.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Start Date</Text>
              <TextInput
                style={styles.input}
                value={nextStart}
                onChangeText={setNextStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>End Date</Text>
              <TextInput
                style={styles.input}
                value={nextEnd}
                onChangeText={setNextEnd}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Subjects by Child</Text>
            <Text style={styles.stepDescription}>
              Set expected weekly minutes for each subject per child.
            </Text>

            {children.map(child => (
              <View key={child.id} style={styles.childSection}>
                <Text style={styles.childName}>{child.first_name}</Text>
                {subjects.map(subject => (
                  <View key={subject.id} style={styles.subjectRow}>
                    <Text style={styles.subjectName}>{subject.name}</Text>
                    <TextInput
                      style={styles.minutesInput}
                      value={yearSubjects[child.id]?.[subject.id]?.toString() || ''}
                      onChangeText={(text) => updateWeeklyMinutes(child.id, subject.id, text)}
                      placeholder="120"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                    <Text style={styles.minutesLabel}>min/week</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Confirm</Text>
            <Text style={styles.stepDescription}>
              Review your settings and create the school year.
            </Text>

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Start:</Text>
              <Text style={styles.confirmValue}>{nextStart}</Text>
            </View>
            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>End:</Text>
              <Text style={styles.confirmValue}>{nextEnd}</Text>
            </View>
            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Subjects:</Text>
              <Text style={styles.confirmValue}>
                {Object.values(yearSubjects).reduce((sum, childSubs) => 
                  sum + Object.keys(childSubs).filter(id => childSubs[id] > 0).length, 0
                )} total
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep(step - 1)}
          >
            <ChevronLeft size={16} color={colors.accent} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, loading && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading ? (
            <Text style={styles.nextButtonText}>Creating...</Text>
          ) : step === 3 ? (
            <>
              <Check size={16} color={colors.accentContrast} />
              <Text style={styles.nextButtonText}>Create Year</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextButtonText}>Next</Text>
              <ChevronRight size={16} color={colors.accentContrast} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  cancelText: {
    fontSize: 14,
    color: colors.muted,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  progressStep: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.bgSubtle,
  },
  progressStepActive: {
    backgroundColor: colors.accent,
  },
  progressStepText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  stepContent: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
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
  childSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  subjectName: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  minutesInput: {
    width: 80,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  minutesLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  confirmSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
  },
  confirmLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  confirmValue: {
    fontSize: 14,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});


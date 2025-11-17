/**
 * Plan the Year Wizard
 * Part of Phase 1 - Year-Round Intelligence Core
 * Multi-step wizard for creating year plans with feature flag support
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { X, ChevronRight, ChevronLeft, Check, Calendar, UserCircle, BookOpen, Target, Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { createYearPlan, getPrefillData, checkFeatureFlags, seedYearPlanEvents, syncBlackouts } from '../../lib/services/yearClient';
import { supabase } from '../../lib/supabase';

const STEPS = [
  { id: 1, label: 'Students & Scope', icon: UserCircle },
  { id: 2, label: 'Dates & Breaks', icon: Calendar },
  { id: 3, label: 'Subjects & Targets', icon: BookOpen },
  { id: 4, label: 'Milestones', icon: Target },
  { id: 5, label: 'Review', icon: Check },
];

// Extract colors as primitives ONCE at module level to avoid readonly issues
const getColors = () => {
  try {
    return {
      border: String(colors?.border || '#e5e7eb'),
      text: String(colors?.text || '#000000'),
      bg: String(colors?.bg || '#ffffff'),
      muted: String(colors?.muted || '#999999'),
      error: String(colors?.error || '#ef4444'),
    };
  } catch (e) {
    return {
      border: '#e5e7eb',
      text: '#000000',
      bg: '#ffffff',
      muted: '#999999',
      error: '#ef4444',
    };
  }
};

const COLORS = getColors();

// Separate component defined OUTSIDE - NO React.memo, NO colors object access
function SubjectRowComponent({ 
  rowKey,
  subjectKey, 
  hoursPerWeek, 
  onKeyChange, 
  onHoursChange, 
  onRemove 
}) {
  // Create fresh style objects on every render using extracted colors
  const rowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  };
  const inputStyle1 = {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  };
  const inputStyle2 = {
    width: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  };
  const labelStyle = {
    fontSize: 14,
    color: COLORS.text,
  };
  const buttonStyle = {
    padding: 4,
  };
  
  return (
    <View style={rowStyle}>
      <TextInput
        style={inputStyle1}
        value={String(subjectKey || '')}
        onChangeText={onKeyChange}
        placeholder="Subject name"
        placeholderTextColor={COLORS.muted}
      />
      <TextInput
        style={inputStyle2}
        value={String(hoursPerWeek || '')}
        onChangeText={onHoursChange}
        placeholder="3.0"
        placeholderTextColor={COLORS.muted}
        keyboardType="decimal-pad"
      />
      <Text style={labelStyle}>hours/week</Text>
      <TouchableOpacity
        onPress={onRemove}
        style={buttonStyle}
      >
        <X size={16} color={COLORS.error} />
      </TouchableOpacity>
    </View>
  );
}

export default function PlanYearWizard({ 
  familyId, 
  children = [], 
  visible = false, 
  onClose, 
  onComplete 
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);
  
  // Step 0: Students & Scope
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [scope, setScope] = useState('current');
  
  // Step 1: Dates & Breaks
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [breaks, setBreaks] = useState([]);
  const [newBreakStart, setNewBreakStart] = useState('');
  const [newBreakEnd, setNewBreakEnd] = useState('');
  const [newBreakLabel, setNewBreakLabel] = useState('');
  const [syncingBlackouts, setSyncingBlackouts] = useState(false);
  const [stateCode, setStateCode] = useState('CA'); // Default to CA, user can change
  
  // Step 2: Subjects & Targets
  const [childSubjects, setChildSubjects] = useState({});
  const [childHoursPerWeek, setChildHoursPerWeek] = useState({});
  
  // Step 3: Milestones (auto-generated, editable)
  const [milestones, setMilestones] = useState([]);
  
  // Load children on mount
  useEffect(() => {
    if (familyId && visible) {
      loadChildren();
      checkFeatureFlags().then(flags => {
        if (!flags.yearPlans) {
          Alert.alert('Feature Disabled', 'Year planning is currently disabled. Please contact support.');
          onClose();
        }
      });
    }
  }, [familyId, visible]);
  
  // Prefill dates based on scope
  useEffect(() => {
    if (scope === 'current') {
      const today = new Date();
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearEnd = new Date(today.getFullYear(), 11, 31);
      setStartDate(yearStart.toISOString().split('T')[0]);
      setEndDate(yearEnd.toISOString().split('T')[0]);
    } else if (scope === 'next') {
      const today = new Date();
      const nextYearStart = new Date(today.getFullYear() + 1, 0, 1);
      const nextYearEnd = new Date(today.getFullYear() + 1, 11, 31);
      setStartDate(nextYearStart.toISOString().split('T')[0]);
      setEndDate(nextYearEnd.toISOString().split('T')[0]);
    }
  }, [scope]);
  
  // Auto-generate milestones when dates change or when navigating to step 4
  useEffect(() => {
    if (startDate && endDate && step === 4) {
      // Generate immediately when on milestones step
      console.log('[PlanYearWizard] Generating milestones for step 4, dates:', startDate, endDate);
      generateMilestones();
    }
  }, [startDate, endDate, step]);
  
  // Also generate milestones when dates are first set (pre-generate)
  useEffect(() => {
    if (startDate && endDate && milestones.length === 0) {
      console.log('[PlanYearWizard] Pre-generating milestones when dates set, dates:', startDate, endDate);
      generateMilestones();
    }
  }, [startDate, endDate]);
  
  // Prefill subjects when children are selected and we reach step 3
  useEffect(() => {
    if (selectedChildren.length > 0 && step === 3) {
      selectedChildren.forEach(childId => {
        // Only load if we don't already have subjects for this child
        if (!childSubjects[childId] || childSubjects[childId].length === 0) {
          loadPrefillData(childId);
        }
      });
    }
  }, [selectedChildren, step]);

  
  const loadChildren = async () => {
    if (!familyId) return;
    const { data } = await supabase
      .from('children')
      .select('id, first_name, avatar_url')
      .eq('family_id', familyId)
      .eq('archived', false);
    
    if (data) {
      // Initialize selected children (all by default)
      setSelectedChildren(data.map(c => c.id));
    }
  };
  
  const loadPrefillData = async (childId) => {
    try {
      console.log('[PlanYearWizard] Loading prefill data for child:', childId);
      const { data, error } = await getPrefillData(childId);
      
      if (error) {
        console.error('[PlanYearWizard] Prefill error:', error);
        return;
      }
      
      if (!data) {
        console.log('[PlanYearWizard] No prefill data returned');
        return;
      }
      
      // Deep clone the data to ensure mutability
      const clonedSubjects = JSON.parse(JSON.stringify(data.subjects || []));
      const clonedHours = JSON.parse(JSON.stringify(data.hoursPerWeek || {}));
      
      console.log('[PlanYearWizard] Prefill data loaded:', {
        subjectsCount: clonedSubjects.length,
        hoursKeys: Object.keys(clonedHours).length
      });
      
      // Update state with cloned data
      setChildSubjects(prev => {
        const newState = { ...prev };
        newState[childId] = clonedSubjects.map(s => ({
          key: String(s.key || ''),
          targetMinPerWeek: Number(s.targetMinPerWeek || 180)
        }));
        return newState;
      });
      
      setChildHoursPerWeek(prev => {
        const newState = { ...prev };
        newState[childId] = clonedHours;
        return newState;
      });
      
      console.log('[PlanYearWizard] Prefill data applied successfully');
    } catch (err) {
      console.error('[PlanYearWizard] Error loading prefill data:', err);
    }
  };
  
  const generateMilestones = () => {
    if (!startDate || !endDate) {
      console.log('[PlanYearWizard] Cannot generate milestones - missing dates:', { startDate, endDate });
      return;
    }
    
    try {
      console.log('[PlanYearWizard] Starting milestone generation...');
      // Parse dates as strings first, then create Date objects
      const startStr = String(startDate);
      const endStr = String(endDate);
      const start = new Date(startStr);
      const end = new Date(endStr);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error('[PlanYearWizard] Invalid date values:', { startDate, endDate });
        return;
      }
      
      const weeks = [];
      // Use timestamp arithmetic instead of mutating Date objects
      const startTimestamp = start.getTime();
      const endTimestamp = end.getTime();
      const weekMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      
      let currentTimestamp = startTimestamp;
      let weekNum = 1;
      
      while (currentTimestamp <= endTimestamp) {
        // Create new Date objects from timestamps (never mutate)
        const weekStart = new Date(currentTimestamp);
        const weekEndTimestamp = currentTimestamp + (6 * 24 * 60 * 60 * 1000); // Add 6 days
        const weekEnd = new Date(Math.min(weekEndTimestamp, endTimestamp));
        
        // Extract date strings
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        
        // Create new object with string values to ensure mutability
        weeks.push({
          week_start: String(weekStartStr),
          week_end: String(weekEndStr),
          summary: String(`Week ${weekNum}`),
        });
        
        // Move to next week by adding 7 days to timestamp
        currentTimestamp += weekMs;
        weekNum++;
      }
      
      console.log('[PlanYearWizard] Generated', weeks.length, 'milestones');
      
      // Deep clone the array to ensure it's completely mutable
      const clonedWeeks = JSON.parse(JSON.stringify(weeks));
      setMilestones(clonedWeeks);
      console.log('[PlanYearWizard] Milestones set in state:', clonedWeeks.length);
    } catch (err) {
      console.error('[PlanYearWizard] Error generating milestones:', err);
      setMilestones([]);
    }
  };
  
  const toggleChild = (childId) => {
    setSelectedChildren(prev => 
      prev.includes(childId)
        ? prev.filter(id => id !== childId)
        : [...prev, childId]
    );
  };
  
  const addBreak = () => {
    if (!newBreakStart || !newBreakEnd) {
      Alert.alert('Error', 'Please enter both start and end dates for the break');
      return;
    }
    
    if (newBreakStart >= newBreakEnd) {
      Alert.alert('Error', 'Break start date must be before end date');
      return;
    }
    
    setBreaks(prev => [...prev, {
      start: newBreakStart,
      end: newBreakEnd,
      label: newBreakLabel || 'Break',
    }]);
    
    setNewBreakStart('');
    setNewBreakEnd('');
    setNewBreakLabel('');
  };
  
  const removeBreak = (index) => {
    setBreaks(prev => prev.filter((_, i) => i !== index));
  };

  const handleSyncBlackouts = async () => {
    if (!startDate) {
      Alert.alert('Error', 'Please set a start date first to determine the year.');
      return;
    }
    
    const year = new Date(startDate).getFullYear();
    const state = stateCode.toUpperCase().trim();
    
    if (!state || state.length !== 2) {
      Alert.alert('Error', 'Please enter a valid 2-letter state code (e.g., CA, NY, TX).');
      return;
    }
    
    setSyncingBlackouts(true);
    
    try {
      const { data, error } = await syncBlackouts(year, state);
      
      if (error) {
        throw error;
      }
      
      if (data && data.success) {
        Alert.alert(
          'Success',
          `Synced ${data.upserted || 0} holiday(s) for ${state} ${year}.${data.skipped ? ` ${data.skipped} already existed.` : ''}`
        );
        
        // Refresh calendar cache by dispatching event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      } else {
        Alert.alert('Info', data?.message || 'No holidays found or already synced.');
      }
    } catch (err) {
      console.error('[PlanYearWizard] Sync blackouts error:', err);
      Alert.alert(
        'Error',
        `Failed to sync state holidays: ${err.message || 'Unknown error'}. Please check that the state_blackouts bucket exists and contains ${state}/${year}.json`
      );
    } finally {
      setSyncingBlackouts(false);
    }
  };
  
  
  const canProceed = () => {
    if (step === 1) return selectedChildren.length > 0;
    if (step === 2) return startDate && endDate && startDate < endDate;
    if (step === 3) {
      // Temporarily allow proceeding even if no subjects are configured
      return true;
    }
    if (step === 4) return true; // Milestones are auto-generated
    return true;
  };
  
  const handleNext = () => {
    if (!canProceed()) {
      Alert.alert('Incomplete', 'Please complete all required fields before continuing');
      return;
    }
    
    if (step < STEPS.length) {
      setStep(step + 1);
      setError(null);
    } else {
      handleSubmit();
    }
  };
  
  const handleSubmit = async () => {
    if (!canProceed()) return;
    
    setSaving(true);
    setError(null);
    
    try {
      // Prepare children data - ensure we create new objects to avoid readonly issues
      const childrenData = selectedChildren.map(childId => ({
        childId,
        subjects: (childSubjects[childId] || []).map(s => ({ ...s })),
        hoursPerWeek: {},
      }));
      
      const input = {
        familyId,
        scope,
        startDate,
        endDate,
        breaks,
        children: childrenData,
      };
      
      console.log('[PlanYearWizard] Submitting year plan:', {
        familyId,
        scope,
        startDate,
        endDate,
        breaksCount: breaks.length,
        childrenCount: childrenData.length,
        children: childrenData.map(c => ({
          childId: c.childId,
          subjectsCount: c.subjects.length,
          subjects: c.subjects
        }))
      });
      
      const { data, error: createError } = await createYearPlan(input);
      
      if (createError) {
        throw createError;
      }
      
      if (data) {
        // Seed events for the year plan
        setSeeding(true);
        setError(null);
        
        try {
          console.log('[PlanYearWizard] Seeding events for year plan:', data.id);
          const { data: seedData, error: seedError } = await seedYearPlanEvents(data.id);
          
          if (seedError) {
            console.error('[PlanYearWizard] Seed error:', seedError);
            // Show warning but don't fail - plan was created successfully
            Alert.alert(
              'Plan Created',
              `Year plan created successfully, but scheduling failed: ${seedError.message || 'Unknown error'}. You can manually add events or try seeding again later.`,
              [{ text: 'OK' }]
            );
          } else {
            console.log('[PlanYearWizard] Seed success:', seedData);
            const eventsCreated = seedData?.events_created || 0;
            const eventsSkipped = seedData?.events_skipped || 0;
            
            Alert.alert(
              'Success',
              `Year plan created successfully!\n\n${eventsCreated} events scheduled${eventsSkipped > 0 ? ` (${eventsSkipped} skipped due to blackouts)` : ''}.`
            );
          }
        } catch (seedErr) {
          console.error('[PlanYearWizard] Seed exception:', seedErr);
          Alert.alert(
            'Plan Created',
            'Year plan created successfully, but scheduling encountered an error. You can manually add events or try seeding again later.'
          );
        } finally {
          setSeeding(false);
        }
        
        onComplete?.(data);
        handleClose();
      }
    } catch (err) {
      console.error('Error creating year plan:', err);
      setError(err.message || 'Failed to create year plan');
    } finally {
      setSaving(false);
    }
  };
  
  const handleClose = () => {
    if (saving || seeding) return; // Prevent closing while saving or seeding
    
    setStep(1);
    setSelectedChildren([]);
    setScope('current');
    setStartDate('');
    setEndDate('');
    setBreaks([]);
    setChildSubjects({});
    setChildHoursPerWeek({});
    setMilestones([]);
    setError(null);
    onClose();
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && visible) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible]);
  
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return renderStudentsScope();
      case 2:
        return renderDatesBreaks();
      case 3:
        return renderSubjectsTargets();
      case 4:
        return renderMilestones();
      case 5:
        return renderReview();
      default:
        return null;
    }
  };
  
  const renderStudentsScope = () => {
    const allChildren = children.filter(c => !c.archived);
    
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Select Students</Text>
        <Text style={styles.stepDescription}>
          Choose which students to include in this year plan.
        </Text>
        
        <View style={styles.childrenGrid}>
          {allChildren.map(child => {
            const isSelected = selectedChildren.includes(child.id);
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.childChip, isSelected && styles.childChipSelected]}
                onPress={() => toggleChild(child.id)}
                activeOpacity={0.7}
              >
                <UserCircle size={20} color={isSelected ? colors.accentContrast : colors.muted} />
                <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
                  {child.first_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        
        <Text style={styles.stepTitle}>Plan Scope</Text>
        <View style={styles.scopePills}>
          {['current', 'next', 'custom'].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.scopePill, scope === s && styles.scopePillActive]}
              onPress={() => setScope(s)}
              activeOpacity={0.7}
            >
              <Text style={[styles.scopePillText, scope === s && styles.scopePillTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };
  
  const renderDatesBreaks = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Year Dates</Text>
      <Text style={styles.stepDescription}>
        Set the start and end dates for your year plan.
      </Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Start Date</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>End Date</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
        />
      </View>
      
      <Text style={styles.stepTitle}>Breaks & Holidays</Text>
      <Text style={styles.stepDescription}>
        Add break periods (vacations, holidays) that will be excluded from planning.
      </Text>
      
      <View style={styles.breakInput}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newBreakStart}
          onChangeText={setNewBreakStart}
          placeholder="Start (YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newBreakEnd}
          onChangeText={setNewBreakEnd}
          placeholder="End (YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newBreakLabel}
          onChangeText={setNewBreakLabel}
          placeholder="Label (optional)"
          placeholderTextColor={colors.muted}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={addBreak}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
      
      {breaks.map((brk, index) => (
        <View key={index} style={styles.breakItem}>
          <Text style={styles.breakText}>
            {brk.label}: {brk.start} to {brk.end}
          </Text>
          <TouchableOpacity onPress={() => removeBreak(index)}>
            <X size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      ))}
      
      <View style={styles.syncSection}>
        <Text style={styles.stepTitle}>State Holidays</Text>
        <Text style={styles.stepDescription}>
          Sync official state holidays to automatically mark them as non-shiftable days.
        </Text>
        <View style={styles.syncInputRow}>
          <TextInput
            style={[styles.input, { width: 80 }]}
            value={stateCode}
            onChangeText={setStateCode}
            placeholder="CA"
            placeholderTextColor={colors.muted}
            maxLength={2}
            autoCapitalize="characters"
          />
          <Text style={styles.label}>State Code</Text>
          <TouchableOpacity
            style={[styles.syncButton, syncingBlackouts && styles.buttonDisabled]}
            onPress={handleSyncBlackouts}
            disabled={syncingBlackouts || !startDate}
          >
            {syncingBlackouts ? (
              <>
                <ActivityIndicator size="small" color={colors.accentContrast} />
                <Text style={styles.syncButtonText}>Syncing...</Text>
              </>
            ) : (
              <Text style={styles.syncButtonText}>Sync State Holidays</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
  

  const addSubject = (childId) => {
    setChildSubjects(prev => {
      const newState = { ...prev };
      if (!newState[childId]) {
        newState[childId] = [];
      }
      newState[childId] = [...newState[childId], { key: '', targetMinPerWeek: 180 }];
      return newState;
    });
  };
  
  const updateSubject = (childId, index, field, value) => {
    setChildSubjects(prev => {
      const newState = { ...prev };
      if (!newState[childId]) {
        newState[childId] = [];
      }
      const subjects = [...newState[childId]];
      subjects[index] = { ...subjects[index], [field]: value };
      newState[childId] = subjects;
      return newState;
    });
  };
  
  const removeSubject = (childId, index) => {
    setChildSubjects(prev => {
      const newState = { ...prev };
      if (newState[childId]) {
        newState[childId] = newState[childId].filter((_, i) => i !== index);
      }
      return newState;
    });
  };

  const renderSubjectsTargets = () => {
    const allChildren = children.filter(c => selectedChildren.includes(c.id));
    
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Subjects & Weekly Targets</Text>
        <Text style={styles.stepDescription}>
          Set target hours per week for each subject per student.
        </Text>
        
        {allChildren.map((child) => {
          const childId = child.id;
          const childName = child.first_name || '';
          const subjects = childSubjects[childId] || [];
          
          return (
            <View key={childId} style={styles.childSection}>
              <Text style={styles.childName}>{childName}</Text>
              
              {subjects.map((subject, index) => {
                const subjectKey = String(subject?.key || '');
                const targetMin = Number(subject?.targetMinPerWeek || 0);
                const hoursPerWeek = targetMin > 0 ? (targetMin / 60).toFixed(1) : '';
                
                return (
                  <View key={`${childId}-${index}`} style={styles.subjectRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={subjectKey}
                      onChangeText={(text) => {
                        updateSubject(childId, index, 'key', text);
                      }}
                      placeholder="Subject name"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[styles.input, { width: 100 }]}
                      value={hoursPerWeek}
                      onChangeText={(text) => {
                        const hours = parseFloat(text) || 0;
                        const minutes = Math.round(hours * 60);
                        updateSubject(childId, index, 'targetMinPerWeek', minutes);
                      }}
                      placeholder="3.0"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.minutesLabel}>hours/week</Text>
                    <TouchableOpacity
                      onPress={() => removeSubject(childId, index)}
                      style={styles.removeButton}
                    >
                      <Text style={{ fontSize: 16, color: colors.error }}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              
              <TouchableOpacity
                style={styles.addSubjectButton}
                onPress={() => addSubject(childId)}
                activeOpacity={0.7}
              >
                <Text style={styles.addSubjectButtonText}>+ Add Subject</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };
  
  const renderMilestones = () => {
    console.log('[PlanYearWizard] Rendering milestones step, milestones count:', milestones.length);
    
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Weekly Milestones</Text>
        <Text style={styles.stepDescription}>
          Weekly checkpoints are auto-generated. You can edit labels if needed.
        </Text>
        
        {milestones.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>Generating milestones...</Text>
            {startDate && endDate ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>
                Dates: {startDate} to {endDate}
              </Text>
            ) : (
              <Text style={{ color: colors.error, marginTop: 10 }}>
                Please set dates first
              </Text>
            )}
          </View>
        ) : (
          <ScrollView style={styles.milestonesList}>
            {milestones.map((milestone, index) => (
          <View key={index} style={styles.milestoneItem}>
            <Text style={styles.milestoneDates}>
              {milestone.week_start} - {milestone.week_end}
            </Text>
            <TextInput
              style={styles.input}
              value={milestone.summary}
              onChangeText={(text) => {
                // Create new array with new object for the updated milestone
                const updated = milestones.map((m, i) => 
                  i === index ? { ...m, summary: text } : m
                );
                setMilestones(updated);
              }}
              placeholder="Week summary"
              placeholderTextColor={colors.muted}
            />
          </View>
        ))}
          </ScrollView>
        )}
      </View>
    );
  };
  
  const renderReview = () => {
    const allChildren = children.filter(c => selectedChildren.includes(c.id));
    const totalWeeks = milestones.length;
    
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Review Your Plan</Text>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Scope:</Text>
          <Text style={styles.reviewValue}>{scope}</Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Dates:</Text>
          <Text style={styles.reviewValue}>{startDate} to {endDate}</Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Total Weeks:</Text>
          <Text style={styles.reviewValue}>{totalWeeks}</Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Students:</Text>
          <Text style={styles.reviewValue}>{selectedChildren.length}</Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Breaks:</Text>
          <Text style={styles.reviewValue}>{breaks.length}</Text>
        </View>
        
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  };
  
  if (!visible) return null;
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Sparkles size={20} color={colors.accent} />
              <Text style={styles.title}>Plan the Year</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              disabled={saving || seeding}
              style={styles.closeButton}
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          {/* Stepper */}
          <View style={styles.stepper}>
            {STEPS.map((stepItem, index) => {
              const Icon = stepItem.icon;
              const isActive = step === stepItem.id;
              const isDone = step > stepItem.id;
              
              return (
                <React.Fragment key={stepItem.id}>
                  <TouchableOpacity
                    style={[styles.stepItem, isActive && styles.stepItemActive, isDone && styles.stepItemDone]}
                    onPress={() => step > stepItem.id && setStep(stepItem.id)}
                    disabled={step <= stepItem.id}
                  >
                    <Icon size={16} color={isActive || isDone ? colors.accentContrast : colors.muted} />
                    <Text style={[styles.stepLabel, (isActive || isDone) && styles.stepLabelActive]}>
                      {stepItem.label}
                    </Text>
                  </TouchableOpacity>
                  {index < STEPS.length - 1 && (
                    <ChevronRight size={16} color={colors.muted} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
          
          {/* Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {renderStepContent()}
          </ScrollView>
          
          {/* Footer */}
          <View style={styles.footer}>
            {step > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setStep(step - 1)}
                disabled={saving}
              >
                <ChevronLeft size={16} color={colors.accent} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextButton, (!canProceed() || saving || seeding) && styles.nextButtonDisabled]}
              onPress={step === STEPS.length ? handleSubmit : handleNext}
              disabled={!canProceed() || saving || seeding}
            >
              {saving ? (
                <>
                  <ActivityIndicator size="small" color={colors.accentContrast} />
                  <Text style={styles.nextButtonText}>Creating plan...</Text>
                </>
              ) : seeding ? (
                <>
                  <ActivityIndicator size="small" color={colors.accentContrast} />
                  <Text style={styles.nextButtonText}>Scheduling events...</Text>
                </>
              ) : step === STEPS.length ? (
                <>
                  <Check size={16} color={colors.accentContrast} />
                  <Text style={styles.nextButtonText}>Create Plan & Schedule</Text>
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
  },
  modal: {
    width: Platform.OS === 'web' ? 800 : '90%',
    maxWidth: Platform.OS === 'web' ? 800 : '100%',
    maxHeight: '90%',
    backgroundColor: colors.bg,
    borderRadius: 12,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: 'wrap',
    gap: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
  },
  stepItemActive: {
    backgroundColor: colors.accent,
  },
  stepItemDone: {
    backgroundColor: colors.accent,
    opacity: 0.8,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
  stepLabelActive: {
    color: colors.accentContrast,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  stepContent: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 8,
  },
  childrenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  childChipTextSelected: {
    color: colors.accentContrast,
  },
  scopePills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  scopePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  scopePillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  scopePillTextActive: {
    color: colors.accentContrast,
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
  breakInput: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  addButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  addButtonText: {
    color: colors.accentContrast,
    fontWeight: '600',
  },
  breakItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
  },
  breakText: {
    fontSize: 14,
    color: colors.text,
  },
  syncSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  syncInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  syncButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButtonText: {
    color: colors.accentContrast,
    fontWeight: '500',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
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
    gap: 8,
    marginBottom: 8,
  },
  minutesLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  removeButton: {
    padding: 4,
  },
  addSubjectButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
  },
  addSubjectButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  milestonesList: {
    maxHeight: 400,
  },
  milestoneItem: {
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
  },
  milestoneDates: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  reviewSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
  },
  reviewLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  reviewValue: {
    fontSize: 14,
    color: colors.muted,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
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


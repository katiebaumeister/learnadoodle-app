import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Animated, Easing, ScrollView, StyleSheet, Modal, Switch } from 'react-native';
import { X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

const DEFAULT_START_TIME = '9:00 AM';
const DEFAULT_DURATION_MINUTES = 30;

const EVENT_TYPES = [
  'Appointment',
  'Travel',
  'Live Class',
  'Home Lesson',
  'Core Class',
  'Activity',
  'Sport',
  'Assessment',
  'Meeting',
];

const MODE_OPTIONS = ['home', 'online', 'outside', 'travel'];

// Safe View wrapper that filters out text nodes
function SafeView({ children, style, ...props }) {
  // Convert to array and filter aggressively
  const childrenArray = React.Children.toArray(children);
  const safeChildren = childrenArray.filter((child, index) => {
    if (typeof child === 'string') {
      const trimmed = child.trim();
      if (trimmed.length === 0) {
        // Empty whitespace - filter it out silently
        return false;
      }
      console.error('[SafeView] Found non-whitespace text node at index', index, ':', JSON.stringify(child), 'length:', child.length, 'charCodes:', child.split('').map(c => c.charCodeAt(0)));
      return false;
    }
    if (child == null) return false;
    if (typeof child === 'boolean') return false;
    return true;
  });
  
  // Log if we filtered anything
  if (childrenArray.length !== safeChildren.length) {
    console.log('[SafeView] Filtered', childrenArray.length - safeChildren.length, 'text nodes from', childrenArray.length, 'total children');
  }
  
  return <View style={style} {...props}>{safeChildren}</View>;
}

// Wrapper for fieldRow to catch text nodes
function SafeFieldRow({ children, style }) {
  const safeChildren = React.Children.toArray(children).filter((child, index) => {
    if (typeof child === 'string') {
      console.error('[SafeFieldRow] Found text node at index', index, ':', JSON.stringify(child), 'charCodes:', child.split('').map(c => c.charCodeAt(0)));
      return false;
    }
    return child != null;
  });
  return <View style={style}>{safeChildren}</View>;
}

function ChipRow({ children, style }) {
  // Use React.Children.map to process children and filter out any text nodes
  const normalizedChildren = React.Children.map(children, (child, index) => {
    // Filter out strings (including whitespace), null, undefined, booleans
    if (typeof child === 'string') {
      console.warn('[ChipRow] Filtering out string child at index', index, ':', JSON.stringify(child), 'length:', child.length, 'charCodes:', child.split('').map(c => c.charCodeAt(0)));
      return null;
    }
    if (child == null) {
      console.warn('[ChipRow] Filtering out null/undefined child at index', index);
      return null;
    }
    if (typeof child === 'boolean') {
      console.warn('[ChipRow] Filtering out boolean child at index', index, ':', child);
      return null;
    }
    return child;
  }) || [];
  
  // Additional filter to ensure no strings slip through
  const safeChildren = normalizedChildren.filter((child, index) => {
    if (typeof child === 'string') {
      console.error('[ChipRow] CRITICAL: String child slipped through filter at index', index, ':', JSON.stringify(child));
      return false;
    }
    if (child == null) {
      console.warn('[ChipRow] Null child in safeChildren at index', index);
      return false;
    }
    return true;
  });
  
  console.log('[ChipRow] Rendering with', safeChildren.length, 'children');
  return <View style={style}>{safeChildren}</View>;
}

function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TaskCreateModal({
  visible,
  onClose,
  defaultDate,
  familyMembers = [],
  familyId,
  onCreated,
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(defaultDate ?? new Date());
  const [assigneeId, setAssigneeId] = useState(null);
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [labels, setLabels] = useState([]);
  const suggestedTags = ['homework', 'lesson', 'project', 'appointment', 'sport'];
  const [submitting, setSubmitting] = useState(false);
  const [placement, setPlacement] = useState('calendar');
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState('');
  
  // New academic and metadata fields
  const [eventType, setEventType] = useState('');
  const [subjectId, setSubjectId] = useState(null);
  const [unit, setUnit] = useState('');
  const [grade, setGrade] = useState('');
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [goalLink, setGoalLink] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [subjectGoals, setSubjectGoals] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [showGoalDropdown, setShowGoalDropdown] = useState(false);
  
  const toast = useToast();

  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const labelInputRef = useRef(null);

  // Fetch subjects and subject goals when modal opens
  useEffect(() => {
    if (visible && familyId) {
      fetchSubjects();
      if (assigneeId) {
        fetchSubjectGoals(assigneeId);
      }
    }
  }, [visible, familyId, assigneeId]);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setDueDate(defaultDate ?? new Date());
      setAssigneeId(null);
      setPriority('normal');
      setNotes('');
      setLabels([]);
      setLabelDraft('');
      setPlacement('calendar');
      setAllDay(false);
      setStartTime(DEFAULT_START_TIME);
      setEndTime('');
      // Reset new fields
      setEventType('');
      setSubjectId(null);
      setUnit('');
      setGrade('');
      setLocation('');
      setMode('');
      setInstructor('');
      setGoalLink(null);
      setShowSubjectDropdown(false);
      setShowGoalDropdown(false);
    }
  }, [visible, defaultDate]);

  const fetchSubjects = async () => {
    if (!familyId) return;
    setLoadingSubjects(true);
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const fetchSubjectGoals = async (childId) => {
    if (!childId) return;
    try {
      const { data, error } = await supabase
        .from('subject_goals')
        .select('id, subject_id, minutes_per_week')
        .eq('child_id', childId)
        .eq('is_active', true);
      
      if (error) throw error;
      setSubjectGoals(data || []);
    } catch (error) {
      console.error('Error fetching subject goals:', error);
      // Subject goals might not exist yet, that's okay
      setSubjectGoals([]);
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.96);
    }
  }, [visible, fade, scale]);

  const commitLabel = () => {
    const trimmed = labelDraft.trim().replace(/^#/, '');
    if (trimmed.length && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
    }
    setLabelDraft('');
  };

  const removeLabel = (l) => {
    setLabels(labels.filter((x) => x !== l));
  };

  const parseTimeString = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (hours === 0 || hours > 12 || minutes < 0 || minutes > 59) {
      return null;
    }

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return { hours, minutes };
  };

  const applyTimeToDate = (date, timeStr) => {
    const parts = parseTimeString(timeStr);
    if (!parts) return null;
    const result = new Date(date);
    result.setHours(parts.hours, parts.minutes, 0, 0);
    return result;
  };

  const calculateMinutes = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  };

  // Determine if academic fields should be shown
  const showAcademicFields = () => {
    return eventType && ['Live Class', 'Home Lesson', 'Core Class', 'Assessment'].includes(eventType);
  };

  // Determine if location/mode fields should be shown
  const showLocationFields = () => {
    return eventType && ['Appointment', 'Travel', 'Activity', 'Sport'].includes(eventType);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.push('Please enter a task name', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Fetch family_id directly from the authenticated user's profile
      // This ensures we use the exact family_id that RLS expects
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        toast.push('User not authenticated', 'error');
        setSubmitting(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', authUser.id)
        .single();

      if (profileError || !profile?.family_id) {
        console.error('Error fetching profile:', profileError);
        toast.push('Failed to fetch family information', 'error');
        setSubmitting(false);
        return;
      }

      const userFamilyId = profile.family_id;

      // Parse list_id to extract child_id if it's a child list
      const childId = assigneeId;

      let data;
      let error;

      if (placement === 'backlog') {
        // For backlog items, use scheduled status with a far future date
        // This works around schema constraints while maintaining backlog functionality
        const farFutureDate = new Date('2099-12-31T09:00:00Z');
        const farFutureEndDate = new Date('2099-12-31T09:30:00Z');
        
        // Use RPC function to bypass RLS issues
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', {
          _family_id: userFamilyId,
          _child_id: childId,
          _title: title.trim(),
          _description: notes.trim() || null,
          _start_ts: farFutureDate.toISOString(),
          _end_ts: farFutureEndDate.toISOString(),
          _status: 'scheduled',
          _source: 'task_create',
          _tags: labels.length > 0 ? labels : null,
          _is_flexible: true,
          _event_type: eventType || null,
          _subject_id: subjectId || null,
          _unit: unit.trim() || null,
          _grade: grade.trim() || null,
          _location: location.trim() || null,
          _mode: mode || null,
          _instructor: instructor.trim() || null,
          _goal_link: goalLink || null,
          _minutes: null,
        });

        if (rpcError || !rpcData?.ok) {
          error = rpcError || { message: rpcData?.error || 'Failed to create task' };
          data = null;
        } else {
          // Fetch the created event to return full data
          const { data: eventData, error: fetchError } = await supabase
            .from('events')
            .select('*')
            .eq('id', rpcData.id)
            .single();
          data = eventData;
          error = fetchError;
        }
      } else {
        // Calculate start_ts and end_ts from due date and selected time
        const baseDate = new Date(dueDate);
        baseDate.setHours(0, 0, 0, 0);

        let startDate;
        let endDate;

        if (allDay) {
          startDate = new Date(baseDate);
          endDate = new Date(baseDate);
          endDate.setHours(23, 59, 0, 0);
        } else {
          const resolvedStart = applyTimeToDate(baseDate, startTime);
          if (!resolvedStart) {
            toast.push('Enter a valid start time, e.g. 9:00 AM', 'error');
            setSubmitting(false);
            return;
          }
          startDate = resolvedStart;

          if (endTime.trim()) {
            let resolvedEnd = applyTimeToDate(baseDate, endTime);
            if (!resolvedEnd) {
              toast.push('Enter a valid end time, e.g. 10:00 AM', 'error');
              setSubmitting(false);
              return;
            }
            if (resolvedEnd <= startDate) {
              resolvedEnd = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
            }
            endDate = resolvedEnd;
          } else {
            endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
          }
        }

        // Calculate minutes from duration
        const minutes = calculateMinutes(startDate, endDate);

        // Use RPC function to bypass RLS issues
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', {
          _family_id: userFamilyId,
          _child_id: childId,
          _title: title.trim(),
          _description: notes.trim() || null,
          _start_ts: startDate.toISOString(),
          _end_ts: endDate?.toISOString(),
          _status: 'scheduled',
          _source: 'task_create',
          _tags: labels.length > 0 ? labels : null,
          _is_flexible: allDay,
          _event_type: eventType || null,
          _subject_id: subjectId || null,
          _unit: unit.trim() || null,
          _grade: grade.trim() || null,
          _location: location.trim() || null,
          _mode: mode || null,
          _instructor: instructor.trim() || null,
          _goal_link: goalLink || null,
          _minutes: minutes,
        });

        if (rpcError || !rpcData?.ok) {
          error = rpcError || { message: rpcData?.error || 'Failed to create task' };
          data = null;
        } else {
          // Fetch the created event to return full data
          const { data: eventData, error: fetchError } = await supabase
            .from('events')
            .select('*')
            .eq('id', rpcData.id)
            .single();
          data = eventData;
          error = fetchError;
        }
      }

      if (error) {
        console.error('Error creating task:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error hint:', error.hint);
        toast.push(`Failed to create task: ${error.message || 'Unknown error'}`, 'error');
        return;
      }

      toast.push(placement === 'backlog' ? 'Backlog task created' : 'Task created successfully', 'success');
      onCreated?.(data);
      onClose();
    } catch (error) {
      console.error('Error in handleCreate:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      toast.push(`Failed to create task: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fade,
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            if (showSubjectDropdown || showGoalDropdown) {
              setShowSubjectDropdown(false);
              setShowGoalDropdown(false);
            } else {
              onClose();
            }
          }}
        />
        <Animated.View
          style={[
            styles.modal,
            {
              transform: [{ scale }],
            },
          ]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {
            // Prevent clicks inside modal from closing it
          }}
        >
          {/* Header / Title input */}
          <View style={styles.header}>
            <TextInput
              placeholder="Task name"
              placeholderTextColor={MUTED}
              value={title}
              onChangeText={setTitle}
              style={styles.titleInput}
              autoFocus
            />
          </View>

          {/* Placement toggle */}
          <View style={styles.modeToggle}>
            {[
              { key: 'calendar', label: 'Schedule on calendar' },
              { key: 'backlog', label: 'Add to backlog' },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => setPlacement(option.key)}
                style={[
                  styles.modeOption,
                  placement === option.key && styles.modeOptionActive,
                ]}
              >
                <Text
                  style={[
                    styles.modeOptionText,
                    placement === option.key && styles.modeOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {placement === 'backlog' && (
            <View style={styles.modeInfo}>
              <Text style={styles.modeInfoText}>
                Backlog tasks stay off the calendar until you schedule them.
              </Text>
            </View>
          )}

          {/* Chip Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {/* Due date chip */}
            {placement === 'calendar' && (
              <View style={styles.chip}>
                <TouchableOpacity onPress={() => setDueDate(addDays(dueDate, -1))}>
                  <ChevronLeft size={16} color={FG} />
                </TouchableOpacity>
                <Text style={styles.chipText}>{fmt(dueDate)}</Text>
                <TouchableOpacity onPress={() => setDueDate(addDays(dueDate, +1))}>
                  <ChevronRight size={16} color={FG} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDueDate(new Date())} style={styles.todayButton}>
                  <Text style={styles.todayText}>Today</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Assignee chip */}
            {familyMembers.length > 0 && (
              <View style={styles.chip}>
                <Text style={styles.chipLabel}>Assignee</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                  {familyMembers.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setAssigneeId(assigneeId === m.id ? null : m.id)}
                      style={[
                        styles.chipOption,
                        assigneeId === m.id && styles.chipOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipOptionText,
                          assigneeId === m.id && styles.chipOptionTextActive,
                        ]}
                      >
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Priority chip */}
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Priority</Text>
              {['low', 'normal', 'high', 'urgent'].map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.chipOption,
                    priority === p && styles.chipOptionActivePriority,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipOptionText,
                      priority === p && styles.chipOptionTextActive,
                    ]}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Labels chip */}
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Labels</Text>
              <View style={styles.labelsContainer}>
                {labels.map((l) => (
                  <TouchableOpacity key={l} onPress={() => removeLabel(l)} style={styles.labelChip}>
                    <Text style={styles.labelChipText}>#{l} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Notes + Label input + List */}
          <SafeView style={styles.body}>
            {placement === 'calendar' && (
              <View style={styles.timeSection}>
                <View style={styles.timeToggleRow}>
                  <Text style={styles.sectionLabel}>Schedule time</Text>
                  <View style={styles.allDayControl}>
                    <Text style={styles.allDayLabel}>All day</Text>
                    <Switch
                      value={allDay}
                      onValueChange={(value) => {
                        setAllDay(value);
                        if (value) {
                          setStartTime('');
                          setEndTime('');
                        } else {
                          setStartTime(DEFAULT_START_TIME);
                          setEndTime('');
                        }
                      }}
                      trackColor={{ false: BORDER, true: '#93c5fd' }}
                      thumbColor={allDay ? '#ffffff' : '#f9fafb'}
                    />
                  </View>
                </View>
                {!allDay && (
                  <View style={styles.timeInputsRow}>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>Start</Text>
                      <TextInput
                        placeholder="e.g. 9:00 AM"
                        placeholderTextColor={MUTED}
                        value={startTime}
                        onChangeText={setStartTime}
                        style={styles.timeInput}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>End</Text>
                      <TextInput
                        placeholder="Optional"
                        placeholderTextColor={MUTED}
                        value={endTime}
                        onChangeText={setEndTime}
                        style={styles.timeInput}
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
            {/* Label entry */}
            <TextInput
              ref={labelInputRef}
              placeholder="Type #label and press space/enter…"
              placeholderTextColor={MUTED}
              value={labelDraft}
              onChangeText={(v) => {
                setLabelDraft(v);
                if (/[ ,]$/.test(v)) {
                  commitLabel();
                }
              }}
              onSubmitEditing={commitLabel}
              style={styles.input}
            />
            <View style={styles.suggestedTagsRow}>
              {suggestedTags.map((tag) => {
                const isActive = labels.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => {
                      if (!isActive) {
                        setLabels((prev) => [...prev, tag]);
                      }
                      setLabelDraft(`#${tag}`);
                      labelInputRef.current?.focus();
                    }}
                    style={[
                      styles.suggestedTagChip,
                      isActive && styles.suggestedTagChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.suggestedTagText,
                        isActive && styles.suggestedTagTextActive,
                      ]}
                    >
                      #{tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Academic Details Section */}
            {(showAcademicFields() || showLocationFields()) && (
              <SafeView style={styles.academicSection}>
                <Text style={styles.sectionTitle}>Academic Details</Text>
                {/* Event Type */}
                <SafeFieldRow style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Type</Text>
                      <SafeView style={styles.dropdownContainer}>
                        <ChipRow style={styles.dropdownRow}>{EVENT_TYPES.map((type) => (
                          <TouchableOpacity
                            key={type}
                            onPress={() => setEventType(eventType === type ? '' : type)}
                            style={[
                              styles.dropdownOption,
                              eventType === type && styles.dropdownOptionActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dropdownOptionText,
                                eventType === type && styles.dropdownOptionTextActive,
                              ]}
                            >
                              {type}
                            </Text>
                          </TouchableOpacity>
                        ))}</ChipRow>
                      </SafeView>
                  </View>
                </SafeFieldRow>

                {/* Academic fields - shown for Lesson/Core Class/Assessment */}
                {showAcademicFields() && (
                  <>
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Subject</Text>
                        <View style={styles.selectContainer}>
                          <TouchableOpacity
                            style={styles.select}
                            onPress={() => setShowSubjectDropdown(!showSubjectDropdown)}
                          >
                            <Text style={[styles.selectText, !subjectId && styles.selectPlaceholder]}>
                              {subjectId ? subjects.find(s => s.id === subjectId)?.name || 'Select...' : 'Select subject'}
                            </Text>
                            <ChevronDown size={16} color={SUB} />
                          </TouchableOpacity>
                          {showSubjectDropdown && subjects.length > 0 && (
                            <View style={styles.selectOptions}>
                              <TouchableOpacity
                                onPress={() => {
                                  setSubjectId(null);
                                  setShowSubjectDropdown(false);
                                }}
                                style={[styles.selectOption, !subjectId && styles.selectOptionActive]}
                              >
                                <Text style={[styles.selectOptionText, !subjectId && styles.selectOptionTextActive]}>
                                  None
                                </Text>
                              </TouchableOpacity>
                              {subjects.map((subj) => (
                                <TouchableOpacity
                                  key={subj.id}
                                  onPress={() => {
                                    setSubjectId(subj.id);
                                    setShowSubjectDropdown(false);
                                  }}
                                  style={[styles.selectOption, subjectId === subj.id && styles.selectOptionActive]}
                                >
                                  <Text style={[styles.selectOptionText, subjectId === subj.id && styles.selectOptionTextActive]}>
                                    {subj.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Unit / Topic</Text>
                        <TextInput
                          placeholder="e.g. Algebra I – Linear Equations"
                          placeholderTextColor={MUTED}
                          value={unit}
                          onChangeText={setUnit}
                          style={styles.input}
                        />
                      </View>
                    </SafeFieldRow>
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Grade (optional)</Text>
                        <TextInput
                          placeholder="e.g. B+ or 88%"
                          placeholderTextColor={MUTED}
                          value={grade}
                          onChangeText={setGrade}
                          style={styles.input}
                        />
                      </View>
                      {subjectGoals.length > 0 && (
                        <View style={styles.field}>
                          <Text style={styles.fieldLabel}>Link to Goal</Text>
                          <View style={styles.selectContainer}>
                            <TouchableOpacity 
                              style={styles.select}
                              onPress={() => setShowGoalDropdown(!showGoalDropdown)}
                            >
                              <Text style={[styles.selectText, !goalLink && styles.selectPlaceholder]}>
                                {goalLink ? `Goal (${subjectGoals.find(g => g.id === goalLink)?.minutes_per_week || 0} min/week)` : 'Optional'}
                              </Text>
                              <ChevronDown size={16} color={SUB} />
                            </TouchableOpacity>
                            {showGoalDropdown && (
                              <View style={styles.selectOptions}>
                                <TouchableOpacity
                                  onPress={() => {
                                    setGoalLink(null);
                                    setShowGoalDropdown(false);
                                  }}
                                  style={[styles.selectOption, !goalLink && styles.selectOptionActive]}
                                >
                                  <Text style={[styles.selectOptionText, !goalLink && styles.selectOptionTextActive]}>
                                    None
                                  </Text>
                                </TouchableOpacity>
                                {subjectGoals
                                  .filter(g => {
                                    // subject_goals.subject_id is TEXT, so we need to match by subject name or ID
                                    if (!subjectId) return true;
                                    // Try to match by UUID if subject_id is UUID, otherwise match by name
                                    const subject = subjects.find(s => s.id === subjectId);
                                    return subject && (g.subject_id === subjectId || g.subject_id === subject.name || g.subject_id === subject.id);
                                  })
                                  .map((goal) => (
                                    <TouchableOpacity
                                      key={goal.id}
                                      onPress={() => {
                                        setGoalLink(goal.id);
                                        setShowGoalDropdown(false);
                                      }}
                                      style={[styles.selectOption, goalLink === goal.id && styles.selectOptionActive]}
                                    >
                                      <Text style={[styles.selectOptionText, goalLink === goal.id && styles.selectOptionTextActive]}>
                                        {subjects.find(s => s.id === goal.subject_id || s.name === goal.subject_id)?.name || goal.subject_id || 'Subject'} - {goal.minutes_per_week} min/week
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                              </View>
                            )}
                          </View>
                        </View>
                      )}
                    </SafeFieldRow>
                  </>
                )}

                {/* Location/Mode fields - shown for Appointment/Travel/Activity/Sport */}
                {showLocationFields() && (
                  <>
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Location</Text>
                        <TextInput
                          placeholder="e.g. Library, Park, etc."
                          placeholderTextColor={MUTED}
                          value={location}
                          onChangeText={setLocation}
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Mode</Text>
                        <SafeView style={styles.dropdownContainer}>
                          <ChipRow style={styles.dropdownRow}>{MODE_OPTIONS.map((m) => (
                              <TouchableOpacity
                                key={m}
                                onPress={() => setMode(mode === m ? '' : m)}
                                style={[
                                  styles.dropdownOption,
                                  mode === m && styles.dropdownOptionActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.dropdownOptionText,
                                    mode === m && styles.dropdownOptionTextActive,
                                  ]}
                                >
                                  {m.charAt(0).toUpperCase() + m.slice(1)}
                                </Text>
                              </TouchableOpacity>
                            ))}</ChipRow>
                        </SafeView>
                      </View>
                    </SafeFieldRow>
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Instructor / Host (optional)</Text>
                        <TextInput
                          placeholder="e.g. Ms. Chen"
                          placeholderTextColor={MUTED}
                          value={instructor}
                          onChangeText={setInstructor}
                          style={styles.input}
                        />
                      </View>
                    </SafeFieldRow>
                  </>
                )}
              </SafeView>
            )}

            {/* Event Type selector - always visible */}
            {!showAcademicFields() && !showLocationFields() && (
              <SafeFieldRow style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Event Type (optional)</Text>
                  <SafeView style={styles.dropdownContainer}>
                    <ChipRow style={styles.dropdownRow}>{EVENT_TYPES.map((type) => (
                        <TouchableOpacity
                          key={type}
                          onPress={() => setEventType(eventType === type ? '' : type)}
                          style={[
                            styles.dropdownOption,
                            eventType === type && styles.dropdownOptionActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              eventType === type && styles.dropdownOptionTextActive,
                            ]}
                          >
                            {type}
                          </Text>
                        </TouchableOpacity>
                      ))}</ChipRow>
                  </SafeView>
                </View>
              </SafeFieldRow>
            )}

            {/* Notes */}
            <TextInput
              placeholder="Notes"
              placeholderTextColor={MUTED}
              value={notes}
              onChangeText={setNotes}
              style={[styles.input, styles.notesInput]}
              multiline
            />
          </SafeView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={submitting || !title.trim()}
              style={[
                styles.createButton,
                (submitting || !title.trim()) && styles.createButtonDisabled,
              ]}
            >
              <Text style={styles.createButtonText}>
                {submitting ? 'Adding…' : 'Add task'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: 720,
    maxWidth: '100%',
    backgroundColor: BG,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    overflow: 'hidden',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: FG,
  },
  chipRow: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  modeOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#ffffff',
  },
  modeOptionActive: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5f5',
  },
  modeOptionText: {
    color: FG,
    fontSize: 13,
    fontWeight: '500',
  },
  modeOptionTextActive: {
    color: FG,
    fontWeight: '600',
  },
  modeInfo: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  modeInfoText: {
    color: SUB,
    fontSize: 13,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_BG,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    marginRight: 8,
  },
  chipText: {
    color: FG,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  chipLabel: {
    color: SUB,
    marginRight: 8,
  },
  chipScroll: {
    gap: 8,
  },
  chipOption: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CHIP_BORDER,
  },
  chipOptionActive: {
    backgroundColor: '#e0f2fe',
  },
  chipOptionActivePriority: {
    backgroundColor: '#fee2e2',
  },
  chipOptionText: {
    color: FG,
    fontSize: 12,
  },
  chipOptionTextActive: {
    fontWeight: '600',
  },
  todayButton: {
    marginLeft: 10,
  },
  todayText: {
    color: SUB,
    textDecorationLine: 'underline',
    fontSize: 12,
  },
  labelsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: 260,
  },
  labelChip: {
    backgroundColor: '#eef2ff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  labelChipText: {
    color: FG,
    fontSize: 12,
  },
  suggestedTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  suggestedTagChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#fff',
  },
  suggestedTagChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  suggestedTagText: {
    color: FG,
    fontSize: 12,
    fontWeight: '500',
  },
  suggestedTagTextActive: {
    fontWeight: '600',
    color: FG,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  timeSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  timeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
  },
  allDayControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allDayLabel: {
    color: SUB,
    fontSize: 13,
  },
  timeInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: FG,
    backgroundColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    color: FG,
    marginBottom: 10,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  cancelText: {
    color: SUB,
  },
  createButton: {
    backgroundColor: ACCENT,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  createButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  academicSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  field: {
    flex: 1,
  },
  fieldLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '500',
  },
  dropdownContainer: {
    flexDirection: 'row',
  },
  dropdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dropdownOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#fff',
  },
  dropdownOptionActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  dropdownOptionText: {
    color: FG,
    fontSize: 12,
  },
  dropdownOptionTextActive: {
    fontWeight: '600',
    color: FG,
  },
  selectContainer: {
    position: 'relative',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  selectText: {
    color: FG,
    fontSize: 14,
  },
  selectPlaceholder: {
    color: MUTED,
  },
  selectOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    marginTop: 4,
    maxHeight: 200,
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  selectOptionActive: {
    backgroundColor: '#e0f2fe',
  },
  selectOptionText: {
    color: FG,
    fontSize: 14,
  },
  selectOptionTextActive: {
    fontWeight: '600',
  },
});


import React, { useState, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Platform, Modal } from 'react-native';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useModalStackElevation } from './hooks/useModalStackElevation';

const GRADES = ['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12'];
const STATES = ['None','AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
const INTERESTS = ['STEM','Reading','Writing','Arts','Music','Sports','Outdoors','Languages','History','Coding','Woodworking','Other'];

// Support profile options
const DIAGNOSES = [
  'Attention regulation (e.g., focus shifts quickly)',
  'Reading / decoding challenges',
  'Math / number sense challenges',
  'Writing or fine-motor challenges',
  'Auditory processing challenges (e.g., following spoken directions)',
  'Visual processing challenges (e.g., interpreting visuals or layouts)',
  'Neurodiverse',
  'Gifted',
  'Other'
];
const LEARNING_MODALITIES = ['Visual', 'Hands-on', 'Verbal', 'Repetition-based', 'Short bursts (Pomodoro-like)'];
const SUPPORT_NEEDS = [
  'Frequent breaks',
  'Step-by-step instructions',
  'Visual supports',
  'Chunked tasks',
  'Allow extra processing time',
  'Quiet workspace',
  'Movement breaks',
  'Multi-sensory instruction',
  'One-on-one guidance'
];
const EXECUTIVE_FUNCTION = [
  'Difficulty with transitions',
  'Difficulty sustaining attention',
  'Difficulty planning tasks'
];

// Limit to 8 avatars as per spec
const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8'];

// Date picker chip style (match Add Event / TaskCreateModal)
const FG = '#111827';
const SUB = '#6b7280';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function toDisplayDate(s) {
  if (!s || typeof s !== 'string') return null;
  try {
    const d = new Date(s + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) { return null; }
}
function parseDateSafe(s) {
  if (!s || typeof s !== 'string') return null;
  try {
    const d = new Date(s + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d;
  } catch (_) { return null; }
}
function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const AddChildForm = forwardRef(({ onSubmit, initial = {}, submitting = false, onValidationChange }, ref) => {
  const [name, setName] = useState(initial.name || '');
  const [nickname, setNickname] = useState(initial.nickname || '');
  const [age, setAge] = useState(initial.age ? String(initial.age) : '');
  const [grade, setGrade] = useState(initial.grade || initial.grade_label || '');
  const [standardsState, setStandardsState] = useState(initial.standards_state || initial.standardsState || 'None');
  const [interests, setInterests] = useState(() => {
    const arr = Array.isArray(initial.interests) ? initial.interests : [];
    const otherItem = arr.find((i) => typeof i === 'string' && i.startsWith('Other: '));
    if (!otherItem) return arr;
    return arr.filter((i) => i !== otherItem).concat('Other');
  });
  const [avatar, setAvatar] = useState(initial.avatar || initial.avatar_url || 'prof1');
  
  // Support profile state
  const [diagnoses, setDiagnoses] = useState(Array.isArray(initial.diagnoses) ? initial.diagnoses : []);
  const [learningModalities, setLearningModalities] = useState(Array.isArray(initial.learning_modalities) ? initial.learning_modalities : []);
  const [supportNeeds, setSupportNeeds] = useState(Array.isArray(initial.support_needs) ? initial.support_needs : []);
  const [executiveFunction, setExecutiveFunction] = useState(Array.isArray(initial.executive_function) ? initial.executive_function : []);
  const [supportNotes, setSupportNotes] = useState(initial.support_notes || '');
  const [otherDiagnosis, setOtherDiagnosis] = useState('');
  const [otherInterest, setOtherInterest] = useState(() => {
    const arr = Array.isArray(initial.interests) ? initial.interests : [];
    const otherItem = arr.find((i) => typeof i === 'string' && i.startsWith('Other: '));
    return otherItem ? otherItem.replace(/^Other: \s*/, '') : '';
  });

  // School year & target (optional) — used for attendance / progress
  const [targetMode, setTargetMode] = useState(initial.targetMode || '');
  const [targetDays, setTargetDays] = useState(initial.targetDays != null ? String(initial.targetDays) : '');
  const [targetHours, setTargetHours] = useState(initial.targetHours != null ? String(initial.targetHours) : '');
  const [schoolYearStart, setSchoolYearStart] = useState(initial.schoolYearStart || '');
  const [schoolYearEnd, setSchoolYearEnd] = useState(initial.schoolYearEnd || '');
  const [showDatePickerFor, setShowDatePickerFor] = useState(null);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => {
    const s = initial.schoolYearStart || '';
    const d = parseDateSafe(s);
    return d || new Date();
  });
  const datePickerOverlayRef = useRef(null);
  useModalStackElevation(datePickerOverlayRef, !!showDatePickerFor, 50000);

  // Update form when initial data changes (for edit mode)
  useEffect(() => {
    if (initial.name !== undefined) setName(initial.name || '');
    if (initial.nickname !== undefined) setNickname(initial.nickname || '');
    if (initial.age !== undefined) setAge(initial.age ? String(initial.age) : '');
    if (initial.grade !== undefined || initial.grade_label !== undefined) {
      setGrade(initial.grade || initial.grade_label || '');
    }
    if (initial.standards_state !== undefined || initial.standardsState !== undefined) {
      setStandardsState(initial.standards_state || initial.standardsState || 'None');
    }
    if (initial.interests !== undefined) {
      const arr = Array.isArray(initial.interests) ? initial.interests : [];
      const otherItem = arr.find((i) => typeof i === 'string' && i.startsWith('Other: '));
      if (otherItem) {
        setInterests(arr.filter((i) => i !== otherItem).concat('Other'));
        setOtherInterest(otherItem.replace(/^Other: \s*/, ''));
      } else {
        setInterests(arr);
        setOtherInterest('');
      }
    }
    if (initial.avatar !== undefined || initial.avatar_url !== undefined) {
      setAvatar(initial.avatar || initial.avatar_url || 'prof1');
    }
    if (initial.diagnoses !== undefined) {
      setDiagnoses(Array.isArray(initial.diagnoses) ? initial.diagnoses : []);
    }
    if (initial.learning_modalities !== undefined) {
      setLearningModalities(Array.isArray(initial.learning_modalities) ? initial.learning_modalities : []);
    }
    if (initial.support_needs !== undefined) {
      setSupportNeeds(Array.isArray(initial.support_needs) ? initial.support_needs : []);
    }
    if (initial.executive_function !== undefined) {
      setExecutiveFunction(Array.isArray(initial.executive_function) ? initial.executive_function : []);
    }
    if (initial.support_notes !== undefined) {
      setSupportNotes(initial.support_notes || '');
    }
    if (initial.targetMode !== undefined) setTargetMode(initial.targetMode || '');
    if (initial.targetDays !== undefined) setTargetDays(initial.targetDays != null ? String(initial.targetDays) : '');
    if (initial.targetHours !== undefined) setTargetHours(initial.targetHours != null ? String(initial.targetHours) : '');
    if (initial.schoolYearStart !== undefined) setSchoolYearStart(initial.schoolYearStart || '');
    if (initial.schoolYearEnd !== undefined) setSchoolYearEnd(initial.schoolYearEnd || '');
  }, [initial]);

  const avatarSources = {
    prof1: require('../assets/prof1.png'),
    prof2: require('../assets/prof2.png'),
    prof3: require('../assets/prof3.png'),
    prof4: require('../assets/prof4.png'),
    prof5: require('../assets/prof5.png'),
    prof6: require('../assets/prof6.png'),
    prof7: require('../assets/prof7.png'),
    prof8: require('../assets/prof8.png'),
  };

  const toggleFromList = (value, list, setList) => {
    if (list.includes(value)) setList(list.filter(v => v !== value));
    else setList([...list, value]);
  };

  const canSubmit = name.trim() && age && grade && avatar;

  // Notify parent of validation changes
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(canSubmit);
    }
  }, [canSubmit, onValidationChange]);

  // Expose submit handler to parent via ref
  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    canSubmit: canSubmit,
  }));

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    
    // Handle "Other" diagnosis
    let finalDiagnoses = [...diagnoses];
    if (diagnoses.includes('Other') && otherDiagnosis.trim()) {
      finalDiagnoses = diagnoses.filter(d => d !== 'Other');
      finalDiagnoses.push(`Other: ${otherDiagnosis.trim()}`);
    }
    // Handle "Other" interest
    let finalInterests = [...(interests || [])];
    if (interests && interests.includes('Other') && otherInterest.trim()) {
      finalInterests = interests.filter((i) => i !== 'Other');
      finalInterests.push(`Other: ${otherInterest.trim()}`);
    }

    const payload = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      age: Number(age),
      grade: grade || null,
      standardsState: standardsState === 'None' ? null : standardsState,
      interests: finalInterests,
      avatar: avatar || null,
      // Support profile fields (only include if any are filled)
      diagnoses: finalDiagnoses.length > 0 ? finalDiagnoses : null,
      learningModalities: learningModalities.length > 0 ? learningModalities : null,
      supportNeeds: supportNeeds.length > 0 ? supportNeeds : null,
      executiveFunction: executiveFunction.length > 0 ? executiveFunction : null,
      supportNotes: supportNotes.trim() || null,
      // School year (optional) — applied to family academic year
      targetMode: targetMode || null,
      targetDays: targetMode === 'days' && targetDays.trim() ? parseInt(targetDays, 10) : null,
      targetHours: targetMode === 'hours' && targetHours.trim() ? parseInt(targetHours, 10) : null,
      schoolYearStart: schoolYearStart.trim() || null,
      schoolYearEnd: schoolYearEnd.trim() || null,
    };
    
    onSubmit && onSubmit(payload);
  };

  return (
    <View style={styles.container}>
      {/* Section: Student Basics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Student Basics</Text>
        <Text style={styles.sectionSubtitle}>Shown in planner, AI summaries, and child dashboard.</Text>

        <View style={styles.field}> 
          <Text style={styles.label}>Name or Nickname<Text style={styles.required}> *</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Lily"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.hint}>Use a nickname if you prefer.</Text>
        </View>

        <View style={styles.fieldRow}> 
          <View style={[styles.field, styles.fieldHalf]}>
            <Text style={styles.label}>Age<Text style={styles.required}> *</Text></Text>
            <View style={styles.chipsWrap}>
              {Array.from({ length: 18 }, (_, i) => i + 3).map(n => (
                <TouchableOpacity 
                  key={n} 
                  style={[styles.ageButton, Number(age) === n && styles.ageButtonSelected]} 
                  onPress={() => setAge(String(n))}
                >
                  <Text style={[styles.ageButtonText, Number(age) === n && styles.ageButtonTextSelected]}>
                    {String(n)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.field, styles.fieldHalf]}>
            <Text style={styles.label}>Grade<Text style={styles.required}> *</Text></Text>
            <Text style={[styles.hint, { marginTop: 2, marginBottom: 8 }]}>(This can be a guess!)</Text>
            <View style={styles.chipsWrap}>
              {GRADES.map(g => (
                <TouchableOpacity 
                  key={g} 
                  style={[styles.chip, grade === g && styles.chipSelected]} 
                  onPress={() => setGrade(g)}
                >
                  <Text style={[styles.chipText, grade === g && styles.chipTextSelected]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.field}> 
          <Text style={styles.label}>Choose Avatar<Text style={styles.required}> *</Text></Text>
          <View style={styles.avatarsWrap}>
            {AVATAR_KEYS.map(key => (
              <TouchableOpacity 
                key={key} 
                onPress={() => setAvatar(key)} 
                style={[styles.avatarCell, avatar === key && styles.avatarCellSelected]}
              >
                <Image source={avatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Section: Interests */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interests</Text>
        <View style={styles.chipsWrap}>
          {INTERESTS.map(it => (
            <TouchableOpacity 
              key={it} 
              style={[styles.chip, interests.includes(it) && styles.chipSelected]} 
              onPress={() => toggleFromList(it, interests, setInterests)}
            >
              <Text style={[styles.chipText, interests.includes(it) && styles.chipTextSelected]}>{it}</Text>
            </TouchableOpacity>
          ))}
          {interests && interests.filter((i) => typeof i === 'string' && i.startsWith('Other: ')).map((custom) => (
            <TouchableOpacity
              key={custom}
              style={[styles.chip, styles.chipSelected]}
              onPress={() => setInterests((prev) => prev.filter((i) => i !== custom))}
            >
              <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {interests && interests.includes('Other') && (
          <View style={styles.otherInterestRow}>
            <TextInput
              style={[styles.input, styles.otherInterestInput]}
              placeholder="Type interest, then tap Add"
              value={otherInterest}
              onChangeText={setOtherInterest}
              placeholderTextColor="#9ca3af"
              onSubmitEditing={() => {
                const t = otherInterest.trim();
                if (!t) return;
                setInterests((prev) => [...prev.filter((i) => i !== 'Other'), `Other: ${t}`]);
                setOtherInterest('');
              }}
            />
            <TouchableOpacity
              onPress={() => {
                const t = otherInterest.trim();
                if (!t) return;
                setInterests((prev) => [...prev.filter((i) => i !== 'Other'), `Other: ${t}`]);
                setOtherInterest('');
              }}
              style={[styles.otherConfirmButton, !otherInterest.trim() && styles.otherConfirmButtonDisabled]}
              disabled={!otherInterest.trim()}
            >
              <Check size={20} color={otherInterest.trim() ? '#ffffff' : '#9ca3af'} strokeWidth={2.5} />
              <Text style={[styles.otherConfirmButtonText, !otherInterest.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Section: School year (optional) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>School year</Text>
        <Text style={styles.sectionSubtitle}>(Optional — used for attendance and progress tracking)</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Target</Text>
          <View style={styles.chipsWrap}>
            <TouchableOpacity
              style={[styles.chip, targetMode === 'days' && styles.chipSelected]}
              onPress={() => setTargetMode('days')}
            >
              <Text style={[styles.chipText, targetMode === 'days' && styles.chipTextSelected]}>Target days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, targetMode === 'hours' && styles.chipSelected]}
              onPress={() => setTargetMode('hours')}
            >
              <Text style={[styles.chipText, targetMode === 'hours' && styles.chipTextSelected]}>Target hours</Text>
            </TouchableOpacity>
          </View>
          {targetMode === 'days' && (
            <TextInput
              style={[styles.input, { marginTop: 8, maxWidth: 120 }]}
              placeholder="e.g. 180"
              value={targetDays}
              onChangeText={setTargetDays}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />
          )}
          {targetMode === 'hours' && (
            <TextInput
              style={[styles.input, { marginTop: 8, maxWidth: 120 }]}
              placeholder="e.g. 1000"
              value={targetHours}
              onChangeText={setTargetHours}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>School year start</Text>
          <View style={styles.dateChipRow}>
            <View style={styles.dateChip}>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearStart) || new Date(); setSchoolYearStart(toDateStr(addDays(d, -1))); }}>
                <ChevronLeft size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { const d = parseDateSafe(schoolYearStart) || new Date(); setCalendarViewMonth(d); setShowDatePickerFor('start'); }}
                style={styles.dateChipCenter}
              >
                <Text style={styles.dateChipText}>{toDisplayDate(schoolYearStart) || 'Select start date'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearStart) || new Date(); setSchoolYearStart(toDateStr(addDays(d, 1))); }}>
                <ChevronRight size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSchoolYearStart(toDateStr(new Date())); }} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>School year end</Text>
          <View style={styles.dateChipRow}>
            <View style={styles.dateChip}>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearEnd) || new Date(); setSchoolYearEnd(toDateStr(addDays(d, -1))); }}>
                <ChevronLeft size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { const d = parseDateSafe(schoolYearEnd) || new Date(); setCalendarViewMonth(d); setShowDatePickerFor('end'); }}
                style={styles.dateChipCenter}
              >
                <Text style={styles.dateChipText}>{toDisplayDate(schoolYearEnd) || 'Select end date'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearEnd) || new Date(); setSchoolYearEnd(toDateStr(addDays(d, 1))); }}>
                <ChevronRight size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSchoolYearEnd(toDateStr(new Date())); }} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {showDatePickerFor ? (
          <Modal animationType="fade" transparent visible onRequestClose={() => setShowDatePickerFor(null)} statusBarTranslucent>
            <TouchableOpacity ref={datePickerOverlayRef} style={[styles.datePickerOverlay, styles.datePickerOverlayZ]} activeOpacity={1} onPress={() => setShowDatePickerFor(null)}>
              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.datePickerModal, styles.datePickerModalZ]}>
                <View style={styles.datePickerMonthRow}>
                  <TouchableOpacity onPress={() => setCalendarViewMonth(addDays(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), 1), -1))} style={{ padding: 4 }}>
                    <ChevronLeft size={20} color={FG} />
                  </TouchableOpacity>
                  <Text style={styles.datePickerMonthText}>{calendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                  <TouchableOpacity onPress={() => setCalendarViewMonth(addDays(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 1), 0))} style={{ padding: 4 }}>
                    <ChevronRight size={20} color={FG} />
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerYearRow}>
                  <TouchableOpacity onPress={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear() - 1, calendarViewMonth.getMonth(), 1))} style={{ padding: 4 }}>
                    <Text style={styles.datePickerSubText}>← Year</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { const t = new Date(); setCalendarViewMonth(t); if (showDatePickerFor === 'start') setSchoolYearStart(toDateStr(t)); else setSchoolYearEnd(toDateStr(t)); setShowDatePickerFor(null); }} style={{ padding: 4 }}>
                    <Text style={[styles.datePickerSubText, { textDecorationLine: 'underline' }]}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear() + 1, calendarViewMonth.getMonth(), 1))} style={{ padding: 4 }}>
                    <Text style={styles.datePickerSubText}>Year →</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ marginBottom: 8, flexDirection: 'row' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 11, color: SUB, fontWeight: '500' }}>{day}</Text></View>
                  ))}
                </View>
                {(() => {
                  const year = calendarViewMonth.getFullYear();
                  const month = calendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay());
                  const days = [];
                  const current = new Date(startDate);
                  for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                  const currentVal = showDatePickerFor === 'start' ? schoolYearStart : schoolYearEnd;
                  const selectedDate = parseDateSafe(currentVal);
                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();
                            const isToday = day.toDateString() === new Date().toDateString();
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  if (showDatePickerFor === 'start') setSchoolYearStart(toDateStr(day));
                                  else setSchoolYearEnd(toDateStr(day));
                                  setShowDatePickerFor(null);
                                }}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? ACCENT : 'transparent',
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? ACCENT : 'transparent',
                                }}
                              >
                                <Text style={{ fontSize: 13, color: isSelected ? '#FFFFFF' : (isCurrentMonth ? FG : '#9ca3af'), fontWeight: isSelected || isToday ? '600' : '400' }}>{day.getDate()}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        ) : null}
      </View>

      {/* Section: Learning Profile & Supports (Optional) */}
      <View style={[styles.section, styles.sectionLast]}>
        <Text style={styles.sectionTitle}>Learning Profile & Supports</Text>
        <Text style={styles.sectionSubtitle}>(Optional)</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Follow State Standards?</Text>
          <View style={styles.chipsWrap}>
            {STATES.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, standardsState === s && styles.chipSelected]}
                onPress={() => setStandardsState(s)}
              >
                <Text style={[styles.chipText, standardsState === s && styles.chipTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Learning & processing needs */}
        <View style={styles.field}>
          <Text style={styles.label}>Learning & processing needs</Text>
          <View style={styles.chipsWrap}>
            {DIAGNOSES.map(d => (
              <TouchableOpacity 
                key={d} 
                style={[styles.chip, diagnoses.includes(d) && styles.chipSelected]} 
                onPress={() => toggleFromList(d, diagnoses, setDiagnoses)}
              >
                <Text style={[styles.chipText, diagnoses.includes(d) && styles.chipTextSelected]}>{d}</Text>
              </TouchableOpacity>
            ))}
            {diagnoses.filter((d) => typeof d === 'string' && d.startsWith('Other: ')).map((custom) => (
              <TouchableOpacity
                key={custom}
                style={[styles.chip, styles.chipSelected]}
                onPress={() => setDiagnoses((prev) => prev.filter((x) => x !== custom))}
              >
                <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {diagnoses.includes('Other') && (
            <View style={styles.otherInterestRow}>
              <TextInput
                style={[styles.input, styles.otherInterestInput]}
                placeholder="Specify other, then tap checkmark"
                value={otherDiagnosis}
                onChangeText={setOtherDiagnosis}
                placeholderTextColor="#9ca3af"
                onSubmitEditing={() => {
                  const t = otherDiagnosis.trim();
                  if (!t) return;
                  setDiagnoses((prev) => [...prev.filter((x) => x !== 'Other'), `Other: ${t}`]);
                  setOtherDiagnosis('');
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  const t = otherDiagnosis.trim();
                  if (!t) return;
                  setDiagnoses((prev) => [...prev.filter((x) => x !== 'Other'), `Other: ${t}`]);
                  setOtherDiagnosis('');
                }}
                style={[styles.otherConfirmButton, !otherDiagnosis.trim() && styles.otherConfirmButtonDisabled]}
                disabled={!otherDiagnosis.trim()}
              >
                <Check size={20} color={otherDiagnosis.trim() ? '#ffffff' : '#9ca3af'} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Executive function needs */}
        <View style={styles.field}>
          <Text style={styles.label}>Executive function needs</Text>
          <View style={styles.chipsWrap}>
            {EXECUTIVE_FUNCTION.map(ef => (
              <TouchableOpacity 
                key={ef} 
                style={[styles.chip, executiveFunction.includes(ef) && styles.chipSelected]} 
                onPress={() => toggleFromList(ef, executiveFunction, setExecutiveFunction)}
              >
                <Text style={[styles.chipText, executiveFunction.includes(ef) && styles.chipTextSelected]}>{ef}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Preferred learning modalities */}
        <View style={styles.field}>
          <Text style={styles.label}>Preferred learning modalities</Text>
          <View style={styles.chipsWrap}>
            {LEARNING_MODALITIES.map(mod => (
              <TouchableOpacity 
                key={mod} 
                style={[styles.chip, learningModalities.includes(mod) && styles.chipSelected]} 
                onPress={() => toggleFromList(mod, learningModalities, setLearningModalities)}
              >
                <Text style={[styles.chipText, learningModalities.includes(mod) && styles.chipTextSelected]}>{mod}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Support needs */}
        <View style={styles.field}>
          <Text style={styles.label}>Support needs</Text>
          <View style={styles.chipsWrap}>
            {SUPPORT_NEEDS.map(need => (
              <TouchableOpacity 
                key={need} 
                style={[styles.chip, supportNeeds.includes(need) && styles.chipSelected]} 
                onPress={() => toggleFromList(need, supportNeeds, setSupportNeeds)}
              >
                <Text style={[styles.chipText, supportNeeds.includes(need) && styles.chipTextSelected]}>{need}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.label}>Additional notes</Text>
          <Text style={styles.hint}>(Optional - any additional information about learning supports)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add any additional notes about learning supports..."
            value={supportNotes}
            onChangeText={setSupportNotes}
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>
    </View>
  );
});

AddChildForm.displayName = 'AddChildForm';

export default AddChildForm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  section: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 24,
    fontWeight: '400',
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  field: {
    marginBottom: 24,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 16,
  },
  fieldHalf: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  required: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    fontSize: 14,
    color: '#111827',
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  hint: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 6,
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageButtonSelected: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  ageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  ageButtonTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },
  chipSelected: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  chipText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  otherInterestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  otherInterestInput: {
    flex: 1,
    marginTop: 0,
    minWidth: 0,
  },
  otherConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  otherConfirmButtonDisabled: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  otherConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  otherConfirmButtonTextDisabled: {
    color: '#9ca3af',
  },
  avatarsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avatarCell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  avatarCellSelected: {
    borderColor: '#B8D7F9',
    backgroundColor: '#f0f9ff',
  },
  avatarImg: {
    width: 48,
    height: 48,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
    paddingBottom: 12,
  },
  dateChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-start',
    maxWidth: 260,
    width: '100%',
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_BG,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    minHeight: 40,
    flex: 1,
    maxWidth: 260,
  },
  dateChipCenter: { flex: 1, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  dateChipText: {
    color: FG,
    fontWeight: '600',
    fontSize: 14,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  todayBtn: { marginLeft: 4 },
  todayBtnText: {
    color: SUB,
    textDecorationLine: 'underline',
    fontSize: 12,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerOverlayZ: Platform.OS === 'web' ? { zIndex: 50000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } : { elevation: 10000 },
  datePickerModalZ: Platform.OS === 'web' ? { zIndex: 50001 } : { elevation: 10001 },
  datePickerModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: Platform.OS === 'web' ? 280 : '90%',
    maxWidth: 280,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' } : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }),
  },
  datePickerMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  datePickerMonthText: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  datePickerYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  datePickerSubText: { fontSize: 12, color: SUB, ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) },
});


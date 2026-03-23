import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Image, Animated, Modal } from 'react-native';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

const AVATAR_SIZE = 64;
const AVATAR_PREVIEW_SIZE = 72;

const GRADES = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const STATES = ['None', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'];
const INTERESTS = ['STEM', 'Reading', 'Writing', 'Arts', 'Music', 'Sports', 'Outdoors', 'Languages', 'History', 'Coding', 'Woodworking', 'Other'];
const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8'];

const DIAGNOSES = [
  'Attention regulation (e.g., focus shifts quickly)',
  'Reading / decoding challenges',
  'Math / number sense challenges',
  'Writing or fine-motor challenges',
  'Auditory processing challenges (e.g., following spoken directions)',
  'Visual processing challenges (e.g., interpreting visuals or layouts)',
  'Neurodiverse',
  'Gifted',
  'Other',
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
  'One-on-one guidance',
];
const EXECUTIVE_FUNCTION = [
  'Difficulty with transitions',
  'Difficulty sustaining attention',
  'Difficulty planning tasks',
];

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

const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
};

export default function AddChildStep({ createdChildren = [], onAddChild, onContinueWithNewChild, onRemoveChild, onContinue, isSaving, isStudentOnboarding = false }) {
  // Required fields (match AddChildModal/AddChildForm)
  const [name, setName] = useState('');
  const [age, setAge] = useState(''); // required
  const [grade, setGrade] = useState(''); // required
  const [standardsState, setStandardsState] = useState('None'); // required (None allowed)
  const [avatar, setAvatar] = useState('prof1'); // required

  // Optional fields (collapsed by default)
  const [showAdditional, setShowAdditional] = useState(false);
  const [interests, setInterests] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [learningModalities, setLearningModalities] = useState([]);
  const [supportNeeds, setSupportNeeds] = useState([]);
  const [executiveFunction, setExecutiveFunction] = useState([]);
  const [otherDiagnosis, setOtherDiagnosis] = useState('');
  const [otherInterest, setOtherInterest] = useState('');
  const [targetMode, setTargetMode] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [schoolYearStart, setSchoolYearStart] = useState('');
  const [schoolYearEnd, setSchoolYearEnd] = useState('');
  const [showDatePickerFor, setShowDatePickerFor] = useState(null);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date());
  const [datePickerPortalContainer, setDatePickerPortalContainer] = useState(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (showDatePickerFor) {
      const div = document.createElement('div');
      div.setAttribute('data-date-picker-portal', '1');
      div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:50000;display:flex;flex-direction:column;';
      document.body.appendChild(div);
      setDatePickerPortalContainer(div);
      return () => {
        if (div.parentNode) div.parentNode.removeChild(div);
        setDatePickerPortalContainer(null);
      };
    }
  }, [showDatePickerFor]);

  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [hoveredAvatar, setHoveredAvatar] = useState(null);
  const continueScale = useRef(new Animated.Value(1)).current;

  const formValid = Boolean(name.trim() && age && grade && avatar);
  const formEmpty = !name.trim() && !age && !grade;
  // If user has added at least one child and current form has any content (partial second child), they must finish or clear before continuing
  const canContinue = formValid || (createdChildren.length >= 1 && formEmpty);
  const formHasContent = Boolean(name.trim() || age || grade);

  const missingRequired = [
    !name.trim() && (isStudentOnboarding ? 'Name' : 'Child name'),
    !age && 'Age',
    !grade && 'Grade',
  ].filter(Boolean);
  const showMissingHint = !canContinue && missingRequired.length > 0;

  useEffect(() => {
    if (canContinue) {
      Animated.sequence([
        Animated.timing(continueScale, { toValue: 1.03, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(150),
        Animated.timing(continueScale, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    } else {
      continueScale.setValue(1);
    }
  }, [canContinue]);

  const toggleFromList = (value, list, setList) => {
    if (list.includes(value)) setList(list.filter((v) => v !== value));
    else setList([...list, value]);
  };

  const getChildPayload = () => {
    let finalDiagnoses = [...diagnoses];
    if (diagnoses.includes('Other') && otherDiagnosis.trim()) {
      finalDiagnoses = diagnoses.filter((d) => d !== 'Other');
      finalDiagnoses.push(`Other: ${otherDiagnosis.trim()}`);
    }
    let finalInterests = [...interests];
    if (interests.includes('Other') && otherInterest.trim()) {
      finalInterests = interests.filter((i) => i !== 'Other');
      finalInterests.push(`Other: ${otherInterest.trim()}`);
    }
    return {
      name: name.trim(),
      nickname: null,
      age: Number(age),
      grade: grade,
      standardsState: standardsState === 'None' ? null : standardsState,
      avatar,
      interests: finalInterests,
      diagnoses: finalDiagnoses.length > 0 ? finalDiagnoses : null,
      learningModalities: learningModalities.length > 0 ? learningModalities : null,
      supportNeeds: supportNeeds.length > 0 ? supportNeeds : null,
      executiveFunction: executiveFunction.length > 0 ? executiveFunction : null,
      supportNotes: null,
      targetMode: targetMode || null,
      targetDays: targetMode === 'days' && targetDays.trim() ? parseInt(targetDays, 10) : null,
      targetHours: targetMode === 'hours' && targetHours.trim() ? parseInt(targetHours, 10) : null,
      schoolYearStart: schoolYearStart.trim() || null,
      schoolYearEnd: schoolYearEnd.trim() || null,
    };
  };

  const resetCurrentForm = () => {
    setError(null);
    setName('');
    setAge('');
    setGrade('');
    setStandardsState('None');
    setAvatar('prof1');
    setInterests([]);
    setDiagnoses([]);
    setLearningModalities([]);
    setSupportNeeds([]);
    setExecutiveFunction([]);
    setOtherDiagnosis('');
    setOtherInterest('');
    setShowAdditional(false);
    setTargetMode('');
    setTargetDays('');
    setTargetHours('');
    setSchoolYearStart('');
    setSchoolYearEnd('');
  };

  const handleAddAnother = async () => {
    setError(null);
    if (!formValid) {
      setError('Please enter the required fields (name, age, grade, avatar).');
      return;
    }
    setAdding(true);
    try {
      await onAddChild(getChildPayload());
      resetCurrentForm();
    } catch (e) {
      setError(e?.message ?? 'Failed to add child.');
    } finally {
      setAdding(false);
    }
  };

  const handleContinue = async () => {
    setError(null);
    if (formValid && onContinueWithNewChild) {
      onContinueWithNewChild(getChildPayload());
      return;
    }
    if (formValid) {
      setAdding(true);
      try {
        await onAddChild(getChildPayload());
        onContinue();
      } catch (e) {
        setError(e?.message ?? 'Failed to add child.');
      } finally {
        setAdding(false);
      }
      return;
    }
    if (createdChildren.length >= 1) {
      onContinue();
      return;
    }
    setError('Enter the required fields for at least one child.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.mainHeading}>
        {isStudentOnboarding ? "Let's add some basic profile info" : "Let's add your first learner"}
      </Text>
      {!isStudentOnboarding && (
        <Text style={styles.mainSubtext}>You can edit, add, and delete later on too.</Text>
      )}
      {!isStudentOnboarding && createdChildren.length > 0 && (
        <View style={styles.list}>
          {createdChildren.map((c) => (
            <View key={c.id} style={styles.chipReadOnly}>
              <Text style={styles.chipReadOnlyText}>{c.name}</Text>
              {onRemoveChild ? (
                <TouchableOpacity
                  onPress={() => onRemoveChild(c.id, c.name)}
                  style={styles.chipRemoveBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={isSaving || adding}
                >
                  <X size={14} color="#6B7280" />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Section: Profile — matches AddChildForm order: Name, Age, Grade, Avatar, Follow State Standards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        {/* Live preview — when name + avatar, show profile preview */}
        {name.trim() && (
          <View style={styles.previewWrap}>
            <Image source={avatarSources[avatar]} style={styles.previewAvatar} resizeMode="contain" />
            <Text style={styles.previewName}>{name.trim()}</Text>
            {(age || grade) && (
              <Text style={styles.previewMeta}>
                {[age && `Age ${age}`, grade && `Grade ${grade}`].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        )}
        <Text style={[styles.label, styles.labelFirstInSection]}>
          {isStudentOnboarding ? 'Name' : 'Child name'} <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
            placeholder={isStudentOnboarding ? 'Enter your name' : "Enter child's name"}
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />
        </View>
        <Text style={styles.label}>Age <Text style={styles.requiredAsterisk}>*</Text></Text>
        <View style={styles.row}>
          {(isStudentOnboarding ? Array.from({ length: 6 }, (_, i) => i + 13) : Array.from({ length: 16 }, (_, i) => i + 3)).map((n) => {
            const val = String(n);
            const selected = age === val;
            return (
              <TouchableOpacity
                key={n}
                style={[styles.chipAgeGrade, selected && styles.chipAgeGradeSelected]}
                onPress={() => { setAge(val); setError(null); }}
              >
                <Text style={[styles.chipAgeGradeText, selected && styles.chipAgeGradeTextSelected]}>{val}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.label}>Grade <Text style={styles.requiredAsterisk}>*</Text></Text>
        <View style={styles.row}>
          {GRADES.map((g) => {
            const selected = grade === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.chipAgeGrade, selected && styles.chipAgeGradeSelected]}
                onPress={() => { setGrade(g); setError(null); }}
              >
                <Text style={[styles.chipAgeGradeText, selected && styles.chipAgeGradeTextSelected]}>{g}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.label}>Choose avatar <Text style={styles.requiredAsterisk}>*</Text></Text>
        <View style={styles.avatarsWrap}>
          {AVATAR_KEYS.map((key) => {
            const selected = avatar === key;
            const hovered = hoveredAvatar === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => { setAvatar(key); setError(null); }}
                onMouseEnter={Platform.OS === 'web' ? () => setHoveredAvatar(key) : undefined}
                onMouseLeave={Platform.OS === 'web' ? () => setHoveredAvatar(null) : undefined}
                style={[
                  styles.avatarCell,
                  selected && styles.avatarCellSelected,
                  Platform.OS === 'web' && !selected && hovered && styles.avatarCellHovered,
                ]}
                disabled={isSaving || adding}
              >
                <Image source={avatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.label}>Follow State Standards?</Text>
        <View style={styles.row}>
          {STATES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, standardsState === s && styles.chipSelected]}
              onPress={() => { setStandardsState(s); setError(null); }}
            >
              <Text style={[styles.chipText, standardsState === s && styles.chipTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Section 3 — Optional info */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.additionalToggle}
          onPress={() => setShowAdditional((v) => !v)}
          activeOpacity={0.85}
        >
          <Text style={styles.additionalToggleText}>Show additional fields</Text>
          <View style={styles.additionalToggleIcon}>
            {showAdditional ? <ChevronUp size={16} color="#374151" /> : <ChevronDown size={16} color="#374151" />}
          </View>
        </TouchableOpacity>

      {showAdditional && (
        <View style={styles.additionalSectionInner}>
          <Text style={styles.label}>Interests</Text>
          <View style={styles.row}>
            {INTERESTS.map((it) => (
              <TouchableOpacity
                key={it}
                style={[styles.chip, interests.includes(it) && styles.chipSelected]}
                onPress={() => { toggleFromList(it, interests, setInterests); setError(null); }}
              >
                <Text style={[styles.chipText, interests.includes(it) && styles.chipTextSelected]}>{it}</Text>
              </TouchableOpacity>
            ))}
            {interests.filter((i) => typeof i === 'string' && i.startsWith('Other: ')).map((custom) => (
              <TouchableOpacity
                key={custom}
                style={[styles.chip, styles.chipSelected]}
                onPress={() => setInterests((prev) => prev.filter((i) => i !== custom))}
              >
                <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {interests.includes('Other') && (
            <View style={styles.otherInterestRow}>
              <TextInput
                style={[styles.input, styles.otherInterestInput]}
                placeholder="Type interest, then tap Add"
                value={otherInterest}
                onChangeText={(t) => { setOtherInterest(t); setError(null); }}
                placeholderTextColor="#9CA3AF"
                onSubmitEditing={() => {
                  const t = otherInterest.trim();
                  if (!t) return;
                  setInterests((prev) => [...prev.filter((i) => i !== 'Other'), `Other: ${t}`]);
                  setOtherInterest('');
                  setError(null);
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  const t = otherInterest.trim();
                  if (!t) return;
                  setInterests((prev) => [...prev.filter((i) => i !== 'Other'), `Other: ${t}`]);
                  setOtherInterest('');
                  setError(null);
                }}
                style={[styles.otherConfirmButton, !otherInterest.trim() && styles.otherConfirmButtonDisabled]}
                disabled={!otherInterest.trim()}
              >
                <Check size={20} color={otherInterest.trim() ? '#ffffff' : '#9CA3AF'} strokeWidth={2.5} />
                <Text style={[styles.otherConfirmButtonText, !otherInterest.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.label}>Learning & processing needs</Text>
          <View style={styles.row}>
            {DIAGNOSES.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, diagnoses.includes(d) && styles.chipSelected]}
                onPress={() => { toggleFromList(d, diagnoses, setDiagnoses); setError(null); }}
              >
                <Text style={[styles.chipText, diagnoses.includes(d) && styles.chipTextSelected]}>{d}</Text>
              </TouchableOpacity>
            ))}
            {diagnoses.filter((d) => typeof d === 'string' && d.startsWith('Other: ')).map((custom) => (
              <TouchableOpacity
                key={custom}
                style={[styles.chip, styles.chipSelected]}
                onPress={() => { setDiagnoses((prev) => prev.filter((x) => x !== custom)); setError(null); }}
              >
                <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {diagnoses.includes('Other') && (
            <View style={styles.otherInterestRow}>
              <TextInput
                style={[styles.input, styles.otherInterestInput, { marginTop: 10 }]}
                placeholder="Specify other, then tap checkmark"
                value={otherDiagnosis}
                onChangeText={(t) => { setOtherDiagnosis(t); setError(null); }}
                placeholderTextColor="#9CA3AF"
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
                <Check size={20} color={otherDiagnosis.trim() ? '#ffffff' : '#9CA3AF'} strokeWidth={2.5} />
                <Text style={[styles.otherConfirmButtonText, !otherDiagnosis.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.label}>Executive function needs</Text>
          <View style={styles.row}>
            {EXECUTIVE_FUNCTION.map((ef) => (
              <TouchableOpacity
                key={ef}
                style={[styles.chip, executiveFunction.includes(ef) && styles.chipSelected]}
                onPress={() => { toggleFromList(ef, executiveFunction, setExecutiveFunction); setError(null); }}
              >
                <Text style={[styles.chipText, executiveFunction.includes(ef) && styles.chipTextSelected]}>{ef}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Preferred learning modalities</Text>
          <View style={styles.row}>
            {LEARNING_MODALITIES.map((mod) => (
              <TouchableOpacity
                key={mod}
                style={[styles.chip, learningModalities.includes(mod) && styles.chipSelected]}
                onPress={() => { toggleFromList(mod, learningModalities, setLearningModalities); setError(null); }}
              >
                <Text style={[styles.chipText, learningModalities.includes(mod) && styles.chipTextSelected]}>{mod}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Support needs</Text>
          <View style={styles.row}>
            {SUPPORT_NEEDS.map((need) => (
              <TouchableOpacity
                key={need}
                style={[styles.chip, supportNeeds.includes(need) && styles.chipSelected]}
                onPress={() => { toggleFromList(need, supportNeeds, setSupportNeeds); setError(null); }}
              >
                <Text style={[styles.chipText, supportNeeds.includes(need) && styles.chipTextSelected]}>{need}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.subsectionTitle}>School year (family default)</Text>
          <Text style={[styles.label, { marginBottom: 4 }]}>Optional. One setting for the whole family — pre-fills new plans in Plan My Year.</Text>
          <Text style={styles.label}>Target</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.chip, targetMode === 'days' && styles.chipSelected]}
              onPress={() => { setTargetMode('days'); setError(null); }}
            >
              <Text style={[styles.chipText, targetMode === 'days' && styles.chipTextSelected]}>Target days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, targetMode === 'hours' && styles.chipSelected]}
              onPress={() => { setTargetMode('hours'); setError(null); }}
            >
              <Text style={[styles.chipText, targetMode === 'hours' && styles.chipTextSelected]}>Target hours</Text>
            </TouchableOpacity>
          </View>
          {targetMode === 'days' && (
            <TextInput
              style={[styles.input, { marginTop: 8, maxWidth: 120 }]}
              placeholder="e.g. 180"
              value={targetDays}
              onChangeText={(t) => { setTargetDays(t); setError(null); }}
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
          )}
          {targetMode === 'hours' && (
            <TextInput
              style={[styles.input, { marginTop: 8, maxWidth: 120 }]}
              placeholder="e.g. 1000"
              value={targetHours}
              onChangeText={(t) => { setTargetHours(t); setError(null); }}
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
          )}
          <Text style={styles.label}>School year start</Text>
          <View style={styles.dateChipRow}>
            <View style={styles.dateChip}>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearStart) || new Date(); setSchoolYearStart(toDateStr(addDays(d, -1))); setError(null); }}>
                <ChevronLeft size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearStart) || new Date(); setCalendarViewMonth(d); setShowDatePickerFor('start'); setError(null); }} style={styles.dateChipCenter}>
                <Text style={styles.dateChipText}>{toDisplayDate(schoolYearStart) || 'Select start date'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearStart) || new Date(); setSchoolYearStart(toDateStr(addDays(d, 1))); setError(null); }}>
                <ChevronRight size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSchoolYearStart(toDateStr(new Date())); setError(null); }} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.label}>School year end</Text>
          <View style={styles.dateChipRow}>
            <View style={styles.dateChip}>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearEnd) || new Date(); setSchoolYearEnd(toDateStr(addDays(d, -1))); setError(null); }}>
                <ChevronLeft size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearEnd) || new Date(); setCalendarViewMonth(d); setShowDatePickerFor('end'); setError(null); }} style={styles.dateChipCenter}>
                <Text style={styles.dateChipText}>{toDisplayDate(schoolYearEnd) || 'Select end date'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const d = parseDateSafe(schoolYearEnd) || new Date(); setSchoolYearEnd(toDateStr(addDays(d, 1))); setError(null); }}>
                <ChevronRight size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSchoolYearEnd(toDateStr(new Date())); setError(null); }} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showDatePickerFor ? (
            Platform.OS === 'web' ? (
              datePickerPortalContainer && ReactDOM.createPortal(
                <TouchableOpacity style={[styles.datePickerOverlay, styles.datePickerOverlayZ]} activeOpacity={1} onPress={() => setShowDatePickerFor(null)}>
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
                      <TouchableOpacity onPress={() => { const t = new Date(); setCalendarViewMonth(t); if (showDatePickerFor === 'start') setSchoolYearStart(toDateStr(t)); else setSchoolYearEnd(toDateStr(t)); setShowDatePickerFor(null); setError(null); }} style={{ padding: 4 }}>
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
                                      setError(null);
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
                </TouchableOpacity>,
                datePickerPortalContainer
              )
            ) : (
            <Modal animationType="fade" transparent visible onRequestClose={() => setShowDatePickerFor(null)} statusBarTranslucent>
              <TouchableOpacity style={[styles.datePickerOverlay, styles.datePickerOverlayZ]} activeOpacity={1} onPress={() => setShowDatePickerFor(null)}>
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
                    <TouchableOpacity onPress={() => { const t = new Date(); setCalendarViewMonth(t); if (showDatePickerFor === 'start') setSchoolYearStart(toDateStr(t)); else setSchoolYearEnd(toDateStr(t)); setShowDatePickerFor(null); setError(null); }} style={{ padding: 4 }}>
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
                                    setError(null);
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
            )
          ) : null}
        </View>
      )}
      {!isStudentOnboarding && (
        <View style={styles.addAnotherRow}>
          <TouchableOpacity
              style={[
                styles.addBtn,
                formValid && !isSaving && !adding && styles.addBtnFilled,
                (!formValid || isSaving || adding) && styles.addBtnOutline,
              ]}
              onPress={handleAddAnother}
              disabled={!formValid || isSaving || adding}
              activeOpacity={0.8}
            >
              <Text style={[styles.addBtnText, formValid && !isSaving && !adding && styles.addBtnTextFilled, (!formValid || isSaving || adding) && styles.addBtnTextOutline]}>
                {adding || isSaving ? 'Adding...' : 'Add another child'}
              </Text>
            </TouchableOpacity>
        </View>
      )}
      </View>
      {showMissingHint && (
        <View style={styles.missingHint}>
          <Text style={styles.missingHintText}>To continue:</Text>
          {missingRequired.map((item) => (
            <Text key={item} style={styles.missingHintBullet}>
              • {item}
            </Text>
          ))}
        </View>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Animated.View style={[styles.continueWrap, { transform: [{ scale: continueScale }] }]}>
        <TouchableOpacity
          style={[
            styles.continueBtn,
            (!canContinue || isSaving || adding) && styles.continueBtnDisabled,
          ]}
          onPress={handleContinue}
          disabled={!canContinue || isSaving || adding}
          activeOpacity={0.9}
        >
          <Text
            style={[
              styles.continueBtnText,
              (!canContinue || isSaving || adding) && styles.continueBtnTextDisabled,
            ]}
          >
            {isSaving || adding ? 'Saving…' : `Next: ${(createdChildren.length >= 1 ? createdChildren[0].name : (name.trim() || 'learner'))}'s subjects`}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    paddingBottom: 8,
  },
  mainHeading: {
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.9)',
    marginBottom: 6,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  mainSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  section: {
    marginTop: 8,
    marginBottom: 8,
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  previewAvatar: {
    width: AVATAR_PREVIEW_SIZE,
    height: AVATAR_PREVIEW_SIZE,
    marginBottom: 8,
  },
  previewName: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.95)',
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  previewMeta: {
    fontSize: 14,
    color: '#6B7280',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.8)',
    marginBottom: 8,
    marginTop: 16,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  labelFirstInSection: {
    marginTop: 0,
  },
  requiredAsterisk: {
    color: '#DC2626',
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chipReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  chipRemoveBtn: {
    marginLeft: 4,
    padding: 2,
  },
  chipReadOnlyText: {
    fontSize: 14,
    color: '#1d4ed8',
    fontWeight: '500',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  inputWrap: {
    paddingVertical: 8,
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    height: 48,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  otherInterestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
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
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  otherConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  otherConfirmButtonTextDisabled: {
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  splitCol: {
    flex: 1,
    minWidth: 180,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  chipAgeGrade: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  chipAgeGradeSelected: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  chipAgeGradeText: {
    fontSize: 14,
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  chipAgeGradeTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  addAnotherRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
  },
  addBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  addBtnFilled: {
    borderStyle: 'solid',
    borderColor: '#85C4F2',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  addBtnOutline: {
    borderStyle: 'dashed',
    borderColor: '#C7D2FE',
    backgroundColor: '#FAFBFF',
    opacity: 0.85,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '700',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  addBtnTextFilled: {
    color: '#85C4F2',
  },
  addBtnTextOutline: {
    color: '#85C4F2',
  },
  missingHint: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  missingHintText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  missingHintBullet: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    marginTop: 2,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  continueWrap: {
    alignSelf: 'flex-end',
    marginTop: 24,
    marginBottom: 0,
  },
  continueBtn: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 14px rgba(133,196,242,0.3)',
      cursor: 'pointer',
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  continueBtnDisabled: {
    backgroundColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
      cursor: 'not-allowed',
    }),
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  continueBtnTextDisabled: {
    color: '#9CA3AF',
  },
  avatarsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  avatarCell: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  avatarCellHovered: {
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -2 }],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 4,
    }),
  },
  avatarCellSelected: {
    borderWidth: 2,
    borderColor: '#85C4F2',
    backgroundColor: '#F4F7FF',
    transform: [{ scale: 1.05 }],
    ...(Platform.OS === 'web' && {
      boxShadow: '0 0 0 3px rgba(133,196,242,0.2), 0 6px 16px rgba(133,196,242,0.2)',
    }),
  },
  avatarImg: {
    width: AVATAR_SIZE - 4,
    height: AVATAR_SIZE - 4,
  },
  additionalToggle: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  additionalToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  additionalToggleIcon: {
    marginLeft: 4,
  },
  additionalSectionInner: {
    marginTop: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  textArea: {
    minHeight: 84,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  dateChipRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, alignSelf: 'flex-start', maxWidth: 260, width: '100%' },
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
  todayBtnText: { color: SUB, textDecorationLine: 'underline', fontSize: 12, ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) },
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)', justifyContent: 'center', alignItems: 'center' },
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
  datePickerMonthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  datePickerMonthText: { fontSize: 16, fontWeight: '600', color: FG, ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) },
  datePickerYearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  datePickerSubText: { fontSize: 12, color: SUB, ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) },
});

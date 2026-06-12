import React, { useState, useImperativeHandle, forwardRef, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { ChevronLeft, ChevronRight, Check, BookOpen, Brain, FileText } from 'lucide-react';
import { getChildColorFromAvatar, hexToRgba } from '../utils/avatarColors';
import { ModalSectionCard } from './ui/ModalSectionCard';

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

const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8', 'prof9', 'prof10'];

// Date picker chip style (match Add Event / TaskCreateModal)
const FG = '#111827';
const SUB = '#6b7280';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';
const MUTED = '#9ca3af';

function listSignature(arr) {
  return JSON.stringify([...(Array.isArray(arr) ? arr : [])].map(String).sort());
}

function effectiveDiagnosesForCompare(diagnoses, otherDiagnosis) {
  const d = [...(diagnoses || [])];
  if (d.includes('Other') && (otherDiagnosis || '').trim()) {
    return d.filter((x) => x !== 'Other').concat(`Other: ${otherDiagnosis.trim()}`);
  }
  return d;
}

function effectiveInterestsForCompare(interests, otherInterest) {
  const arr = [...(interests || [])];
  if (arr.includes('Other') && (otherInterest || '').trim()) {
    return arr.filter((x) => x !== 'Other').concat(`Other: ${otherInterest.trim()}`);
  }
  return arr;
}

const AddChildForm = forwardRef(
  (
    {
      onSubmit,
      initial = {},
      submitting = false,
      onValidationChange,
      requireDirtyToSubmit = false,
    },
    ref
  ) => {
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
  const [showLearningSetup, setShowLearningSetup] = useState(false);
  const [showLearningProfile, setShowLearningProfile] = useState(false);
  const [showAdditionalNotes, setShowAdditionalNotes] = useState(false);

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

  const initialSyncKey = useMemo(() => {
    const ini = initial || {};
    return JSON.stringify({
      name: ini.name ?? '',
      nickname: ini.nickname ?? '',
      age: ini.age ?? '',
      grade: ini.grade ?? ini.grade_label ?? '',
      standards: ini.standards_state ?? ini.standardsState ?? 'None',
      interests: listSignature(ini.interests),
      avatar: ini.avatar ?? ini.avatar_url ?? '',
      diagnoses: listSignature(ini.diagnoses),
      learning_modalities: listSignature(ini.learning_modalities),
      support_needs: listSignature(ini.support_needs),
      executive_function: listSignature(ini.executive_function),
      support_notes: ini.support_notes ?? '',
      targetMode: ini.targetMode ?? '',
      targetDays: String(ini.targetDays ?? ''),
      targetHours: String(ini.targetHours ?? ''),
      schoolYearStart: ini.schoolYearStart ?? '',
      schoolYearEnd: ini.schoolYearEnd ?? '',
    });
  }, [
    initial?.name,
    initial?.nickname,
    initial?.age,
    initial?.grade,
    initial?.grade_label,
    initial?.standards_state,
    initial?.standardsState,
    initial?.avatar,
    initial?.avatar_url,
    JSON.stringify([...(Array.isArray(initial?.interests) ? initial.interests : [])].map(String).sort()),
    JSON.stringify([...(Array.isArray(initial?.diagnoses) ? initial.diagnoses : [])].map(String).sort()),
    JSON.stringify([...(Array.isArray(initial?.learning_modalities) ? initial.learning_modalities : [])].map(String).sort()),
    JSON.stringify([...(Array.isArray(initial?.support_needs) ? initial.support_needs : [])].map(String).sort()),
    JSON.stringify([...(Array.isArray(initial?.executive_function) ? initial.executive_function : [])].map(String).sort()),
    initial?.support_notes,
    initial?.targetMode,
    initial?.targetDays,
    initial?.targetHours,
    initial?.schoolYearStart,
    initial?.schoolYearEnd,
  ]);

  // Update form when initial data changes (for edit mode) — key is stable across parent re-renders with same data
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
  }, [initialSyncKey]);

  const avatarSources = {
    prof1: require('../assets/prof1.png'),
    prof2: require('../assets/prof2.png'),
    prof3: require('../assets/prof3.png'),
    prof4: require('../assets/prof4.png'),
    prof5: require('../assets/prof5.png'),
    prof6: require('../assets/prof6.png'),
    prof7: require('../assets/prof7.png'),
    prof8: require('../assets/prof8.png'),
    prof9: require('../assets/prof9.png'),
    prof10: require('../assets/prof10.png'),
  };

  const toggleFromList = (value, list, setList) => {
    if (list.includes(value)) setList(list.filter(v => v !== value));
    else setList([...list, value]);
  };

  const canSubmit = Boolean(name.trim() && age && grade && avatar);

  const isDirty = useMemo(() => {
    if (!requireDirtyToSubmit) return true;
    const ini = initial || {};
    if ((name || '').trim() !== (ini.name || '').trim()) return true;
    if ((nickname || '').trim() !== (ini.nickname || '').trim()) return true;
    if ((age || '') !== (ini.age != null && ini.age !== '' ? String(ini.age) : '')) return true;
    const gIn = ini.grade || ini.grade_label || '';
    if (String(grade || '') !== String(gIn || '')) return true;
    const aIn = ini.avatar || ini.avatar_url || 'prof1';
    if (String(avatar || '') !== String(aIn)) return true;
    const stIn = ini.standards_state || ini.standardsState || 'None';
    if (standardsState !== stIn) return true;
    if (
      listSignature(effectiveInterestsForCompare(interests, otherInterest)) !==
      listSignature(Array.isArray(ini.interests) ? ini.interests : [])
    ) {
      return true;
    }
    if (
      listSignature(effectiveDiagnosesForCompare(diagnoses, otherDiagnosis)) !==
      listSignature(Array.isArray(ini.diagnoses) ? ini.diagnoses : [])
    ) {
      return true;
    }
    if (listSignature(learningModalities) !== listSignature(ini.learning_modalities || [])) return true;
    if (listSignature(supportNeeds) !== listSignature(ini.support_needs || [])) return true;
    if (listSignature(executiveFunction) !== listSignature(ini.executive_function || [])) return true;
    if ((supportNotes || '').trim() !== (ini.support_notes || '').trim()) return true;
    if ((targetMode || '') !== (ini.targetMode || '')) return true;
    const tdIn = ini.targetDays != null && ini.targetDays !== '' ? String(ini.targetDays) : '';
    if (String(targetDays || '').trim() !== tdIn) return true;
    const thIn = ini.targetHours != null && ini.targetHours !== '' ? String(ini.targetHours) : '';
    if (String(targetHours || '').trim() !== thIn) return true;
    if ((schoolYearStart || '').trim() !== (ini.schoolYearStart || '').trim()) return true;
    if ((schoolYearEnd || '').trim() !== (ini.schoolYearEnd || '').trim()) return true;
    return false;
  }, [
    requireDirtyToSubmit,
    initial,
    name,
    nickname,
    age,
    grade,
    avatar,
    standardsState,
    interests,
    otherInterest,
    diagnoses,
    otherDiagnosis,
    learningModalities,
    supportNeeds,
    executiveFunction,
    supportNotes,
    targetMode,
    targetDays,
    targetHours,
    schoolYearStart,
    schoolYearEnd,
  ]);

  const maySubmit = canSubmit && (!requireDirtyToSubmit || isDirty);

  // Notify parent of validation + dirty state (Edit Child enables Save only when valid and changed)
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(maySubmit);
    }
  }, [maySubmit, onValidationChange]);

  // Expose submit handler to parent via ref
  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    canSubmit: maySubmit,
  }));

  const handleSubmit = () => {
    if (!maySubmit || submitting) return;
    
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
      {/* SECTION 1: Identity block (always visible) */}
      <View style={styles.identityBlock}>
        <View style={styles.field}>
          <Text style={styles.nameFieldLabel}>Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g., Lily"
            value={name}
            onChangeText={setName}
            placeholderTextColor={MUTED}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Age<Text style={styles.required}> *</Text></Text>
          <View style={styles.chipsWrap}>
            {Array.from({ length: 18 }, (_, i) => i + 3).map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.chip, Number(age) === n && styles.chipSelected]}
                onPress={() => setAge(String(n))}
              >
                <Text style={[styles.chipText, Number(age) === n && styles.chipTextSelected]}>{String(n)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Grade<Text style={styles.required}> *</Text></Text>
          <View style={styles.chipsWrap}>
            {GRADES.map(g => (
              <TouchableOpacity key={g} style={[styles.chip, grade === g && styles.chipSelected]} onPress={() => setGrade(g)}>
                <Text style={[styles.chipText, grade === g && styles.chipTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Choose Avatar<Text style={styles.required}> *</Text></Text>
          <View style={styles.avatarsWrap}>
            {AVATAR_KEYS.map(key => (
              <TouchableOpacity
                key={key}
                onPress={() => setAvatar(key)}
                style={[
                  styles.avatarCell,
                  { backgroundColor: hexToRgba(getChildColorFromAvatar(key), 0.55) },
                  avatar === key && styles.avatarCellSelected,
                ]}
              >
                <Image source={avatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* SECTION 2: Learning setup */}
      <ModalSectionCard
        Icon={BookOpen}
        title="Learning setup"
        subtitle="Standards, interests, and goals"
        expanded={showLearningSetup}
        onPress={() => setShowLearningSetup(!showLearningSetup)}
        accent="#9ECFFB"
      >
          <View style={styles.accordionContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Follow State Standards?</Text>
              <View style={styles.chipsWrap}>
                {STATES.map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, standardsState === s && styles.chipSelected]} onPress={() => setStandardsState(s)}>
                    <Text style={[styles.chipText, standardsState === s && styles.chipTextSelected]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Interests</Text>
              <View style={styles.chipsWrap}>
                {INTERESTS.map(it => (
                  <TouchableOpacity key={it} style={[styles.chip, interests.includes(it) && styles.chipSelected]} onPress={() => toggleFromList(it, interests, setInterests)}>
                    <Text style={[styles.chipText, interests.includes(it) && styles.chipTextSelected]}>{it}</Text>
                  </TouchableOpacity>
                ))}
                {interests && interests.filter((i) => typeof i === 'string' && i.startsWith('Other: ')).map((custom) => (
                  <TouchableOpacity key={custom} style={[styles.chip, styles.chipSelected]} onPress={() => setInterests((prev) => prev.filter((i) => i !== custom))}>
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {interests && interests.includes('Other') && (
                <View style={styles.otherInterestRow}>
                  <TextInput style={[styles.input, styles.otherInterestInput]} placeholder="Type interest, then tap Add" value={otherInterest} onChangeText={setOtherInterest} placeholderTextColor={MUTED}
                    onSubmitEditing={() => { const t = otherInterest.trim(); if (!t) return; setInterests((prev) => [...prev.filter((i) => i !== 'Other'), `Other: ${t}`]); setOtherInterest(''); }} />
                  <TouchableOpacity onPress={() => { const t = otherInterest.trim(); if (!t) return; setInterests((prev) => [...prev.filter((i) => i !== 'Other'), `Other: ${t}`]); setOtherInterest(''); }} style={[styles.otherConfirmButton, !otherInterest.trim() && styles.otherConfirmButtonDisabled]} disabled={!otherInterest.trim()}>
                    <Check size={20} color={otherInterest.trim() ? '#ffffff' : MUTED} strokeWidth={2.5} />
                    <Text style={[styles.otherConfirmButtonText, !otherInterest.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
      </ModalSectionCard>

      {/* SECTION 3: Learning profile & supports */}
      <ModalSectionCard
        Icon={Brain}
        title="Learning profile & supports"
        subtitle="Support needs and learning preferences"
        expanded={showLearningProfile}
        onPress={() => setShowLearningProfile(!showLearningProfile)}
        accent="#9ECFFB"
      >
          <View style={styles.accordionContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Learning & processing needs</Text>
              <View style={styles.chipsWrap}>
                {DIAGNOSES.map(d => (
                  <TouchableOpacity key={d} style={[styles.chip, diagnoses.includes(d) && styles.chipSelected]} onPress={() => toggleFromList(d, diagnoses, setDiagnoses)}>
                    <Text style={[styles.chipText, diagnoses.includes(d) && styles.chipTextSelected]}>{d}</Text>
                  </TouchableOpacity>
                ))}
                {diagnoses.filter((d) => typeof d === 'string' && d.startsWith('Other: ')).map((custom) => (
                  <TouchableOpacity key={custom} style={[styles.chip, styles.chipSelected]} onPress={() => setDiagnoses((prev) => prev.filter((x) => x !== custom))}>
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {diagnoses.includes('Other') && (
                <View style={styles.otherInterestRow}>
                  <TextInput style={[styles.input, styles.otherInterestInput]} placeholder="Specify other, then tap checkmark" value={otherDiagnosis} onChangeText={setOtherDiagnosis} placeholderTextColor={MUTED}
                    onSubmitEditing={() => { const t = otherDiagnosis.trim(); if (!t) return; setDiagnoses((prev) => [...prev.filter((x) => x !== 'Other'), `Other: ${t}`]); setOtherDiagnosis(''); }} />
                  <TouchableOpacity onPress={() => { const t = otherDiagnosis.trim(); if (!t) return; setDiagnoses((prev) => [...prev.filter((x) => x !== 'Other'), `Other: ${t}`]); setOtherDiagnosis(''); }} style={[styles.otherConfirmButton, !otherDiagnosis.trim() && styles.otherConfirmButtonDisabled]} disabled={!otherDiagnosis.trim()}>
                    <Check size={20} color={otherDiagnosis.trim() ? '#ffffff' : MUTED} strokeWidth={2.5} />
                    <Text style={[styles.otherConfirmButtonText, !otherDiagnosis.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Executive function needs</Text>
              <View style={styles.chipsWrap}>
                {EXECUTIVE_FUNCTION.map(ef => (
                  <TouchableOpacity key={ef} style={[styles.chip, executiveFunction.includes(ef) && styles.chipSelected]} onPress={() => toggleFromList(ef, executiveFunction, setExecutiveFunction)}>
                    <Text style={[styles.chipText, executiveFunction.includes(ef) && styles.chipTextSelected]}>{ef}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Preferred learning modalities</Text>
              <View style={styles.chipsWrap}>
                {LEARNING_MODALITIES.map(mod => (
                  <TouchableOpacity key={mod} style={[styles.chip, learningModalities.includes(mod) && styles.chipSelected]} onPress={() => toggleFromList(mod, learningModalities, setLearningModalities)}>
                    <Text style={[styles.chipText, learningModalities.includes(mod) && styles.chipTextSelected]}>{mod}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Support needs</Text>
              <View style={styles.chipsWrap}>
                {SUPPORT_NEEDS.map(need => (
                  <TouchableOpacity key={need} style={[styles.chip, supportNeeds.includes(need) && styles.chipSelected]} onPress={() => toggleFromList(need, supportNeeds, setSupportNeeds)}>
                    <Text style={[styles.chipText, supportNeeds.includes(need) && styles.chipTextSelected]}>{need}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
      </ModalSectionCard>

      {/* SECTION 4: Additional notes */}
      <ModalSectionCard
        Icon={FileText}
        title="Additional notes"
        subtitle="Anything else to remember"
        expanded={showAdditionalNotes}
        onPress={() => setShowAdditionalNotes(!showAdditionalNotes)}
        accent="#9ECFFB"
      >
          <View style={styles.accordionContent}>
            <View style={styles.field}>
              <TextInput style={[styles.input, styles.textArea]} placeholder="Add any additional notes about learning supports..." value={supportNotes} onChangeText={setSupportNotes} placeholderTextColor={MUTED} multiline numberOfLines={3} textAlignVertical="top" />
            </View>
          </View>
      </ModalSectionCard>
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
  identityBlock: {
    marginBottom: 16,
  },
  accordionSection: {
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  accordionContent: {
    marginTop: 12,
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    marginBottom: 20,
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
    color: '#0f172a',
    marginBottom: 4,
    fontFamily: Platform.select({
      web: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
    fontSize: 14,
    color: '#0f172a',
    fontFamily: Platform.select({
      web: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: 'System',
    }),
  },
  nameFieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 6,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
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
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    minHeight: 32,
  },
  chipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  chipText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '400',
    fontFamily: Platform.select({
      web: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: 'System',
    }),
  },
  chipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
    fontFamily: Platform.select({
      web: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: 'System',
    }),
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
  },
  avatarCellSelected: {
    borderWidth: 3,
    borderColor: '#6BB3E8',
    ...Platform.select({
      web: {
        boxShadow:
          '0 0 0 1px rgba(107, 179, 232, 0.35), 0 0 10px 2px rgba(107, 179, 232, 0.28)',
      },
      ios: {
        shadowColor: '#6BB3E8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
        shadowColor: '#6BB3E8',
      },
      default: {},
    }),
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


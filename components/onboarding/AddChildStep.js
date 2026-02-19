import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Image, Animated } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

export default function AddChildStep({ createdChildren = [], onAddChild, onContinue, isSaving }) {
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

  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [hoveredAvatar, setHoveredAvatar] = useState(null);
  const continueScale = useRef(new Animated.Value(1)).current;

  const formValid = Boolean(name.trim() && age && grade && avatar);
  const canContinue = formValid || createdChildren.length >= 1;

  useEffect(() => {
    if (canContinue) {
      Animated.sequence([
        Animated.timing(continueScale, { toValue: 1.03, duration: 120, useNativeDriver: true }),
        Animated.delay(150),
        Animated.timing(continueScale, { toValue: 1, duration: 100, useNativeDriver: true }),
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
    return {
      name: name.trim(),
      nickname: null,
      age: Number(age),
      grade: grade,
      standardsState: standardsState === 'None' ? null : standardsState,
      avatar,
      interests,
      diagnoses: finalDiagnoses.length > 0 ? finalDiagnoses : null,
      learningModalities: learningModalities.length > 0 ? learningModalities : null,
      supportNeeds: supportNeeds.length > 0 ? supportNeeds : null,
      executiveFunction: executiveFunction.length > 0 ? executiveFunction : null,
      supportNotes: null,
    };
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
      setShowAdditional(false);
    } catch (e) {
      setError(e?.message ?? 'Failed to add child.');
    } finally {
      setAdding(false);
    }
  };

  const handleContinue = async () => {
    setError(null);
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

  const showGrade = Boolean(age);

  return (
    <View style={styles.container}>
      <Text style={styles.mainHeading}>Let's add your first learner</Text>
      <Text style={styles.mainSubtext}>You can add more later anytime.</Text>
      {createdChildren.length > 0 && (
        <View style={styles.list}>
          {createdChildren.map((c) => (
            <View key={c.id} style={styles.chipReadOnly}>
              <Text style={styles.chipReadOnlyText}>{c.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Section 1 — Identity */}
      <View style={styles.section}>
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
        <Text style={[styles.label, styles.labelFirstInSection]}>Child name <Text style={styles.requiredAsterisk}>*</Text></Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
            placeholder="Enter child's name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />
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
      </View>

      {/* Section 2 — Age & grade */}
      <View style={styles.section}>
        <Text style={[styles.label, styles.labelFirstInSection]}>Age <Text style={styles.requiredAsterisk}>*</Text></Text>
        <View style={styles.row}>
          {Array.from({ length: 18 }, (_, i) => i + 3).map((n) => {
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
        {showGrade && (
          <>
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
          </>
        )}
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
          </View>
          {diagnoses.includes('Other') && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Specify other"
              value={otherDiagnosis}
              onChangeText={(t) => { setOtherDiagnosis(t); setError(null); }}
              placeholderTextColor="#9CA3AF"
            />
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
        </View>
      )}
      <TouchableOpacity
        style={[styles.addBtn, (!formValid || isSaving || adding) && styles.addBtnDisabled]}
        onPress={handleAddAnother}
        disabled={!formValid || isSaving || adding}
        activeOpacity={0.8}
      >
        <Text style={styles.addBtnText}>{adding || isSaving ? 'Adding...' : 'Add another child'}</Text>
      </TouchableOpacity>
      </View>
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
            {isSaving || adding ? 'Saving…' : 'Continue'}
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
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
    backgroundColor: '#5B7FFF',
    borderWidth: 0,
  },
  chipAgeGradeText: {
    fontSize: 14,
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  chipAgeGradeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C7D2FE',
    backgroundColor: '#FAFBFF',
    alignSelf: 'flex-start',
    marginTop: 20,
  },
  addBtnDisabled: {
    opacity: 0.6,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5B7FFF',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
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
    backgroundColor: '#5B7FFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 14px rgba(91,127,255,0.25)',
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
    fontWeight: '500',
    color: '#FFFFFF',
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
    borderColor: '#5B7FFF',
    backgroundColor: '#F4F7FF',
    transform: [{ scale: 1.05 }],
    ...(Platform.OS === 'web' && {
      boxShadow: '0 0 0 3px rgba(91,127,255,0.15), 0 6px 16px rgba(91,127,255,0.18)',
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
});

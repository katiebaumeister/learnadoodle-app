import React, { useState, useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';

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

const AddChildForm = forwardRef(({ onSubmit, initial = {}, submitting = false, onValidationChange }, ref) => {
  const [name, setName] = useState(initial.name || '');
  const [nickname, setNickname] = useState(initial.nickname || '');
  const [age, setAge] = useState(initial.age ? String(initial.age) : '');
  const [grade, setGrade] = useState(initial.grade || initial.grade_label || '');
  const [standardsState, setStandardsState] = useState(initial.standards_state || initial.standardsState || 'None');
  const [interests, setInterests] = useState(Array.isArray(initial.interests) ? initial.interests : []);
  const [avatar, setAvatar] = useState(initial.avatar || initial.avatar_url || 'prof1');
  
  // Support profile state
  const [diagnoses, setDiagnoses] = useState(Array.isArray(initial.diagnoses) ? initial.diagnoses : []);
  const [learningModalities, setLearningModalities] = useState(Array.isArray(initial.learning_modalities) ? initial.learning_modalities : []);
  const [supportNeeds, setSupportNeeds] = useState(Array.isArray(initial.support_needs) ? initial.support_needs : []);
  const [executiveFunction, setExecutiveFunction] = useState(Array.isArray(initial.executive_function) ? initial.executive_function : []);
  const [supportNotes, setSupportNotes] = useState(initial.support_notes || '');
  const [otherDiagnosis, setOtherDiagnosis] = useState('');

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
      setInterests(Array.isArray(initial.interests) ? initial.interests : []);
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
    
    const payload = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      age: Number(age),
      grade: grade || null,
      standardsState: standardsState === 'None' ? null : standardsState,
      interests: interests || [],
      avatar: avatar || null,
      // Support profile fields (only include if any are filled)
      diagnoses: finalDiagnoses.length > 0 ? finalDiagnoses : null,
      learningModalities: learningModalities.length > 0 ? learningModalities : null,
      supportNeeds: supportNeeds.length > 0 ? supportNeeds : null,
      executiveFunction: executiveFunction.length > 0 ? executiveFunction : null,
      supportNotes: supportNotes.trim() || null,
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
        </View>
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
          </View>
          {diagnoses.includes('Other') && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Specify other diagnosis"
              value={otherDiagnosis}
              onChangeText={setOtherDiagnosis}
              placeholderTextColor="#9ca3af"
            />
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
    borderColor: '#B8D7F9',
    backgroundColor: '#B8D7F9',
  },
  ageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  ageButtonTextSelected: {
    color: '#1e40af',
    fontWeight: '700',
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
    borderColor: '#B8D7F9',
    backgroundColor: '#B8D7F9',
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
    color: '#1e40af',
    fontWeight: '600',
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
});


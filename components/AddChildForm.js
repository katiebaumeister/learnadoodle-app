import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';

const GRADES = ['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12'];
const STATES = ['None','AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
const INTERESTS = ['STEM','Reading','Writing','Arts','Music','Sports','Outdoors','Languages','History','Coding','Woodworking','Other'];
const LEARNING_STYLES = ['Visual','Auditory','Kinesthetic','Mixed','Unsure'];
const COLLEGE_BOUND = ['Yes','No','Maybe'];

export default function AddChildForm({ onSubmit, initial = {}, submitting = false }) {
  const [name, setName] = useState(initial.name || '');
  const [age, setAge] = useState(initial.age ? String(initial.age) : '');
  const [grade, setGrade] = useState(initial.grade || '');
  const [standardsState, setStandardsState] = useState(initial.standards_state || 'None');
  const [willTakeTests, setWillTakeTests] = useState(Boolean(initial.will_take_tests));
  const [interests, setInterests] = useState(Array.isArray(initial.interests) ? initial.interests : []);
  const [learningStyle, setLearningStyle] = useState(initial.learning_style || '');
  const [collegeBound, setCollegeBound] = useState(initial.college_bound || '');
  const [avatar, setAvatar] = useState(initial.avatar || 'prof1');

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

  const isHS = useMemo(() => {
    const g = grade === 'K' || grade === 'Pre-K' ? 0 : Number(grade);
    return g >= 8; // show college bound for 8+
  }, [grade]);

  const toggleFromList = (value, list, setList) => {
    if (list.includes(value)) setList(list.filter(v => v !== value));
    else setList([...list, value]);
  };

  const canSubmit = name.trim() && age && grade;

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    const payload = {
      name: name.trim(),
      age: Number(age),
      grade,
      standards: standardsState === 'None' ? null : standardsState,
      will_take_tests: willTakeTests,
      interests,
      learning_style: learningStyle || null,
      college_bound: isHS ? (collegeBound || null) : null,
      avatar,
    };
    onSubmit && onSubmit(payload);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Student Basics</Text>
      <Text style={styles.intro}>Add each student. This helps personalize their learning plan.</Text>

      <View style={styles.field}> 
        <Text style={styles.label}>Name or nickname</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Lily"
          value={name}
          onChangeText={setName}
        />
        <Text style={styles.hint}>Use a nickname if you prefer.</Text>
      </View>

      <View style={styles.fieldRow}> 
        <View style={[styles.field, styles.fieldHalf]}>
          <Text style={styles.label}>Age</Text>
          <View style={styles.chipsWrap}>
            {Array.from({ length: 18 }, (_, i) => i + 3).map(n => (
              <TouchableOpacity key={n} style={[styles.chip, Number(age) === n && styles.chipSelected]} onPress={() => setAge(String(n))}>
                <Text style={[styles.chipText, Number(age) === n && styles.chipTextSelected]}>{String(n)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[styles.field, styles.fieldHalf]}>
          <Text style={styles.label}>Grade</Text>
          <View style={styles.chipsWrap}>
            {GRADES.map(g => (
              <TouchableOpacity key={g} style={[styles.chip, grade === g && styles.chipSelected]} onPress={() => setGrade(g)}>
                <Text style={[styles.chipText, grade === g && styles.chipTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.field}> 
        <Text style={styles.label}>Follow state standards?</Text>
        <View style={styles.chipsWrap}>
          {STATES.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, standardsState === s && styles.chipSelected]} onPress={() => setStandardsState(s)}>
              <Text style={[styles.chipText, standardsState === s && styles.chipTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {standardsState !== 'None' && (
        <TouchableOpacity style={styles.toggleRow} onPress={() => setWillTakeTests(!willTakeTests)}>
          <View style={[styles.checkbox, willTakeTests && styles.checkboxChecked]} />
          <Text style={styles.toggleText}>Will take standardized tests</Text>
        </TouchableOpacity>
      )}

      <View style={styles.field}> 
        <Text style={styles.label}>Choose an Avatar</Text>
        <View style={styles.avatarsWrap}>
          {Object.keys(avatarSources).map(key => (
            <TouchableOpacity key={key} onPress={() => setAvatar(key)} style={[styles.avatarCell, avatar === key && styles.avatarCellSelected]}>
              <Image source={avatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
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
        </View>
      </View>

      <View style={styles.field}> 
        <Text style={styles.label}>Learning style</Text>
        <View style={styles.chipsWrap}>
          {LEARNING_STYLES.map(ls => (
            <TouchableOpacity key={ls} style={[styles.chip, learningStyle === ls && styles.chipSelected]} onPress={() => setLearningStyle(ls)}>
              <Text style={[styles.chipText, learningStyle === ls && styles.chipTextSelected]}>{ls}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isHS && (
        <View style={styles.field}> 
          <Text style={styles.label}>College bound?</Text>
          <View style={styles.chipsWrap}>
            {COLLEGE_BOUND.map(cb => (
              <TouchableOpacity key={cb} style={[styles.chip, collegeBound === cb && styles.chipSelected]} onPress={() => setCollegeBound(cb)}>
                <Text style={[styles.chipText, collegeBound === cb && styles.chipTextSelected]}>{cb}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={!canSubmit || submitting}>
        <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Save Student'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 4 },
  intro: { color: '#666', marginBottom: 16 },
  field: { marginBottom: 16 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  hint: { color: '#7a7a7a', fontSize: 12, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatarsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarCell: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  avatarCellSelected: { borderColor: '#38B6FF', backgroundColor: '#E9F6FF' },
  avatarImg: { width: 44, height: 44 },
  chip: { borderWidth: 1, borderColor: '#ddd', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#fff' },
  chipSelected: { borderColor: '#38B6FF', backgroundColor: '#E9F6FF' },
  chipText: { color: '#555' },
  chipTextSelected: { color: '#0c7ac9', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  toggleText: { color: '#333' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#bbb', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#38B6FF', borderColor: '#38B6FF' },
  submitBtn: { backgroundColor: '#38B6FF', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { backgroundColor: '#9ccff3' },
  submitText: { color: '#fff', fontWeight: '700' },
});



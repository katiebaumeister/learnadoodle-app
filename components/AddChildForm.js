import React, { useState, useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';

const GRADES = ['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12'];
const STATES = ['None','AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
const INTERESTS = ['STEM','Reading','Writing','Arts','Music','Sports','Outdoors','Languages','History','Coding','Woodworking','Other'];
const LEARNING_STYLES = ['Visual','Auditory','Kinesthetic','Mixed','Unsure'];

// Limit to 8 avatars as per spec
const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8'];

const AddChildForm = forwardRef(({ onSubmit, initial = {}, submitting = false, onValidationChange }, ref) => {
  const [name, setName] = useState(initial.name || '');
  const [nickname, setNickname] = useState(initial.nickname || '');
  const [age, setAge] = useState(initial.age ? String(initial.age) : '');
  const [grade, setGrade] = useState(initial.grade || initial.grade_label || '');
  const [standardsState, setStandardsState] = useState(initial.standards_state || 'None');
  const [interests, setInterests] = useState(Array.isArray(initial.interests) ? initial.interests : []);
  const [learningStyle, setLearningStyle] = useState(
    Array.isArray(initial.learning_styles) && initial.learning_styles.length > 0 
      ? initial.learning_styles[0] 
      : initial.learning_style || ''
  );
  const [avatar, setAvatar] = useState(initial.avatar || initial.avatar_url || 'prof1');

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

  const canSubmit = name.trim() && age;

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
    
    const payload = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      age: Number(age),
      grade: grade || null,
      standardsState: standardsState === 'None' ? null : standardsState,
      interests: interests || [],
      learningStyle: learningStyle || null,
      avatar: avatar || null,
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
          <Text style={styles.label}>Name or Nickname</Text>
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
            <Text style={styles.label}>Age</Text>
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
            <Text style={styles.label}>Grade</Text>
            <Text style={styles.hint}>(Optional)</Text>
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

        <View style={styles.field}> 
          <Text style={styles.label}>Choose Avatar</Text>
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

      {/* Section: Learning Style */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Learning Style</Text>
        <View style={styles.chipsWrap}>
          {LEARNING_STYLES.map(ls => (
            <TouchableOpacity 
              key={ls} 
              style={[styles.chip, learningStyle === ls && styles.chipSelected]} 
              onPress={() => setLearningStyle(ls)}
            >
              <Text style={[styles.chipText, learningStyle === ls && styles.chipTextSelected]}>{ls}</Text>
            </TouchableOpacity>
          ))}
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
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
});



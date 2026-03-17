import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, UserPlus, BookOpen, Check } from 'lucide-react';

const GRADES = ['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12'];
const SUBJECT_GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const STATES = ['None','AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
const INTERESTS = ['STEM','Reading','Writing','Arts','Music','Sports','Outdoors','Languages','History','Coding','Woodworking','Other'];
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

export default function OnboardingStepper({ onComplete, startAtStep = 1 }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(startAtStep);
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Step 1: Parent Name
  const [parentName, setParentName] = useState('');

  // Step 2: Children
  const [children, setChildren] = useState([]);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childStandardsState, setChildStandardsState] = useState('None');
  const [childInterests, setChildInterests] = useState([]);
  const [childDiagnoses, setChildDiagnoses] = useState([]);
  const [childLearningModalities, setChildLearningModalities] = useState([]);
  const [childSupportNeeds, setChildSupportNeeds] = useState([]);
  const [childExecutiveFunction, setChildExecutiveFunction] = useState([]);
  const [childSupportNotes, setChildSupportNotes] = useState('');
  const [childOtherDiagnosis, setChildOtherDiagnosis] = useState('');
  const [childAvatar, setChildAvatar] = useState('prof1');
  const [showOptionalFields, setShowOptionalFields] = useState(false);

  // Step 3: Subjects (optional)
  const [subjects, setSubjects] = useState([]);
  const [subjectName, setSubjectName] = useState('');
  const [subjectSummary, setSubjectSummary] = useState('');
  const [subjectGrade, setSubjectGrade] = useState('');
  const [subjectCredits, setSubjectCredits] = useState('');
  const [subjectNotes, setSubjectNotes] = useState('');
  const [selectedChildIndexForSubject, setSelectedChildIndexForSubject] = useState(null);
  const [isFieldFocused, setIsFieldFocused] = useState(false);

  const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8'];
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

  const validateStep1 = () => {
    if (!parentName.trim()) {
      Alert.alert('Required', 'Please enter your name');
      return false;
    }
    return true;
  };

  const canAddChild = () => {
    return childName.trim() &&
           childAge.trim() &&
           childAvatar;
  };

  const validateStep2 = () => {
    if (children.length === 0) {
      Alert.alert('Required', 'Please add at least one child');
      return false;
    }
    if (children.length > 5) {
      Alert.alert('Limit Reached', 'You can add up to 5 children during onboarding. To add more, please contact us after completing setup.');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    // Subjects are optional, so this always returns true
    return true;
  };

  const validateChild = () => {
    if (!childName.trim()) {
      Alert.alert('Required', 'Please enter the child\'s name');
      return false;
    }
    if (!childAge.trim()) {
      Alert.alert('Required', 'Please enter the child\'s age');
      return false;
    }
    const age = parseInt(childAge);
    if (isNaN(age) || age < 0 || age > 25) {
      Alert.alert('Invalid Age', 'Age must be between 0 and 25');
      return false;
    }
    if (!childAvatar) {
      Alert.alert('Required', 'Please choose an avatar');
      return false;
    }
    return true;
  };

  const toggleFromList = (value, list, setList) => {
    if (list.includes(value)) setList(list.filter(v => v !== value));
    else setList([...list, value]);
  };

  const handleAddChild = () => {
    if (!validateChild()) return;
    if (children.length >= 5) {
      Alert.alert('Limit Reached', 'You can add up to 5 children during onboarding. To add more children, please contact us at support@learnadoodle.com after completing setup.');
      return;
    }
    
    // Handle "Other" diagnosis
    let finalDiagnoses = [...childDiagnoses];
    if (childDiagnoses.includes('Other') && childOtherDiagnosis.trim()) {
      finalDiagnoses = childDiagnoses.filter(d => d !== 'Other');
      finalDiagnoses.push(`Other: ${childOtherDiagnosis.trim()}`);
    }
    
    setChildren([...children, {
      first_name: childName.trim(),
      age: parseInt(childAge),
      grade_label: childGrade || null,
      avatar_url: childAvatar,
      standards_state: childStandardsState === 'None' ? null : childStandardsState,
      interests: childInterests.length > 0 ? childInterests : null,
      diagnoses: finalDiagnoses.length > 0 ? finalDiagnoses : null,
      learning_modalities: childLearningModalities.length > 0 ? childLearningModalities : null,
      support_needs: childSupportNeeds.length > 0 ? childSupportNeeds : null,
      executive_function: childExecutiveFunction.length > 0 ? childExecutiveFunction : null,
      support_notes: childSupportNotes.trim() || null,
    }]);
    
    // Reset form only after successful add
    setChildName('');
    setChildAge('');
    setChildGrade('');
    setChildStandardsState('None');
    setChildInterests([]);
    setChildDiagnoses([]);
    setChildLearningModalities([]);
    setChildSupportNeeds([]);
    setChildExecutiveFunction([]);
    setChildSupportNotes('');
    setChildOtherDiagnosis('');
    setChildAvatar('prof1');
    setShowOptionalFields(false);
  };

  // Animation for dialog box on step 3
  useEffect(() => {
    if (currentStep === 3) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(bounceAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      bounceAnim.setValue(0);
    }
  }, [currentStep, bounceAnim]);

  const handleRemoveChild = (index) => {
    setChildren(children.filter((_, i) => i !== index));
  };

  const handleAddSubject = () => {
    if (!subjectName.trim()) {
      Alert.alert('Required', 'Please enter a subject name');
      return;
    }
    if (selectedChildIndexForSubject === null) {
      Alert.alert('Required', 'Please select a child for this subject');
      return;
    }
    
    setSubjects([...subjects, {
      name: subjectName.trim(),
      summary: subjectSummary.trim() || null,
      grade: subjectGrade || null,
      credits: subjectCredits ? parseFloat(subjectCredits) : null,
      notes: subjectNotes.trim() || null,
      childIndex: selectedChildIndexForSubject,
    }]);
    
    // Reset form
    setSubjectName('');
    setSubjectSummary('');
    setSubjectGrade('');
    setSubjectCredits('');
    setSubjectNotes('');
    setSelectedChildIndexForSubject(null);
  };

  const handleRemoveSubject = (index) => {
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!validateStep2()) return;
      setCurrentStep(3);
    }
  };

  const handleSkipSubjects = async () => {
    await handleComplete();
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        throw new Error('User not authenticated');
      }

      // 1. Get or create family
      let familyId;
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', authUser.id)
        .single();

      if (profile?.family_id) {
        familyId = profile.family_id;
      } else {
        // Create family
        const { data: family, error: familyError } = await supabase
          .from('family')
          .insert({})
          .select('id')
          .single();
        
        if (familyError) throw familyError;
        familyId = family.id;

        // Update profile with family_id and parent name
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ 
            family_id: familyId,
            full_name: parentName.trim()
          })
          .eq('id', authUser.id);
        
        if (profileError) throw profileError;
      }
      
      // Update existing profile with parent name if not already set
      if (parentName.trim() && !profile?.full_name) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: parentName.trim() })
          .eq('id', authUser.id);
        
        if (profileError) console.error('Error updating parent name:', profileError);
      }

          // 2. Insert children
          const childIds = [];
          for (const child of children) {
            const { data: childData, error: childError } = await supabase
              .from('children')
              .insert({
                family_id: familyId,
                first_name: child.first_name,
                age: child.age,
                grade: child.grade_label || null,
                avatar: child.avatar_url || null,
                standards: child.standards_state && child.standards_state !== 'None' ? child.standards_state : null,
                interests: child.interests || null,
              })
              .select('id')
              .single();
            
            if (childError) throw childError;
            const childId = childData.id;
            childIds.push(childId);

            // Create or update support profile if any support fields are provided
            if (child.diagnoses || child.learning_modalities || child.support_needs || child.executive_function || child.support_notes) {
              const supportProfileData = {
                child_id: childId,
              };
              if (child.diagnoses) supportProfileData.diagnoses = child.diagnoses;
              if (child.learning_modalities) supportProfileData.learning_modalities = child.learning_modalities;
              if (child.support_needs) supportProfileData.support_needs = child.support_needs;
              if (child.executive_function) supportProfileData.executive_function = child.executive_function;
              if (child.support_notes) supportProfileData.notes = child.support_notes;

              const { error: profileError } = await supabase
                .from('child_support_profiles')
                .upsert(supportProfileData, { onConflict: 'child_id' });
              
              if (profileError) {
                console.error('Error creating support profile:', profileError);
                // Don't throw - child was created successfully, profile is optional
              }
            }
          }

      // 3. Insert subjects (if any)
      if (subjects.length > 0) {
        for (const subject of subjects) {
          const childIndex = subject.childIndex;
          if (childIndex >= 0 && childIndex < childIds.length) {
            const { data: subjectData, error: subjectError } = await supabase
              .from('subject')
              .insert({
                family_id: familyId,
                name: subject.name,
                summary: subject.summary || null,
                grade: subject.grade || null,
                credits: subject.credits || null,
                notes: subject.notes || null,
                child_id: childIds[childIndex],
              })
              .select('id')
              .single();
            
            if (subjectError) throw subjectError;
          }
        }
      }

      // 4. Mark onboarding as complete
      const { error: onboardingError } = await supabase
        .from('family')
        .update({ 
          has_completed_onboarding: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', familyId);
      
      if (onboardingError) {
        console.error('Error marking onboarding complete:', onboardingError);
        // Don't throw - onboarding data is saved, just the flag update failed
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to complete onboarding');
      Alert.alert('Error', err.message || 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.step1Header}>
        <Image 
          source={require('../assets/poodle-icon.png')} 
          style={styles.poodleImage}
          resizeMode="contain"
        />
        <View style={styles.step1TextContainer}>
          <Text style={styles.stepTitle}>
            Hello! I'm Doodle.{'\n'}What's your name?
          </Text>
          <Text style={styles.privacyNote}>
            I take data privacy seriously. We securely store and never share your data.
          </Text>
        </View>
      </View>
      
      <View style={styles.formGroup}>
        <TextInput
          style={styles.inputPill}
          placeholder="e.g., Mom, Dad, or whatever else you want us to greet you as"
          placeholderTextColor="#9ca3af"
          value={parentName}
          onChangeText={setParentName}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Add Your Children</Text>
      <Text style={styles.stepSubtitle}>Add at least one child to get started {children.length > 0 && `(${children.length}/5)`}</Text>

      {children.length >= 5 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            You've reached the limit of 5 children for onboarding. To add more children, please contact us at support@learnadoodle.com after completing setup.
          </Text>
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          Name<Text style={styles.requiredAsterisk}> *</Text>
        </Text>
        <TextInput
          style={styles.inputPill}
          placeholder="Child's name"
          placeholderTextColor="#9ca3af"
          value={childName}
          onChangeText={setChildName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          Age<Text style={styles.requiredAsterisk}> *</Text>
        </Text>
        <TextInput
          style={styles.inputPill}
          placeholder="Age"
          placeholderTextColor="#9ca3af"
          value={childAge}
          onChangeText={setChildAge}
          keyboardType="numeric"
          maxLength={2}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          Choose Avatar<Text style={styles.requiredAsterisk}> *</Text>
        </Text>
        <View style={styles.avatarsWrap}>
          {AVATAR_KEYS.map(key => (
            <TouchableOpacity
              key={key}
              onPress={() => setChildAvatar(key)}
              style={[styles.avatarCell, childAvatar === key && styles.avatarCellSelected]}
            >
              <Image source={avatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Optional Fields Accordion */}
      <View style={styles.accordionContainer}>
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setShowOptionalFields(!showOptionalFields)}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <View style={styles.accordionTitleContainer}>
            <Text style={styles.accordionTitle}>Optional</Text>
            {showOptionalFields ? (
              <ChevronUp size={20} color="#6b7280" />
            ) : (
              <ChevronDown size={20} color="#6b7280" />
            )}
          </View>
        </TouchableOpacity>

        {showOptionalFields && (
          <View style={styles.accordionContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Follow State Standards? (Optional)</Text>
              <View style={styles.chipsWrap}>
                {STATES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, childStandardsState === s && styles.chipSelected]}
                    onPress={() => setChildStandardsState(s)}
                  >
                    <Text style={[styles.chipText, childStandardsState === s && styles.chipTextSelected]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Grade (Optional)</Text>
              <View style={styles.chipsWrap}>
                {GRADES.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, childGrade === g && styles.chipSelected]}
                    onPress={() => setChildGrade(g)}
                  >
                    <Text style={[styles.chipText, childGrade === g && styles.chipTextSelected]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Interests (Optional)</Text>
              <View style={styles.chipsWrap}>
                {INTERESTS.map(it => (
                  <TouchableOpacity
                    key={it}
                    style={[styles.chip, childInterests.includes(it) && styles.chipSelected]}
                    onPress={() => toggleFromList(it, childInterests, setChildInterests)}
                  >
                    <Text style={[styles.chipText, childInterests.includes(it) && styles.chipTextSelected]}>{it}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Learning & processing needs (Optional)</Text>
              <View style={styles.chipsWrap}>
                {DIAGNOSES.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, childDiagnoses.includes(d) && styles.chipSelected]}
                    onPress={() => toggleFromList(d, childDiagnoses, setChildDiagnoses)}
                  >
                    <Text style={[styles.chipText, childDiagnoses.includes(d) && styles.chipTextSelected]}>{d}</Text>
                  </TouchableOpacity>
                ))}
                {childDiagnoses.filter((d) => typeof d === 'string' && d.startsWith('Other: ')).map((custom) => (
                  <TouchableOpacity
                    key={custom}
                    style={[styles.chip, styles.chipSelected]}
                    onPress={() => setChildDiagnoses((prev) => prev.filter((x) => x !== custom))}
                  >
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {childDiagnoses.includes('Other') && (
                <View style={styles.otherDiagnosisRow}>
                  <TextInput
                    style={[styles.inputPill, styles.otherDiagnosisInput]}
                    placeholder="Specify other, then tap checkmark"
                    placeholderTextColor="#9ca3af"
                    value={childOtherDiagnosis}
                    onChangeText={setChildOtherDiagnosis}
                    onSubmitEditing={() => {
                      const t = childOtherDiagnosis.trim();
                      if (!t) return;
                      setChildDiagnoses((prev) => [...prev.filter((x) => x !== 'Other'), `Other: ${t}`]);
                      setChildOtherDiagnosis('');
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const t = childOtherDiagnosis.trim();
                      if (!t) return;
                      setChildDiagnoses((prev) => [...prev.filter((x) => x !== 'Other'), `Other: ${t}`]);
                      setChildOtherDiagnosis('');
                    }}
                    style={[styles.otherConfirmButton, !childOtherDiagnosis.trim() && styles.otherConfirmButtonDisabled]}
                    disabled={!childOtherDiagnosis.trim()}
                  >
                    <Check size={20} color={childOtherDiagnosis.trim() ? '#ffffff' : '#9ca3af'} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Executive function needs (Optional)</Text>
              <View style={styles.chipsWrap}>
                {EXECUTIVE_FUNCTION.map(ef => (
                  <TouchableOpacity
                    key={ef}
                    style={[styles.chip, childExecutiveFunction.includes(ef) && styles.chipSelected]}
                    onPress={() => toggleFromList(ef, childExecutiveFunction, setChildExecutiveFunction)}
                  >
                    <Text style={[styles.chipText, childExecutiveFunction.includes(ef) && styles.chipTextSelected]}>{ef}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Preferred learning modalities (Optional)</Text>
              <View style={styles.chipsWrap}>
                {LEARNING_MODALITIES.map(mod => (
                  <TouchableOpacity
                    key={mod}
                    style={[styles.chip, childLearningModalities.includes(mod) && styles.chipSelected]}
                    onPress={() => toggleFromList(mod, childLearningModalities, setChildLearningModalities)}
                  >
                    <Text style={[styles.chipText, childLearningModalities.includes(mod) && styles.chipTextSelected]}>{mod}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Support needs (Optional)</Text>
              <View style={styles.chipsWrap}>
                {SUPPORT_NEEDS.map(need => (
                  <TouchableOpacity
                    key={need}
                    style={[styles.chip, childSupportNeeds.includes(need) && styles.chipSelected]}
                    onPress={() => toggleFromList(need, childSupportNeeds, setChildSupportNeeds)}
                  >
                    <Text style={[styles.chipText, childSupportNeeds.includes(need) && styles.chipTextSelected]}>{need}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Additional notes (Optional)</Text>
              <TextInput
                style={[styles.inputPill, styles.textArea]}
                placeholder="Add any additional notes about learning supports..."
                placeholderTextColor="#9ca3af"
                value={childSupportNotes}
                onChangeText={setChildSupportNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.addButton, (!canAddChild() || children.length >= 5) && styles.addButtonDisabled]}
        onPress={handleAddChild}
        disabled={!canAddChild() || children.length >= 5}
      >
        <UserPlus size={18} color="#ffffff" />
        <Text style={styles.addButtonText}>Add Child</Text>
      </TouchableOpacity>

      {children.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>Children Added:</Text>
          {children.map((child, idx) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.listItemText}>
                {child.first_name} (Age: {child.age}){child.grade_label && ` - Grade ${child.grade_label}`}
              </Text>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveChild(idx)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Add Subjects</Text>
      <Text style={styles.stepSubtitle}>You can add subjects now or skip and add them later</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          Subject Name<Text style={styles.requiredAsterisk}> *</Text>
        </Text>
        <TextInput
          style={styles.inputPill}
          placeholder="e.g., Math, Reading, Science"
          placeholderTextColor="#9ca3af"
          value={subjectName}
          onChangeText={setSubjectName}
          onFocus={() => setIsFieldFocused(true)}
          onBlur={() => setIsFieldFocused(false)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Summary (Optional)</Text>
        <TextInput
          style={styles.inputPill}
          placeholder="Brief description of the subject"
          placeholderTextColor="#9ca3af"
          value={subjectSummary}
          onChangeText={setSubjectSummary}
          onFocus={() => setIsFieldFocused(true)}
          onBlur={() => setIsFieldFocused(false)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          For Child<Text style={styles.requiredAsterisk}> *</Text>
        </Text>
        <View style={styles.chipsWrap}>
          {children.map((child, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.chip, selectedChildIndexForSubject === idx && styles.chipSelected]}
              onPress={() => {
                setSelectedChildIndexForSubject(idx);
                setIsFieldFocused(true);
              }}
            >
              <Text style={[styles.chipText, selectedChildIndexForSubject === idx && styles.chipTextSelected]}>
                {child.first_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Grade Level (Optional)</Text>
        <View style={styles.chipsWrap}>
          {SUBJECT_GRADE_OPTIONS.map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.chip, subjectGrade === g && styles.chipSelected]}
              onPress={() => {
                setSubjectGrade(g);
                setIsFieldFocused(true);
              }}
            >
              <Text style={[styles.chipText, subjectGrade === g && styles.chipTextSelected]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Credits (Optional)</Text>
        <TextInput
          style={styles.inputPill}
          placeholder="e.g., 0.5, 1.0, 1.5"
          placeholderTextColor="#9ca3af"
          value={subjectCredits}
          onChangeText={(text) => {
            // Allow only numbers and decimal point
            const numericValue = text.replace(/[^0-9.]/g, '');
            // Prevent multiple decimal points
            const parts = numericValue.split('.');
            const filteredValue = parts.length > 2 
              ? parts[0] + '.' + parts.slice(1).join('')
              : numericValue;
            setSubjectCredits(filteredValue);
          }}
          keyboardType="numeric"
          onFocus={() => setIsFieldFocused(true)}
          onBlur={() => setIsFieldFocused(false)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Notes (Optional)</Text>
        <TextInput
          style={[styles.inputPill, styles.textArea]}
          placeholder="Add any additional notes about this subject..."
          placeholderTextColor="#9ca3af"
          value={subjectNotes}
          onChangeText={setSubjectNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          onFocus={() => setIsFieldFocused(true)}
          onBlur={() => setIsFieldFocused(false)}
        />
      </View>

      <TouchableOpacity style={styles.addButton} onPress={handleAddSubject}>
        <BookOpen size={18} color="#ffffff" />
        <Text style={styles.addButtonText}>Add Subject</Text>
      </TouchableOpacity>

      {subjects.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>Subjects Added:</Text>
          {subjects.map((subject, idx) => {
            const child = children[subject.childIndex];
            return (
              <View key={idx} style={styles.listItem}>
                <Text style={styles.listItemText}>
                  {subject.name} - {child?.first_name || 'Unknown'}
                </Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveSubject(idx)}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Top Header with Back Arrow and Progress Bar */}
      <View style={styles.topHeader}>
        {currentStep > 1 && (
          <TouchableOpacity
            style={styles.topBackButton}
            onPress={() => setCurrentStep(currentStep - 1)}
            disabled={loading}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <ChevronLeft size={24} color="#111827" />
          </TouchableOpacity>
        )}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View 
              style={[
                styles.progressBarFill,
                { width: `${(currentStep / 3) * 100}%` }
              ]} 
            />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        {currentStep === 3 && !isFieldFocused && (
          <Animated.View 
            style={[
              styles.skipDialogBox,
              {
                transform: [
                  {
                    translateY: bounceAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -8],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.skipDialogText}>Want to skip adding subjects for now?</Text>
            <View style={styles.skipDialogCaret} />
          </Animated.View>
        )}
        {currentStep < 3 ? (
          <TouchableOpacity
            style={[styles.continueButton, (loading || (currentStep === 2 && children.length === 0)) && styles.buttonDisabled]}
            onPress={handleNext}
            disabled={loading || (currentStep === 2 && children.length === 0)}
            {...(Platform.OS === 'web' && { cursor: (loading || (currentStep === 2 && children.length === 0)) ? 'not-allowed' : 'pointer' })}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.continueButtonText}>CONTINUE</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.continueButton, loading && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={loading}
            {...(Platform.OS === 'web' && { cursor: loading ? 'not-allowed' : 'pointer' })}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.continueButtonText}>COMPLETE SETUP</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E6F4FC', // Light blue background matching sign in/sign up
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#E6F4FC', // Light blue background
  },
  topBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  progressBarContainer: {
    flex: 1,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 50,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 50,
    backgroundColor: '#a78bfa', // Plain purple
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#E6F4FC', // Light blue background
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#E6F4FC', // Light blue background
  },
  stepContent: {
    flex: 1,
    backgroundColor: '#E6F4FC', // Light blue background
    paddingHorizontal: 32,
    paddingVertical: 48,
    justifyContent: 'center',
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  step1Header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 32,
    gap: 16,
  },
  poodleImage: {
    width: 200,
    height: 200,
    flexShrink: 0,
  },
  step1TextContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 48,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  privacyNote: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'left',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  requiredAsterisk: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  inputPill: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    fontSize: 16,
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  textArea: {
    borderRadius: 12,
    minHeight: 80,
    paddingTop: 12,
    paddingBottom: 12,
  },
  accordionContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  accordionHeader: {
    paddingVertical: 16,
    paddingHorizontal: 0,
    backgroundColor: '#E6F4FC',
  },
  accordionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  accordionContent: {
    padding: 0,
    backgroundColor: '#E6F4FC',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    borderColor: '#60a5fa',
    backgroundColor: '#dbeafe',
  },
  chipText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  chipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  otherDiagnosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  otherDiagnosisInput: {
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
    borderColor: '#60a5fa',
    backgroundColor: '#f0f9ff',
  },
  avatarImg: {
    width: 48,
    height: 48,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#60a5fa',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.6,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  listContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  listItemText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde047',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  warningText: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  footer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#E6F4FC', // Light blue background
    gap: 12,
  },
  skipDialogBox: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'flex-end',
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  skipDialogText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  skipDialogCaret: {
    position: 'absolute',
    bottom: -8,
    right: 24,
    width: 16,
    height: 16,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    transform: [{ rotate: '45deg' }],
  },
  footerWithSkip: {
    justifyContent: 'space-between',
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  continueButton: {
    backgroundColor: '#60a5fa',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  signInLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  signInLinkText: {
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  signInLink: {
    fontSize: 14,
    color: '#60a5fa',
    fontWeight: '600',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  successIconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  verificationInstructions: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#60a5fa',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 50,
    marginBottom: 16,
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  resendButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  resendButtonText: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
});

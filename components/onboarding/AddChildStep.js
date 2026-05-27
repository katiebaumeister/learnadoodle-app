import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { BookOpen, Brain, FileText, Check, X } from 'lucide-react';
import { getChildColorFromAvatar, hexToRgba } from '../../utils/avatarColors';
import { ModalSectionCard } from '../ui/ModalSectionCard';

const AVATAR_SIZE = 64;
const AVATAR_PREVIEW_SIZE = 72;

const GRADES = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const STATES = ['None', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'];
const INTERESTS = ['STEM', 'Reading', 'Writing', 'Arts', 'Music', 'Sports', 'Outdoors', 'Languages', 'History', 'Coding', 'Woodworking', 'Other'];
const AVATAR_KEYS = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8', 'prof9', 'prof10'];

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

/** Match AddChildForm accordion / section label tokens */
const MUTED = '#9ca3af';
const FG = '#111827';
const CHIP_BORDER = '#e5e7eb';

const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
};

export default function AddChildStep({ createdChildren = [], onAddChild, onContinueWithNewChild, onRemoveChild, onContinue, isSaving, isStudentOnboarding = false }) {
  // Required fields (match AddChildModal/AddChildForm)
  const [name, setName] = useState('');
  const [age, setAge] = useState(''); // required
  const [grade, setGrade] = useState(''); // required
  const [standardsState, setStandardsState] = useState('None'); // required (None allowed)
  const [avatar, setAvatar] = useState('prof1'); // required

  const [showLearningSetup, setShowLearningSetup] = useState(false);
  const [showLearningProfile, setShowLearningProfile] = useState(false);
  const [showAdditionalNotes, setShowAdditionalNotes] = useState(false);
  const [interests, setInterests] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [learningModalities, setLearningModalities] = useState([]);
  const [supportNeeds, setSupportNeeds] = useState([]);
  const [executiveFunction, setExecutiveFunction] = useState([]);
  const [otherDiagnosis, setOtherDiagnosis] = useState('');
  const [otherInterest, setOtherInterest] = useState('');
  const [supportNotes, setSupportNotes] = useState('');

  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [hoveredAvatar, setHoveredAvatar] = useState(null);
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
      supportNotes: supportNotes.trim() || null,
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
    setSupportNotes('');
    setShowLearningSetup(false);
    setShowLearningProfile(false);
    setShowAdditionalNotes(false);
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

      {/* Name, Age, Grade, Avatar (standards live under Learning setup) */}
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
        <View style={styles.chipsWrap}>
          {(isStudentOnboarding ? Array.from({ length: 6 }, (_, i) => i + 13) : Array.from({ length: 16 }, (_, i) => i + 3)).map((n) => {
            const val = String(n);
            const selected = age === val;
            return (
              <TouchableOpacity
                key={n}
                style={[styles.formChip, selected && styles.formChipSelected]}
                onPress={() => { setAge(val); setError(null); }}
              >
                <Text style={[styles.formChipText, selected && styles.formChipTextSelected]}>{val}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.label}>Grade <Text style={styles.requiredAsterisk}>*</Text></Text>
        <View style={styles.chipsWrap}>
          {GRADES.map((g) => {
            const selected = grade === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.formChip, selected && styles.formChipSelected]}
                onPress={() => { setGrade(g); setError(null); }}
              >
                <Text style={[styles.formChipText, selected && styles.formChipTextSelected]}>{g}</Text>
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
                  { backgroundColor: hexToRgba(getChildColorFromAvatar(key), 0.55) },
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

      {/* Section cards — mirror in-app Add Child modal */}
      <ModalSectionCard
        Icon={BookOpen}
        title="Learning setup"
        subtitle="Standards, interests, and goals"
        expanded={showLearningSetup}
        onPress={() => setShowLearningSetup((v) => !v)}
        accent="#9ECFFB"
      >
          <View style={styles.accordionContent}>
            <View style={styles.accordionField}>
              <Text style={styles.accordionLabel}>Follow State Standards?</Text>
              <View style={styles.chipsWrap}>
                {STATES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, standardsState === s && styles.chipSelected]}
                    onPress={() => { setStandardsState(s); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, standardsState === s && styles.chipTextSelected]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.accordionField}>
              <Text style={styles.accordionLabel}>Interests</Text>
              <View style={styles.chipsWrap}>
                {INTERESTS.map((it) => (
                  <TouchableOpacity
                    key={it}
                    style={[styles.chip, interests.includes(it) && styles.chipSelected]}
                    onPress={() => { toggleFromList(it, interests, setInterests); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, interests.includes(it) && styles.chipTextSelected]}>{it}</Text>
                  </TouchableOpacity>
                ))}
                {interests.filter((i) => typeof i === 'string' && i.startsWith('Other: ')).map((custom) => (
                  <TouchableOpacity
                    key={custom}
                    style={[styles.chip, styles.chipSelected]}
                    onPress={() => setInterests((prev) => prev.filter((i) => i !== custom))}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {interests.includes('Other') && (
                <View style={styles.otherInterestRow}>
                  <TextInput
                    style={[styles.accordionInput, styles.otherInterestInput]}
                    placeholder="Type interest, then tap Add"
                    value={otherInterest}
                    onChangeText={(t) => { setOtherInterest(t); setError(null); }}
                    placeholderTextColor={MUTED}
                    editable={!isSaving && !adding}
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
                    disabled={!otherInterest.trim() || isSaving || adding}
                  >
                    <Check size={20} color={otherInterest.trim() ? '#ffffff' : MUTED} strokeWidth={2.5} />
                    <Text style={[styles.otherConfirmButtonText, !otherInterest.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
      </ModalSectionCard>

      <ModalSectionCard
        Icon={Brain}
        title="Learning profile & supports"
        subtitle="Support needs and learning preferences"
        expanded={showLearningProfile}
        onPress={() => setShowLearningProfile((v) => !v)}
        accent="#9ECFFB"
      >
          <View style={styles.accordionContent}>
            <View style={styles.accordionField}>
              <Text style={styles.accordionLabel}>Learning & processing needs</Text>
              <View style={styles.chipsWrap}>
                {DIAGNOSES.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, diagnoses.includes(d) && styles.chipSelected]}
                    onPress={() => { toggleFromList(d, diagnoses, setDiagnoses); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, diagnoses.includes(d) && styles.chipTextSelected]}>{d}</Text>
                  </TouchableOpacity>
                ))}
                {diagnoses.filter((d) => typeof d === 'string' && d.startsWith('Other: ')).map((custom) => (
                  <TouchableOpacity
                    key={custom}
                    style={[styles.chip, styles.chipSelected]}
                    onPress={() => { setDiagnoses((prev) => prev.filter((x) => x !== custom)); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{custom.replace(/^Other: \s*/, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {diagnoses.includes('Other') && (
                <View style={styles.otherInterestRow}>
                  <TextInput
                    style={[styles.accordionInput, styles.otherInterestInput]}
                    placeholder="Specify other, then tap checkmark"
                    value={otherDiagnosis}
                    onChangeText={(t) => { setOtherDiagnosis(t); setError(null); }}
                    placeholderTextColor={MUTED}
                    editable={!isSaving && !adding}
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
                    disabled={!otherDiagnosis.trim() || isSaving || adding}
                  >
                    <Check size={20} color={otherDiagnosis.trim() ? '#ffffff' : MUTED} strokeWidth={2.5} />
                    <Text style={[styles.otherConfirmButtonText, !otherDiagnosis.trim() && styles.otherConfirmButtonTextDisabled]}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.accordionField}>
              <Text style={styles.accordionLabel}>Executive function needs</Text>
              <View style={styles.chipsWrap}>
                {EXECUTIVE_FUNCTION.map((ef) => (
                  <TouchableOpacity
                    key={ef}
                    style={[styles.chip, executiveFunction.includes(ef) && styles.chipSelected]}
                    onPress={() => { toggleFromList(ef, executiveFunction, setExecutiveFunction); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, executiveFunction.includes(ef) && styles.chipTextSelected]}>{ef}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.accordionField}>
              <Text style={styles.accordionLabel}>Preferred learning modalities</Text>
              <View style={styles.chipsWrap}>
                {LEARNING_MODALITIES.map((mod) => (
                  <TouchableOpacity
                    key={mod}
                    style={[styles.chip, learningModalities.includes(mod) && styles.chipSelected]}
                    onPress={() => { toggleFromList(mod, learningModalities, setLearningModalities); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, learningModalities.includes(mod) && styles.chipTextSelected]}>{mod}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.accordionField}>
              <Text style={styles.accordionLabel}>Support needs</Text>
              <View style={styles.chipsWrap}>
                {SUPPORT_NEEDS.map((need) => (
                  <TouchableOpacity
                    key={need}
                    style={[styles.chip, supportNeeds.includes(need) && styles.chipSelected]}
                    onPress={() => { toggleFromList(need, supportNeeds, setSupportNeeds); setError(null); }}
                    disabled={isSaving || adding}
                  >
                    <Text style={[styles.chipText, supportNeeds.includes(need) && styles.chipTextSelected]}>{need}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
      </ModalSectionCard>

      <ModalSectionCard
        Icon={FileText}
        title="Additional notes"
        subtitle="Anything else to remember"
        expanded={showAdditionalNotes}
        onPress={() => setShowAdditionalNotes((v) => !v)}
        accent="#9ECFFB"
      >
          <View style={styles.accordionContent}>
            <View style={styles.accordionField}>
              <TextInput
                style={[styles.accordionInput, styles.notesTextArea]}
                placeholder="Add any additional notes about learning supports..."
                value={supportNotes}
                onChangeText={(t) => { setSupportNotes(t); setError(null); }}
                placeholderTextColor={MUTED}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!isSaving && !adding}
              />
            </View>
          </View>
      </ModalSectionCard>
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

      {/* Match AddChildModal footer: secondary text action + primary sky button */}
      <View style={styles.footer}>
        {!isStudentOnboarding ? (
          <TouchableOpacity
            style={styles.footerSecondaryBtn}
            onPress={handleAddAnother}
            disabled={!formValid || isSaving || adding}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' && {
              cursor: !formValid || isSaving || adding ? 'not-allowed' : 'pointer',
            })}
          >
            <Text
              style={[
                styles.footerSecondaryBtnText,
                (!formValid || isSaving || adding) && styles.footerSecondaryBtnTextDisabled,
              ]}
            >
              {adding || isSaving ? 'Adding…' : 'Add another child'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerSpacer} />
        )}
        <TouchableOpacity
          style={[
            styles.footerPrimaryBtn,
            (!canContinue || isSaving || adding) && styles.footerPrimaryBtnDisabled,
          ]}
          onPress={handleContinue}
          disabled={!canContinue || isSaving || adding}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && {
            cursor: !canContinue || isSaving || adding ? 'not-allowed' : 'pointer',
          })}
        >
          <Text
            style={[
              styles.footerPrimaryBtnText,
              (!canContinue || isSaving || adding) && styles.footerPrimaryBtnTextDisabled,
            ]}
          >
            {isSaving || adding
              ? 'Saving…'
              : 'FINISH SETUP'}
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: CHIP_BORDER,
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
  accordionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  accordionField: {
    marginBottom: 20,
  },
  accordionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  accordionInput: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
    fontSize: 14,
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  notesTextArea: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
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
  // Match AddChildForm chip styling (in-app Add Child modal)
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  formChip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    minHeight: 32,
    justifyContent: 'center',
  },
  formChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  formChipText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  formChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    minHeight: 32,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  chipText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  footerSecondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  footerSecondaryBtnText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footerSecondaryBtnTextDisabled: {
    color: '#9ca3af',
  },
  footerPrimaryBtn: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  footerPrimaryBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
      cursor: 'not-allowed',
    }),
  },
  footerPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  footerPrimaryBtnTextDisabled: {
    color: 'rgba(255,255,255,0.85)',
  },
  avatarsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  avatarCell: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { overflow: 'visible' }),
  },
  avatarCellHovered: {
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -1 }],
      opacity: 0.95,
    }),
  },
  avatarCellSelected: {
    borderWidth: 3,
    borderColor: '#6BB3E8',
  },
  avatarImg: {
    width: 48,
    height: 48,
  },
});

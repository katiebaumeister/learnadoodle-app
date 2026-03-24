import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { ChevronDown, ChevronUp, Plus, X, CheckCircle } from 'lucide-react';
import { getMaterials } from '../../lib/services/materialsClient';
import { getFamilyPlannerSettings } from '../../lib/services/plannerSettingsClient';
import { PLANNING_PREFERENCES_UI } from '../planner/planningPreferencesUiCopy';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../../lib/docs/roles';
import AddMaterialModal from '../materials/AddMaterialModal';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const MATERIAL_SLOT = { SYLLABUS: 'syllabus', LESSON_PLAN: 'lesson_plan' };

function materialEligibleForSyllabusPicker(m) {
  const r = deriveRoleFromTags(m.tags);
  return r == null || r === DOCUMENT_ROLES.SYLLABUS;
}

function materialEligibleForLessonPicker(m) {
  const r = deriveRoleFromTags(m.tags);
  return r == null || r === DOCUMENT_ROLES.LESSON_PLAN;
}

function getSchoolYearOptions() {
  const options = [];
  for (let y = 2025; y <= 2040; y++) {
    options.push(`${y}/${String(y + 1).slice(-2)}`);
  }
  return options;
}
const SCHOOL_YEAR_OPTIONS = getSchoolYearOptions();

function getDefaultSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month < 5) return `${year}/${String(year + 1).slice(-2)}`;
  return `${year + 1}/${String(year + 2).slice(-2)}`;
}

const MUTED = '#9ca3af';
const CHIP_BORDER = '#e5e7eb';
const FG = '#111827';

export default function AddSubjectStep({
  familyId = null,
  createdChildren = [],
  subjectStepChildIndex = 0,
  subjectsForCurrentChild = [],
  onAddSubject,
  onRemoveSubject,
  onContinue,
  isSaving,
}) {
  const [subjectName, setSubjectName] = useState('');
  const [subjectNameFocused, setSubjectNameFocused] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [grade, setGrade] = useState(GRADE_OPTIONS[0] || 'K');
  const [credits, setCredits] = useState('');
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showMaterialsAccordion, setShowMaterialsAccordion] = useState(false);
  const [showPlanningAccordion, setShowPlanningAccordion] = useState(false);
  const [showAdditionalNotesAccordion, setShowAdditionalNotesAccordion] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialPickerSlot, setMaterialPickerSlot] = useState(null);
  const [selectedSyllabusMaterialId, setSelectedSyllabusMaterialId] = useState(null);
  const [selectedLessonPlanMaterialId, setSelectedLessonPlanMaterialId] = useState(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [addMaterialDefaultRole, setAddMaterialDefaultRole] = useState(null);

  const [schoolYear, setSchoolYear] = useState(() => getDefaultSchoolYear());
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [goalModeForSubject, setGoalModeForSubject] = useState('overall');
  const [targetMode, setTargetMode] = useState('none');
  const [defaultTargetDays, setDefaultTargetDays] = useState('');
  const [defaultTargetHours, setDefaultTargetHours] = useState('');
  const [familyPlannerContext, setFamilyPlannerContext] = useState(null);
  const [planningPrefilledFromFamily, setPlanningPrefilledFromFamily] = useState(false);
  const hasPrefilledFromFamilyRef = useRef(false);

  const currentChild = createdChildren[subjectStepChildIndex] || null;
  const childName = currentChild?.name || 'Child';
  const isLastChild = subjectStepChildIndex >= createdChildren.length - 1;
  const nextChildName = !isLastChild ? createdChildren[subjectStepChildIndex + 1]?.name : null;

  useEffect(() => {
    if (!showMaterialsAccordion) setMaterialPickerSlot(null);
  }, [showMaterialsAccordion]);

  useEffect(() => {
    setSubjectName('');
    setAdditionalNotes('');
    setCredits('');
    setGrade(GRADE_OPTIONS[0] || 'K');
    setError(null);
    setSubjectNameFocused(false);
    setShowMaterialsAccordion(false);
    setShowPlanningAccordion(false);
    setShowAdditionalNotesAccordion(false);
    setMaterialPickerSlot(null);
    setSelectedSyllabusMaterialId(null);
    setSelectedLessonPlanMaterialId(null);
    setSchoolYear(getDefaultSchoolYear());
    setShowSchoolYearDropdown(false);
    setGoalModeForSubject(
      familyPlannerContext?.targetScope === 'per_subject' ? 'per_subject' : 'overall'
    );
    setTargetMode('none');
    setDefaultTargetDays('');
    setDefaultTargetHours('');
    setPlanningPrefilledFromFamily(false);
    hasPrefilledFromFamilyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset form when learner step changes; read latest planner context from closure
  }, [subjectStepChildIndex]);

  useEffect(() => {
    if (!familyPlannerContext) return;
    setGoalModeForSubject(familyPlannerContext.targetScope === 'per_subject' ? 'per_subject' : 'overall');
    setPlanningPrefilledFromFamily(true);
  }, [familyPlannerContext]);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    setLoadingMaterials(true);
    getMaterials(familyId, {}, null)
      .then((list) => {
        if (!cancelled) setMaterials(list || []);
      })
      .catch(() => {
        if (!cancelled) setMaterials([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMaterials(false);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    getFamilyPlannerSettings(familyId).then(({ data: s }) => {
      if (cancelled) return;
      if (!s) {
        setFamilyPlannerContext({ targetScope: 'overall', mode: 'none', days: '', hours: '' });
        return;
      }
      const scope = s.target_scope || 'overall';
      const mode =
        s.default_constraint_mode ||
        (s.default_target_days != null ? 'days' : s.default_target_hours != null ? 'hours' : 'none');
      const days = s.default_target_days != null ? String(s.default_target_days) : '';
      const hours = s.default_target_hours != null ? String(s.default_target_hours) : '';
      setFamilyPlannerContext({ targetScope: scope, mode, days, hours });
    });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  useEffect(() => {
    if (!familyPlannerContext) return;
    if (goalModeForSubject !== 'per_subject' && goalModeForSubject !== 'overall') return;
    if (defaultTargetDays !== '' || defaultTargetHours !== '') return;
    if (hasPrefilledFromFamilyRef.current) return;
    hasPrefilledFromFamilyRef.current = true;
    setTargetMode(familyPlannerContext.mode);
    setDefaultTargetDays(familyPlannerContext.days);
    setDefaultTargetHours(familyPlannerContext.hours);
  }, [familyPlannerContext, goalModeForSubject, defaultTargetDays, defaultTargetHours]);

  const nameTrim = subjectName.trim();
  const canAdd = nameTrim.length > 0 && currentChild?.id;
  const canContinue = subjectsForCurrentChild.length >= 1 || nameTrim.length > 0;

  const setSlotSelection = (slot, materialId) => {
    if (slot === MATERIAL_SLOT.SYLLABUS) {
      setSelectedSyllabusMaterialId(materialId);
      if (materialId) setSelectedLessonPlanMaterialId((prev) => (prev === materialId ? null : prev));
    } else {
      setSelectedLessonPlanMaterialId(materialId);
      if (materialId) setSelectedSyllabusMaterialId((prev) => (prev === materialId ? null : prev));
    }
  };

  const buildPayload = () => {
    const creditsVal = credits.trim() ? parseFloat(credits.trim()) : null;
    return {
      name: nameTrim,
      child_id: currentChild.id,
      summary: null,
      grade: grade || null,
      credits: creditsVal != null && !Number.isNaN(creditsVal) ? creditsVal : null,
      notes: additionalNotes.trim() || null,
      school_year: schoolYear || getDefaultSchoolYear(),
      default_constraint_mode: goalModeForSubject === 'per_subject' ? targetMode : null,
      default_target_days:
        goalModeForSubject === 'per_subject' && targetMode === 'days' && defaultTargetDays.trim()
          ? parseInt(defaultTargetDays, 10) || null
          : null,
      default_target_hours:
        goalModeForSubject === 'per_subject' && targetMode === 'hours' && defaultTargetHours.trim()
          ? parseFloat(defaultTargetHours) || null
          : null,
      familyPlannerTargets:
        goalModeForSubject === 'overall'
          ? {
              target_scope: 'overall',
              default_constraint_mode: targetMode,
              default_target_days:
                targetMode === 'days' && defaultTargetDays.trim()
                  ? parseInt(defaultTargetDays, 10) || null
                  : null,
              default_target_hours:
                targetMode === 'hours' && defaultTargetHours.trim()
                  ? parseFloat(defaultTargetHours) || null
                  : null,
            }
          : null,
      syllabus_material_id: selectedSyllabusMaterialId,
      lesson_plan_material_id: selectedLessonPlanMaterialId,
    };
  };

  const resetAfterAdd = () => {
    setSubjectName('');
    setAdditionalNotes('');
    setCredits('');
    setGrade(GRADE_OPTIONS[0] || 'K');
    setSelectedSyllabusMaterialId(null);
    setSelectedLessonPlanMaterialId(null);
    setMaterialPickerSlot(null);
    setShowMaterialsAccordion(false);
    setShowPlanningAccordion(false);
    setShowAdditionalNotesAccordion(false);
    setSchoolYear(getDefaultSchoolYear());
    setGoalModeForSubject(familyPlannerContext?.targetScope === 'per_subject' ? 'per_subject' : 'overall');
    setTargetMode('none');
    setDefaultTargetDays('');
    setDefaultTargetHours('');
    setPlanningPrefilledFromFamily(true);
    hasPrefilledFromFamilyRef.current = false;
  };

  const addSubjectByName = async () => {
    if (!nameTrim || !currentChild?.id) return;
    const nameNorm = nameTrim.toLowerCase();
    const alreadyAdded = (subjectsForCurrentChild || []).some(
      (s) => (s.name || '').trim().toLowerCase() === nameNorm
    );
    if (alreadyAdded) return;
    setError(null);
    setAdding(true);
    try {
      await onAddSubject(buildPayload());
      resetAfterAdd();
    } catch (e) {
      setError(e?.message || 'Failed to add subject.');
    } finally {
      setAdding(false);
    }
  };

  const handleContinue = () => {
    setError(null);
    if (nameTrim && currentChild?.id) {
      const nameNorm = nameTrim.toLowerCase();
      const alreadyAdded = (subjectsForCurrentChild || []).some(
        (s) => (s.name || '').trim().toLowerCase() === nameNorm
      );
      if (alreadyAdded) {
        setError(`"${nameTrim}" is already added for ${childName}.`);
        return;
      }
      const payload = buildPayload();
      onContinue(payload);
      resetAfterAdd();
      return;
    }
    if (subjectsForCurrentChild.length >= 1) {
      onContinue();
      return;
    }
    setError(`Enter a subject name for ${childName}, or add one above.`);
  };

  const handleAddAnother = async () => {
    if (!nameTrim) {
      setError('Enter a subject name.');
      return;
    }
    await addSubjectByName();
  };

  const friendlyErrorMessage = 'UH OH. SOMETHING WENT WRONG. PLEASE TRY REFRESHING OR CONTACT US: CONTACT@LEARNADOODLE.COM';

  const syllabusPickerMaterials = materials.filter(materialEligibleForSyllabusPicker);
  const lessonPickerMaterials = materials.filter(materialEligibleForLessonPicker);

  const renderMaterialRow = (slot, sectionLabel, addLabel, selectedId) => (
    <View style={[styles.formGroup, { marginBottom: 14 }]}>
      <Text style={styles.modalLabel}>{sectionLabel}</Text>
      <View style={styles.materialSelectorContainer}>
        <TouchableOpacity
          style={styles.materialSelector}
          onPress={() => setMaterialPickerSlot((prev) => (prev === slot ? null : slot))}
        >
          <Text
            style={[styles.materialSelectorText, !selectedId && styles.materialSelectorPlaceholder]}
            numberOfLines={1}
          >
            {selectedId
              ? materials.find((m) => m.id === selectedId)?.title ||
                materials.find((m) => m.id === selectedId)?.provider_name ||
                'Select attachment...'
              : 'Select attachment...'}
          </Text>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>
        {selectedId ? (
          <TouchableOpacity style={styles.clearMaterialButton} onPress={() => setSlotSelection(slot, null)}>
            <Text style={styles.clearMaterialText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.addMaterialButton}
          onPress={() => {
            setMaterialPickerSlot(null);
            setAddMaterialDefaultRole(slot === MATERIAL_SLOT.SYLLABUS ? 'syllabus' : 'lesson_plan');
            setShowAddMaterialModal(true);
          }}
        >
          <Plus size={14} color="#B8D7F9" />
          <Text style={styles.addMaterialText}>{addLabel}</Text>
        </TouchableOpacity>
      </View>
      {materialPickerSlot === slot && (
        <View style={styles.inlineMaterialList}>
          {loadingMaterials ? (
            <Text style={styles.mutedSmall}>Loading…</Text>
          ) : (slot === MATERIAL_SLOT.SYLLABUS ? syllabusPickerMaterials : lessonPickerMaterials).length === 0 ? (
            <Text style={styles.mutedSmall}>No materials yet</Text>
          ) : (
            <ScrollView style={styles.inlineMaterialScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.inlineMaterialOption}
                onPress={() => {
                  setSlotSelection(slot, null);
                  setMaterialPickerSlot(null);
                }}
              >
                <Text style={styles.inlineMaterialOptionText}>None</Text>
              </TouchableOpacity>
              {(slot === MATERIAL_SLOT.SYLLABUS ? syllabusPickerMaterials : lessonPickerMaterials).map((material) => (
                <TouchableOpacity
                  key={material.id}
                  style={[
                    styles.inlineMaterialOption,
                    selectedId === material.id && styles.inlineMaterialOptionSelected,
                  ]}
                  onPress={() => {
                    setSlotSelection(slot, material.id);
                    setMaterialPickerSlot(null);
                  }}
                >
                  <Text
                    style={[
                      styles.inlineMaterialOptionText,
                      selectedId === material.id && styles.inlineMaterialOptionTextSelected,
                    ]}
                  >
                    {material.title || material.provider_name || 'Untitled'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );

  if (!currentChild) {
    return (
      <View style={styles.container}>
        <Text style={styles.friendlyErrorText}>{friendlyErrorMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeading}>What is {childName} learning?</Text>
      <Text style={styles.supportingText}>You can change these anytime.</Text>

      {subjectsForCurrentChild.length > 0 && (
        <View style={styles.list}>
          {subjectsForCurrentChild.map((s) => (
            <View key={s.id} style={styles.chipReadOnly}>
              <Text style={styles.chipReadOnlyText}>{s.name}</Text>
              {onRemoveSubject && currentChild?.id ? (
                <TouchableOpacity
                  onPress={() => onRemoveSubject(currentChild.id, s.id)}
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

      {/* Subject Name — match AddSubjectModal */}
      <View style={styles.formGroup}>
        <Text style={styles.subjectNameLabel}>
          Subject Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.subjectNameInput, subjectNameFocused && styles.subjectNameInputFocused]}
          value={subjectName}
          onChangeText={(t) => {
            setSubjectName(t);
            setError(null);
          }}
          placeholder="e.g., Algebra I, World History, Spanish"
          placeholderTextColor={MUTED}
          onFocus={() => setSubjectNameFocused(true)}
          onBlur={() => setSubjectNameFocused(false)}
          editable={!isSaving && !adding}
        />
      </View>

      {/* Students — match modal chips; only current learner is active on this step */}
      <View style={styles.formGroup}>
        <Text style={styles.modalLabel}>
          Students<Text style={styles.required}> *</Text>
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childrenScroll}>
          {createdChildren.map((c) => {
            const isCurrent = c.id === currentChild.id;
            const isSelected = isCurrent;
            return (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.childChip,
                  isSelected && styles.childChipSelected,
                  !isCurrent && styles.childChipInactive,
                ]}
                disabled={!isCurrent}
                activeOpacity={isCurrent ? 0.8 : 1}
              >
                <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {!createdChildren.some((c) => c.id === currentChild.id) ? null : (
          <Text style={styles.studentsHint}>Adding subjects for {childName} on this step.</Text>
        )}
      </View>

      {/* Grade + Credits row */}
      <View style={styles.formGroup}>
        <View style={styles.gradeCreditsRow}>
          <View style={styles.gradeCreditsCol}>
            <Text style={styles.modalLabel}>Grade Level (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gradeScroll}>
              {GRADE_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.gradeChip, grade === g && styles.gradeChipSelected]}
                  onPress={() => {
                    setGrade(g);
                    setError(null);
                  }}
                  disabled={isSaving || adding}
                >
                  <Text style={[styles.gradeChipText, grade === g && styles.gradeChipTextSelected]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={styles.creditsCol}>
            <Text style={styles.modalLabel}>Credits (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={credits}
              onChangeText={(text) => {
                const numericValue = text.replace(/[^0-9.]/g, '');
                const parts = numericValue.split('.');
                const filteredValue =
                  parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : numericValue;
                setCredits(filteredValue.slice(0, 8));
                setError(null);
              }}
              placeholder="e.g., 0.5, 1.0, 1.5"
              placeholderTextColor={MUTED}
              keyboardType="numeric"
              editable={!isSaving && !adding}
            />
          </View>
        </View>
      </View>

      {/* Syllabus & Lesson Plan accordion */}
      {familyId ? (
        <View style={styles.accordionSection}>
          <TouchableOpacity
            onPress={() => setShowMaterialsAccordion(!showMaterialsAccordion)}
            style={styles.accordionHeader}
            activeOpacity={0.8}
            disabled={isSaving || adding}
          >
            <Text style={styles.accordionSectionLabel}>Syllabus and Lesson Plan</Text>
            {showMaterialsAccordion ? <ChevronUp size={20} color={MUTED} /> : <ChevronDown size={20} color={MUTED} />}
          </TouchableOpacity>
          {showMaterialsAccordion && (
            <View style={styles.accordionContent}>
              {renderMaterialRow(MATERIAL_SLOT.SYLLABUS, 'Syllabus', 'Add syllabus', selectedSyllabusMaterialId)}
              {renderMaterialRow(
                MATERIAL_SLOT.LESSON_PLAN,
                'Lesson plan',
                'Add lesson plan',
                selectedLessonPlanMaterialId
              )}
            </View>
          )}
        </View>
      ) : null}

      {/* Planning Preferences accordion */}
      <View style={styles.accordionSection}>
        <TouchableOpacity
          onPress={() => setShowPlanningAccordion(!showPlanningAccordion)}
          style={styles.accordionHeader}
          activeOpacity={0.8}
          disabled={isSaving || adding}
        >
          <Text style={styles.accordionSectionLabel}>{PLANNING_PREFERENCES_UI.subjectModalAccordionTitle}</Text>
          {showPlanningAccordion ? <ChevronUp size={20} color={MUTED} /> : <ChevronDown size={20} color={MUTED} />}
        </TouchableOpacity>
        {showPlanningAccordion && (
          <View style={styles.accordionContent}>
            <View style={[styles.formGroup, styles.planningDefaultsField]}>
              <Text style={styles.modalLabel}>School year</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowSchoolYearDropdown(!showSchoolYearDropdown)}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownButtonText}>{schoolYear}</Text>
                <ChevronDown size={18} color="#6b7280" />
              </TouchableOpacity>
              {showSchoolYearDropdown && (
                <View style={styles.dropdownList}>
                  <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {SCHOOL_YEAR_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.dropdownOption, opt === schoolYear && styles.dropdownOptionSelected]}
                        onPress={() => {
                          setSchoolYear(opt);
                          setShowSchoolYearDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[styles.dropdownOptionText, opt === schoolYear && styles.dropdownOptionTextSelected]}
                        >
                          {opt}
                        </Text>
                        {opt === schoolYear ? <CheckCircle size={16} color="#3b82f6" /> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={[styles.formGroup, styles.planningDefaultsField, styles.planningDefaultsStack]}>
              <Text style={[styles.modalLabel, { marginBottom: 6 }]}>Learning goals</Text>
              <View style={styles.learningGoalsRow}>
                <TouchableOpacity
                  style={[
                    styles.goalPill,
                    goalModeForSubject === 'overall' ? styles.goalPillSelected : styles.goalPillIdle,
                  ]}
                  onPress={() => {
                    setGoalModeForSubject('overall');
                    setPlanningPrefilledFromFamily(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.goalPillText,
                      { color: goalModeForSubject === 'overall' ? '#3b82f6' : '#9ca3af' },
                    ]}
                  >
                    Overall
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.goalPill,
                    goalModeForSubject === 'per_subject' ? styles.goalPillSelected : styles.goalPillIdle,
                  ]}
                  onPress={() => {
                    setGoalModeForSubject('per_subject');
                    setPlanningPrefilledFromFamily(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.goalPillText,
                      { color: goalModeForSubject === 'per_subject' ? '#3b82f6' : '#9ca3af' },
                    ]}
                  >
                    Per subject
                  </Text>
                </TouchableOpacity>
              </View>
              {goalModeForSubject === 'per_subject' && (
                <View style={styles.perSubjectPreview}>
                  <Text style={styles.modalLabel}>Subject</Text>
                  <View style={styles.subjectNamePreviewChip}>
                    <Text style={styles.subjectNamePreviewText} numberOfLines={2}>
                      {nameTrim || 'Type in Subject name above'}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={[styles.formGroup, styles.planningDefaultsField, styles.planningDefaultsStack]}>
              <Text style={[styles.modalLabel, { marginBottom: 6 }]}>Target</Text>
              <View style={styles.targetRow}>
                {['none', 'days', 'hours'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.targetPill, targetMode === m ? styles.targetPillSelected : styles.targetPillIdle]}
                    onPress={() => {
                      setTargetMode(m);
                      setPlanningPrefilledFromFamily(false);
                    }}
                    activeOpacity={0.8}
                    disabled={isSaving || adding}
                  >
                    <Text
                      style={[
                        styles.goalPillText,
                        { color: targetMode === m ? '#3b82f6' : '#6b7280' },
                      ]}
                    >
                      {m === 'none' ? 'None' : m === 'days' ? 'Days' : 'Hours'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {targetMode === 'days' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.modalLabel, { fontSize: 12, marginBottom: 4 }]}>Days per year</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={defaultTargetDays}
                    onChangeText={(v) => {
                      setDefaultTargetDays(v);
                      setPlanningPrefilledFromFamily(false);
                    }}
                    placeholder="e.g. 36"
                    placeholderTextColor={MUTED}
                    keyboardType="number-pad"
                    editable={!isSaving && !adding}
                  />
                </View>
              )}
              {targetMode === 'hours' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.modalLabel, { fontSize: 12, marginBottom: 4 }]}>Hours per year</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={defaultTargetHours}
                    onChangeText={(v) => {
                      setDefaultTargetHours(v);
                      setPlanningPrefilledFromFamily(false);
                    }}
                    placeholder="e.g. 72"
                    placeholderTextColor={MUTED}
                    keyboardType="decimal-pad"
                    editable={!isSaving && !adding}
                  />
                </View>
              )}
              {planningPrefilledFromFamily &&
                familyPlannerContext &&
                (familyPlannerContext.days || familyPlannerContext.hours) && (
                  <Text style={styles.prefillNote}>Prefilled from family planning settings.</Text>
                )}
            </View>
          </View>
        )}
      </View>

      {/* Additional notes — match Add Child accordion */}
      <View style={[styles.accordionSection, styles.accordionSectionLast]}>
        <TouchableOpacity
          onPress={() => setShowAdditionalNotesAccordion(!showAdditionalNotesAccordion)}
          style={styles.accordionHeader}
          activeOpacity={0.8}
          disabled={isSaving || adding}
        >
          <Text style={styles.accordionSectionLabel}>Additional notes</Text>
          {showAdditionalNotesAccordion ? <ChevronUp size={20} color={MUTED} /> : <ChevronDown size={20} color={MUTED} />}
        </TouchableOpacity>
        {showAdditionalNotesAccordion && (
          <View style={styles.accordionContent}>
            <View style={styles.accordionNotesField}>
              <TextInput
                style={[styles.modalInput, styles.notesTextArea]}
                placeholder="Add any additional notes about this subject"
                value={additionalNotes}
                onChangeText={(t) => {
                  setAdditionalNotes(t);
                  setError(null);
                }}
                placeholderTextColor={MUTED}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!isSaving && !adding}
              />
            </View>
          </View>
        )}
      </View>

      {familyId && (
        <AddMaterialModal
          visible={showAddMaterialModal}
          onClose={() => {
            setShowAddMaterialModal(false);
            setAddMaterialDefaultRole(null);
          }}
          onSaved={async (detail) => {
            if (detail?.materialId && addMaterialDefaultRole) {
              const slot =
                addMaterialDefaultRole === 'syllabus' ? MATERIAL_SLOT.SYLLABUS : MATERIAL_SLOT.LESSON_PLAN;
              setSlotSelection(slot, detail.materialId);
            }
            if (familyId) {
              try {
                const list = await getMaterials(familyId, {}, null);
                setMaterials(list || []);
              } catch (_) {}
            }
            setShowAddMaterialModal(false);
            setAddMaterialDefaultRole(null);
          }}
          familyId={familyId}
          children={createdChildren.map((c) => ({ id: c.id, first_name: c.name, name: c.name }))}
          defaultRole={addMaterialDefaultRole ?? null}
          defaultChildIds={currentChild ? [currentChild.id] : []}
        />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerSecondaryBtn}
          onPress={handleAddAnother}
          disabled={!canAdd || isSaving || adding}
          activeOpacity={0.85}
          {...(Platform.OS === 'web' && {
            cursor: !canAdd || isSaving || adding ? 'not-allowed' : 'pointer',
          })}
        >
          <Text
            style={[
              styles.footerSecondaryBtnText,
              (!canAdd || isSaving || adding) && styles.footerSecondaryBtnTextDisabled,
            ]}
          >
            {adding || isSaving ? 'Adding…' : 'Add another'}
          </Text>
        </TouchableOpacity>
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
              : isLastChild
                ? 'Finish'
                : `Next: ${nextChildName}'s subjects`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  sectionHeading: {
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.8)',
    marginBottom: 6,
    marginTop: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  supportingText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
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
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(133,196,242,0.2)',
    borderWidth: 1,
    borderColor: '#6BB3E8',
  },
  chipRemoveBtn: {
    marginLeft: 4,
    padding: 2,
  },
  chipReadOnlyText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  formGroup: {
    marginBottom: 20,
  },
  subjectNameLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectNameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: FG,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      transition: 'border-color 0.15s ease',
    }),
  },
  subjectNameInputFocused: {
    borderColor: '#6BB3E8',
    borderWidth: 1.5,
  },
  required: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  notesTextArea: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  accordionNotesField: {
    marginBottom: 0,
  },
  childrenScroll: {
    marginTop: 6,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: CHIP_BORDER,
  },
  childChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  childChipInactive: {
    opacity: 0.45,
  },
  childChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
  },
  studentsHint: {
    fontSize: 12,
    color: MUTED,
    marginTop: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  gradeCreditsRow: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  gradeCreditsCol: {
    flex: 1,
    minWidth: 200,
  },
  creditsCol: {
    width: 160,
    minWidth: 120,
  },
  gradeScroll: {
    marginTop: 6,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    marginRight: 6,
  },
  gradeChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  gradeChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
  },
  accordionSection: {
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  accordionSectionLast: {
    marginBottom: 4,
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
  accordionSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    flex: 1,
    paddingRight: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  materialSelector: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
  },
  materialSelectorText: {
    fontSize: 14,
    color: FG,
    flex: 1,
  },
  materialSelectorPlaceholder: {
    color: MUTED,
  },
  clearMaterialButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  clearMaterialText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#B8D7F9',
  },
  addMaterialText: {
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '600',
  },
  inlineMaterialList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 8,
    backgroundColor: '#fff',
    maxHeight: 200,
    overflow: 'hidden',
  },
  inlineMaterialScroll: {
    maxHeight: 200,
  },
  inlineMaterialOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  inlineMaterialOptionSelected: {
    backgroundColor: 'rgba(184, 215, 249, 0.1)',
  },
  inlineMaterialOptionText: {
    fontSize: 13,
    color: FG,
  },
  inlineMaterialOptionTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  mutedSmall: {
    fontSize: 13,
    color: '#6b7280',
    padding: 12,
  },
  planningDefaultsField: {
    marginBottom: 8,
  },
  planningDefaultsStack: {
    marginTop: 8,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#0f172a',
  },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  dropdownOptionTextSelected: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  learningGoalsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  goalPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  goalPillSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  goalPillIdle: {
    borderColor: CHIP_BORDER,
    backgroundColor: '#fff',
  },
  goalPillText: {
    fontSize: 14,
    fontWeight: '500',
  },
  perSubjectPreview: {
    marginTop: 12,
  },
  subjectNamePreviewChip: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#f9fafb',
  },
  subjectNamePreviewText: {
    fontSize: 15,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  prefillNote: {
    fontSize: 12,
    color: MUTED,
    marginTop: 6,
  },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  targetPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  targetPillSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  targetPillIdle: {
    borderColor: CHIP_BORDER,
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 16,
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  friendlyErrorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    paddingVertical: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: CHIP_BORDER,
    gap: 12,
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
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  footerPrimaryBtnTextDisabled: {
    color: 'rgba(255,255,255,0.85)',
  },
});

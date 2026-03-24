import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronDown, ChevronUp, X, Calculator, BookOpen, Pencil, FlaskConical, Clock, Layers, Plus, Check } from 'lucide-react';
import { getMaterials } from '../../lib/services/materialsClient';
import AddMaterialModal from '../materials/AddMaterialModal';

const PRESETS = ['Math', 'Reading', 'Writing', 'Science', 'History', 'Other'];
const PRESET_ICONS = {
  Math: Calculator,
  Reading: BookOpen,
  Writing: Pencil,
  Science: FlaskConical,
  History: Clock,
  Other: Layers,
};
const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

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
  const [customName, setCustomName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [hoveredPreset, setHoveredPreset] = useState(null);
  const [summary, setSummary] = useState('');
  const [grade, setGrade] = useState('');
  const [credits, setCredits] = useState('');
  const [notes, setNotes] = useState('');
  const [attachedMaterialIds, setAttachedMaterialIds] = useState([]);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  const currentChild = createdChildren[subjectStepChildIndex] || null;
  const childName = currentChild?.name || 'Child';
  const isLastChild = subjectStepChildIndex >= createdChildren.length - 1;
  const nextChildName = !isLastChild ? createdChildren[subjectStepChildIndex + 1]?.name : null;

  useEffect(() => {
    if (!showAdditional || !familyId) return;
    let cancelled = false;
    setLoadingMaterials(true);
    getMaterials(familyId, {}, null)
      .then((list) => { if (!cancelled) setMaterials(list || []); })
      .catch(() => { if (!cancelled) setMaterials([]); })
      .finally(() => { if (!cancelled) setLoadingMaterials(false); });
    return () => { cancelled = true; };
  }, [showAdditional, familyId]);

  const nameToAdd = selectedPreset === 'Other' ? customName.trim() : (selectedPreset || customName.trim());
  const canAdd = nameToAdd.length > 0 && currentChild?.id;
  const canContinue = subjectsForCurrentChild.length >= 1 || nameToAdd.length > 0;

  const addSubjectByName = async (name) => {
    if (!name?.trim() || !currentChild?.id) return;
    const nameNorm = name.trim().toLowerCase();
    const alreadyAdded = (subjectsForCurrentChild || []).some((s) => (s.name || '').trim().toLowerCase() === nameNorm);
    if (alreadyAdded) return;
    setError(null);
    setAdding(true);
    try {
      const creditsVal = credits.trim() ? parseFloat(credits.trim()) : null;
      await onAddSubject({
        name: name.trim(),
        child_id: currentChild.id,
        summary: summary.trim() || null,
        grade: grade || null,
        credits: creditsVal != null && !Number.isNaN(creditsVal) ? creditsVal : null,
        notes: notes.trim() || null,
        material_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : undefined,
      });
      setSelectedPreset(null);
      setCustomName('');
      setSummary('');
      setGrade('');
      setCredits('');
      setNotes('');
      setAttachedMaterialIds([]);
      setShowAdditional(false);
    } catch (e) {
      setError(e?.message || 'Failed to add subject.');
    } finally {
      setAdding(false);
    }
  };

  const handlePresetPress = (preset) => {
    if (preset === 'Other') {
      setSelectedPreset('Other');
      setCustomName('');
      setError(null);
      return;
    }
    addSubjectByName(preset);
  };

  const handleAddAnother = async () => {
    const name = nameToAdd;
    if (!name) {
      setError('Choose a subject or type a name.');
      return;
    }
    await addSubjectByName(name);
  };

  const handleContinue = () => {
    setError(null);
    if (nameToAdd && currentChild?.id) {
      const creditsVal = credits.trim() ? parseFloat(credits.trim()) : null;
      const payload = {
        name: nameToAdd,
        child_id: currentChild.id,
        summary: summary.trim() || null,
        grade: grade || null,
        credits: creditsVal != null && !Number.isNaN(creditsVal) ? creditsVal : null,
        notes: notes.trim() || null,
        material_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : undefined,
      };
      setSelectedPreset(null);
      setCustomName('');
      setSummary('');
      setGrade('');
      setCredits('');
      setNotes('');
      setAttachedMaterialIds([]);
      setShowAdditional(false);
      onContinue(payload);
      return;
    }
    if (subjectsForCurrentChild.length >= 1) {
      onContinue();
      return;
    }
    setError(`Choose or type a subject for ${childName}, or add one above.`);
  };

  const friendlyErrorMessage = 'UH OH. SOMETHING WENT WRONG. PLEASE TRY REFRESHING OR CONTACT US: CONTACT@LEARNADOODLE.COM';

  if (!currentChild) {
    return (
      <View style={styles.container}>
        <Text style={styles.friendlyErrorText}>{friendlyErrorMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeading}>
        What is {childName} learning?
      </Text>
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
      <Text style={styles.subjectsTitle}>Subjects <Text style={styles.requiredAsterisk}>*</Text></Text>
      <View style={styles.presetsRow}>
        {PRESETS.map((preset) => {
          const selected = selectedPreset === preset;
          const hovered = hoveredPreset === preset;
          const Icon = PRESET_ICONS[preset];
          return (
            <TouchableOpacity
              key={preset}
              style={[
                styles.presetChip,
                selected && styles.presetChipSelected,
                Platform.OS === 'web' && !selected && hovered && styles.presetChipHovered,
                (isSaving || adding) && styles.chipDisabled,
              ]}
              onPress={() => handlePresetPress(preset)}
              onMouseEnter={Platform.OS === 'web' ? () => setHoveredPreset(preset) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setHoveredPreset(null) : undefined}
              disabled={isSaving || adding}
              activeOpacity={0.8}
            >
              {Icon ? (
                <Icon size={16} color={selected ? '#6BB3E8' : '#6b7280'} style={styles.chipIcon} />
              ) : null}
              <Text style={[styles.presetChipText, selected && styles.presetChipTextSelected]}>
                {preset}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedPreset === 'Other' && (
        <View style={styles.customSubjectRow}>
          <TextInput
            style={[styles.subjectNameInput, styles.customSubjectInput]}
            value={customName}
            onChangeText={(t) => { setCustomName(t); setError(null); }}
            placeholder="Add a custom subject (Art, Piano, Robotics…)"
            placeholderTextColor="#9CA3AF"
            onSubmitEditing={() => {
              const name = customName.trim();
              if (name && !adding && !isSaving) addSubjectByName(name);
            }}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={() => {
              const name = customName.trim();
              if (!name || adding || isSaving) return;
              addSubjectByName(name);
            }}
            style={[styles.otherConfirmButton, (!customName.trim() || adding || isSaving) && styles.otherConfirmButtonDisabled]}
            disabled={!customName.trim() || adding || isSaving}
          >
            <Check size={20} color={customName.trim() && !adding && !isSaving ? '#ffffff' : '#9CA3AF'} strokeWidth={2.5} />
            <Text style={[styles.otherConfirmButtonText, (!customName.trim() || adding || isSaving) && styles.otherConfirmButtonTextDisabled]}>Add</Text>
          </TouchableOpacity>
        </View>
      )}

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
        <View style={styles.additionalSection}>
          <Text style={styles.fieldLabel}>Summary</Text>
          <TextInput
            style={styles.modalInput}
            value={summary}
            onChangeText={(t) => { setSummary(t); setError(null); }}
            placeholder="E.g., Building foundational knowledge on fractions."
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.fieldLabel}>Grade level</Text>
          <View style={styles.chipsWrap}>
            {GRADE_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.gradeChip,
                  grade === g && styles.gradeChipSelected,
                  (isSaving || adding) && styles.chipDisabled,
                ]}
                onPress={() => { setGrade(grade === g ? '' : g); setError(null); }}
                disabled={isSaving || adding}
                activeOpacity={0.8}
              >
                <Text style={[styles.gradeChipText, grade === g && styles.gradeChipTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Credits</Text>
          <TextInput
            style={styles.modalInput}
            value={credits}
            onChangeText={(t) => { setCredits(t.replace(/[^\d.]/g, '').slice(0, 6)); setError(null); }}
            placeholder="e.g. 0.5, 1.0"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
          />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.modalInput, styles.textArea]}
            value={notes}
            onChangeText={(t) => { setNotes(t); setError(null); }}
            placeholder="Add any additional notes about this subject"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />

          {familyId && (
            <>
              <Text style={styles.fieldLabel}>Material (optional)</Text>
              <View style={styles.materialRow}>
                <View style={styles.materialSelectedWrap}>
                  {attachedMaterialIds.length === 0 ? (
                    <Text style={styles.materialPlaceholder}>No material attached</Text>
                  ) : (
                    materials
                      .filter((m) => attachedMaterialIds.includes(m.id))
                      .map((m) => (
                        <View key={m.id} style={styles.materialChip}>
                          <Text style={styles.materialChipText} numberOfLines={1}>
                            {m.title || m.provider_name || 'Material'}
                          </Text>
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => setAttachedMaterialIds((prev) => prev.filter((id) => id !== m.id))}
                            style={styles.materialChipClear}
                            disabled={isSaving || adding}
                          >
                            <X size={14} color="#6B7280" />
                          </TouchableOpacity>
                        </View>
                      ))
                  )}
                </View>
                <TouchableOpacity
                  style={styles.addMaterialBtn}
                  onPress={() => setShowAddMaterialModal(true)}
                  disabled={isSaving || adding}
                >
                  <Plus size={14} color="#6BB3E8" />
                  <Text style={styles.addMaterialBtnText}>Add material</Text>
                </TouchableOpacity>
              </View>
              {loadingMaterials ? (
                <Text style={styles.materialPlaceholder}>Loading materials…</Text>
              ) : materials.length > 0 ? (
                <View style={styles.materialLibraryWrap}>
                  <Text style={styles.materialLibraryLabel}>Select from library</Text>
                  <View style={styles.materialLibraryList}>
                    {materials
                      .filter((m) => !attachedMaterialIds.includes(m.id))
                      .slice(0, 8)
                      .map((m) => (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.libraryChip, (isSaving || adding) && styles.chipDisabled]}
                          onPress={() => setAttachedMaterialIds((prev) => [...prev, m.id])}
                          disabled={isSaving || adding}
                        >
                          <Text style={styles.libraryChipText} numberOfLines={1}>
                            {m.title || m.provider_name || 'Material'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      )}
      {familyId && (
        <AddMaterialModal
          visible={showAddMaterialModal}
          onClose={() => setShowAddMaterialModal(false)}
          onSaved={async (detail) => {
            if (detail?.materialId) {
              setAttachedMaterialIds((prev) => (prev.includes(detail.materialId) ? prev : [...prev, detail.materialId]));
              if (familyId) {
                try {
                  const list = await getMaterials(familyId, {}, null);
                  setMaterials(list || []);
                } catch (_) {}
              }
            }
            setShowAddMaterialModal(false);
          }}
          familyId={familyId}
          children={currentChild ? [{ id: currentChild.id, first_name: currentChild.name }] : []}
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
  subjectsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.8)',
    marginBottom: 8,
    textAlign: 'left',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
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
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  presetChipHovered: {
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  presetChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipIcon: {
    marginRight: 6,
  },
  presetChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  presetChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    marginTop: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectNameInput: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
    }),
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 44,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  libraryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    maxWidth: '100%',
  },
  libraryChipText: {
    fontSize: 12,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  customSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  customSubjectInput: {
    flex: 1,
    marginTop: 0,
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
  additionalToggle: {
    marginTop: 22,
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
  additionalSection: {
    marginTop: 14,
    paddingTop: 10,
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  materialSelectedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  materialPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  materialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(133,196,242,0.2)',
    borderWidth: 1,
    borderColor: '#6BB3E8',
    maxWidth: '100%',
  },
  materialChipText: {
    fontSize: 14,
    color: '#374151',
    maxWidth: 180,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  materialChipClear: {
    marginLeft: 4,
    padding: 2,
  },
  addMaterialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  addMaterialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialLibraryWrap: {
    marginTop: 12,
  },
  materialLibraryLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  materialLibraryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
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

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

  const handleContinue = async () => {
    setError(null);
    if (nameToAdd && currentChild?.id) {
      setAdding(true);
      try {
        const creditsVal = credits.trim() ? parseFloat(credits.trim()) : null;
        await onAddSubject({
          name: nameToAdd,
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
        onContinue();
      } catch (e) {
        setError(e?.message || 'Failed to add subject.');
      } finally {
        setAdding(false);
      }
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
      <View style={styles.presets}>
        {PRESETS.map((preset) => {
          const selected = selectedPreset === preset;
          const hovered = hoveredPreset === preset;
          const Icon = PRESET_ICONS[preset];
          return (
            <TouchableOpacity
              key={preset}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                Platform.OS === 'web' && !selected && hovered && styles.chipHovered,
                (isSaving || adding) && styles.chipDisabled,
              ]}
              onPress={() => handlePresetPress(preset)}
              onMouseEnter={Platform.OS === 'web' ? () => setHoveredPreset(preset) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setHoveredPreset(null) : undefined}
              disabled={isSaving || adding}
              activeOpacity={0.8}
            >
              {Icon ? <Icon size={18} color={selected ? '#1F2A44' : '#6B7280'} style={styles.chipIcon} /> : null}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {preset}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedPreset === 'Other' && (
        <View style={styles.customSubjectRow}>
          <TextInput
            style={[styles.input, styles.customSubjectInput]}
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
            <Check size={20} color={customName.trim() && !adding && !isSaving ? '#1d4ed8' : '#9CA3AF'} strokeWidth={2.5} />
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
          <Text style={styles.label}>Summary</Text>
          <TextInput
            style={styles.input}
            value={summary}
            onChangeText={(t) => { setSummary(t); setError(null); }}
            placeholder="E.g., Building foundational knowledge on fractions."
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Grade level</Text>
          <View style={styles.presets}>
            {GRADE_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.chip, grade === g && styles.chipSelected, (isSaving || adding) && styles.chipDisabled]}
                onPress={() => { setGrade(grade === g ? '' : g); setError(null); }}
                disabled={isSaving || adding}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, grade === g && styles.chipTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Credits</Text>
          <TextInput
            style={styles.input}
            value={credits}
            onChangeText={(t) => { setCredits(t.replace(/[^\d.]/g, '').slice(0, 6)); setError(null); }}
            placeholder="e.g. 0.5, 1.0"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={(t) => { setNotes(t); setError(null); }}
            placeholder="Add any additional notes about this subject"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />

          {familyId && (
            <>
              <Text style={styles.label}>Material (optional)</Text>
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
                  <Plus size={14} color="#85C4F2" />
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
                          style={[styles.chip, (isSaving || adding) && styles.chipDisabled]}
                          onPress={() => setAttachedMaterialIds((prev) => [...prev, m.id])}
                          disabled={isSaving || adding}
                        >
                          <Text style={styles.chipText} numberOfLines={1}>
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
      <TouchableOpacity
        style={[styles.addBtn, (!canAdd || isSaving || adding) && styles.addBtnDisabled]}
        onPress={handleAddAnother}
        disabled={!canAdd || isSaving || adding}
        activeOpacity={0.8}
      >
        <Text style={styles.addBtnText}>{adding || isSaving ? 'Adding...' : 'Add another'}</Text>
      </TouchableOpacity>
      {error ? <Text style={styles.friendlyErrorText}>{friendlyErrorMessage}</Text> : null}
      <TouchableOpacity
        style={[styles.continueBtn, (!canContinue || isSaving || adding) && styles.continueBtnDisabled]}
        onPress={handleContinue}
        disabled={!canContinue || isSaving || adding}
        activeOpacity={0.8}
      >
        <Text style={styles.continueBtnText}>
          {isSaving || adding ? 'Saving…' : isLastChild ? 'Finish' : `Next: ${nextChildName}'s subjects`}
        </Text>
      </TouchableOpacity>
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
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.8)',
    marginBottom: 8,
    marginTop: 16,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
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
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
    backgroundColor: '#FFFFFF',
  },
  chipHovered: {
    backgroundColor: '#F8FAFF',
    borderColor: '#C7D2FE',
  },
  chipSelected: {
    backgroundColor: '#EEF2FF',
    borderWidth: 2,
    borderColor: '#85C4F2',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(91,127,255,0.15)',
    }),
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipIcon: {
    marginRight: 8,
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  chipTextSelected: {
    color: '#1F2A44',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
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
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  otherConfirmButtonDisabled: {
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'default' }),
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
    fontWeight: '700',
    color: '#85C4F2',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  friendlyErrorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
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
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
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
    borderColor: '#C7D2FE',
    backgroundColor: '#FAFBFF',
  },
  addMaterialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#85C4F2',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
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
    gap: 8,
  },
  textArea: {
    minHeight: 84,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  continueBtn: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 28,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  continueBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});

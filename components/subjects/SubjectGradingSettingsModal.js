import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from '../create/shared/CreateModalShell';
import SubjectGradingFields from './subjectSettings/SubjectGradingFields';
import {
  parseSubjectGradingSettings,
  validateGradingSettings,
  createEmptyCategory,
} from '../../lib/subjectGradingSettings';
import { saveSubjectGradingSettings } from '../../lib/services/subjectGradingSettingsClient';

export default function SubjectGradingSettingsModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subjectId,
  subjectName = '',
  initialSettings = null,
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => parseSubjectGradingSettings(initialSettings));
  const [saving, setSaving] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDraft(parseSubjectGradingSettings(initialSettings));
    setValidationBanner('');
  }, [visible, initialSettings]);

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setValidationBanner('');
  }, []);

  const updateCategory = useCallback((index, patch) => {
    setDraft((prev) => {
      const categories = [...(prev.categories || [])];
      categories[index] = { ...categories[index], ...patch };
      return { ...prev, categories };
    });
    setValidationBanner('');
  }, []);

  const removeCategory = useCallback((index) => {
    setDraft((prev) => ({
      ...prev,
      categories: (prev.categories || []).filter((_, i) => i !== index),
    }));
    setValidationBanner('');
  }, []);

  const addCategory = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      categories: [...(prev.categories || []), createEmptyCategory()],
    }));
    setValidationBanner('');
  }, []);

  const handleSave = async () => {
    const { ok, errors } = validateGradingSettings(draft);
    if (!ok) {
      setValidationBanner(errors[0]);
      return;
    }
    setSaving(true);
    try {
      await saveSubjectGradingSettings(subjectId, familyId, draft);
      toast.push('Grading settings saved', 'success');
      onSaved?.(draft);
      onClose?.();
    } catch (err) {
      setValidationBanner(err?.message || 'Could not save grading settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <CreateModalShell
        title={subjectName ? `Grading · ${subjectName}` : 'Grading settings'}
        onClose={onClose}
        onSave={handleSave}
        saving={saving}
        saveLabel="Save"
        validationBanner={validationBanner}
        maxWidth={640}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <SubjectGradingFields
            draft={draft}
            onUpdateDraft={updateDraft}
            onUpdateCategory={updateCategory}
            onRemoveCategory={removeCategory}
            onAddCategory={addCategory}
          />
        </ScrollView>
      </CreateModalShell>
    </Modal>
  );
}

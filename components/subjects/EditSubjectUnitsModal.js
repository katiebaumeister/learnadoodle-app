import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X, Plus, Sparkles, Upload, Pencil } from 'lucide-react';
import ManualCurriculumBuilderModal from '../ManualCurriculumBuilderModal';
import SubjectCurriculumImportModal from './SubjectCurriculumImportModal';
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import { curriculumStructureHasContent } from '../../lib/subjectUnitsEditorDraft';

const METHOD_OPTIONS = [
  { id: 'manual', label: 'Manual input', icon: Plus },
  { id: 'generate', label: 'Generate curriculum', icon: Sparkles },
  { id: 'upload', label: 'Upload material', icon: Upload },
  { id: 'paste_plain', label: 'Paste plain text', icon: Pencil },
];

function routeImportMethod(method) {
  const raw = String(method || '').trim().toLowerCase();
  if (raw === 'paste') return 'paste_plain';
  return raw;
}

const IMPORT_METHODS = new Set(['generate', 'upload', 'paste_plain']);

export default function EditSubjectUnitsModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  assignedChildIds = [],
  hasExistingContent = false,
  academicYearId = null,
  initialImportMethod = null,
}) {
  const [step, setStep] = useState('picker');
  const [importMethod, setImportMethod] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [resolvedHasContent, setResolvedHasContent] = useState(hasExistingContent);

  const subjectId = subject?.id || null;
  const subjectName = subject?.name?.trim() || 'Subject';

  useEffect(() => {
    if (!visible) {
      setStep('picker');
      setImportMethod(null);
      setCheckingExisting(false);
      return;
    }
    const requested = routeImportMethod(initialImportMethod);
    if (requested === 'manual') {
      setResolvedHasContent(hasExistingContent);
      setStep('manual');
      return;
    }
    if (IMPORT_METHODS.has(requested)) {
      setResolvedHasContent(hasExistingContent);
      setImportMethod(requested);
      setStep('import');
      return;
    }
    setResolvedHasContent(hasExistingContent);
    if (hasExistingContent) {
      setStep('manual');
      return;
    }
    if (!familyId || !subjectId) {
      setStep('picker');
      return;
    }
    let cancelled = false;
    (async () => {
      setCheckingExisting(true);
      try {
        const { data } = await fetchSubjectCurriculumEventsStructure(familyId, subjectId, academicYearId);
        if (cancelled) return;
        const hasContent = curriculumStructureHasContent(data);
        setResolvedHasContent(hasContent);
        setStep(hasContent ? 'manual' : 'picker');
      } finally {
        if (!cancelled) setCheckingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, hasExistingContent, familyId, subjectId, academicYearId, initialImportMethod]);

  const handleClose = useCallback(() => {
    setStep('picker');
    onClose?.();
  }, [onClose]);

  const handleManualSaved = useCallback(() => {
    onSaved?.();
    handleClose();
  }, [onSaved, handleClose]);

  const handleSelectMethod = useCallback((methodId) => {
    if (methodId === 'manual') {
      setStep('manual');
      return;
    }
    const safeMethod = routeImportMethod(methodId);
    setImportMethod(safeMethod === 'paste' ? 'paste_plain' : safeMethod);
    setStep('import');
  }, []);

  const pickerSubtitle = useMemo(() => (
    resolvedHasContent
      ? 'Choose how to add new units and lessons.'
      : 'Choose how to build units and lessons for this subject.'
  ), [resolvedHasContent]);

  if (!visible) return null;

  if (step === 'manual') {
    return (
      <ManualCurriculumBuilderModal
        visible
        onClose={handleClose}
        onSaved={handleManualSaved}
        familyId={familyId}
        subjectId={subjectId}
        subjectName={subjectName}
        loadExisting={resolvedHasContent}
        replaceExisting={resolvedHasContent}
        createCalendarEvents={false}
        academicYearId={academicYearId}
        headerTitle={`Edit units — ${subjectName}`}
      />
    );
  }

  if (step === 'import') {
    return (
      <SubjectCurriculumImportModal
        visible
        onClose={handleClose}
        onSaved={handleManualSaved}
        familyId={familyId}
        subject={subject}
        assignedChildIds={assignedChildIds}
        replaceExisting={resolvedHasContent}
        initialMethod={importMethod}
      />
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit units — {subjectName}</Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel="Close">
              <X size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {checkingExisting ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#6BB3E8" />
              <Text style={styles.loadingText}>Checking saved units…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>{pickerSubtitle}</Text>
              {resolvedHasContent ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>
                    Generate, upload, and paste stay on this subject. Manual input opens the unit editor.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep('manual')}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.noteLink}>Edit current units instead</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.options}>
                {METHOD_OPTIONS.map(({ id, label, icon: Icon }) => (
                  <TouchableOpacity
                    key={id}
                    style={styles.optionRow}
                    onPress={() => handleSelectMethod(id)}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Icon size={16} color="#5E6C84" />
                    <Text style={styles.optionText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    paddingRight: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 20,
  },
  noteBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noteText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  noteLink: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  options: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: '#F8FAFC',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#334155',
  },
  loadingWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
});

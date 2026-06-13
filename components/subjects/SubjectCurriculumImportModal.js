import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { X, Sparkles, Upload, Pencil } from 'lucide-react';
import { useToast } from '../Toast';
import {
  parsePlainTextStream,
  generateCurriculumDraftStream,
  commitParsedDraft,
  commitManualDraft,
} from '../../lib/services/curriculumClient';
import { manualDraftFromGeneratedDraft, summarizeDraftUnits } from '../../lib/subjectCurriculumImport';
import { consumePendingMagicExtractPaste } from '../../lib/planYearRetirement';

export default function SubjectCurriculumImportModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  assignedChildIds = [],
  replaceExisting = false,
  initialMethod = null,
}) {
  const toast = useToast();
  const subjectId = subject?.id || null;
  const subjectName = subject?.name?.trim() || 'Subject';
  const [method, setMethod] = useState(initialMethod);
  const [rawText, setRawText] = useState('');
  const [generateNotes, setGenerateNotes] = useState('');
  const [statusText, setStatusText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parsedDraft, setParsedDraft] = useState(null);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setMethod(initialMethod || null);
    setRawText('');
    setGenerateNotes('');
    setStatusText('');
    setPreview(null);
    setParsedDraft(null);
    setWorking(false);
    setSaving(false);
  }, [initialMethod]);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const handleParse = async () => {
    if (!familyId || !subjectId || !rawText.trim()) return;
    setWorking(true);
    setStatusText('Parsing…');
    setPreview(null);
    setParsedDraft(null);
    try {
      const { data, error } = await parsePlainTextStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          raw_text: rawText.trim(),
          source_title: `${subjectName} import`,
        },
        {
          onDelta: () => {},
        }
      );
      if (error || !data) throw error || new Error('Parse failed');
      setParsedDraft(data);
      setPreview(summarizeDraftUnits(manualDraftFromGeneratedDraft(data)));
    } catch (err) {
      toast.push(err?.message || 'Could not parse text', 'error');
    } finally {
      setWorking(false);
      setStatusText('');
    }
  };

  const handleGenerate = async () => {
    if (!familyId || !subjectId) return;
    setWorking(true);
    setStatusText('Generating curriculum…');
    setPreview(null);
    setParsedDraft(null);
    try {
      const { data, error } = await generateCurriculumDraftStream(
        {
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          child_ids: assignedChildIds,
          generation_scope: generateNotes.trim() || `Build units and lessons for ${subjectName}.`,
          duration_mode: 'multi_unit_course',
          include_assessments: true,
          include_projects: true,
          include_materials: false,
          include_pacing: false,
        },
        {
          onStatus: (text) => setStatusText(text || 'Generating…'),
        }
      );
      if (error || !data) throw error || new Error('Generate failed');
      setParsedDraft(data);
      setPreview(summarizeDraftUnits(manualDraftFromGeneratedDraft(data)));
    } catch (err) {
      toast.push(err?.message || 'Could not generate curriculum', 'error');
    } finally {
      setWorking(false);
      setStatusText('');
    }
  };

  const handleSave = async () => {
    if (!parsedDraft || !familyId || !subjectId) return;
    setSaving(true);
    try {
      if (method === 'paste_plain' || method === 'upload') {
        const { error } = await commitParsedDraft({
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          draft: parsedDraft,
          replace_existing_events: false,
          create_calendar_events: false,
        });
        if (error) throw error;
      } else {
        const manualDraft = manualDraftFromGeneratedDraft(parsedDraft);
        const { error } = await commitManualDraft({
          subject_id: subjectId,
          family_id: familyId,
          subject_name: subjectName,
          draft: manualDraft,
          builder_mode: 'rich_units',
          replace_existing: replaceExisting,
          create_calendar_events: false,
        });
        if (error) throw error;
      }
      toast.push('Units saved', 'success');
      onSaved?.();
      handleClose();
    } catch (err) {
      toast.push(err?.message || 'Failed to save units', 'error');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setMethod(initialMethod || null);
      const pendingPaste = consumePendingMagicExtractPaste();
      if (pendingPaste && (!initialMethod || initialMethod === 'paste_plain')) {
        setMethod('paste_plain');
        setRawText(pendingPaste);
      }
    }
  }, [visible, initialMethod]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {!method ? `Add units — ${subjectName}` : method === 'generate' ? 'Generate curriculum' : method === 'upload' ? 'Import from material' : 'Paste plain text'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {!method ? (
            <View style={styles.body}>
              <TouchableOpacity style={styles.methodRow} onPress={() => setMethod('paste_plain')}>
                <Pencil size={16} color="#5E6C84" />
                <Text style={styles.methodText}>Paste plain text</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.methodRow} onPress={() => setMethod('generate')}>
                <Sparkles size={16} color="#5E6C84" />
                <Text style={styles.methodText}>Generate curriculum</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.methodRow} onPress={() => setMethod('upload')}>
                <Upload size={16} color="#5E6C84" />
                <Text style={styles.methodText}>Paste from uploaded material</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
              {method === 'generate' ? (
                <>
                  <Text style={styles.label}>What should this course cover?</Text>
                  <TextInput
                    value={generateNotes}
                    onChangeText={setGenerateNotes}
                    placeholder={`e.g. 6th grade ${subjectName}, 12 weeks, include projects`}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleGenerate} disabled={working}>
                    {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Generate preview</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.label}>
                    {method === 'upload'
                      ? 'Paste text extracted from your syllabus or PDF.'
                      : 'Paste units and lessons (one topic per line, optional Unit headers).'}
                  </Text>
                  <TextInput
                    value={rawText}
                    onChangeText={setRawText}
                    placeholder="Unit 1: Fractions&#10;Intro to fractions&#10;Adding fractions"
                    multiline
                    style={[styles.input, styles.textAreaLarge]}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleParse} disabled={working || !rawText.trim()}>
                    {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Parse preview</Text>}
                  </TouchableOpacity>
                </>
              )}

              {statusText ? <Text style={styles.status}>{statusText}</Text> : null}

              {preview ? (
                <View style={styles.previewBox}>
                  <Text style={styles.previewTitle}>
                    {preview.unitCount} units · {preview.lessonCount} lessons
                  </Text>
                  {preview.lines.map((line) => (
                    <Text key={line} style={styles.previewLine}>{line}</Text>
                  ))}
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save units</Text>}
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity style={styles.backBtn} onPress={() => { setMethod(null); setPreview(null); setParsedDraft(null); }}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    paddingRight: 12,
  },
  body: {
    padding: 16,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  methodText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#334155',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  textAreaLarge: {
    minHeight: 160,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: '#6BB3E8',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  status: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  previewBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  previewLine: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 4,
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: 14,
    color: '#64748B',
  },
});

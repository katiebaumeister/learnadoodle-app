import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Platform,
  Modal
} from 'react-native';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

export default function SyllabusWizard({ 
  familyId, 
  children = [], 
  subjects = [], 
  onClose,
  visible = true
}) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [startUnit, setStartUnit] = useState(1);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState([]);
  const [autoPace, setAutoPace] = useState(false);
  const [attachChild, setAttachChild] = useState('');
  const [attachWeek, setAttachWeek] = useState(
    DateTime.local().startOf('week').plus({ days: 1 }).toISODate()
  );
  const [saving, setSaving] = useState(false);

  const canNext1 = title.trim().length > 0;

  useEffect(() => {
    if (step === 3 && text.trim()) {
      parseText();
    }
  }, [step]);

  // Keyboard shortcuts
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [onClose]);

  const parseText = () => {
    // Local parser - splits by Unit/Week/Chapter headings
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const chunks = [];
    let current = null;

    for (const line of lines) {
      if (/^(unit|week|chapter|lesson)\s*\d+/i.test(line)) {
        if (current) chunks.push(current);
        current = { title: line, details: [] };
      } else if (current) {
        current.details.push(line);
      } else {
        current = { title: line, details: [] };
      }
    }
    if (current) chunks.push(current);

    const steps = chunks.map((chunk, idx) => ({
      order: idx + startUnit,
      kind: 'read',
      title: chunk.title.replace(/^(\w+)\s*\d+[:\-]?\s*/i, '').trim(),
      details: chunk.details.join(' · ').slice(0, 280),
      resource_urls: [],
      minutes: 30
    }));

    setParsed(steps);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // 1) Upload raw syllabus text to storage
      let fileData;
      let fileSize;
      
      if (Platform.OS === 'web' && typeof Blob !== 'undefined') {
        fileData = new Blob([text], { type: 'text/plain;charset=utf-8' });
        fileSize = fileData.size;
      } else {
        // For non-web platforms, use text directly
        fileData = text;
        fileSize = text.length;
      }

      const fileName = `${title.replace(/\s+/g, '_')}_${Date.now()}.txt`;
      const path = `${familyId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(path, fileData, {
          contentType: 'text/plain',
          metadata: { family_id: familyId }
        });

      if (uploadError) throw uploadError;

      // 2) Create upload record
      await supabase.rpc('create_upload_record', {
        _family: familyId,
        _child: null,
        _subject: subjectId || null,
        _event: null,
        _path: path,
        _mime: 'text/plain',
        _bytes: fileSize,
        _title: `${title} (syllabus)`,
        _tags: ['syllabus'],
        _notes: provider || null
      });

      // 3) Create lesson plan from parsed steps
      const { data: planData, error: planError } = await supabase.rpc('create_lesson_plan', {
        _family: familyId,
        _subject: subjectId || null,
        _title: title,
        _description: `Provider: ${provider || 'N/A'}`,
        _grade_level: null,
        _tags: ['syllabus'],
        _steps: parsed.map(s => ({
          order: s.order,
          kind: s.kind || 'other',
          title: s.title,
          details: s.details || '',
          resource_urls: s.resource_urls || [],
          minutes: s.minutes || 30
        }))
      });

      if (planError) throw planError;
      const planId = planData?.id;

      // 4) Auto-pace into calendar if enabled
      if (autoPace && attachChild && attachWeek && planId) {
        await supabase.rpc('instantiate_plan_to_week', {
          _family: familyId,
          _plan_id: planId,
          _child_id: attachChild,
          _week_start: attachWeek
        });
      }

      onClose();
    } catch (error) {
      console.error('Error saving syllabus:', error);
      alert('Failed to save syllabus. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Course Title *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Algebra I (K-12)"
                style={styles.input}
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.helperText}>
                Use a clear title; it becomes your plan name.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Provider Name</Text>
              <TextInput
                value={provider}
                onChangeText={setProvider}
                placeholder="Khan Academy, Outschool, Local School"
                style={styles.input}
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Subject</Text>
                <View style={styles.select}>
                  <Text style={styles.selectText}>
                    {subjects.find(s => s.id === subjectId)?.name || '—'}
                  </Text>
                </View>
              </View>

              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Start from unit</Text>
                <TextInput
                  value={String(startUnit)}
                  onChangeText={(val) => setStartUnit(parseInt(val) || 1)}
                  keyboardType="number-pad"
                  style={styles.input}
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Course Outline / Syllabus *</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Paste the raw text…"
                multiline
                numberOfLines={12}
                style={[styles.input, styles.textarea]}
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.helperText}>
                Tip: paste the full outline. We'll detect Units/Weeks/Chapters automatically.
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                onPress={() => setAutoPace(!autoPace)}
                style={styles.checkbox}
                activeOpacity={0.7}
              >
                <View style={[styles.checkboxBox, autoPace && styles.checkboxBoxChecked]}>
                  {autoPace && <Check size={14} color={colors.accent} />}
                </View>
                <Text style={styles.checkboxLabel}>Enable auto-pacing & calendar</Text>
              </TouchableOpacity>
            </View>

            {autoPace && (
              <View style={styles.fieldRow}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Attach to child</Text>
                  <View style={styles.select}>
                    <Text style={styles.selectText}>
                      {children.find(c => c.id === attachChild)?.name || 'Choose…'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Week start</Text>
                  <TextInput
                    value={attachWeek}
                    onChangeText={setAttachWeek}
                    placeholder="YYYY-MM-DD"
                    style={styles.input}
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Left: Form */}
          <ScrollView style={styles.formPanel} contentContainerStyle={styles.formContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Upload Course Syllabus</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Stepper step={step} setStep={setStep} />

            {renderStepContent()}

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={() => setStep(s => Math.max(1, s - 1))}
                style={[styles.button, styles.secondaryButton]}
                disabled={step === 1}
                activeOpacity={0.7}
              >
                <ChevronLeft size={16} color={colors.text} />
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>

              <View style={styles.footerRight}>
                {step < 3 ? (
                  <TouchableOpacity
                    onPress={() => setStep(s => s + 1)}
                    style={[styles.button, styles.primaryButton]}
                    disabled={step === 1 && !canNext1}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.primaryButtonText}>Next</Text>
                    <ChevronRight size={16} color={colors.accentContrast} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSave}
                    style={[styles.button, styles.primaryButton]}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <Check size={16} color={colors.accentContrast} />
                    <Text style={styles.primaryButtonText}>
                      {saving ? 'Saving...' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Right: Preview */}
          <View style={styles.previewPanel}>
            <Text style={styles.previewTitle}>Preview</Text>
            <ScrollView style={styles.previewScroll}>
              {step < 3 ? (
                <Text style={styles.previewEmpty}>
                  Your parsed outline will appear here after "Next".
                </Text>
              ) : parsed.length > 0 ? (
                <View style={styles.previewList}>
                  {parsed.map((s, idx) => (
                    <View key={idx} style={styles.previewItem}>
                      <Text style={styles.previewItemTitle}>
                        {s.order}. {s.title}
                      </Text>
                      <Text style={styles.previewItemMeta}>
                        {s.kind} · {s.minutes || 30} min
                      </Text>
                      {s.details && (
                        <Text style={styles.previewItemDetails}>{s.details}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.previewEmpty}>No steps yet.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stepper({ step, setStep }) {
  const items = ['Details', 'Paste/Upload', 'Review & Map'];

  return (
    <View style={styles.stepper}>
      {items.map((label, idx) => {
        const n = idx + 1;
        const active = n === step;
        const done = n < step;

        return (
          <TouchableOpacity
            key={label}
            onPress={() => setStep(n)}
            style={[
              styles.stepperItem,
              active && styles.stepperItemActive,
              done && styles.stepperItemDone
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.stepperItemText,
                (active || done) && styles.stepperItemTextActive
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 980,
    maxHeight: '85%',
    flexDirection: 'row',
    borderRadius: colors.radiusLg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadows.md,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    }),
  },
  formPanel: {
    flex: 1,
    backgroundColor: colors.card,
  },
  formContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stepper: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  stepperItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stepperItemActive: {
    backgroundColor: colors.indigoSoft,
    borderColor: colors.indigoBold,
  },
  stepperItemDone: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBold,
  },
  stepperItemText: {
    fontSize: 14,
    color: colors.text,
  },
  stepperItemTextActive: {
    fontWeight: '500',
  },
  stepContent: {
    gap: 20,
    marginBottom: 24,
  },
  field: {
    gap: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontSize: 14,
    color: colors.text,
  },
  textarea: {
    minHeight: 200,
    textAlignVertical: 'top',
  },
  select: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  selectText: {
    fontSize: 14,
    color: colors.text,
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
  },
  checkboxRow: {
    marginBottom: 16,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.blueSoft,
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
  },
  primaryButton: {
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accentContrast,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  previewPanel: {
    width: 360,
    backgroundColor: colors.bgSubtle,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    padding: 24,
  },
  previewTitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  previewScroll: {
    flex: 1,
  },
  previewEmpty: {
    fontSize: 14,
    color: colors.muted,
  },
  previewList: {
    gap: 12,
  },
  previewItem: {
    padding: 16,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  previewItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  previewItemMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  previewItemDetails: {
    fontSize: 12,
    color: colors.text,
    marginTop: 4,
  },
});


'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { FileQuestion } from 'lucide-react';
import Modal from '../home/Modal';
import { COMPLIANCE_MODAL_CONFIG, type ConfigField, type ComplianceDraft } from './complianceModalConfig';
import {
  getComplianceDraft,
  saveComplianceRequirementDraft,
} from '../../lib/services/complianceService';
import { openPlannerAttendance } from '../../lib/services/complianceLinks';
import { getAttendanceLogs } from '../../lib/services/recordsClient';

export type ComplianceRequirement = {
  id: string;
  label: string;
  detail?: string;
  type?: 'required' | 'optional' | 'info';
  stateCode?: string;
} | null;

export type ComplianceRequirementModalProps = {
  open: boolean;
  onClose: () => void;
  requirement: ComplianceRequirement;
  familyId?: string;
  childIds?: string[];
  /** For attendance summary: list of children with id and display name (first_name or name). */
  children?: Array<{ id: string; first_name?: string; name?: string }>;
  /** Deep link to Planner in Attendance mode (year heatmap + month drill-down). If not provided, openPlannerAttendance() is used on web. */
  onOpenAttendanceView?: () => void;
};

const BADGE_LABELS: Record<string, string> = {
  required: 'Required',
  optional: 'Optional',
  info: 'Info',
};

export default function ComplianceRequirementModal({
  open,
  onClose,
  requirement,
  familyId = '',
  childIds = [],
  children: childrenProp = [],
  onOpenAttendanceView,
}: ComplianceRequirementModalProps) {
  const [draft, setDraft] = useState<ComplianceDraft>({});
  const [initialDraft, setInitialDraft] = useState<ComplianceDraft>({});
  const [loading, setLoading] = useState(true);
  const [attendanceSummary, setAttendanceSummary] = useState<Record<string, { daysPresent: number; daysAbsent: number }> | null>(null);
  const [attendanceSummaryLoading, setAttendanceSummaryLoading] = useState(false);

  const config = requirement ? COMPLIANCE_MODAL_CONFIG[requirement.id] : null;
  const dirty =
    Object.keys(draft).length !== Object.keys(initialDraft).length ||
    Object.keys(draft).some((k) => draft[k] !== initialDraft[k]);

  const loadDraft = useCallback(async () => {
    if (!requirement || !familyId) {
      setDraft({});
      setInitialDraft({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const saved = await getComplianceDraft(familyId, requirement.id);
    const initial = saved ?? {};
    setInitialDraft(initial);
    setDraft(initial);
    setLoading(false);
  }, [requirement?.id, familyId]);

  useEffect(() => {
    if (open && requirement) loadDraft();
  }, [open, requirement, loadDraft]);

  useEffect(() => {
    if (!open || requirement?.id !== 'attendance' || !familyId) {
      setAttendanceSummary(null);
      return;
    }
    const childIdsToUse = childrenProp.length > 0 ? childrenProp.map((c) => c.id) : childIds.length > 0 ? childIds : undefined;
    setAttendanceSummaryLoading(true);
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
    getAttendanceLogs(familyId, childIdsToUse ?? undefined, {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    })
      .then((logs: Array<{ child_id: string; day_date: string; status?: string }>) => {
        const byChild: Record<string, { present: Set<string>; absent: Set<string> }> = {};
        logs.forEach((log) => {
          const cid = log.child_id;
          if (!byChild[cid]) byChild[cid] = { present: new Set(), absent: new Set() };
          const day = (log.day_date || '').slice(0, 10);
          if (!day) return;
          if (log.status === 'present') byChild[cid].present.add(day);
          else if (log.status === 'absent') byChild[cid].absent.add(day);
        });
        const summary: Record<string, { daysPresent: number; daysAbsent: number }> = {};
        Object.keys(byChild).forEach((cid) => {
          summary[cid] = {
            daysPresent: byChild[cid].present.size,
            daysAbsent: byChild[cid].absent.size,
          };
        });
        setAttendanceSummary(summary);
      })
      .catch(() => setAttendanceSummary(null))
      .finally(() => setAttendanceSummaryLoading(false));
  }, [open, familyId, requirement?.id, childrenProp, childIds]);

  const updateDraft = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!requirement || !familyId || !dirty) return;
    await saveComplianceRequirementDraft(familyId, requirement.id, draft);
    onClose();
  }, [requirement, familyId, draft, dirty, onClose]);

  const handleQuickLink = useCallback((handlerKey: string) => {
    if (handlerKey === 'view_attendance_calendar' || handlerKey === 'open_attendance_view') {
      if (onOpenAttendanceView) onOpenAttendanceView();
      else openPlannerAttendance();
      onClose();
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.log('[ComplianceRequirementModal] Quick link:', handlerKey);
    }
  }, [onOpenAttendanceView, onClose]);

  const handleOpenAttendanceView = useCallback(() => {
    if (onOpenAttendanceView) onOpenAttendanceView();
    else openPlannerAttendance();
    onClose();
  }, [onOpenAttendanceView, onClose]);

  if (!open) return null;

  const title = requirement?.label ?? 'Compliance';
  const typeLabel = requirement?.type ? BADGE_LABELS[requirement.type] ?? requirement.type : null;
  const stateGuidance = requirement?.detail ?? '';
  const stateCode = requirement?.stateCode ?? '';
  const isAttendance = requirement?.id === 'attendance';

  const renderAttendanceLayout = () => (
    <>
      <View style={styles.attendanceMetadataRow}>
        {typeLabel ? <View style={styles.attendancePill}><Text style={styles.attendancePillText}>{typeLabel}</Text></View> : null}
        {stateCode ? <View style={styles.attendanceStateChip}><Text style={styles.attendanceStateChipText}>{stateCode}</Text></View> : null}
      </View>
      <View style={styles.attendanceHeaderDivider} />

      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyScrollContent} showsVerticalScrollIndicator={false}>
        {(attendanceSummaryLoading || childrenProp.length > 0 || (attendanceSummary && Object.keys(attendanceSummary).length > 0)) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Current attendance</Text>
            {attendanceSummaryLoading ? (
              <Text style={styles.attendanceSummaryMuted}>Loading…</Text>
            ) : (childrenProp.length > 0 ? childrenProp : Object.keys(attendanceSummary || {}).map((id) => ({ id }))).length > 0 ? (
              (childrenProp.length > 0 ? childrenProp : Object.keys(attendanceSummary || {}).map((id) => ({ id }))).map((child) => {
                const s = attendanceSummary?.[child.id];
                const name = (child as { first_name?: string; name?: string }).first_name || (child as { first_name?: string; name?: string }).name || 'Child';
                const daysPresent = s?.daysPresent ?? 0;
                const daysAbsent = s?.daysAbsent ?? 0;
                return (
                  <Text key={child.id} style={styles.attendanceSummaryRow}>
                    {name}: {daysPresent} day{daysPresent !== 1 ? 's' : ''} attended{daysAbsent > 0 ? `, ${daysAbsent} absent` : ''}
                  </Text>
                );
              })
            ) : null}
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>State guidance</Text>
          {stateGuidance ? (
            <Text style={styles.cardBody} id="compliance-modal-desc">{stateGuidance}</Text>
          ) : (
            <View style={styles.emptyStateRow}>
              <FileQuestion size={18} color="#94A3B8" />
              <Text style={styles.emptyStateText}>No state guidance loaded yet.</Text>
              <TouchableOpacity onPress={() => {}} activeOpacity={0.7} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                <Text style={styles.reloadLink}>Reload</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>How Learnadoodle tracks attendance</Text>
          <Text style={styles.cardBody}>
            We mark a day as attended if an event marked as "Count as instructional time" is completed. You can control attendance markings further in{' '}
            <Text style={styles.inlineLink} onPress={handleOpenAttendanceView}>
              Attendance
            </Text>
            {' '}for full day or individual events.
          </Text>
        </View>

      </ScrollView>

      <View style={styles.stickyFooter}>
        <TouchableOpacity style={styles.cancelButtonGhost} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, !dirty && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!dirty}
          activeOpacity={0.7}
        >
          <Text style={[styles.saveText, !dirty && styles.saveTextDisabled]}>Save changes</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderDefaultLayout = () => (
    <>
      {typeLabel && (
        <View style={styles.badgeWrap}>
          <Text style={styles.badge}>{typeLabel}</Text>
        </View>
      )}
      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyScrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>State guidance</Text>
          <Text style={styles.sectionBody} id="compliance-modal-desc">
            {stateGuidance || 'No state guidance loaded yet.'}
          </Text>
        </View>
        {config && (
          <View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What you track in Learnadoodle</Text>
              <Text style={styles.sectionBody}>{config.description}</Text>
            </View>
            {loading ? (
              <Text style={styles.muted}>Loading...</Text>
            ) : (
              <View>
                {config.sections.map((section) => (
                  <View key={section.id} style={styles.section}>
                    {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
                    {section.summary && <Text style={styles.summaryPlaceholder}>{section.summary}</Text>}
                    {section.fields?.map((field) => (
                      <FieldRenderer key={field.key} field={field} value={draft[field.key]} draft={draft} onChange={(value) => updateDraft(field.key, value)} />
                    ))}
                  </View>
                ))}
                {config.quickLinks && config.quickLinks.length > 0 && (
                  <View style={styles.quickLinks}>
                    {config.quickLinks.map((link) => (
                      <TouchableOpacity key={link.handlerKey} style={styles.quickLinkButton} onPress={() => handleQuickLink(link.handlerKey)} activeOpacity={0.7}>
                        <Text style={styles.quickLinkText}>{link.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
        {!config && requirement && <Text style={styles.muted}>No specific form for this requirement yet.</Text>}
      </ScrollView>
      <View style={styles.stickyFooter}>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveButton, !dirty && styles.saveButtonDisabled]} onPress={handleSave} disabled={!dirty} activeOpacity={0.7}>
          <Text style={[styles.saveText, !dirty && styles.saveTextDisabled]}>Save</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      ariaLabelledBy="compliance-modal-title"
      ariaDescribedBy="compliance-modal-desc"
      maxWidth={isAttendance ? 720 : undefined}
    >
      <View style={styles.body}>
        {isAttendance ? renderAttendanceLayout() : renderDefaultLayout()}
      </View>
    </Modal>
  );
}

function FieldRenderer({
  field,
  value,
  draft,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  draft: ComplianceDraft;
  onChange: (value: unknown) => void;
}) {
  const showConditional =
    !field.conditionalKey ||
    (draft[field.conditionalKey] === field.conditionalValue);
  if (!showConditional) return null;

  const stringValue = value != null ? String(value) : '';
  const numValue = typeof value === 'number' ? value : '';

  if (field.type === 'textarea') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={stringValue}
          onChangeText={(text) => onChange(text)}
          placeholder={field.placeholder}
          multiline
          numberOfLines={3}
          placeholderTextColor="#94A3B8"
        />
        {field.helperText ? <Text style={styles.fieldHelperText}>{field.helperText}</Text> : null}
      </View>
    );
  }

  if (field.type === 'toggle') {
    const on = value === true || value === 'true';
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TouchableOpacity
          style={[styles.toggle, on && styles.toggleOn]}
          onPress={() => onChange(!on)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleText}>{on ? 'Yes' : 'No'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (field.type === 'select') {
    const options = field.options ?? [];
    const current = stringValue || (options[0]?.value ?? '');
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {Platform.OS === 'web' ? (
          <select
            value={current}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              fontSize: 14,
              color: '#1E293B',
            }}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <View style={styles.selectOptions}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.selectOption, current === opt.value && styles.selectOptionActive]}
                onPress={() => onChange(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.selectOptionText, current === opt.value && styles.selectOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (field.type === 'number') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TextInput
          style={styles.input}
          value={numValue !== '' ? String(numValue) : ''}
          onChangeText={(text) => {
            const n = text === '' ? undefined : Number(text);
            onChange(n === undefined || isNaN(n) ? text : n);
          }}
          placeholder={field.placeholder}
          keyboardType="numeric"
          placeholderTextColor="#94A3B8"
        />
      </View>
    );
  }

  if (field.type === 'date') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TextInput
          style={styles.input}
          value={stringValue}
          onChangeText={(text) => onChange(text)}
          placeholder={field.placeholder ?? 'YYYY-MM-DD'}
          placeholderTextColor="#94A3B8"
          {...(Platform.OS === 'web' && { type: 'date' })}
        />
      </View>
    );
  }

  // text (default)
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <TextInput
        style={styles.input}
        value={stringValue}
        onChangeText={(text) => onChange(text)}
        placeholder={field.placeholder}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingTop: 0,
    minHeight: 0,
  },
  bodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  bodyScrollContent: {
    paddingBottom: 24,
  },
  attendanceMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  attendancePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  attendancePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  attendanceStateChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  attendanceStateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  attendanceHeaderDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1E293B',
  },
  attendanceSummaryMuted: {
    fontSize: 14,
    color: '#94A3B8',
  },
  attendanceSummaryRow: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1E293B',
    marginBottom: 4,
  },
  inlineLink: {
    color: '#60a5fa',
    fontWeight: '600',
    ...(Platform.OS === 'web' && { cursor: 'pointer', textDecorationLine: 'underline' }),
  },
  emptyStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94A3B8',
    flex: 1,
  },
  reloadLink: {
    fontSize: 12,
    color: '#60a5fa',
    fontWeight: '500',
  },
  stickyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  cancelButtonGhost: {
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  badgeWrap: {
    marginBottom: 12,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sectionBody: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  attendanceCustomBlock: {
    marginBottom: 8,
  },
  bullet: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 4,
    paddingLeft: 4,
  },
  fieldHelperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  summaryPlaceholder: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    minHeight: 44,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignSelf: 'flex-start',
  },
  toggleOn: {
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
  },
  toggleText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  selectOptions: {
    gap: 6,
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  selectOptionActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#6BB3E8',
  },
  selectOptionText: {
    fontSize: 14,
    color: '#475569',
  },
  selectOptionTextActive: {
    color: '#1E293B',
    fontWeight: '600',
  },
  quickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  quickLinkButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickLinkText: {
    fontSize: 14,
    color: '#60a5fa',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#60a5fa',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  saveTextDisabled: {
    color: '#94A3B8',
  },
  muted: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 12,
  },
});

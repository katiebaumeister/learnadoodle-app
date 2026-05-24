import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Smile } from 'lucide-react';
import AddChildForm from './AddChildForm';
import { supabase } from '../lib/supabase';
import { permanentDeleteChild, unlinkChildLogin } from '../lib/apiClient';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { designTokens } from '../theme/designTokens';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { DEFAULT_CHILD_PROFILE, normalizeChildProfile } from '../lib/permissions/userPermissionProfiles';

/** Normalize DB row for client lists (name + avatar for color chips). */
function mapChildRowForClient(row) {
  if (!row?.id) return row;
  return {
    ...row,
    name: row.first_name ?? row.name,
    avatar: row.avatar ?? null,
  };
}

/** family_members row for a linked learner: child_id matches, or child_scope includes children.id */
function findLinkedChildStudentMemberRow(fmRows, childId) {
  const cid = String(childId);
  for (const r of fmRows || []) {
    if (r.child_id != null && String(r.child_id) === cid) return r;
    let scope = r.child_scope;
    if (typeof scope === 'string') {
      try {
        scope = JSON.parse(scope);
      } catch (_) {
        scope = [];
      }
    }
    if (Array.isArray(scope) && scope.some((x) => String(x) === cid)) return r;
  }
  return null;
}

export default function EditChildModal({ 
  visible, 
  onClose, 
  child,
  familyId,
  /** From Family Members list when invite_status is accepted; used when profiles.email is hidden by RLS */
  linkedLoginEmail = null,
  /** 'none' | 'pending' | 'accepted' — from merged invite summaries (Family) */
  childInviteStatus = 'none',
  /** Email on the outstanding invite when status is pending */
  pendingInviteEmail = null,
  /** Close edit (optional) and open invite flow for this child — e.g. Family Members → Invite Child */
  onRequestInviteChild = null,
  onChildUpdated,
  onChildDeleted
}) {
  const CHILD_PROFILE_OPTIONS = useMemo(
    () => [
      { id: 'guided', label: 'Guided' },
      { id: 'standard', label: 'Standard' },
      { id: 'independent', label: 'Independent' },
    ],
    []
  );
  const formRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [fullChildData, setFullChildData] = useState(null);
  const [supportProfile, setSupportProfile] = useState(null);
  const [academicYear, setAcademicYear] = useState(null);
  const [formCanSubmit, setFormCanSubmit] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState(null);
  const [unlinkingLogin, setUnlinkingLogin] = useState(false);
  /** After disconnect, ignore stale linkedLoginEmail from parent until modal closes */
  const [accountDisconnectedThisSession, setAccountDisconnectedThisSession] = useState(false);
  /** Web: second RNModal stacks above Edit Child; window.confirm can sit behind RN Web modals */
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [childPermissionProfile, setChildPermissionProfile] = useState(DEFAULT_CHILD_PROFILE);
  const [initialChildPermissionProfile, setInitialChildPermissionProfile] = useState(DEFAULT_CHILD_PROFILE);

  const toast = useToast();

  /** Shown from first paint: prop from Family API list + RLS merge, then refined by fetch; never null→invite flash when prop is set */
  const displayLinkedEmail = useMemo(() => {
    if (accountDisconnectedThisSession) return null;
    const fromState =
      connectedEmail != null && String(connectedEmail).trim() !== ''
        ? String(connectedEmail).trim()
        : null;
    if (fromState) return fromState;
    if (linkedLoginEmail != null && String(linkedLoginEmail).trim() !== '') {
      return String(linkedLoginEmail).trim();
    }
    return null;
  }, [connectedEmail, linkedLoginEmail, accountDisconnectedThisSession]);

  // Reset Save button only when opening the modal or switching child — not when familyId / linkedLoginEmail
  // churn (that used to force formCanSubmit false while AddChildForm did not re-fire onValidationChange).
  useEffect(() => {
    if (visible && child?.id) {
      setFormCanSubmit(false);
      setAccountDisconnectedThisSession(false);
      const normalizedProfile = normalizeChildProfile(child?.permission_profile || DEFAULT_CHILD_PROFILE);
      setChildPermissionProfile(normalizedProfile);
      setInitialChildPermissionProfile(normalizedProfile);
    }
  }, [visible, child?.id]);

  // Fetch / refresh child payload when modal open; deps may change without clearing submit state.
  useEffect(() => {
    if (visible && child?.id) {
      fetchFullChildDataInBackground();
    } else if (!visible) {
      setError(null);
      setIsSubmitting(false);
      setFullChildData(null);
      setSupportProfile(null);
      setFormCanSubmit(false);
      setConnectedEmail(null);
      setUnlinkingLogin(false);
      setAccountDisconnectedThisSession(false);
      setDisconnectConfirmOpen(false);
      setDeleteConfirmOpen(false);
      setChildPermissionProfile(DEFAULT_CHILD_PROFILE);
      setInitialChildPermissionProfile(DEFAULT_CHILD_PROFILE);
    }
  }, [visible, child?.id, familyId, linkedLoginEmail]);

  const fetchFullChildDataInBackground = async () => {
    if (!child?.id) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('children')
        .select('*')
        .eq('id', child.id)
        .single();

      if (fetchError) return;

      setFullChildData(data);
      const normalizedProfile = normalizeChildProfile(data?.permission_profile || DEFAULT_CHILD_PROFILE);
      setChildPermissionProfile(normalizedProfile);
      setInitialChildPermissionProfile(normalizedProfile);

      const { data: supportData, error: supportErr } = await supabase
        .from('child_support_profiles')
        .select('*')
        .eq('child_id', child.id)
        .maybeSingle();
      if (!supportErr) {
        setSupportProfile(supportData || null);
      } else {
        setSupportProfile(null);
      }

      const fid = familyId || data.family_id;
      if (fid) {
        const { data: fmRows } = await supabase
          .from('family_members')
          .select('user_id, child_id, child_scope')
          .eq('family_id', fid)
          .in('member_role', ['child', 'student']);
        const fmRow = findLinkedChildStudentMemberRow(fmRows, child.id);
        const userId = fmRow?.user_id;
        let emailFromProfile = null;
        if (userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle();
          emailFromProfile = (profile?.email && String(profile.email).trim()) || null;
        }
        const fromList =
          linkedLoginEmail != null && String(linkedLoginEmail).trim() !== ''
            ? String(linkedLoginEmail).trim()
            : null;
        setConnectedEmail(emailFromProfile || fromList || null);

        const { data: ay } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, target_instructional_days, target_instructional_hours')
          .eq('family_id', fid)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setAcademicYear(ay || null);
      } else {
        setConnectedEmail(null);
        setAcademicYear(null);
      }
    } catch (err) {
      // Silent: form already shows cached data
    }
  };

  const baseData = fullChildData || child;

  // Stable object identity unless real field values change (avoids AddChildForm resetting every parent render).
  const initialData = useMemo(() => {
    const b = fullChildData || child;
    if (!b) return {};
    const interestsRaw = Array.isArray(b.interests)
      ? b.interests
      : typeof b.interests === 'string' && b.interests
        ? b.interests.split(',').map((i) => i.trim()).filter(Boolean)
        : [];
    return {
      name: b.first_name || b.name || '',
      nickname: b.nickname || '',
      age: b.age != null ? String(b.age) : '',
      grade: b.grade || b.grade_level || b.grade_label || '',
      standardsState: b.standards || b.standards_state || 'None',
      interests: interestsRaw,
      learningStyle:
        Array.isArray(b.learning_styles) && b.learning_styles.length > 0
          ? b.learning_styles[0]
          : b.learning_style || '',
      avatar: b.avatar || b.avatar_url || 'prof1',
      schoolYearStart: academicYear?.start_date || '',
      schoolYearEnd: academicYear?.end_date || '',
      targetMode:
        academicYear?.target_instructional_days != null
          ? 'days'
          : academicYear?.target_instructional_hours != null
            ? 'hours'
            : '',
      targetDays:
        academicYear?.target_instructional_days != null
          ? String(academicYear.target_instructional_days)
          : '',
      targetHours:
        academicYear?.target_instructional_hours != null
          ? String(academicYear.target_instructional_hours)
          : '',
      diagnoses: supportProfile?.diagnoses ?? [],
      learning_modalities: supportProfile?.learning_modalities ?? [],
      support_needs: supportProfile?.support_needs ?? [],
      executive_function: supportProfile?.executive_function ?? [],
      support_notes: supportProfile?.notes ?? '',
    };
  }, [
    fullChildData?.id,
    child?.id,
    fullChildData?.first_name ?? child?.first_name,
    fullChildData?.name ?? child?.name,
    fullChildData?.nickname ?? child?.nickname,
    fullChildData?.age ?? child?.age,
    fullChildData?.grade ?? child?.grade,
    fullChildData?.grade_level ?? child?.grade_level,
    fullChildData?.grade_label ?? child?.grade_label,
    fullChildData?.standards ?? child?.standards,
    fullChildData?.standards_state ?? child?.standards_state,
    fullChildData?.avatar ?? child?.avatar,
    fullChildData?.avatar_url ?? child?.avatar_url,
    JSON.stringify(
      Array.isArray(fullChildData?.interests)
        ? fullChildData.interests
        : Array.isArray(child?.interests)
          ? child.interests
          : typeof (fullChildData?.interests || child?.interests) === 'string'
            ? (fullChildData?.interests || child?.interests || '').split(',').map((i) => i.trim()).filter(Boolean)
            : []
    ),
    fullChildData?.learning_style ?? child?.learning_style,
    JSON.stringify(fullChildData?.learning_styles ?? child?.learning_styles ?? []),
    academicYear?.start_date,
    academicYear?.end_date,
    academicYear?.target_instructional_days,
    academicYear?.target_instructional_hours,
    JSON.stringify(supportProfile?.diagnoses ?? []),
    JSON.stringify(supportProfile?.learning_modalities ?? []),
    JSON.stringify(supportProfile?.support_needs ?? []),
    JSON.stringify(supportProfile?.executive_function ?? []),
    supportProfile?.notes,
  ]);

  const handleSubmit = async (formData) => {
    const effectiveFamilyId = familyId || fullChildData?.family_id || child?.family_id;
    
    if (!effectiveFamilyId || !child?.id) {
      // Try to get family_id from user profile as fallback
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          
          if (!profile?.family_id || !child?.id) {
            setError('Family ID or Child ID not found. Please refresh and try again.');
            return;
          }
          
          // Use profile family_id
          const finalFamilyId = profile.family_id;
          await performUpdate(formData, finalFamilyId);
          return;
        }
      } catch (err) {
      }
      
      setError('Family ID or Child ID not found. Please refresh and try again.');
      return;
    }

    await performUpdate(formData, effectiveFamilyId);
  };

  const performUpdate = async (formData, finalFamilyId) => {
    if (!formData.name?.trim()) {
      setError('Name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Map form data to database columns
      const updateData = {
        first_name: formData.name.trim(),
        nickname: formData.nickname?.trim() || null,
        age: formData.age ? Number(formData.age) : null,
        grade: formData.grade || null,
        standards: formData.standardsState === 'None' ? null : formData.standardsState,
        avatar: formData.avatar || null,
        interests: Array.isArray(formData.interests) ? formData.interests : [],
        learning_style: formData.learningStyle || null,
        permission_profile: normalizeChildProfile(childPermissionProfile),
      };

      const { data, error: updateError } = await supabase
        .from('children')
        .update(updateData)
        .eq('id', child.id)
        .eq('family_id', finalFamilyId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      const hasSupportProfile = [formData.diagnoses, formData.learningModalities, formData.supportNeeds, formData.executiveFunction, formData.supportNotes].some(
        (v) => (Array.isArray(v) && v.length > 0) || (typeof v === 'string' && v.trim() !== '')
      );
      if (hasSupportProfile) {
        const supportPayload = {
          child_id: child.id,
          diagnoses: Array.isArray(formData.diagnoses) ? formData.diagnoses : null,
          learning_modalities: Array.isArray(formData.learningModalities) ? formData.learningModalities : null,
          support_needs: Array.isArray(formData.supportNeeds) ? formData.supportNeeds : null,
          executive_function: Array.isArray(formData.executiveFunction) ? formData.executiveFunction : null,
          notes: formData.supportNotes?.trim() || null,
        };
        await supabase.from('child_support_profiles').upsert(supportPayload, { onConflict: 'child_id' });
      }

      const hasTarget = (formData.targetMode === 'days' && formData.targetDays) || (formData.targetMode === 'hours' && formData.targetHours);
      const hasRange = formData.schoolYearStart && formData.schoolYearEnd;
      if (finalFamilyId && (hasTarget || hasRange)) {
        const { data: existing } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date')
          .eq('family_id', finalFamilyId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const startDate = formData.schoolYearStart || existing?.start_date;
        const endDate = formData.schoolYearEnd || existing?.end_date;
        if (existing) {
          const toUpdate = { updated_at: new Date().toISOString() };
          if (formData.targetMode === 'days' && formData.targetDays) toUpdate.target_instructional_days = formData.targetDays;
          if (formData.targetMode === 'hours' && formData.targetHours) toUpdate.target_instructional_hours = formData.targetHours;
          if (startDate) toUpdate.start_date = startDate;
          if (endDate) toUpdate.end_date = endDate;
          await supabase.from('academic_years').update(toUpdate).eq('id', existing.id);
        } else if (startDate && endDate) {
          await supabase.from('academic_years').insert({
            family_id: finalFamilyId,
            year_name: 'School year',
            start_date: startDate,
            end_date: endDate,
            target_instructional_days: formData.targetMode === 'days' && formData.targetDays ? formData.targetDays : null,
            target_instructional_hours: formData.targetMode === 'hours' && formData.targetHours ? formData.targetHours : null,
          });
        }
      }

      if (toast && toast.push) {
        toast.push(`${formData.name} has been updated successfully!`, 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert(`${formData.name} has been updated successfully!`);
      }

      const clientRow = mapChildRowForClient(data);
      setInitialChildPermissionProfile(normalizeChildProfile(childPermissionProfile));
      if (onChildUpdated) {
        onChildUpdated(clientRow);
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && clientRow?.id) {
        window.dispatchEvent(new CustomEvent('childProfileUpdated', { detail: { child: clientRow } }));
      }

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to update child. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const performDisconnectLogin = async () => {
    setUnlinkingLogin(true);
    try {
      const { data, error } = await unlinkChildLogin({ childId: child.id });
      if (error) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(error.message || 'Failed to disconnect account');
        } else {
          Alert.alert('Error', error.message || 'Failed to disconnect account');
        }
        return;
      }
      if (!data?.ok) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('Failed to disconnect account');
        } else {
          Alert.alert('Error', 'Failed to disconnect account');
        }
        return;
      }
      setConnectedEmail(null);
      setAccountDisconnectedThisSession(true);
      if (toast?.push) {
        toast.push('Account disconnected', 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Account disconnected');
      } else {
        Alert.alert('Done', 'Account disconnected');
      }
      if (onChildUpdated) onChildUpdated(child, { unlinkLogin: true });
    } finally {
      setUnlinkingLogin(false);
    }
  };

  const handleDisconnectAccount = () => {
    if (!child?.id || unlinkingLogin) return;
    const em = displayLinkedEmail || 'this email';
    const body = `${em} will lose access to this child’s learning dashboard. Their profile and all learning data stay in your family. You can send a new invite anytime.`;

    // Web: use a stacked RNModal so the prompt is above this modal (native confirm can sit behind).
    if (Platform.OS === 'web') {
      setDisconnectConfirmOpen(true);
      return;
    }

    Alert.alert('Disconnect?', body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          void performDisconnectLogin();
        },
      },
    ]);
  };

  const handleInviteChildFromAccount = () => {
    if (!child?.id || typeof onRequestInviteChild !== 'function') return;
    onRequestInviteChild(child.id);
  };

  const performPermanentDelete = async () => {
    const effectiveFamilyId = familyId || fullChildData?.family_id;
    if (!effectiveFamilyId) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Family not found. Please refresh and try again.');
      } else {
        Alert.alert('Error', 'Family not found. Please refresh and try again.');
      }
      return;
    }
    const confirmedName = String(
      fullChildData?.first_name || fullChildData?.name || child?.first_name || child?.name || ''
    ).trim();
    setDeleting(true);
    try {
      const { data, error } = await permanentDeleteChild({
        childId: child.id,
        confirmName: confirmedName,
      });

      if (error) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(error.message || 'Failed to delete child');
        } else {
          Alert.alert('Error', error.message || 'Failed to delete child');
        }
        return;
      }
      if (!data?.ok) {
        const reason = data?.reason || 'unknown';
        const msg =
          reason === 'name_mismatch'
            ? 'Name does not match'
            : reason === 'forbidden'
              ? 'You do not have permission'
              : 'Failed to delete child';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
        return;
      }

      setDeleteConfirmOpen(false);
      if (toast && toast.push) {
        toast.push('Child has been permanently deleted', 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Child has been permanently deleted');
      } else {
        Alert.alert('Deleted', 'Child has been permanently deleted');
      }
      if (onChildDeleted) {
        onChildDeleted(child.id);
      }
      setTimeout(() => {
        onClose();
      }, 500);
    } finally {
      setDeleting(false);
    }
  };

  if (!child) return null;

  const childName = fullChildData?.first_name || fullChildData?.name || child?.first_name || child?.name || 'Child';

  const disconnectConfirmEmail = displayLinkedEmail || 'this email';
  const disconnectConfirmBody = `${disconnectConfirmEmail} will lose access to this child’s learning dashboard. Their profile and all learning data stay in your family. You can send a new invite anytime.`;

  const deleteLoginBulletsModal =
    displayLinkedEmail != null && displayLinkedEmail !== ''
      ? `\n• Delete linked account (${displayLinkedEmail})\n• Remove them from this family`
      : '';
  const deleteConfirmBodyModal = `This will:\n• Delete all learning data\n• Remove planner history, goals, and records${deleteLoginBulletsModal}\n\nThis cannot be undone.`;
  const hasAttachedEmail =
    (displayLinkedEmail != null && displayLinkedEmail !== '') ||
    (childInviteStatus === 'pending' && pendingInviteEmail && String(pendingInviteEmail).trim() !== '');
  const permissionDirty =
    normalizeChildProfile(childPermissionProfile) !== normalizeChildProfile(initialChildPermissionProfile);
  const hasRequiredEditFields = Boolean(String(initialData?.name || '').trim())
    && Boolean(String(initialData?.age || '').trim())
    && Boolean(String(initialData?.grade || '').trim())
    && Boolean(String(initialData?.avatar || '').trim());

  const savePermissionOnly = async () => {
    const effectiveFamilyId = familyId || fullChildData?.family_id || child?.family_id;
    if (!effectiveFamilyId || !child?.id) {
      setError('Family ID or Child ID not found. Please refresh and try again.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('children')
        .update({ permission_profile: normalizeChildProfile(childPermissionProfile) })
        .eq('id', child.id)
        .eq('family_id', effectiveFamilyId)
        .select()
        .single();
      if (updateError) throw updateError;
      const clientRow = mapChildRowForClient(data);
      setInitialChildPermissionProfile(normalizeChildProfile(childPermissionProfile));
      if (onChildUpdated) onChildUpdated(clientRow);
      if (toast?.push) toast.push('Permission level updated.', 'success');
      setTimeout(() => {
        onClose?.();
      }, 400);
    } catch (err) {
      setError(err?.message || 'Failed to update permission level. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <RNModal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e?.stopPropagation?.()} style={styles.modalWrap}>
          <AppModalShell
            mode="edit"
            title={childName || 'Edit child'}
            eyebrow="CHILD"
            accent="#9ECFFB"
            accentSoft="#F0F8FF"
            HeroIcon={Smile}
            onClose={onClose}
            contentContainerStyle={styles.scrollContent}
            footer={(
              <ModalFooter
                mode="edit"
                primaryLabel={isSubmitting ? 'Saving...' : 'Save changes'}
                destructiveLabel="Delete Student"
                onCancel={onClose}
                onDelete={() => setDeleteConfirmOpen(true)}
                onPrimary={() => {
                  if (formCanSubmit && formRef.current?.submit) {
                    formRef.current.submit();
                    return;
                  }
                  if (permissionDirty) {
                    void savePermissionOnly();
                    return;
                  }
                  if (hasRequiredEditFields && formRef.current?.submit) {
                    formRef.current.submit();
                  }
                }}
                onBlockedPrimary={() => {
                  setError('Please complete all required fields before saving.');
                }}
                accent="#9ECFFB"
                disabled={isSubmitting}
                visuallyDisabled={!formCanSubmit && !permissionDirty && !hasRequiredEditFields}
                loading={isSubmitting}
              />
            )}
          >
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={true}>
              {baseData ? (
                <>
                <AddChildForm
                  key={child.id}
                  ref={formRef}
                  initial={initialData}
                  submitting={isSubmitting}
                  onSubmit={handleSubmit}
                  onValidationChange={setFormCanSubmit}
                  requireDirtyToSubmit={false}
                />

                <View style={styles.accountSection}>
                  <Text style={styles.accountSectionTitle}>Account</Text>
                  <View style={styles.accountRule} />
                  {displayLinkedEmail != null && displayLinkedEmail !== '' ? (
                    <Text style={styles.accountConnectedLine1} numberOfLines={2}>
                      ✓ Connected · {displayLinkedEmail}
                    </Text>
                  ) : accountDisconnectedThisSession ? (
                    <>
                      <Text style={styles.accountDisconnectedHeadline}>Account disconnected</Text>
                      {typeof onRequestInviteChild === 'function' ? (
                        <TouchableOpacity
                          style={styles.accountInviteButton}
                          onPress={handleInviteChildFromAccount}
                          activeOpacity={0.85}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.accountInviteButtonText}>Invite child</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  ) : childInviteStatus === 'pending' ? (
                    <>
                      <Text style={styles.accountPendingTitle}>Invite sent</Text>
                      <Text style={styles.accountPendingEmail} numberOfLines={2}>
                        {pendingInviteEmail && String(pendingInviteEmail).trim() !== ''
                          ? String(pendingInviteEmail).trim()
                          : '—'}
                      </Text>
                      <Text style={styles.accountPendingWait}>Waiting for acceptance</Text>
                      {typeof onRequestInviteChild === 'function' ? (
                        <View style={styles.accountInviteActionsRow}>
                          <TouchableOpacity
                            style={styles.accountOutlineButton}
                            onPress={handleInviteChildFromAccount}
                            activeOpacity={0.8}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={styles.accountOutlineButtonText}>Resend invite</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.accountOutlineButton}
                            onPress={handleInviteChildFromAccount}
                            activeOpacity={0.8}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={styles.accountOutlineButtonText}>Change email</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={styles.accountEmptyText}>No account connected</Text>
                      <Text style={styles.accountPurposeLine}>
                        Invite this child to access their learning dashboard.
                      </Text>
                      {typeof onRequestInviteChild === 'function' ? (
                        <TouchableOpacity
                          style={styles.accountInviteButton}
                          onPress={handleInviteChildFromAccount}
                          activeOpacity={0.85}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.accountInviteButtonText}>Invite child</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                  {hasAttachedEmail ? (
                    <View style={styles.permissionFieldWrap}>
                      <Text style={styles.inputLabel}>Permission level</Text>
                      <View style={styles.permissionPills}>
                        {CHILD_PROFILE_OPTIONS.map((option) => {
                          const selected = option.id === childPermissionProfile;
                          return (
                            <TouchableOpacity
                              key={option.id}
                              style={[styles.permissionPill, selected && styles.permissionPillSelected]}
                              onPress={() => setChildPermissionProfile(option.id)}
                              activeOpacity={0.85}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={[styles.permissionPillText, selected && styles.permissionPillTextSelected]}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
                </>
              ) : null}
            </ScrollView>
          </AppModalShell>
        </TouchableOpacity>
      </TouchableOpacity>
    </RNModal>
    {Platform.OS === 'web' ? (
      <RNModal
        visible={disconnectConfirmOpen && visible && !!child?.id}
        transparent
        animationType="fade"
        onRequestClose={() => setDisconnectConfirmOpen(false)}
      >
        <View style={styles.disconnectConfirmOverlay}>
          <TouchableOpacity
            style={styles.disconnectConfirmBackdrop}
            activeOpacity={1}
            onPress={() => !unlinkingLogin && setDisconnectConfirmOpen(false)}
            accessibilityLabel="Dismiss disconnect confirmation"
          />
          <View style={styles.disconnectConfirmCard} accessibilityRole="dialog">
            <Text style={styles.disconnectConfirmTitle}>Disconnect?</Text>
            <Text style={styles.disconnectConfirmBody}>{disconnectConfirmBody}</Text>
            <View style={styles.disconnectConfirmActions}>
              <TouchableOpacity
                style={styles.disconnectConfirmCancelBtn}
                onPress={() => setDisconnectConfirmOpen(false)}
                disabled={unlinkingLogin}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' && { cursor: unlinkingLogin ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.disconnectConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.disconnectConfirmDestructiveBtn,
                  unlinkingLogin && styles.disconnectConfirmDestructiveBtnDisabled,
                ]}
                onPress={() => {
                  setDisconnectConfirmOpen(false);
                  void performDisconnectLogin();
                }}
                disabled={unlinkingLogin}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: unlinkingLogin ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.disconnectConfirmDestructiveText}>
                  {unlinkingLogin ? 'Disconnecting…' : 'Disconnect'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>
    ) : null}
    {Platform.OS === 'web' ? (
      <RNModal
        visible={deleteConfirmOpen && visible && !!child?.id}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteConfirmOpen(false)}
      >
        <View style={styles.disconnectConfirmOverlay}>
          <TouchableOpacity
            style={styles.disconnectConfirmBackdrop}
            activeOpacity={1}
            onPress={() => !deleting && setDeleteConfirmOpen(false)}
            accessibilityLabel="Dismiss delete confirmation"
          />
          <View style={styles.disconnectConfirmCard} accessibilityRole="alertdialog">
            <Text style={styles.disconnectConfirmTitle}>Delete {childName} permanently?</Text>
            <Text style={styles.disconnectConfirmBody}>{deleteConfirmBodyModal}</Text>
            <View style={styles.disconnectConfirmActions}>
              <TouchableOpacity
                style={styles.disconnectConfirmCancelBtn}
                onPress={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.disconnectConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.disconnectConfirmDestructiveBtn,
                  deleting && styles.disconnectConfirmDestructiveBtnDisabled,
                ]}
                onPress={() => {
                  void performPermanentDelete();
                }}
                disabled={deleting}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.disconnectConfirmDestructiveText}>
                  {deleting ? 'Deleting…' : `Delete ${childName}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrap: {
    width: '100%',
    maxWidth: 860,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    marginRight: 2,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 20,
    marginTop: 16,
  },
  footerDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    margin: 20,
    marginTop: 0,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  accountSection: {
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  accountSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  accountRule: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 10,
    marginBottom: 14,
  },
  accountConnectedLine1: {
    fontSize: 15,
    fontWeight: '600',
    color: '#166534',
    lineHeight: 22,
  },
  disconnectOutlineButtonInDanger: {
    marginTop: 0,
  },
  disconnectOutlineButton: {
    alignSelf: 'flex-start',
    marginTop: 18,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  disconnectOutlineButtonDisabled: {
    opacity: 0.55,
  },
  disconnectOutlineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  accountDisconnectedHeadline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 14,
  },
  accountPendingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  accountPendingEmail: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    marginTop: 6,
    lineHeight: 20,
  },
  accountPendingWait: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 17,
  },
  accountInviteActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  accountOutlineButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  accountOutlineButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  accountEmptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  accountPurposeLine: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 14,
  },
  /** Match selected planner / planning-preferences chips (designTokens primary + soft lavender fill) */
  accountInviteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: designTokens.colors.primary,
    backgroundColor: designTokens.softAccents.core,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  accountInviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: designTokens.colors.primary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  permissionFieldWrap: {
    marginTop: 12,
  },
  permissionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  permissionPillSelected: {
    borderColor: '#9ECFFB',
    backgroundColor: 'rgba(158, 207, 251, 0.22)',
  },
  permissionPillText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  permissionPillTextSelected: {
    color: '#1e5f8a',
  },
  dangerZoneAccordion: {
    marginTop: 0,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(254, 242, 242, 0.5)',
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  dangerZoneHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold || '#dc2626',
  },
  dangerZoneContent: {
    marginTop: 16,
  },
  dangerDisconnectSection: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  dangerDisconnectTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 10,
  },
  dangerBulletList: {
    marginBottom: 14,
    gap: 0,
  },
  dangerBulletLine: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 0,
  },
  dangerSectionLead: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  dangerSection: {
    backgroundColor: colors.redSoft || '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: (colors.redBold || '#dc2626') + '40',
    padding: 16,
    marginBottom: 12,
  },
  dangerSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  dangerSectionDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  dangerSectionDescriptionLast: {
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
    marginTop: 8,
  },
  dangerInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: colors.redBold || '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: colors.redSoft || '#fef2f2',
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    backgroundColor: '#fafafa',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  saveButton: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  disconnectConfirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  disconnectConfirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  disconnectConfirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 22,
    zIndex: 2,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
    }),
  },
  disconnectConfirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  disconnectConfirmBody: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 21,
    marginBottom: 22,
  },
  disconnectConfirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  disconnectConfirmCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  disconnectConfirmCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  disconnectConfirmDestructiveBtn: {
    backgroundColor: colors.redBold || '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  disconnectConfirmDestructiveBtnDisabled: {
    opacity: 0.55,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  disconnectConfirmDestructiveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});


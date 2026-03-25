import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import AddChildForm from './AddChildForm';
import { supabase } from '../lib/supabase';
import { permanentDeleteChild, unlinkChildLogin } from '../lib/apiClient';
import { useToast } from './Toast';
import { colors } from '../theme/colors';

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
  const formRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [fullChildData, setFullChildData] = useState(null);
  const [supportProfile, setSupportProfile] = useState(null);
  const [academicYear, setAcademicYear] = useState(null);
  const [formCanSubmit, setFormCanSubmit] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState(null);
  const [unlinkingLogin, setUnlinkingLogin] = useState(false);
  /** After disconnect, ignore stale linkedLoginEmail from parent until modal closes */
  const [accountDisconnectedThisSession, setAccountDisconnectedThisSession] = useState(false);

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
    }
  }, [visible, child?.id]);

  // Fetch / refresh child payload when modal open; deps may change without clearing submit state.
  useEffect(() => {
    if (visible && child?.id) {
      fetchFullChildDataInBackground();
    } else if (!visible) {
      setError(null);
      setIsSubmitting(false);
      setShowDangerZone(false);
      setConfirmName('');
      setFullChildData(null);
      setSupportProfile(null);
      setFormCanSubmit(false);
      setConnectedEmail(null);
      setUnlinkingLogin(false);
      setAccountDisconnectedThisSession(false);
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

      const { data: supportData } = await supabase
        .from('child_support_profiles')
        .select('*')
        .eq('child_id', child.id)
        .maybeSingle();
      setSupportProfile(supportData || null);

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

  const handleDisconnectAccount = () => {
    if (!child?.id || unlinkingLogin) return;
    const em = displayLinkedEmail || 'this email';
    Alert.alert(
      'Disconnect?',
      `${em} will lose access to this child’s learning dashboard. Their profile and all learning data stay in your family. You can send a new invite anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setUnlinkingLogin(true);
            const { data, error } = await unlinkChildLogin({ childId: child.id });
            setUnlinkingLogin(false);
            if (error) {
              Alert.alert('Error', error.message || 'Failed to disconnect account');
              return;
            }
            if (!data?.ok) {
              Alert.alert('Error', 'Failed to disconnect account');
              return;
            }
            setConnectedEmail(null);
            setAccountDisconnectedThisSession(true);
            if (toast?.push) {
              toast.push('Account disconnected', 'success');
            } else {
              Alert.alert('Done', 'Account disconnected');
            }
            if (onChildUpdated) onChildUpdated(child);
          },
        },
      ]
    );
  };

  const handleInviteChildFromAccount = () => {
    if (!child?.id || typeof onRequestInviteChild !== 'function') return;
    onRequestInviteChild(child.id);
  };

  const handleDelete = async () => {
    const childName = child?.first_name || child?.name || 'Child';
    if (confirmName.trim().toLowerCase() !== childName.trim().toLowerCase()) {
      Alert.alert('Error', 'Name does not match');
      return;
    }

    const loginBullets =
      displayLinkedEmail != null && displayLinkedEmail !== ''
        ? `\n• Delete linked account (${displayLinkedEmail})\n• Remove them from this family`
        : '';
    Alert.alert(
      `Delete ${childName} permanently?`,
      `This will:\n• Delete all learning data\n• Remove planner history, goals, and records${loginBullets}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${childName}`,
          style: 'destructive',
          onPress: async () => {
            const effectiveFamilyId = familyId || fullChildData?.family_id;
            if (!effectiveFamilyId) {
              Alert.alert('Error', 'Family not found. Please refresh and try again.');
              return;
            }
            setDeleting(true);
            const { data, error } = await permanentDeleteChild({
              childId: child.id,
              confirmName: confirmName.trim(),
            });

            setDeleting(false);

            if (error) {
              Alert.alert('Error', error.message || 'Failed to delete child');
              return;
            }
            if (!data?.ok) {
              const reason = data?.reason || 'unknown';
              Alert.alert(
                'Error',
                reason === 'name_mismatch' ? 'Name does not match' :
                reason === 'forbidden' ? 'You do not have permission' :
                'Failed to delete child'
              );
              return;
            }

            if (toast && toast.push) {
              toast.push('Child has been permanently deleted', 'success');
            } else {
              Alert.alert('Deleted', 'Child has been permanently deleted');
            }
            if (onChildDeleted) {
              onChildDeleted(child.id);
            }
            setTimeout(() => {
              onClose();
            }, 500);
          }
        }
      ]
    );
  };

  if (!child) return null;

  const childName = fullChildData?.first_name || fullChildData?.name || child?.first_name || child?.name || 'Child';

  return (
    <RNModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e?.stopPropagation?.()} style={styles.modal}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Content - Scrollable */}
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {baseData ? (
              <>
                <AddChildForm
                  key={child.id}
                  ref={formRef}
                  initial={initialData}
                  submitting={isSubmitting}
                  onSubmit={handleSubmit}
                  onValidationChange={setFormCanSubmit}
                  requireDirtyToSubmit
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
                </View>

                {/* Accordion — Danger zone */}
                <View style={styles.dangerZoneAccordion}>
                  <TouchableOpacity
                    onPress={() => setShowDangerZone(!showDangerZone)}
                    style={styles.dangerZoneHeader}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dangerZoneHeaderLeft}>
                      <AlertTriangle size={16} color={colors.redBold || '#dc2626'} />
                      <Text style={styles.dangerZoneTitle}>Danger zone</Text>
                    </View>
                    {showDangerZone ? <ChevronUp size={20} color={colors.redBold || '#dc2626'} /> : <ChevronDown size={20} color={colors.redBold || '#dc2626'} />}
                  </TouchableOpacity>
                  {showDangerZone && (
                <View style={styles.dangerZoneContent}>
                  {displayLinkedEmail != null && displayLinkedEmail !== '' && !accountDisconnectedThisSession ? (
                    <View style={styles.dangerDisconnectSection}>
                      <Text style={styles.dangerDisconnectTitle}>Disconnect linked account</Text>
                      <Text style={styles.dangerDisconnectDescription}>
                        Disconnect the account to delete the linked email, {displayLinkedEmail}, but to keep the child and their data in your account. Delete the child below if you want to both delete the linked account as well as child data in both that account and this one.
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.disconnectOutlineButton,
                          styles.disconnectOutlineButtonInDanger,
                          unlinkingLogin && styles.disconnectOutlineButtonDisabled,
                        ]}
                        onPress={handleDisconnectAccount}
                        disabled={unlinkingLogin}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' && { cursor: unlinkingLogin ? 'not-allowed' : 'pointer' })}
                      >
                        <Text style={styles.disconnectOutlineButtonText}>
                          {unlinkingLogin ? 'Disconnecting…' : 'Disconnect'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={styles.dangerSection}>
                    <Text style={styles.dangerSectionTitle}>Delete child permanently</Text>
                    <Text style={styles.dangerSectionDescription}>
                      This will delete all learning data, planner history, goals, and records for{' '}
                      <Text style={styles.bold}>{childName}</Text>.
                      {displayLinkedEmail != null && displayLinkedEmail !== '' ? (
                        <>
                          {'\n\n'}
                          Also removes login access for:{' '}
                          <Text style={styles.bold}>{displayLinkedEmail}</Text>
                        </>
                      ) : null}
                      {'\n\n'}
                      This cannot be undone.
                    </Text>
                    
                    <Text style={styles.inputLabel}>
                      Type the child's name to confirm
                    </Text>
                    <TextInput
                      style={styles.dangerInput}
                      value={confirmName}
                      onChangeText={setConfirmName}
                      placeholder={childName}
                      autoCapitalize="words"
                    />

                    <TouchableOpacity
                      style={[
                        styles.deleteButton,
                        confirmName.trim().toLowerCase() !== childName.trim().toLowerCase() && styles.deleteButtonDisabled
                      ]}
                      onPress={handleDelete}
                      disabled={
                        confirmName.trim().toLowerCase() !== childName.trim().toLowerCase() || deleting
                      }
                    >
                      <Text style={styles.deleteButtonText}>
                        {deleting ? 'Deleting...' : `Delete ${childName}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footerDivider} />
          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, (isSubmitting || !formCanSubmit) && styles.saveButtonDisabled]}
              onPress={() => {
                if (formRef.current?.submit) {
                  formRef.current.submit();
                }
              }}
              disabled={isSubmitting || !formCanSubmit}
            >
              <Text style={styles.saveButtonText}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </RNModal>
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
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: 810,
    maxWidth: '100%',
    maxHeight: '85vh',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
    }),
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
  accountInviteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.blue || '#4A9FD4',
  },
  accountInviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
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
    marginBottom: 8,
  },
  dangerDisconnectDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 14,
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
});


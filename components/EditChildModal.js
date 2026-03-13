import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { X, AlertTriangle, UserCircle } from 'lucide-react';
import AddChildForm from './AddChildForm';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';

export default function EditChildModal({ 
  visible, 
  onClose, 
  child,
  familyId,
  onChildUpdated,
  onChildDeleted
}) {
  const formRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [fullChildData, setFullChildData] = useState(null);
  const [academicYear, setAcademicYear] = useState(null);
  const [loadingChildData, setLoadingChildData] = useState(false);
  const [formCanSubmit, setFormCanSubmit] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState(null);

  const toast = useToast();

  // Fetch full child data when modal opens
  useEffect(() => {
    if (visible && child?.id) {
      setFormCanSubmit(false); // Reset validation state
      fetchFullChildData();
    } else if (!visible) {
      setError(null);
      setIsSubmitting(false);
      setShowDangerZone(false);
      setConfirmName('');
      setFullChildData(null);
      setFormCanSubmit(false);
      setConnectedEmail(null);
    }
  }, [visible, child?.id]);

  const fetchFullChildData = async () => {
    if (!child?.id) return;
    
    setLoadingChildData(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('children')
        .select('*')
        .eq('id', child.id)
        .single();

      if (fetchError) {
        setError('Failed to load child information');
        return;
      }

      setFullChildData(data);
      setIsArchived(data.archived || false);

      // If child has a linked account (verified), get the connected email (read-only, one per child)
      const fid = familyId || data.family_id;
      if (fid) {
        const { data: fmRows } = await supabase
          .from('family_members')
          .select('user_id')
          .eq('family_id', fid)
          .eq('child_id', child.id)
          .eq('member_role', 'child')
          .limit(1);
        const userId = fmRows?.[0]?.user_id;
        if (userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle();
          setConnectedEmail(profile?.email || null);
        } else {
          setConnectedEmail(null);
        }
      } else {
        setConnectedEmail(null);
      }

      if (fid) {
        const { data: ay } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, target_instructional_days, target_instructional_hours')
          .eq('family_id', fid)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setAcademicYear(ay || null);
      } else {
        setAcademicYear(null);
      }
      
      // If familyId wasn't provided, get it from the child data or user profile
      if (!familyId && data.family_id) {
        // We'll use the child's family_id in handleSubmit
      } else if (!familyId) {
        // Try to get from user profile
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.family_id) {
            // Store it for use in handleSubmit
            // We'll need to handle this differently
          }
        }
      }
    } catch (err) {
      setError('Failed to load child information');
    } finally {
      setLoadingChildData(false);
    }
  };

  // Prepare initial data for form
  const initialData = fullChildData ? {
    name: fullChildData.first_name || fullChildData.name || '',
    nickname: fullChildData.nickname || '',
    age: fullChildData.age ? String(fullChildData.age) : '',
    grade: fullChildData.grade || fullChildData.grade_label || '',
    standardsState: fullChildData.standards || fullChildData.standards_state || 'None',
    interests: Array.isArray(fullChildData.interests) 
      ? fullChildData.interests 
      : (typeof fullChildData.interests === 'string' && fullChildData.interests 
          ? fullChildData.interests.split(',').map(i => i.trim()).filter(Boolean)
          : []),
    learningStyle: Array.isArray(fullChildData.learning_styles) && fullChildData.learning_styles.length > 0
      ? fullChildData.learning_styles[0]
      : fullChildData.learning_style || '',
    avatar: fullChildData.avatar || fullChildData.avatar_url || 'prof1',
    schoolYearStart: academicYear?.start_date || '',
    schoolYearEnd: academicYear?.end_date || '',
    targetMode: academicYear?.target_instructional_days != null ? 'days' : academicYear?.target_instructional_hours != null ? 'hours' : '',
    targetDays: academicYear?.target_instructional_days != null ? String(academicYear.target_instructional_days) : '',
    targetHours: academicYear?.target_instructional_hours != null ? String(academicYear.target_instructional_hours) : '',
  } : {};

  const handleSubmit = async (formData) => {
    // Get family_id from child data if not provided as prop
    const effectiveFamilyId = familyId || fullChildData?.family_id;
    
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

      if (onChildUpdated) {
        onChildUpdated(data);
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

  const handleArchive = async () => {
    const childName = child?.first_name || child?.name || 'Child';
    Alert.alert(
      'Archive Child',
      `Are you sure you want to archive ${childName}? This will hide them from planners and reports, but data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setArchiving(true);
            const { data, error } = await supabase.rpc('archive_child', {
              _family: familyId,
              _child: child.id
            });

            setArchiving(false);

            if (error || !data?.ok) {
              Alert.alert('Error', 'Failed to archive child');
              return;
            }

            if (toast && toast.push) {
              toast.push('Child archived successfully', 'success');
            } else {
              Alert.alert('Success', 'Child archived successfully');
            }
            setIsArchived(true);
            setShowDangerZone(false);
            if (onChildUpdated) {
              onChildUpdated({ ...child, archived: true });
            }
            setTimeout(() => {
              onClose();
            }, 500);
          }
        }
      ]
    );
  };

  const handleRestore = async () => {
    setRestoring(true);
    const { data, error } = await supabase.rpc('restore_child', {
      _family: familyId,
      _child: child.id
    });

    setRestoring(false);

    if (error || !data?.ok) {
      const reason = data?.reason || 'unknown';
      Alert.alert(
        'Error',
        reason === 'forbidden' ? 'You do not have permission' :
        reason === 'not_found' ? 'Child not found' :
        'Failed to restore child'
      );
      return;
    }

    if (toast && toast.push) {
      toast.push('Child restored successfully', 'success');
    } else {
      Alert.alert('Success', 'Child restored successfully');
    }
    setIsArchived(false);
    setShowDangerZone(false);
    if (onChildUpdated) {
      onChildUpdated({ ...child, archived: false });
    }
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const handleDelete = async () => {
    const childName = child?.first_name || child?.name || 'Child';
    if (confirmName.trim().toLowerCase() !== childName.trim().toLowerCase()) {
      Alert.alert('Error', 'Name does not match');
      return;
    }

    Alert.alert(
      'Delete Permanently',
      `This will permanently delete ${childName} and ALL their data including sessions, goals, rules, and progress. This CANNOT be undone.\n\nAre you absolutely sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            const effectiveFamilyId = familyId || fullChildData?.family_id;
            if (!effectiveFamilyId) {
              Alert.alert('Error', 'Family not found. Please refresh and try again.');
              return;
            }
            setDeleting(true);
            const { data, error } = await supabase.rpc('delete_child_permanently', {
              _family: effectiveFamilyId,
              _child: child.id,
              _confirm_name: confirmName
            });

            setDeleting(false);

            if (error || !data?.ok) {
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerTitleRow}>
                <View style={styles.headerIconWrap}>
                  <UserCircle size={20} color="#6b7280" />
                </View>
                <View>
                  <Text style={styles.title}>Edit Child</Text>
                  <Text style={styles.subtitle}>Update {childName}'s information</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerDivider} />

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
            {loadingChildData ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.loadingText}>Loading child information...</Text>
              </View>
            ) : fullChildData ? (
              <>
                {connectedEmail != null && connectedEmail !== '' && (
                  <View style={styles.connectedEmailRow}>
                    <Text style={styles.connectedEmailLabel}>Connected to email:</Text>
                    <Text style={styles.connectedEmailValue} numberOfLines={1}>{connectedEmail}</Text>
                  </View>
                )}
                <AddChildForm
                  ref={formRef}
                  initial={initialData}
                  submitting={isSubmitting}
                  onSubmit={handleSubmit}
                  onValidationChange={setFormCanSubmit}
                />
                
                {/* Danger Zone */}
                <View style={styles.dangerZone}>
              <TouchableOpacity
                style={styles.dangerZoneToggle}
                onPress={() => setShowDangerZone(!showDangerZone)}
              >
                <AlertTriangle size={16} color={colors.redBold || '#dc2626'} />
                <Text style={styles.dangerZoneTitle}>
                  {showDangerZone ? 'Hide' : 'Show'} Danger Zone
                </Text>
              </TouchableOpacity>

              {showDangerZone && (
                <View style={styles.dangerZoneContent}>
                  {/* Archive Section */}
                  <View style={styles.dangerSection}>
                    <Text style={styles.dangerSectionTitle}>Archive child</Text>
                    <Text style={styles.dangerSectionDescription}>
                      Hides {childName} from Planner and reports. Data is preserved and can be restored.
                    </Text>
                    <View style={styles.dangerActions}>
                      <TouchableOpacity
                        style={styles.dangerButton}
                        onPress={handleArchive}
                        disabled={archiving || isArchived}
                      >
                        <Text style={styles.dangerButtonText}>
                          {archiving ? 'Archiving...' : 'Archive'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dangerButton}
                        onPress={handleRestore}
                        disabled={restoring || !isArchived}
                      >
                        <Text style={styles.dangerButtonText}>
                          {restoring ? 'Restoring...' : 'Restore'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Delete Section */}
                  <View style={styles.dangerSection}>
                    <Text style={styles.dangerSectionTitle}>Delete permanently</Text>
                    <Text style={styles.dangerSectionDescription}>
                      This removes all sessions, goals, overrides, and cached days for{' '}
                      <Text style={styles.bold}>{childName}</Text>. This cannot be undone.
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
            ) : (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Failed to load child data</Text>
              </View>
            )}
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
              style={[styles.saveButton, (isSubmitting || loadingChildData || !fullChildData || !formCanSubmit) && styles.saveButtonDisabled]}
              onPress={() => {
                if (formRef.current?.submit) {
                  formRef.current.submit();
                }
              }}
              disabled={isSubmitting || loadingChildData || !fullChildData || !formCanSubmit}
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
    width: 720,
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
  connectedEmailRow: {
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  connectedEmailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  connectedEmailValue: {
    fontSize: 15,
    color: '#0f172a',
  },
  dangerZone: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  dangerZoneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold || '#dc2626',
  },
  dangerZoneContent: {
    marginTop: 16,
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
  dangerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dangerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  dangerButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
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


import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { X, AlertTriangle } from 'lucide-react';
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
  const [loadingChildData, setLoadingChildData] = useState(false);
  const [formCanSubmit, setFormCanSubmit] = useState(false);

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
            setDeleting(true);
            const { data, error } = await supabase.rpc('delete_child_permanently', {
              _family: familyId,
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
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Edit Child</Text>
              <Text style={styles.subtitle}>Update {childName}'s information</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

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
        </View>
      </View>
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#8B7CF6',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
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


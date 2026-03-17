// Onboarding modal: plan → add child → subjects → complete
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { ChevronLeft } from 'lucide-react';
import {
  setOnboardingPlanningMode,
  addChild,
  createOnboardingSubject,
  completeOnboarding,
  getOnboardingStatus,
  getFamilyMembers,
} from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import WelcomeStep from './WelcomeStep';
import PlanningModeStep from './PlanningModeStep';
import LearningContextStep from './LearningContextStep';
import AddChildStep from './AddChildStep';
import AddSubjectStep from './AddSubjectStep';
import CompleteStep from './CompleteStep';

const STEPS = ['welcome', 'planning_mode', 'learning_context', 'add_child', 'add_subject', 'complete'];

export default function OnboardingModal({
  visible,
  familyId,
  initialPlanningMode = null,
  onCompleted,
  /** When familyId is null, parent can try to create/fetch family. Returns Promise<familyId | null>. */
  onEnsureFamily = null,
}) {
  const [step, setStep] = useState('welcome');
  const [planningMode, setPlanningMode] = useState(initialPlanningMode);
  const [createdChildren, setCreatedChildren] = useState([]); // [{ id, name }]
  const [createdSubjectsByChild, setCreatedSubjectsByChild] = useState({}); // { [childId]: [{ id, name }, ...] }
  const [subjectStepChildIndex, setSubjectStepChildIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [resuming, setResuming] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setResuming(true);
  }, [visible]);

  // Resume: set step from backend status every time modal opens (avoids stale state if user deletes child/subject mid-flow)
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    if (!familyId) {
      // New signup: no family yet (ensure_family may 404 if backend not deployed). Stop loading after delay so user sees first step.
      const t = setTimeout(() => {
        if (!cancelled) {
          setStep('welcome');
          setPlanningMode(initialPlanningMode ?? null);
          setCreatedChildren([]);
          setResuming(false);
        }
      }, 2000);
      return () => { cancelled = true; clearTimeout(t); };
    }
    (async () => {
      try {
        const res = await getOnboardingStatus();
        const data = res?.data ?? res;
        if (cancelled) return;
        if (data?.onboarding_completed) {
          if (onCompleted) onCompleted();
          return;
        }
        if (!data?.default_planning_mode) {
          setStep('welcome');
          setPlanningMode(initialPlanningMode ?? null);
          setCreatedChildren([]);
        } else if (!data?.has_children) {
          setStep('add_child');
          setPlanningMode(data.default_planning_mode);
          setCreatedChildren([]);
        } else {
          setStep('add_subject');
          setPlanningMode(data.default_planning_mode ?? null);
          setSubjectStepChildIndex(0);
          try {
            const membersRes = await getFamilyMembers();
            const membersData = membersRes?.data ?? membersRes;
            const kids = membersData?.children ?? [];
            if (kids.length > 0) {
              setCreatedChildren(kids.map((c) => ({ id: c.id, name: c.first_name || c.name || 'Child' })));
            }
            if (data?.has_subjects && familyId) {
              const { data: subjRows } = await supabase
                .from('subject')
                .select('id, name, child_id')
                .eq('family_id', familyId);
              if (subjRows && subjRows.length > 0) {
                const byChild = {};
                subjRows.forEach((s) => {
                  const cid = s.child_id || null;
                  if (!byChild[cid]) byChild[cid] = [];
                  byChild[cid].push({ id: s.id, name: s.name || 'Subject' });
                });
                setCreatedSubjectsByChild(byChild);
              } else {
                setCreatedSubjectsByChild({});
              }
            } else {
              setCreatedSubjectsByChild({});
            }
          } catch (_) {
            setCreatedSubjectsByChild({});
          }
        }
      } catch (_) {
        // Don't reset step on fetch error (e.g. 429) — only set step from successful API data
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, onCompleted, initialPlanningMode]);

  const goBack = () => {
    setError(null);
    if (step === 'add_subject' && subjectStepChildIndex > 0) {
      setSubjectStepChildIndex(subjectStepChildIndex - 1);
      return;
    }
    if (step === 'add_subject') {
      setStep('add_child');
      return;
    }
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const persistPlanningMode = async () => {
    if (!planningMode) return;
    const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
    if (!fid) {
      setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await setOnboardingPlanningMode({ family_id: fid, planning_mode: planningMode });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to save');
      setStep('add_child');
    } catch (e) {
      setError(e?.message ?? 'Failed to save planning mode.');
    } finally {
      setIsSaving(false);
    }
  };

  const addOneChild = async (child) => {
    const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
    if (!fid) {
      setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await addChild({
        family_id: fid,
        name: child.name,
        nickname: child.nickname ?? null,
        age: child.age ?? null,
        grade_label: child.grade || null,
        follow_standards: !!child.standardsState,
        standards_state: child.standardsState || null,
        avatar_url: child.avatar || null,
        interests: Array.isArray(child.interests) ? child.interests : [],
        support_notes: child.supportNotes ?? null,
        diagnoses: child.diagnoses ?? null,
        learning_modalities: child.learningModalities ?? null,
        support_needs: child.supportNeeds ?? null,
        executive_function: child.executiveFunction ?? null,
      });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to create child.');
      const id = res?.data?.id ?? res?.id;
      if (id) setCreatedChildren((prev) => [...prev, { id, name: child.name }]);

      const hasTarget = (child.targetMode === 'days' && child.targetDays) || (child.targetMode === 'hours' && child.targetHours);
      const hasRange = child.schoolYearStart && child.schoolYearEnd;
      if (fid && (hasTarget || hasRange)) {
        const { data: existing } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date')
          .eq('family_id', fid)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const startDate = child.schoolYearStart || existing?.start_date;
        const endDate = child.schoolYearEnd || existing?.end_date;
        if (existing) {
          const toUpdate = { updated_at: new Date().toISOString() };
          if (child.targetMode === 'days' && child.targetDays) toUpdate.target_instructional_days = child.targetDays;
          if (child.targetMode === 'hours' && child.targetHours) toUpdate.target_instructional_hours = child.targetHours;
          if (startDate) toUpdate.start_date = startDate;
          if (endDate) toUpdate.end_date = endDate;
          await supabase.from('academic_years').update(toUpdate).eq('id', existing.id);
        } else if (startDate && endDate) {
          await supabase.from('academic_years').insert({
            family_id: fid,
            year_name: 'School year',
            start_date: startDate,
            end_date: endDate,
            target_instructional_days: child.targetMode === 'days' && child.targetDays ? child.targetDays : null,
            target_instructional_hours: child.targetMode === 'hours' && child.targetHours ? child.targetHours : null,
          });
        }
      }
    } catch (e) {
      setError(e?.message ?? 'Failed to create child.');
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const goToSubjectStep = () => {
    setError(null);
    setSubjectStepChildIndex(0);
    setCreatedSubjectsByChild({});
    setStep('add_subject');
  };

  const addOneSubject = async (subject) => {
    if (!subject.child_id) return;
    const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
    if (!fid) {
      setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
      return;
    }
    const optimisticId = `pending-${subject.child_id}-${subject.name}-${Date.now()}`;
    setError(null);
    setCreatedSubjectsByChild((prev) => {
      const list = prev[subject.child_id] || [];
      return { ...prev, [subject.child_id]: [...list, { id: optimisticId, name: subject.name }] };
    });
    setIsSaving(true);
    try {
      const res = await createOnboardingSubject({
        family_id: fid,
        name: subject.name,
        child_id: subject.child_id,
        summary: subject.summary ?? null,
        grade: subject.grade ?? null,
        credits: subject.credits ?? null,
        notes: subject.notes ?? null,
      });
      const data = res?.data ?? res;
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to create subject.');
      const id = data?.subject_id ?? data?.id;
      if (id) {
        setCreatedSubjectsByChild((prev) => {
          const list = prev[subject.child_id] || [];
          return { ...prev, [subject.child_id]: list.map((s) => (s.id === optimisticId ? { id, name: subject.name } : s)) };
        });
        if (subject.material_ids?.length > 0) {
          try {
            const { error: materialUpdateError } = await supabase
              .from('materials')
              .update({ subject_id: id })
              .in('id', subject.material_ids);
            if (materialUpdateError) {
              console.warn('Failed to link materials to subject:', materialUpdateError);
            }
          } catch (materialError) {
            console.warn('Error linking materials to subject:', materialError);
          }
        }
      }
    } catch (e) {
      setCreatedSubjectsByChild((prev) => {
        const list = (prev[subject.child_id] || []).filter((s) => s.id !== optimisticId);
        return { ...prev, [subject.child_id]: list };
      });
      setError(e?.message ?? 'Failed to create subject.');
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const removeOneSubject = async (childId, subjectId) => {
    // Update local list immediately so the top chip list reflects the change
    setCreatedSubjectsByChild((prev) => {
      const list = prev[childId] || [];
      return { ...prev, [childId]: list.filter((s) => s.id !== subjectId) };
    });
    // Skip DB delete for optimistic (pending) entries; only delete real subjects
    if (!familyId || !subjectId || String(subjectId).startsWith('pending-')) return;
    try {
      const { error } = await supabase
        .from('subject')
        .delete()
        .eq('id', subjectId)
        .eq('family_id', familyId);
      if (error) {
        console.warn('[OnboardingModal] Failed to delete subject:', error);
        return;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } catch (err) {
      console.warn('[OnboardingModal] Error deleting subject:', err);
    }
  };

  const onSubjectStepContinue = () => {
    setError(null);
    if (subjectStepChildIndex < createdChildren.length - 1) {
      setSubjectStepChildIndex(subjectStepChildIndex + 1);
    } else {
      setStep('complete');
    }
  };

  const goToCompleteStep = () => {
    setError(null);
    setStep('complete');
  };

  const finalize = async () => {
    const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
    if (!fid) {
      setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await completeOnboarding({ family_id: fid });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to complete.');
      // Dispatch first so WebLayout can close modal immediately (avoids depending on refetch, e.g. 429)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('onboardingCompleted'));
      }
      if (onCompleted) await onCompleted();
    } catch (e) {
      setError(e?.message ?? 'Failed to complete onboarding.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            {step !== 'welcome' ? (
              <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <ChevronLeft size={20} color="#374151" />
              </TouchableOpacity>
            ) : (
              <View style={styles.backBtn} />
            )}
            {step !== 'welcome' && (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${((STEPS.indexOf(step) + 1) / STEPS.length) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <View style={styles.friendlyErrorBanner}>
                <Text style={styles.friendlyErrorText}>UH OH. SOMETHING WENT WRONG. PLEASE TRY REFRESHING OR CONTACT US: CONTACT@LEARNADOODLE.COM</Text>
              </View>
            ) : null}
            {resuming ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : (
              <>
                <View style={step === 'welcome' ? undefined : styles.stepHidden}>
                  <WelcomeStep onNext={() => setStep('planning_mode')} />
                </View>
                <View style={step === 'planning_mode' ? undefined : styles.stepHidden}>
                  <PlanningModeStep
                    onNext={() => setStep('learning_context')}
                    isSaving={isSaving}
                  />
                </View>
                <View style={step === 'learning_context' ? undefined : styles.stepHidden}>
                  <LearningContextStep
                    value={planningMode}
                    onChange={setPlanningMode}
                    onNext={persistPlanningMode}
                    isSaving={isSaving}
                  />
                </View>
                <View style={step === 'add_child' ? undefined : styles.stepHidden}>
                  <AddChildStep
                    createdChildren={createdChildren}
                    onAddChild={addOneChild}
                    onContinue={goToSubjectStep}
                    isSaving={isSaving}
                  />
                </View>
                <View style={step === 'add_subject' ? undefined : styles.stepHidden}>
                  <AddSubjectStep
                    familyId={familyId}
                    createdChildren={createdChildren}
                    subjectStepChildIndex={subjectStepChildIndex}
                    subjectsForCurrentChild={createdSubjectsByChild[createdChildren[subjectStepChildIndex]?.id] || []}
                    onAddSubject={addOneSubject}
                    onRemoveSubject={removeOneSubject}
                    onContinue={onSubjectStepContinue}
                    isSaving={isSaving}
                  />
                </View>
                <View style={step === 'complete' ? undefined : styles.stepHidden}>
                  <CompleteStep onFinish={finalize} isSaving={isSaving} />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
      maxHeight: '95vh',
    }),
    ...(Platform.OS !== 'web' && { flex: 1 }),
  },
  scrollView: {
    ...(Platform.OS === 'web' && { maxHeight: '85vh' }),
    ...(Platform.OS !== 'web' && { flex: 1, minHeight: 0 }),
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 40,
  },
  backBtn: {
    width: 32,
    height: 32,
    minWidth: 32,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressWrap: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 0,
  },
  progressTrack: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
  },
  stepHidden: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    height: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  errorBanner: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  friendlyErrorBanner: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  friendlyErrorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
});

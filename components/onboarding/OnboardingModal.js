// Onboarding modal: planning context → add child → complete
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, ScrollView, Animated } from 'react-native';
import { ChevronLeft } from 'lucide-react';
import {
  setOnboardingPlanningMode,
  addChild,
  completeOnboarding,
  getOnboardingStatus,
  getFamilyMembers,
  permanentDeleteChild,
  saveOnboardingParentProfile,
} from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { persistStudentSelfSignupFromOnboarding } from '../../lib/services/accountPrefsClient';
import { ONBOARDING_SKY } from '../../lib/constants/onboardingTheme';
import WelcomeStep from './WelcomeStep';
import PlanningModeStep from './PlanningModeStep';
import LearningContextStep from './LearningContextStep';
import AddChildStep from './AddChildStep';
import ParentProfileStep from './ParentProfileStep';
import SchoolYearSetupStep from './SchoolYearSetupStep';
import CompleteStep from './CompleteStep';
import { seedHomeWelcomeBulletinPost } from '../../lib/homeWelcomeBulletin';
import { notifyOnboardingCompleted } from '../../lib/onboardingCrossTab';

const PARENT_STEPS = ['welcome', 'planning_mode', 'learning_context', 'parent_profile', 'add_child', 'school_year', 'complete'];
const STUDENT_STEPS = ['welcome', 'planning_mode', 'learning_context', 'add_child', 'school_year', 'complete'];
const ONBOARDING_WHO_STORAGE_KEY = 'ld_onboarding_who';
const ONBOARDING_SCHOOL_YEAR_DONE_KEY = 'ld_onboarding_school_year_done';

function getStepsForWho(who) {
  return who === 'student' ? STUDENT_STEPS : PARENT_STEPS;
}

function getStepProgressPercent(step, who) {
  const steps = getStepsForWho(who);
  const idx = steps.indexOf(step);
  if (idx < 0) return 0;
  return ((idx + 1) / steps.length) * 100;
}

function resolveOnboardingWho(storedWho, fallback = 'parent') {
  return storedWho === 'student' ? 'student' : fallback;
}

export default function OnboardingModal({
  visible,
  familyId,
  initialPlanningMode = null,
  onCompleted,
  /** Called when modal has finished loading (resume complete) so parent can hide app loader. */
  onReady = null,
  /** When familyId is null, parent can try to create/fetch family. Returns Promise<familyId | null>. */
  onEnsureFamily = null,
}) {
  const [step, setStep] = useState('welcome');
  const [onboardingWho, setOnboardingWho] = useState('parent'); // 'parent' | 'student' from "I'm using Learnadoodle for..."
  const [planningMode, setPlanningMode] = useState(initialPlanningMode);
  const [createdChildren, setCreatedChildren] = useState([]); // [{ id, name }]
  const [parentDisplayName, setParentDisplayName] = useState('');
  const [parentAvatarKey, setParentAvatarKey] = useState('prof1');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [resuming, setResuming] = useState(true);
  const stepContentOpacity = useRef(new Animated.Value(0)).current;
  const STEP_FADE_MS = 180;

  const transitionToStep = (nextStep) => {
    stepContentOpacity.setValue(0);
    setStep(nextStep);
  };

  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  /** Tracks resume per modal open so familyId arriving mid-flow does not reset the step. */
  const resumeKeyRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setResuming(true);
  }, [visible]);

  useEffect(() => {
    if (resuming) return;
    Animated.timing(stepContentOpacity, {
      toValue: 1,
      duration: STEP_FADE_MS,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [step, resuming, stepContentOpacity]);

  // Resume: set step from backend status when modal opens (avoids stale state if user deletes child/subject mid-flow).
  // familyId may arrive after the user leaves welcome — do not re-run resume in that case.
  useEffect(() => {
    if (!visible) {
      resumeKeyRef.current = null;
      return;
    }
    let cancelled = false;

    const finishResume = () => {
      if (cancelled) return;
      setResuming(false);
      if (onReady) onReady();
    };

    if (!familyId) {
      if (resumeKeyRef.current === 'no-family') return () => { cancelled = true; };
      resumeKeyRef.current = 'no-family';
      setStep('welcome');
      setPlanningMode(initialPlanningMode ?? null);
      setCreatedChildren([]);
      finishResume();
      return () => { cancelled = true; };
    }

    let whoForSteps = onboardingWho;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const storedWho = localStorage.getItem(ONBOARDING_WHO_STORAGE_KEY);
      if (storedWho === 'parent' || storedWho === 'student') {
        whoForSteps = storedWho;
      }
    }
    const stepsForWho = getStepsForWho(whoForSteps);
    const stepIdx = stepsForWho.indexOf(stepRef.current);
    if (resumeKeyRef.current === 'no-family' && stepIdx > 0) {
      resumeKeyRef.current = familyId;
      finishResume();
      return () => { cancelled = true; };
    }

    if (resumeKeyRef.current === familyId) return () => { cancelled = true; };
    resumeKeyRef.current = familyId;

    (async () => {
      try {
        const res = await getOnboardingStatus();
        const data = res?.data ?? res;
        if (cancelled) return;
        let persistedWho = null;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          persistedWho = localStorage.getItem(ONBOARDING_WHO_STORAGE_KEY);
          if (persistedWho === 'parent' || persistedWho === 'student') {
            setOnboardingWho(persistedWho);
          }
        }
        const isStudentFlow = persistedWho === 'student';
        if (data?.onboarding_completed) {
          if (onCompleted) onCompleted();
          return;
        }
        // Read step after await — user may have left welcome while status was loading.
        const stepsForResume = getStepsForWho(resolveOnboardingWho(persistedWho, onboardingWho));
        const currentStepIdx = stepsForResume.indexOf(stepRef.current);
        if (currentStepIdx > 0) return;

        if (!data?.default_planning_mode) {
          if (!isStudentFlow && data?.has_parent_profile) {
            setStep('learning_context');
            setPlanningMode(initialPlanningMode ?? null);
            setParentDisplayName(data.parent_display_name || '');
            setParentAvatarKey(data.parent_avatar_url || 'prof1');
            setCreatedChildren([]);
          } else if (currentStepIdx === 0) {
            setStep('welcome');
            setPlanningMode(initialPlanningMode ?? null);
            setCreatedChildren([]);
          }
        } else if (!isStudentFlow && data?.has_parent_profile === false) {
          setStep('parent_profile');
          setPlanningMode(data.default_planning_mode);
          setParentDisplayName(data.parent_display_name || '');
          setParentAvatarKey(data.parent_avatar_url || 'prof1');
          setCreatedChildren([]);
        } else if (!data?.has_children) {
          setStep('add_child');
          setPlanningMode(data.default_planning_mode);
          setCreatedChildren([]);
        } else {
          let schoolYearDone = false;
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            schoolYearDone = localStorage.getItem(ONBOARDING_SCHOOL_YEAR_DONE_KEY) === '1';
          }
          setStep(schoolYearDone ? 'complete' : 'school_year');
          setPlanningMode(data.default_planning_mode ?? null);
          try {
            const membersRes = await getFamilyMembers();
            const membersData = membersRes?.data ?? membersRes;
            const kids = membersData?.children ?? [];
            if (kids.length > 0) {
              setCreatedChildren(kids.map((c) => ({ id: c.id, name: c.first_name || c.name || 'Child' })));
            }
          } catch (_) {}
        }
      } catch (_) {
        // Don't reset step on fetch error (e.g. 429) — only set step from successful API data
      } finally {
        finishResume();
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, onCompleted, onReady, initialPlanningMode]);

  const goBack = () => {
    setError(null);
    const steps = getStepsForWho(onboardingWho);
    const idx = steps.indexOf(step);
    if (idx > 0) transitionToStep(steps[idx - 1]);
  };

  const persistParentProfile = async ({ displayName, avatarKey }) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await saveOnboardingParentProfile({
        display_name: displayName,
        avatar_url: avatarKey,
      });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to save profile.');
      setParentDisplayName(displayName);
      setParentAvatarKey(avatarKey);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshProfile'));
      }
      transitionToStep('add_child');
    } catch (e) {
      setError(e?.message ?? 'Failed to save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const persistPlanningMode = () => {
    if (!planningMode) return;
    setError(null);
    const nextStep = onboardingWho === 'student' ? 'add_child' : 'parent_profile';
    transitionToStep(nextStep);
    (async () => {
      try {
        const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
        if (!fid) {
          setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
          return;
        }
        const res = await setOnboardingPlanningMode({ family_id: fid, planning_mode: planningMode });
        if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to save');
      } catch (e) {
        setError(e?.message ?? 'Failed to save planning mode.');
      }
    })();
  };

  const addOneChild = async (child, pendingId = null) => {
    const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
    if (!fid) {
      setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
      return;
    }
    const isBackground = pendingId != null;
    if (!isBackground) {
      setIsSaving(true);
    }
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
      if (id) {
        if (pendingId) {
          setCreatedChildren((prev) => prev.map((c) => (c.id === pendingId ? { id, name: child.name } : c)));
        } else {
          setCreatedChildren((prev) => [...prev, { id, name: child.name }]);
        }
      }

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
        } else {
          const y = new Date().getFullYear();
          const fallbackStart = startDate || `${y}-09-01`;
          const fallbackEnd = endDate || `${y + 1}-06-30`;
          await supabase.from('academic_years').insert({
            family_id: fid,
            year_name: 'School year',
            start_date: fallbackStart,
            end_date: fallbackEnd,
            target_instructional_days: child.targetMode === 'days' && child.targetDays ? child.targetDays : null,
            target_instructional_hours: child.targetMode === 'hours' && child.targetHours ? child.targetHours : null,
          });
        }
      }
    } catch (e) {
      if (pendingId) {
        setCreatedChildren((prev) => prev.filter((c) => c.id !== pendingId));
      }
      setError(e?.message ?? 'Failed to create child.');
      if (!isBackground) throw e;
    } finally {
      if (!isBackground) setIsSaving(false);
    }
  };

  const goToCompleteStepWithChild = (childPayload) => {
    setError(null);
    const pendingId = `pending-child-${Date.now()}`;
    setCreatedChildren((prev) => [...prev, { id: pendingId, name: childPayload.name }]);
    transitionToStep('school_year');
    (async () => {
      try {
        await addOneChild(childPayload, pendingId);
      } catch (_) {
        // Error already set in addOneChild
      }
    })();
  };

  const removeOneChild = async (childId, childName) => {
    const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
    if (!fid) {
      setError('We couldn’t set up your family yet. Please refresh the page or contact contact@learnadoodle.com.');
      return;
    }
    setError(null);
    try {
      const { data: delData, error: delErr } = await permanentDeleteChild({
        childId,
        confirmName: (childName || '').trim(),
      });
      if (delErr) throw new Error(delErr.message || 'Failed to delete child.');
      if (!delData?.ok) {
        const r = delData?.reason;
        throw new Error(
          r === 'name_mismatch' ? 'Name does not match.' : 'Failed to delete child.'
        );
      }
      setCreatedChildren((prev) => {
        return prev.filter((c) => c.id !== childId);
      });
    } catch (e) {
      setError(e?.message ?? 'Failed to delete child.');
    }
  };

  const goToCompleteStep = () => {
    setError(null);
    transitionToStep('school_year');
  };

  const finishSchoolYearSetup = () => {
    setError(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.setItem(ONBOARDING_SCHOOL_YEAR_DONE_KEY, '1');
    }
    transitionToStep('complete');
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
      const res = await completeOnboarding({ family_id: fid, onboarding_who: onboardingWho });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to complete.');
      try {
        const seedResult = await seedHomeWelcomeBulletinPost({ familyId: fid, planningMode });
        if (seedResult?.error) {
          console.warn('[OnboardingModal] home welcome bulletin', seedResult.error);
        }
      } catch (seedErr) {
        console.warn('[OnboardingModal] home welcome bulletin', seedErr);
      }
      if (onboardingWho === 'student') {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          const { error: perr } = await persistStudentSelfSignupFromOnboarding(uid);
          if (perr) console.warn('[OnboardingModal] student_self_signup preference', perr);
        }
      }
      // Dispatch first so WebLayout can close modal immediately (avoids depending on refetch, e.g. 429)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.removeItem(ONBOARDING_WHO_STORAGE_KEY);
        localStorage.removeItem(ONBOARDING_SCHOOL_YEAR_DONE_KEY);
        notifyOnboardingCompleted({
          planningMode: planningMode || null,
          familyId: fid,
        });
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
        <View style={[styles.modal, step === 'welcome' && styles.modalWelcome]}>
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
                      {
                        width: `${getStepProgressPercent(step, onboardingWho)}%`,
                        backgroundColor: ONBOARDING_SKY,
                      },
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
                <ActivityIndicator size="large" color={ONBOARDING_SKY} />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : (
              <Animated.View style={{ opacity: stepContentOpacity }}>
                <View style={step === 'welcome' ? undefined : styles.stepHidden}>
                  <WelcomeStep onNext={() => transitionToStep('planning_mode')} />
                </View>
                <View style={step === 'planning_mode' ? undefined : styles.stepHidden}>
                  <PlanningModeStep
                    onNext={async (who) => {
                      const newWho = who || 'parent';
                      const changedRole = onboardingWho != null && newWho !== onboardingWho;
                      if (changedRole && createdChildren.length > 0) {
                        const fid = familyId || (typeof onEnsureFamily === 'function' ? await onEnsureFamily() : null);
                        if (fid) {
                          await Promise.all(
                            createdChildren.map((c) =>
                              permanentDeleteChild({
                                childId: c.id,
                                confirmName: (c.name || '').trim(),
                              }).then(({ error, data }) => {
                                if (error || !data?.ok) {
                                  console.warn('Onboarding clear: failed to delete child', c.id, error || data);
                                }
                              })
                            )
                          );
                        }
                        setCreatedChildren([]);
                      }
                      setOnboardingWho(newWho);
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        localStorage.setItem(ONBOARDING_WHO_STORAGE_KEY, newWho);
                      }
                      transitionToStep('learning_context');
                    }}
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
                <View style={step === 'parent_profile' && onboardingWho !== 'student' ? undefined : styles.stepHidden}>
                  <ParentProfileStep
                    initialName={parentDisplayName}
                    initialAvatar={parentAvatarKey}
                    onNext={persistParentProfile}
                    isSaving={isSaving}
                  />
                </View>
                <View style={step === 'add_child' ? undefined : styles.stepHidden}>
                  <AddChildStep
                    createdChildren={createdChildren}
                    onAddChild={addOneChild}
                    onContinueWithNewChild={goToCompleteStepWithChild}
                    onRemoveChild={removeOneChild}
                    onContinue={goToCompleteStep}
                    isSaving={isSaving}
                    isStudentOnboarding={onboardingWho === 'student'}
                  />
                </View>
                <View style={step === 'school_year' ? undefined : styles.stepHidden}>
                  <SchoolYearSetupStep
                    familyId={familyId}
                    planningMode={planningMode}
                    onNext={finishSchoolYearSetup}
                    isSaving={isSaving}
                  />
                </View>
                <View style={step === 'complete' ? undefined : styles.stepHidden}>
                  <CompleteStep onFinish={finalize} isSaving={isSaving} />
                </View>
              </Animated.View>
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
  modalWelcome: {
    maxWidth: 420,
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
    backgroundColor: ONBOARDING_SKY,
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

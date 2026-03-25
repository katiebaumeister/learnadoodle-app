// Onboarding modal: plan → add child → subjects → complete
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, ScrollView, Animated } from 'react-native';
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
import { parseChildIds } from '../../lib/services/subjectsClient';
import { saveFamilyPlannerSettings } from '../../lib/services/plannerSettingsClient';
import { ONBOARDING_SKY } from '../../lib/constants/onboardingTheme';
import WelcomeStep from './WelcomeStep';
import PlanningModeStep from './PlanningModeStep';
import LearningContextStep from './LearningContextStep';
import AddChildStep from './AddChildStep';
import AddSubjectStep from './AddSubjectStep';
import CompleteStep from './CompleteStep';

const STEPS = ['welcome', 'planning_mode', 'learning_context', 'add_child', 'add_subject', 'complete'];

function extractCreatedSubjectId(res) {
  const d = res?.data;
  if (d == null) return null;
  if (typeof d === 'string' && /^[0-9a-f-]{36}$/i.test(d.trim())) return d.trim();
  if (typeof d !== 'object') return null;
  const nested = d.data;
  return (
    d.subject_id ??
    d.subjectId ??
    d.id ??
    (typeof nested === 'object' && nested != null ? nested.subject_id ?? nested.subjectId ?? nested.id : null) ??
    (d.subject && typeof d.subject === 'object' ? d.subject.id : null) ??
    (d.result && typeof d.result === 'object'
      ? d.result.subject_id ?? d.result.subjectId ?? d.result.id
      : null) ??
    null
  );
}

/**
 * Planning Preferences + subject "Overall" prefill read family_planner_settings.
 * Onboarding only patched `subject` before, so family-level targets stayed None.
 */
async function syncOnboardingSubjectPlanningToFamilyPlanner(fid, subject) {
  if (!fid || !subject) return;
  let mode = subject.default_constraint_mode;
  let days = null;
  let hours = null;
  const dv = subject.default_target_days;
  const hv = subject.default_target_hours;
  if (dv != null && dv !== '') {
    const n = parseInt(dv, 10);
    if (!Number.isNaN(n)) {
      days = n;
      mode = 'days';
    }
  } else if (hv != null && hv !== '') {
    const n = parseFloat(hv);
    if (!Number.isNaN(n)) {
      hours = n;
      mode = 'hours';
    }
  }
  if (mode !== 'days' && mode !== 'hours') return;
  if (mode === 'days' && days == null) return;
  if (mode === 'hours' && hours == null) return;

  const { error } = await saveFamilyPlannerSettings(fid, {
    target_scope: 'overall',
    default_constraint_mode: mode,
    default_target_days: mode === 'days' ? days : null,
    default_target_hours: mode === 'hours' ? hours : null,
  });
  if (error) {
    console.warn('[OnboardingModal] Family planner settings sync failed:', error);
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
  }
}

async function resolveSubjectIdAfterCreate(res, fid, subject) {
  let id = extractCreatedSubjectId(res);
  if (id) return id;
  const lookup = async () => {
    const { data: rows, error } = await supabase
      .from('subject')
      .select('id, child_id, created_at')
      .eq('family_id', fid)
      .eq('name', subject.name)
      .order('created_at', { ascending: false })
      .limit(12);
    if (error || !rows?.length) return null;
    const want = String(subject.child_id);
    const match = rows.find((r) => {
      const ids = parseChildIds(r.child_id ?? '');
      if (ids.length === 0) return true;
      return ids.includes(want);
    });
    return match?.id ?? rows[0]?.id ?? null;
  };
  try {
    id = await lookup();
    if (id) return id;
    await new Promise((r) => setTimeout(r, 350));
    return await lookup();
  } catch (_) {
    return null;
  }
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
  const [createdSubjectsByChild, setCreatedSubjectsByChild] = useState({}); // { [childId]: [{ id, name }, ...] }
  const [subjectStepChildIndex, setSubjectStepChildIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [resuming, setResuming] = useState(true);
  const stepContentOpacity = useRef(new Animated.Value(0)).current;
  const STEP_FADE_MS = 180;

  const transitionToStep = (nextStep) => {
    stepContentOpacity.setValue(0);
    setStep(nextStep);
  };

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
          if (onReady) onReady();
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
        if (!cancelled) {
          setResuming(false);
          if (onReady) onReady();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, onCompleted, onReady, initialPlanningMode]);

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
    if (idx > 0) transitionToStep(STEPS[idx - 1]);
  };

  const persistPlanningMode = () => {
    if (!planningMode) return;
    setError(null);
    transitionToStep('add_child');
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
          setCreatedSubjectsByChild((prev) => {
            const next = { ...prev };
            if (prev[pendingId]) {
              next[id] = prev[pendingId];
              delete next[pendingId];
            }
            return next;
          });
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
        setCreatedSubjectsByChild((prev) => {
          const next = { ...prev };
          delete next[pendingId];
          return next;
        });
      }
      setError(e?.message ?? 'Failed to create child.');
      if (!isBackground) throw e;
    } finally {
      if (!isBackground) setIsSaving(false);
    }
  };

  const goToSubjectStepWithChild = (childPayload) => {
    setError(null);
    const pendingId = `pending-child-${Date.now()}`;
    setCreatedChildren((prev) => [...prev, { id: pendingId, name: childPayload.name }]);
    setSubjectStepChildIndex(0);
    setCreatedSubjectsByChild({});
    transitionToStep('add_subject');
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
      const { error: rpcError } = await supabase.rpc('delete_child_permanently', {
        _family: fid,
        _child: childId,
        _confirm_name: childName || '',
      });
      if (rpcError) throw new Error(rpcError.message || 'Failed to delete child.');
      setCreatedChildren((prev) => {
        const next = prev.filter((c) => c.id !== childId);
        setSubjectStepChildIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
        return next;
      });
      setCreatedSubjectsByChild((prev) => {
        const next = { ...prev };
        delete next[childId];
        return next;
      });
    } catch (e) {
      setError(e?.message ?? 'Failed to delete child.');
    }
  };

  const goToSubjectStep = () => {
    setError(null);
    setSubjectStepChildIndex(0);
    setCreatedSubjectsByChild({});
    transitionToStep('add_subject');
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
        summary: null,
        grade: subject.grade ?? null,
        credits: subject.credits ?? null,
        notes: subject.notes ?? null,
      });
      if (res?.error) throw new Error(res.error?.message || res.error || 'Failed to create subject.');
      let id = await resolveSubjectIdAfterCreate(res, fid, subject);
      if (id) {
        setCreatedSubjectsByChild((prev) => {
          const list = prev[subject.child_id] || [];
          return { ...prev, [subject.child_id]: list.map((s) => (s.id === optimisticId ? { id, name: subject.name } : s)) };
        });
        const subjectPatch = {};
        if (subject.school_year != null && subject.school_year !== '') {
          subjectPatch.school_year = subject.school_year;
        }
        if (subject.default_constraint_mode !== undefined) {
          subjectPatch.default_constraint_mode = subject.default_constraint_mode;
        }
        if (subject.default_target_days !== undefined) {
          const v = subject.default_target_days;
          if (v != null && v !== '') {
            const n = parseInt(v, 10);
            subjectPatch.default_target_days = Number.isNaN(n) ? null : n;
          } else {
            subjectPatch.default_target_days = null;
          }
        }
        if (subject.default_target_hours !== undefined) {
          const v = subject.default_target_hours;
          if (v != null && v !== '') {
            const n = parseFloat(v);
            subjectPatch.default_target_hours = Number.isNaN(n) ? null : n;
          } else {
            subjectPatch.default_target_hours = null;
          }
        }
        if (Object.keys(subjectPatch).length > 0) {
          try {
            const { error: patchErr } = await supabase
              .from('subject')
              .update(subjectPatch)
              .eq('id', id)
              .eq('family_id', fid)
              .select('id')
              .maybeSingle();
            if (patchErr) console.warn('[OnboardingModal] Subject planning fields update:', patchErr);
          } catch (e) {
            console.warn('[OnboardingModal] Subject planning fields update failed:', e);
          }
        }
        await syncOnboardingSubjectPlanningToFamilyPlanner(fid, subject);
        const pickIds = [
          subject.syllabus_material_id,
          subject.lesson_plan_material_id,
          ...(Array.isArray(subject.material_ids) ? subject.material_ids : []),
        ].filter(Boolean);
        const uniquePickIds = [...new Set(pickIds)];
        if (uniquePickIds.length > 0) {
          try {
            const { error: materialUpdateError } = await supabase
              .from('materials')
              .update({ subject_id: id })
              .in('id', uniquePickIds);
            if (materialUpdateError) {
              console.warn('Failed to link materials to subject:', materialUpdateError);
            }
          } catch (materialError) {
            console.warn('Error linking materials to subject:', materialError);
          }
        }
      } else {
        console.warn('[OnboardingModal] Could not resolve new subject id; planning patch skipped.');
        await syncOnboardingSubjectPlanningToFamilyPlanner(fid, subject);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
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

  const onSubjectStepContinue = (pendingSubjectPayload = null) => {
    setError(null);
    if (subjectStepChildIndex < createdChildren.length - 1) {
      setSubjectStepChildIndex(subjectStepChildIndex + 1);
    } else {
      transitionToStep('complete');
    }
    if (pendingSubjectPayload && pendingSubjectPayload.child_id && pendingSubjectPayload.name) {
      (async () => {
        try {
          await addOneSubject(pendingSubjectPayload);
        } catch (e) {
          setError(e?.message ?? 'Failed to add subject.');
        }
      })();
    }
  };

  const goToCompleteStep = () => {
    setError(null);
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
                        width: `${((STEPS.indexOf(step) + 1) / STEPS.length) * 100}%`,
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
                              supabase
                                .rpc('delete_child_permanently', {
                                  _family: fid,
                                  _child: c.id,
                                  _confirm_name: c.name,
                                })
                                .then(({ error }) => {
                                  if (error) console.warn('Onboarding clear: failed to delete child', c.id, error);
                                })
                            )
                          );
                        }
                        setCreatedChildren([]);
                        setCreatedSubjectsByChild({});
                        setSubjectStepChildIndex(0);
                      }
                      setOnboardingWho(newWho);
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
                <View style={step === 'add_child' ? undefined : styles.stepHidden}>
                  <AddChildStep
                    createdChildren={createdChildren}
                    onAddChild={addOneChild}
                    onContinueWithNewChild={goToSubjectStepWithChild}
                    onRemoveChild={removeOneChild}
                    onContinue={goToSubjectStep}
                    isSaving={isSaving}
                    isStudentOnboarding={onboardingWho === 'student'}
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

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import { getPlanDefaultsFromSettings } from '../../lib/services/plannerSettingsClient';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import PlannerSettingsContent from './PlannerSettingsContent';
import AppModalShell from '../ui/AppModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import { useModalStackElevation, NESTED_MODAL_STACK_Z } from '../hooks/useModalStackElevation';
import { isDatePickerModalOpen } from '../ui/datePickerModalGuard';
import {
  createModalStyles as assignmentModalStyles,
  SCHOOL_YEAR_SETTINGS_MODAL_MAX_WIDTH,
} from '../create/shared/createModalStyles';
import { PLANNING_MODES } from '../../lib/planningMode';

const MODAL_MAX_WIDTH = SCHOOL_YEAR_SETTINGS_MODAL_MAX_WIDTH;

export default function SchoolYearSettingsModal({
  visible = false,
  onClose,
  familyId,
  initialSchoolYearLabel = null,
  onSaved,
  familyApproach = null,
  featureSettings = null,
}) {
  const toast = useToast();
  const planningModalActionsRef = useRef(null);
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible, NESTED_MODAL_STACK_Z);
  const [schoolYearLabel, setSchoolYearLabel] = useState(null);
  const [initialDataByYear, setInitialDataByYear] = useState({});
  const initialDataByYearRef = useRef({});
  const [savedSinceOpen, setSavedSinceOpen] = useState(false);
  const savedSinceOpenRef = useRef(false);
  const schoolYearLabelRef = useRef(null);
  const [footerState, setFooterState] = useState({ saving: false, readOnly: false });
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    savedSinceOpenRef.current = savedSinceOpen;
  }, [savedSinceOpen]);

  useEffect(() => {
    schoolYearLabelRef.current = String(schoolYearLabel || '').trim() || null;
  }, [schoolYearLabel]);

  useEffect(() => {
    initialDataByYearRef.current = initialDataByYear;
  }, [initialDataByYear]);

  const preloadData = useCallback(async (yearInput, { force = false } = {}) => {
    const year = String(yearInput || '').trim();
    if (!familyId || !year) return null;
    if (!force) {
      const existing = initialDataByYearRef.current[year];
      if (existing && typeof existing === 'object') return existing;
    }
    try {
      const { settings, exclusions, excluded_holiday_dates } = await getPlanDefaultsFromSettings(familyId, year);
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, school_year, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .eq('school_year', year)
        .order('name');
      const payload = {
        settings: {
          ...(settings || {}),
          school_year_label: year,
          default_school_year: year,
        },
        exclusions: exclusions || [],
        excluded_holiday_dates: excluded_holiday_dates || [],
        subjects: subjectsData || [],
      };
      setInitialDataByYear((prev) => {
        const next = { ...prev, [year]: payload };
        initialDataByYearRef.current = next;
        return next;
      });
      return payload;
    } catch (_) {
      return null;
    }
  }, [familyId]);

  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // External saves (Settings page / other modal instance) must not leave this modal stale.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return undefined;
    const onExternalSchoolYearChange = () => {
      // Ignore the refresh this modal itself just emitted on save.
      if (savedSinceOpenRef.current) return;
      setInitialDataByYear({});
      initialDataByYearRef.current = {};
      const openYear = String(schoolYearLabelRef.current || '').trim();
      if (visibleRef.current && openYear) {
        setContentReady(false);
        preloadData(openYear, { force: true }).finally(() => {
          if (visibleRef.current) setContentReady(true);
        });
      }
    };
    window.addEventListener('refreshPlanDefaults', onExternalSchoolYearChange);
    return () => window.removeEventListener('refreshPlanDefaults', onExternalSchoolYearChange);
  }, [familyId, preloadData]);

  useLayoutEffect(() => {
    if (!visible || !familyId) {
      setContentReady(false);
      return undefined;
    }
    const targetYear = String(initialSchoolYearLabel || '').trim();
    if (!targetYear) {
      setContentReady(false);
      return undefined;
    }
    setSchoolYearLabel(targetYear);
    schoolYearLabelRef.current = targetYear;
    setSavedSinceOpen(false);
    savedSinceOpenRef.current = false;
    let cancelled = false;
    setContentReady(false);
    (async () => {
      // Always refetch on open so Planner/Learning modal matches latest Settings saves.
      await preloadData(targetYear, { force: true });
      if (!cancelled) setContentReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, initialSchoolYearLabel, familyId, preloadData]);

  const handleClose = useCallback(() => {
    const closedYearLabel = String(schoolYearLabelRef.current || schoolYearLabel || '').trim();
    const saved = savedSinceOpenRef.current;
    planningModalActionsRef.current = null;
    setFooterState({ saving: false, readOnly: false });
    setContentReady(false);
    schoolYearLabelRef.current = null;
    setSchoolYearLabel(null);
    onClose?.();
    if (saved) {
      if (closedYearLabel) {
        setInitialDataByYear((prev) => {
          if (!prev || !prev[closedYearLabel]) return prev;
          const next = { ...prev };
          delete next[closedYearLabel];
          return next;
        });
      }
      toast.push('Saved', 'success');
      setSavedSinceOpen(false);
      savedSinceOpenRef.current = false;
    }
  }, [onClose, schoolYearLabel, toast]);

  const requestClose = useCallback(() => {
    if (isDatePickerModalOpen()) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerSettingsRequestClose'));
      return;
    }
    handleClose();
  }, [handleClose]);

  const handleSchoolYearChange = useCallback(async (newLabel) => {
    const label = String(newLabel || '').trim();
    if (!label) return;
    setSchoolYearLabel(label);
    schoolYearLabelRef.current = label;
    const cached = initialDataByYearRef.current[label];
    if (!cached) {
      setContentReady(false);
    }
    await preloadData(label);
    setContentReady(true);
  }, [preloadData]);

  if (!visible || !familyId) return null;

  const activeYear = String(schoolYearLabel || initialSchoolYearLabel || '').trim();
  const activeInitialData = activeYear
    ? (initialDataByYear[activeYear] || initialDataByYearRef.current[activeYear] || null)
    : null;

  return (
    <Modal
      visible
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={requestClose}
    >
      <View ref={overlayRef} style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            if (isDatePickerModalOpen()) return;
            requestClose();
          }}
        />
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.wrap}
        >
          <AppModalShell
            title={familyApproach === PLANNING_MODES.HOMESCHOOL_COMPLIANCE ? 'School Year Settings' : 'Schedule Settings'}
            onClose={requestClose}
            disableShellScroll
            maxWidth={MODAL_MAX_WIDTH}
            scrollerStyle={styles.scroller}
            shellStyle={[styles.shell, assignmentModalStyles.schoolYearSettingsModalShell]}
            bodyStyle={[styles.body, styles.scrollBody, assignmentModalStyles.schoolYearSettingsModalBody]}
            contentContainerStyle={styles.bodyContent}
            footer={(
              <ModalFooter
                mode="edit"
                primaryLabel={footerState.saving ? 'Saving...' : 'Save changes'}
                onCancel={() => planningModalActionsRef.current?.handleCancel?.()}
                onPrimary={() => planningModalActionsRef.current?.handleSave?.()}
                accent="#9ECFFB"
                disabled={footerState.saving || footerState.readOnly || !contentReady}
                loading={footerState.saving}
              />
            )}
          >
            {activeYear ? (
              <PlannerSettingsContent
                key={`planner-settings-${activeYear}`}
                familyId={familyId}
                initialData={activeInitialData}
                embeddedInModal
                hideEmbeddedHeader
                initialSchoolYearLabel={activeYear}
                onSchoolYearChange={handleSchoolYearChange}
                familyApproach={familyApproach}
                featureSettings={featureSettings}
                onEmbeddedModalActionsReady={(actions) => {
                  planningModalActionsRef.current = actions;
                }}
                onEmbeddedModalFooterStateChange={({ saving, readOnly }) => {
                  setFooterState((prev) => {
                    if (prev.saving === saving && prev.readOnly === readOnly) return prev;
                    return { saving, readOnly };
                  });
                }}
                onRequestClose={handleClose}
                onSave={() => {
                  const activeYearLabel = String(schoolYearLabelRef.current || schoolYearLabel || '').trim();
                  setSavedSinceOpen(true);
                  savedSinceOpenRef.current = true;
                  if (activeYearLabel) {
                    setInitialDataByYear((prev) => {
                      if (!prev || !prev[activeYearLabel]) return prev;
                      const next = { ...prev };
                      delete next[activeYearLabel];
                      return next;
                    });
                  }
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
                    window.dispatchEvent(new CustomEvent('refreshSubjects'));
                    window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
                    window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
                  }
                  onSaved?.();
                }}
              />
            ) : null}
          </AppModalShell>
        </TouchableOpacity>
      </View>
    </Modal>
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
  wrap: {
    width: 'auto',
    maxWidth: MODAL_MAX_WIDTH,
    alignSelf: 'center',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  shell: {
    maxWidth: MODAL_MAX_WIDTH,
    width: 'auto',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  scroller: {
    width: '100%',
    ...(Platform.OS === 'web' && {
      flex: 1,
      minHeight: 0,
    }),
  },
  body: {
    width: '100%',
    paddingTop: 0,
    ...(Platform.OS === 'web' && {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
    }),
  },
  scrollBody: {
    width: '100%',
    ...(Platform.OS === 'web' && {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
    }),
  },
  bodyContent: {
    width: '100%',
    paddingBottom: 8,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
    }),
  },
  loadingBody: {
    width: '100%',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
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
import {
  createModalStyles as assignmentModalStyles,
  SCHOOL_YEAR_SETTINGS_MODAL_MAX_WIDTH,
} from '../create/shared/createModalStyles';

const MODAL_MAX_WIDTH = SCHOOL_YEAR_SETTINGS_MODAL_MAX_WIDTH;

export default function SchoolYearSettingsModal({
  visible = false,
  onClose,
  familyId,
  initialSchoolYearLabel = null,
  onSaved,
}) {
  const toast = useToast();
  const planningModalActionsRef = useRef(null);
  const [schoolYearLabel, setSchoolYearLabel] = useState(null);
  const [initialDataByYear, setInitialDataByYear] = useState({});
  const initialDataByYearRef = useRef({});
  const [savedSinceOpen, setSavedSinceOpen] = useState(false);
  const savedSinceOpenRef = useRef(false);
  const schoolYearLabelRef = useRef(null);
  const [footerState, setFooterState] = useState({ saving: false, readOnly: false });

  useEffect(() => {
    savedSinceOpenRef.current = savedSinceOpen;
  }, [savedSinceOpen]);

  useEffect(() => {
    schoolYearLabelRef.current = String(schoolYearLabel || '').trim() || null;
  }, [schoolYearLabel]);

  useEffect(() => {
    initialDataByYearRef.current = initialDataByYear;
  }, [initialDataByYear]);

  const preloadData = useCallback(async (yearInput) => {
    const year = String(yearInput || '').trim();
    if (!familyId || !year) return null;
    const existing = initialDataByYearRef.current[year];
    if (existing && typeof existing === 'object') return existing;
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
      setInitialDataByYear((prev) => ({ ...prev, [year]: payload }));
      return payload;
    } catch (_) {
      return null;
    }
  }, [familyId]);

  useEffect(() => {
    if (!visible) return;
    const targetYear = String(initialSchoolYearLabel || '').trim();
    if (!targetYear) return;
    setSchoolYearLabel(targetYear);
    schoolYearLabelRef.current = targetYear;
    setSavedSinceOpen(false);
    savedSinceOpenRef.current = false;
    preloadData(targetYear);
  }, [visible, initialSchoolYearLabel, preloadData]);

  const handleClose = useCallback(() => {
    const closedYearLabel = String(schoolYearLabelRef.current || schoolYearLabel || '').trim();
    const saved = savedSinceOpenRef.current;
    planningModalActionsRef.current = null;
    setFooterState({ saving: false, readOnly: false });
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
    await preloadData(label);
  }, [preloadData]);

  if (!visible || !familyId) return null;

  const activeYear = String(schoolYearLabel || '').trim();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={requestClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={requestClose}
        />
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.wrap}
        >
          <AppModalShell
            title="School Year Settings"
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
                disabled={footerState.saving || footerState.readOnly}
                loading={footerState.saving}
              />
            )}
          >
            <PlannerSettingsContent
              familyId={familyId}
              initialData={activeYear ? (initialDataByYear[activeYear] || null) : null}
              embeddedInModal
              hideEmbeddedHeader
              initialSchoolYearLabel={activeYear || initialSchoolYearLabel}
              onSchoolYearChange={handleSchoolYearChange}
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
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    ...(Platform.OS === 'web' && {
      flex: 'none',
      minHeight: 'auto',
    }),
  },
  body: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    paddingTop: 0,
    ...(Platform.OS === 'web' && {
      flex: 'none',
      minHeight: 'auto',
      overflow: 'visible',
    }),
  },
  scrollBody: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    ...(Platform.OS === 'web' && {
      flex: 'none',
      overflow: 'visible',
    }),
  },
  bodyContent: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    paddingBottom: 8,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flex: 'none',
    }),
  },
});

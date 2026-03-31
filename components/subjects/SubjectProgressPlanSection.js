import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Pencil, Trash2, Calendar, Paperclip } from 'lucide-react';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import {
  findAcademicYearPlanForSubject,
  buildSubjectPlanSlotLines,
  eventExistsKey,
  formatDateDisplayYmd,
  findEventIdForPlanSlotSupabase,
} from '../../lib/subjectPlanSlotLines';
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import { clearPlaceholders, getEventForPlanSlot } from '../../lib/services/academicYearClient';
import { deleteEvent as deletePlannerEventSoft } from '../../lib/services/plannerClientWithOffline';
import { dropPlanYearFullDataCacheEntry } from '../../lib/planEditListCache';
import {
  getSubjectProgressCache,
  mergeSubjectProgressCache,
  invalidateSubjectProgressCache,
  invalidateSubjectProgressCacheForFamily,
} from '../../lib/subjectProgressPlanCache';
import { colors } from '../../theme/colors';
import { formatSubjectPlanHeading } from '../../lib/formatSubjectPlanHeading';

function dispatchOpenPlanModal(detail) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('openPlanYearModal', { detail }));
}

function dispatchOpenEventForPlanSlot(line) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('openEventForPlanSlot', {
      detail: {
        dateYmd: line.date,
        startLocal: line.startLocal,
        subjectId: line.subjectId,
        academicYearId: line.academicYearId,
        subjectName: line.subjectName,
      },
    })
  );
}

function normalizeLessonYmd(dateVal) {
  if (dateVal == null || dateVal === '') return null;
  const s = String(dateVal).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function openEventById(eventId) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !eventId) return;
  window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId } }));
}

function normLessonLabel(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-');
}

const webCursor = Platform.OS === 'web' ? { cursor: 'pointer' } : {};

/** Same calendar day + same unit/lesson as a plan row → one row is enough (plan line has time). */
function planSlotLessonFingerprint(line) {
  if (!line?.date) return null;
  const rawLt = (line.lessonTitle || '').trim();
  if (!rawLt || /available instructional slot/i.test(rawLt)) return null;
  const u = (line.unitTopic || '').trim();
  const combined = u ? `${u} ${rawLt}` : rawLt;
  return `${line.date}|${normLessonLabel(combined)}`;
}

function curriculumLessonFingerprint(ymd, unitTitle, lessonTitle) {
  if (!ymd) return null;
  const u = (unitTitle || '').trim();
  const l = (lessonTitle || '').trim();
  if (!u || !l) return null;
  return `${ymd}|${normLessonLabel(`${u} ${l}`)}`;
}

export default function SubjectProgressPlanSection({
  familyId,
  subjectId,
  subjectName,
  children = [],
  assignedChildIds = [],
  isParentViewer = true,
  onRefresh,
  onPlanContext,
}) {
  const toast = useToast();
  const subjectIdLiveRef = useRef(subjectId);
  const familyIdLiveRef = useRef(familyId);
  subjectIdLiveRef.current = subjectId;
  familyIdLiveRef.current = familyId;

  const [loadingPlan, setLoadingPlan] = useState(true);
  const [academicYearId, setAcademicYearId] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [slotLines, setSlotLines] = useState([]);

  const [loadingUnits, setLoadingUnits] = useState(true);
  const [curriculumUnits, setCurriculumUnits] = useState([]);

  const [showDeletePlanConfirm, setShowDeletePlanConfirm] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  /** Plan row `item.key` while resolving calendar event id for delete (no eventId on line yet). */
  const [planRowDeleteResolvingKey, setPlanRowDeleteResolvingKey] = useState(null);

  const planSectionHeading = useMemo(() => {
    const idSet = new Set((assignedChildIds || []).map(String));
    const names = (children || [])
      .filter((c) => c && idSet.has(String(c.id)))
      .map((c) => (c.first_name || c.name || '').trim())
      .filter(Boolean);
    return formatSubjectPlanHeading(names, subjectName);
  }, [children, assignedChildIds, subjectName]);

  const loadPlan = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    const reqFamilyId = familyId;
    const reqSubjectId = subjectId;
    if (!reqFamilyId || !reqSubjectId) return;
    if (!silent) setLoadingPlan(true);
    try {
      const { academicYearId: yid, planData: data } = await findAcademicYearPlanForSubject(reqFamilyId, reqSubjectId);
      if (
        String(subjectIdLiveRef.current) !== String(reqSubjectId) ||
        String(familyIdLiveRef.current) !== String(reqFamilyId)
      ) {
        return;
      }
      setAcademicYearId(yid);
      setPlanData(data);
      let nextLines = [];
      if (yid && data) {
        nextLines = buildSubjectPlanSlotLines(yid, data, reqSubjectId, subjectName || 'Subject');
        setSlotLines(nextLines);
      } else {
        setSlotLines([]);
      }
      mergeSubjectProgressCache(reqFamilyId, reqSubjectId, {
        academicYearId: yid,
        planData: data,
        slotLines: yid && data ? nextLines : [],
      });
    } catch (e) {
      console.warn('[SubjectProgressPlanSection] loadPlan', e);
      if (
        String(subjectIdLiveRef.current) !== String(reqSubjectId) ||
        String(familyIdLiveRef.current) !== String(reqFamilyId)
      ) {
        return;
      }
      setAcademicYearId(null);
      setPlanData(null);
      setSlotLines([]);
      mergeSubjectProgressCache(reqFamilyId, reqSubjectId, {
        academicYearId: null,
        planData: null,
        slotLines: [],
      });
    } finally {
      if (
        String(subjectIdLiveRef.current) === String(reqSubjectId) &&
        String(familyIdLiveRef.current) === String(reqFamilyId) &&
        !silent
      ) {
        setLoadingPlan(false);
      }
    }
  }, [familyId, subjectId, subjectName]);

  const loadUnits = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    const reqFamilyId = familyId;
    const reqSubjectId = subjectId;
    if (!reqFamilyId || !reqSubjectId) return;
    if (!silent) setLoadingUnits(true);
    try {
      const { data, error } = await fetchSubjectCurriculumEventsStructure(reqFamilyId, reqSubjectId);
      if (
        String(subjectIdLiveRef.current) !== String(reqSubjectId) ||
        String(familyIdLiveRef.current) !== String(reqFamilyId)
      ) {
        return;
      }
      if (error) {
        setCurriculumUnits([]);
        mergeSubjectProgressCache(reqFamilyId, reqSubjectId, { curriculumUnits: [] });
        return;
      }
      const units = data?.units;
      const nextUnits = Array.isArray(units) ? units : [];
      setCurriculumUnits(nextUnits);
      mergeSubjectProgressCache(reqFamilyId, reqSubjectId, { curriculumUnits: nextUnits });
    } catch (e) {
      if (
        String(subjectIdLiveRef.current) !== String(reqSubjectId) ||
        String(familyIdLiveRef.current) !== String(reqFamilyId)
      ) {
        return;
      }
      setCurriculumUnits([]);
      mergeSubjectProgressCache(reqFamilyId, reqSubjectId, { curriculumUnits: [] });
    } finally {
      if (
        String(subjectIdLiveRef.current) === String(reqSubjectId) &&
        String(familyIdLiveRef.current) === String(reqFamilyId) &&
        !silent
      ) {
        setLoadingUnits(false);
      }
    }
  }, [familyId, subjectId]);

  /** Hydrate from cache before paint to avoid skeleton flash when revisiting a subject. */
  useLayoutEffect(() => {
    if (!familyId || !subjectId) return;
    const c = getSubjectProgressCache(familyId, subjectId);
    if (c) {
      setAcademicYearId(c.academicYearId ?? null);
      setPlanData(c.planData ?? null);
      setSlotLines(Array.isArray(c.slotLines) ? c.slotLines : []);
      setCurriculumUnits(Array.isArray(c.curriculumUnits) ? c.curriculumUnits : []);
      setLoadingPlan(false);
      setLoadingUnits(false);
    } else {
      setAcademicYearId(null);
      setPlanData(null);
      setSlotLines([]);
      setCurriculumUnits([]);
      setLoadingPlan(true);
      setLoadingUnits(true);
    }
  }, [familyId, subjectId]);

  useEffect(() => {
    if (!familyId || !subjectId) return;
    const c = getSubjectProgressCache(familyId, subjectId);
    loadPlan({ silent: !!c });
    loadUnits({ silent: !!c });
  }, [familyId, subjectId, loadPlan, loadUnits]);

  const prevFamilyIdRef = useRef(familyId);
  useEffect(() => {
    const prev = prevFamilyIdRef.current;
    prevFamilyIdRef.current = familyId;
    if (prev && familyId && String(prev) !== String(familyId)) {
      invalidateSubjectProgressCacheForFamily(prev);
    }
  }, [familyId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e) => {
      if (e.detail?.subjectId === subjectId) {
        loadPlan({ silent: true });
        loadUnits({ silent: true });
      }
    };
    window.addEventListener('refreshSubjectDetail', h);
    return () => window.removeEventListener('refreshSubjectDetail', h);
  }, [subjectId, loadPlan, loadUnits]);

  const hasPlan = !!academicYearId && !!planData?.plan?.blocks?.some((b) => String(b.subject_id) === String(subjectId));
  const hasUnits = curriculumUnits.length > 0;

  const onPlanContextRef = useRef(onPlanContext);
  onPlanContextRef.current = onPlanContext;
  useEffect(() => {
    if (loadingPlan || loadingUnits) return;
    onPlanContextRef.current?.({ hasPlan, hasUnits });
  }, [loadingPlan, loadingUnits, hasPlan, hasUnits]);

  /**
   * Curriculum lessons not already represented on a plan row.
   * Dedup by event id when present, and by date + unit/lesson fingerprint when plan_event_dates
   * did not attach eventId to the slot line (common duplicate: curriculum row + timed plan row).
   */
  const curriculumOnlyRows = useMemo(() => {
    const usedEventIds = new Set(slotLines.map((l) => l.eventId).filter(Boolean).map((id) => String(id)));
    const planFingerprints = new Set(slotLines.map(planSlotLessonFingerprint).filter(Boolean));
    const sn = subjectName || 'Subject';
    const out = [];
    for (const unit of curriculumUnits) {
      const ut = (unit.title || '').trim() || 'Unit';
      for (const le of unit.lessons || []) {
        if (!le?.id) continue;
        if (usedEventIds.has(String(le.id))) continue;
        const ymd = normalizeLessonYmd(le.date);
        const unassigned = !ymd;
        const lessonTitle = (le.title || '').trim() || 'Lesson';
        if (!unassigned) {
          const fp = curriculumLessonFingerprint(ymd, ut, lessonTitle);
          if (fp && planFingerprints.has(fp)) continue;
        }
        out.push({
          key: `cur-${le.id}`,
          eventId: le.id,
          unitTitle: ut,
          lessonTitle,
          ymd,
          unassigned,
          subjectName: sn,
        });
      }
    }
    return out;
  }, [curriculumUnits, slotLines, subjectName]);

  /** Plan slots + curriculum rows, sorted by date (unassigned last). */
  const mergedScheduleRows = useMemo(() => {
    const planItems = slotLines.map((line) => ({
      kind: 'plan',
      key: `plan-${eventExistsKey(line.date, line.subjectId, line.startLocal)}`,
      line,
      sortKey: `${line.date}|${String(line.startLocal || '00:00').replace(/:/g, '')}`,
    }));
    const curItems = curriculumOnlyRows.map((r) => ({
      kind: 'curriculum',
      key: r.key,
      row: r,
      sortKey: r.unassigned ? `9999-12-31|${r.eventId}` : `${r.ymd}|0000|${r.eventId}`,
    }));
    return [...planItems, ...curItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [slotLines, curriculumOnlyRows]);

  /** True when the subject has curriculum lessons and/or dated plan rows that name a real lesson (not empty slots). */
  const hasUnitsOrLessonsContent = useMemo(() => {
    const apiLessons = curriculumUnits.some((u) =>
      (u.lessons || []).some((le) => le?.id != null)
    );
    if (apiLessons) return true;
    return mergedScheduleRows.some((item) => {
      if (item.kind === 'curriculum') return true;
      const lt = (item.line?.lessonTitle || '').trim();
      return lt.length > 0 && !/available instructional slot/i.test(lt);
    });
  }, [curriculumUnits, mergedScheduleRows]);

  const refreshPlanCaches = useCallback(() => {
    if (familyId && academicYearId) {
      dropPlanYearFullDataCacheEntry(familyId, academicYearId);
    }
    if (familyId && subjectId) {
      invalidateSubjectProgressCache(familyId, subjectId);
    }
    loadPlan({ silent: true });
    loadUnits({ silent: true });
    onRefresh?.();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
    }
  }, [familyId, academicYearId, subjectId, loadPlan, loadUnits, onRefresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!familyId || !subjectId) return;
    const handler = () => {
      refreshPlanCaches();
    };
    window.addEventListener('planAppliedToCalendar', handler);
    return () => window.removeEventListener('planAppliedToCalendar', handler);
  }, [familyId, subjectId, refreshPlanCaches]);

  const openBuildPlanModal = useCallback(() => {
    dispatchOpenPlanModal({
      from: 'subject_detail',
      subjectId,
      openAsModal: true,
      openDirectlyToScope: true,
    });
  }, [subjectId]);

  const openEditPlanModal = useCallback(() => {
    if (academicYearId) {
      dispatchOpenPlanModal({
        from: 'subject_detail',
        subjectId,
        academicYearId,
        openAsModal: true,
        openToEditList: false,
        skipPlanSummary: true,
      });
    } else {
      openBuildPlanModal();
    }
  }, [academicYearId, subjectId, openBuildPlanModal]);

  /** Same global curriculum flows as Edit Subject → Course structure (WebLayout modals). */
  const openCurriculumStructureAction = useCallback(
    (kind) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      const childIds =
        assignedChildIds.length > 0
          ? [...assignedChildIds]
          : (children || []).map((c) => c.id).filter(Boolean);
      const base = {
        subjectId: subjectId ?? null,
        subjectName: (subjectName || '').trim() || 'Subject',
        familyId,
        childIds,
      };
      if (kind === 'manual') {
        window.dispatchEvent(new CustomEvent('openManualCurriculumBuilderModal', { detail: base }));
      } else if (kind === 'paste') {
        window.dispatchEvent(new CustomEvent('openParsePlainTextModal', { detail: base }));
      } else if (kind === 'generate') {
        window.dispatchEvent(new CustomEvent('openGenerateCurriculumModal', { detail: base }));
      } else if (kind === 'upload') {
        window.dispatchEvent(new CustomEvent('openAddMaterialModal', { detail: { ...base, role: null } }));
      }
    },
    [subjectId, subjectName, familyId, assignedChildIds, children]
  );

  const handleDeletePlan = useCallback(async () => {
    if (!familyId || !academicYearId) return;
    setDeletingPlan(true);
    try {
      const { error } = await clearPlaceholders(familyId, academicYearId, { deletePlan: true });
      if (error) {
        toast.push(error.message || 'Could not delete plan.', 'error');
        return;
      }
      toast.push('Plan deleted.', 'success');
      setShowDeletePlanConfirm(false);
      setAcademicYearId(null);
      setPlanData(null);
      setSlotLines([]);
      dropPlanYearFullDataCacheEntry(familyId, academicYearId);
      invalidateSubjectProgressCache(familyId, subjectId);
      loadPlan({ silent: true });
      loadUnits({ silent: true });
      onRefresh?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
        window.dispatchEvent(new CustomEvent('planEditListPrefetchComplete', { detail: { familyId } }));
      }
    } finally {
      setDeletingPlan(false);
    }
  }, [familyId, academicYearId, subjectId, toast, loadPlan, loadUnits, onRefresh]);

  const requestDeletePlanRow = useCallback(
    async (line, rowKey) => {
      if (!familyId) return;
      let eventId = line?.eventId;
      if (!eventId && line?.academicYearId && line?.date != null && line?.subjectId != null) {
        setPlanRowDeleteResolvingKey(rowKey);
        try {
          const { data, error } = await getEventForPlanSlot({
            familyId,
            dateYmd: line.date,
            startLocal:
              line.startLocal != null && String(line.startLocal).trim() !== ''
                ? String(line.startLocal).trim()
                : undefined,
            subjectId: String(line.subjectId),
            academicYearId: String(line.academicYearId),
          });
          if (!error && data?.event?.id) {
            eventId = data.event.id;
          }
        } catch (_) {
          /* toast below */
        } finally {
          setPlanRowDeleteResolvingKey(null);
        }
      }
      if (!eventId && line?.date && line?.subjectId && familyId) {
        try {
          const fid = await findEventIdForPlanSlotSupabase({
            familyId,
            dateYmd: line.date,
            subjectId: line.subjectId,
            startLocal: line.startLocal,
          });
          if (fid) eventId = fid;
        } catch (_) {
          /* keep toast below */
        }
      }
      if (!eventId) {
        toast.push(
          'No calendar event for this slot yet. Use Edit plan to adjust your schedule, or apply the plan so lessons appear on the calendar.',
          'info'
        );
        return;
      }
      setRowPendingDelete({ ...line, eventId });
    },
    [familyId, toast]
  );

  const confirmDeleteRow = useCallback(async () => {
    const line = rowPendingDelete;
    if (!line?.eventId || !familyId) {
      setRowPendingDelete(null);
      return;
    }
    const { error } = await deletePlannerEventSoft(line.eventId, familyId);
    if (error) {
      toast.push(error.message || 'Could not remove this event.', 'error');
      return;
    }
    toast.push('Event removed.', 'success');
    setRowPendingDelete(null);
    refreshPlanCaches();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: line.eventId } }));
    }
  }, [rowPendingDelete, familyId, toast, refreshPlanCaches]);

  if (!isParentViewer) {
    return (
      <View style={styles.section}>
        <Text style={styles.muted}>Plan and curriculum tools are available to parents.</Text>
      </View>
    );
  }

  const bootstrapping = loadingPlan || loadingUnits;

  if (bootstrapping) {
    return (
      <View style={styles.section} accessibilityLabel="Loading plan and curriculum">
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonHeaderRow}>
            <ActivityIndicator size="small" color="#94a3b8" />
            <Text style={styles.skeletonLabel}>Loading plan and curriculum…</Text>
          </View>
          <View style={styles.skeletonBar} />
          <View style={[styles.skeletonBar, styles.skeletonBarShort]} />
          <View style={[styles.skeletonBar, styles.skeletonBarShorter]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {!hasPlan ? (
        <View style={styles.emptyStateBox}>
          <Text style={styles.emptyStateHint}>
            Start by scheduling this subject, or just organize your lessons.
          </Text>
          <TouchableOpacity
            style={[styles.planHeaderRoundedBtn, styles.buildPlanBtnAlign, styles.emptyStatePrimaryBtn]}
            onPress={openBuildPlanModal}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Build plan"
            {...webCursor}
          >
            <Calendar size={16} color={colors.accentContrast || '#ffffff'} strokeWidth={2} />
            <Text style={styles.emptyStatePrimaryBtnText}>Build plan</Text>
          </TouchableOpacity>
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              onPress={() => openCurriculumStructureAction('manual')}
              style={styles.emptyStateSecondaryLinkWrap}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel="Add units manually"
              {...webCursor}
            >
              <Text style={styles.emptyStateSecondaryLink}>Add units manually →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {mergedScheduleRows.length > 0 ? (
        <View style={styles.datesCard}>
          <View style={styles.datesCardHeaderRow}>
            <Text style={styles.tableTitle}>{planSectionHeading}</Text>
            <View style={styles.planHeaderActionGroup}>
              <TouchableOpacity
                style={styles.planHeaderRoundedBtn}
                onPress={openEditPlanModal}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Edit plan"
                {...webCursor}
              >
                <Pencil size={16} color="#64748b" strokeWidth={2} />
                <Text style={styles.planHeaderRoundedBtnText}>Edit plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.planHeaderRoundedBtn, deletingPlan && styles.btnDisabledSoft]}
                onPress={() => setShowDeletePlanConfirm(true)}
                disabled={deletingPlan}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Delete plan"
                {...webCursor}
              >
                <Trash2 size={16} color="#64748b" strokeWidth={2} />
                <Text style={styles.planHeaderRoundedBtnText}>Delete plan</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.tableBody}>
            {mergedScheduleRows.map((item) => {
              if (item.kind === 'plan') {
                const line = item.line;
                const text = [
                  line.dateLabel,
                  line.timeLabel,
                  line.subjectName,
                  line.unitTopic,
                  line.lessonTitle,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <View key={item.key} style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowTextWrap}
                      onPress={() => dispatchOpenEventForPlanSlot(line)}
                      disabled={!line.academicYearId}
                      {...webCursor}
                    >
                      <Text style={styles.rowText} numberOfLines={4}>
                        {text}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.rowActions}>
                      {line.hasAttachment ? (
                        <View style={styles.clipWrap}>
                          <Paperclip size={14} color="#64748b" />
                        </View>
                      ) : null}
                      <TouchableOpacity
                        style={styles.rowIconBtn}
                        onPress={() => dispatchOpenEventForPlanSlot(line)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel="Edit event"
                        {...webCursor}
                      >
                        <Pencil size={18} color="#64748b" strokeWidth={2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.rowIconBtn,
                          planRowDeleteResolvingKey === item.key && styles.rowIconBtnBusy,
                        ]}
                        onPress={() => requestDeletePlanRow(line, item.key)}
                        disabled={planRowDeleteResolvingKey === item.key}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel="Remove event from calendar"
                        {...webCursor}
                      >
                        {planRowDeleteResolvingKey === item.key ? (
                          <ActivityIndicator size="small" color="#64748b" />
                        ) : (
                          <Trash2 size={18} color="#64748b" strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }
              const r = item.row;
              const dateOrUnassigned = r.unassigned
                ? 'Unassigned'
                : formatDateDisplayYmd(r.ymd);
              const text = [dateOrUnassigned, r.subjectName, `${r.unitTitle} · ${r.lessonTitle}`].join(' · ');
              return (
                <View key={item.key} style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowTextWrap}
                    onPress={() => openEventById(r.eventId)}
                    {...webCursor}
                  >
                    <Text style={[styles.rowText, r.unassigned && styles.rowTextUnassigned]} numberOfLines={4}>
                      {text}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.rowIconBtn}
                      onPress={() => openEventById(r.eventId)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Edit event"
                      {...webCursor}
                    >
                      <Pencil size={18} color="#64748b" strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rowIconBtn}
                      onPress={() => setRowPendingDelete({ eventId: r.eventId })}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Remove event from calendar"
                      {...webCursor}
                    >
                      <Trash2 size={18} color="#64748b" strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
          {Platform.OS === 'web' ? (
            <View style={styles.unitsFooterRow}>
              <Text style={styles.unitsFooterLabel}>
                {hasUnitsOrLessonsContent ? 'Change units' : 'Add units'}
              </Text>
              <TouchableOpacity
                onPress={() => openCurriculumStructureAction('manual')}
                activeOpacity={0.7}
                {...webCursor}
              >
                <Text style={styles.unitsFooterLink}>Manual input</Text>
              </TouchableOpacity>
              <Text style={styles.unitsFooterSep}>·</Text>
              <TouchableOpacity
                onPress={() => openCurriculumStructureAction('paste')}
                activeOpacity={0.7}
                {...webCursor}
              >
                <Text style={styles.unitsFooterLink}>Paste plain text</Text>
              </TouchableOpacity>
              <Text style={styles.unitsFooterSep}>·</Text>
              <TouchableOpacity
                onPress={() => openCurriculumStructureAction('upload')}
                activeOpacity={0.7}
                {...webCursor}
              >
                <Text style={styles.unitsFooterLink}>Upload material</Text>
              </TouchableOpacity>
              <Text style={styles.unitsFooterSep}>·</Text>
              <TouchableOpacity
                onPress={() => openCurriculumStructureAction('generate')}
                activeOpacity={0.7}
                {...webCursor}
              >
                <Text style={styles.unitsFooterLink}>Generate curriculum</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : hasPlan ? (
        <>
          <View style={styles.fallbackPlanIconRow}>
            <TouchableOpacity
              style={styles.planHeaderRoundedBtn}
              onPress={openEditPlanModal}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Edit plan"
              {...webCursor}
            >
              <Pencil size={16} color="#64748b" strokeWidth={2} />
              <Text style={styles.planHeaderRoundedBtnText}>Edit plan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.planHeaderRoundedBtn, deletingPlan && styles.btnDisabledSoft]}
              onPress={() => setShowDeletePlanConfirm(true)}
              disabled={deletingPlan}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Delete plan"
              {...webCursor}
            >
              <Trash2 size={16} color="#64748b" strokeWidth={2} />
              <Text style={styles.planHeaderRoundedBtnText}>Delete plan</Text>
            </TouchableOpacity>
          </View>
          {hasPlan && !hasUnits ? (
            <Text style={styles.muted}>
              No scheduled dates in range yet. Open Edit plan to add blocks or apply to calendar.
            </Text>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        visible={showDeletePlanConfirm}
        title="Delete this plan?"
        message="This removes the plan configuration for this academic year. Calendar events created from the plan may need to be cleaned up separately."
        confirmLabel="Delete plan"
        destructive
        onCancel={() => setShowDeletePlanConfirm(false)}
        onConfirm={handleDeletePlan}
      />

      <ConfirmDialog
        visible={!!rowPendingDelete}
        title="Remove from calendar?"
        message="Delete this scheduled event? You can restore it from trash in the planner if needed."
        confirmLabel="Remove"
        destructive
        onCancel={() => setRowPendingDelete(null)}
        onConfirm={confirmDeleteRow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
  },
  emptyStateBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    marginBottom: 12,
  },
  buildPlanBtnAlign: {
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  emptyStateHint: {
    fontSize: 14,
    color: colors.muted || '#6B7280',
    lineHeight: 20,
    marginTop: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Match Materials Snapshot “Add syllabus / Add lesson plan” chip (SubjectDetailPage materialsAddCta). */
  emptyStatePrimaryBtn: {
    backgroundColor: colors.accent || '#0d9488',
    borderColor: colors.accent || '#0d9488',
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  emptyStatePrimaryBtnText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.accentContrast || '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateSecondaryLinkWrap: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 4,
  },
  emptyStateSecondaryLink: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent || '#0d9488',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  skeletonWrap: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  skeletonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  skeletonLabel: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  skeletonBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
    marginBottom: 10,
    width: '100%',
  },
  skeletonBarShort: {
    width: '78%',
  },
  skeletonBarShorter: {
    width: '52%',
  },
  muted: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
  datesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    overflow: 'visible',
    ...(Platform.OS === 'web' && { zIndex: 1 }),
  },
  datesCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    position: 'relative',
    zIndex: 2,
    overflow: 'visible',
  },
  planHeaderActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
    maxWidth: '100%',
  },
  planHeaderRoundedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    backgroundColor: '#f8fafc',
  },
  planHeaderRoundedBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  btnDisabledSoft: {
    opacity: 0.5,
  },
  fallbackPlanIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    overflow: 'visible',
    ...(Platform.OS === 'web' && { zIndex: 1 }),
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tableBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
    position: 'relative',
    zIndex: 0,
  },
  unitsFooterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingTop: 14,
    gap: 0,
  },
  unitsFooterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsFooterLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsFooterSep: {
    fontSize: 14,
    color: '#9ca3af',
    marginHorizontal: 6,
    fontWeight: '400',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.25)',
    gap: 10,
    position: 'relative',
    zIndex: 0,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowText: {
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowTextUnassigned: {
    color: '#475569',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 0,
    position: 'relative',
    zIndex: 0,
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  clipWrap: {
    paddingRight: 4,
  },
  rowIconBtn: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  rowIconBtnBusy: {
    opacity: 0.65,
  },
});

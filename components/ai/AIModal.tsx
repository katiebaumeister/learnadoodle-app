'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, Animated, Easing } from 'react-native';
import { Check, Circle, XCircle, AlertTriangle, Loader } from 'lucide-react';
import ReviewList, { ProposedChange } from './ReviewList';
import EmptyPanel from './EmptyPanel';
import AppliedPanel from './AppliedPanel';
import { track } from '../../lib/telemetry';

export type AIResult = {
  changeCount: number;
  changes: ProposedChange[];
  suggestions?: string[];
  diagnostics?: { utilizationPct?: number; idleBlocks?: string[] };
  zeroReason?: string;
  planId?: string | null;
};

export type ApplyResult = { applied: number; failed: number; ids?: string[] };

export type AIModalProps = {
  title: string;
  context: { windowStart: string; windowEnd: string; childNames: string[] };
  run: () => Promise<AIResult>;
  apply: (changes: ProposedChange[]) => Promise<ApplyResult>;
  onClose: () => void;
};

type ModalStatus = 'loading' | 'preview' | 'empty' | 'error' | 'applying' | 'applied';

type RunState = {
  result: AIResult | null;
  error?: string;
};

const STEP_LABELS = ['Run', 'Review', 'Apply'];

const buildContextSummary = (context: AIModalProps['context']) => {
  const dateRange = `${context.windowStart} → ${context.windowEnd}`;
  const names = context.childNames.length > 0 ? context.childNames.join(', ') : 'All children';
  return `${dateRange} • ${names}`;
};

const getActiveStep = (status: ModalStatus, hasChanges: boolean) => {
  if (status === 'loading') return 0;
  if (status === 'error') return 0;
  if (status === 'applied') return 2;
  if (status === 'applying') return 2;
  if (!hasChanges && status === 'empty') return 1;
  return 1;
};

const AIModal: React.FC<AIModalProps> = ({ title, context, run, apply, onClose }) => {
  const [status, setStatus] = useState<ModalStatus>('loading');
  const [runState, setRunState] = useState<RunState>({ result: null });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [toast, setToast] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(40)).current;
  const progressTranslate = useRef(new Animated.Value(-120)).current;
  const spinnerScale = useRef(new Animated.Value(1)).current;
  const hasRunRef = useRef(false);
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const spinnerAnim = useRef<Animated.CompositeAnimation | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslate, {
        toValue: 0,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, cardTranslate]);

  useEffect(() => {
    if (progressVisible) {
      console.log('[AIModal] progress animation start');
      progressTranslate.setValue(-120);
      if (progressAnim.current) {
        progressAnim.current.stop();
      }
      progressAnim.current = Animated.loop(
        Animated.timing(progressTranslate, {
          toValue: 220,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      progressAnim.current.start();
    } else if (progressAnim.current) {
      console.log('[AIModal] progress animation stop');
      progressAnim.current.stop();
      progressAnim.current = null;
      progressTranslate.setValue(-120);
    }
  }, [progressVisible, progressTranslate]);

  useEffect(() => {
    if (status === 'applying') {
      spinnerScale.setValue(1);
      if (spinnerAnim.current) spinnerAnim.current.stop();
      spinnerAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(spinnerScale, { toValue: 0.85, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(spinnerScale, { toValue: 1.1, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      spinnerAnim.current.start();
    } else {
      console.log('[AIModal] spinner animation stop');
      if (spinnerAnim.current) {
        spinnerAnim.current.stop();
        spinnerAnim.current = null;
      }
      spinnerScale.setValue(1);
    }
  }, [status, spinnerScale]);

  const hasChanges = (runState.result?.changeCount || 0) > 0;
  const contextSummary = useMemo(() => buildContextSummary(context), [context]);
  const busy = status === 'loading' || status === 'applying';

  const showToast = useCallback((type: 'info' | 'success' | 'error', message: string, durationMs: number = 2800) => {
    console.log('[AIModal] toast', type, message);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToast({ type, message });
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, durationMs);
    });
  }, [toastOpacity]);

  useEffect(() => {
    console.log('[AIModal] busy state changed', busy);
    if (busy) {
      console.log('[AIModal] progress -> visible');
      setProgressVisible(true);
    } else {
      console.log('[AIModal] progress -> hiding with delay');
      const timer = setTimeout(() => {
        console.log('[AIModal] progress -> hidden');
        setProgressVisible(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [busy]);

  useEffect(() => () => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      return [...prev, id];
    });
  }, []);

  const closeDisabled = status === 'applying';

  const executeRun = useCallback(async () => {
    setStatus('loading');
    setRunState({ result: null });
    setPlanId(null);
    showToast('info', 'Analyzing planner…', 1400);
    console.log('[AIModal] executeRun -> loading');
    try {
      const started = Date.now();
      const result = await run();
      console.log('[AIModal] run success', result.changeCount);
      const elapsed = Date.now() - started;
      if (elapsed < 450) {
        await new Promise(resolve => setTimeout(resolve, 450 - elapsed));
      }
      setRunState({ result });
      if (result.planId) setPlanId(result.planId);
      if (result.changeCount > 0) {
        setSelectedIds(result.changes.map(change => change.id));
        setStatus('preview');
        if (hasRunRef.current) {
          showToast('success', 'New plan generated!');
        }
      } else {
        setSelectedIds([]);
        setStatus('empty');
        showToast('info', hasRunRef.current ? 'Still all clear!' : 'Great news — nothing needs to move.');
      }
      track('ai_modal_run_complete', { change_count: result.changeCount });
    } catch (err) {
      const message = (err as Error).message || 'Failed to run planner';
      console.log('[AIModal] run error', message);
      setRunState({ result: null, error: message });
      setStatus('error');
      showToast('error', message);
      track('ai_modal_error', { phase: 'run', message });
    } finally {
      hasRunRef.current = true;
    }
  }, [run, showToast]);

  useEffect(() => {
    executeRun();
  }, [executeRun]);

  const visibleChanges = useMemo(() => (runState.result?.changes || []).filter(change => selectedIds.includes(change.id)), [runState.result, selectedIds]);

  const handleApply = useCallback(async () => {
    if (!runState.result) {
      onClose();
      return;
    }
    if (visibleChanges.length === 0) {
      onClose();
      return;
    }

    console.log('[AIModal] handleApply start');
    setStatus('applying');
    try {
      const selectedChanges = runState.result.changes.filter(change => selectedIds.includes(change.id)).map(change => ({ ...change, planId: planId || change.planId }));
      const applyResult = await apply(selectedChanges);
      console.log('[AIModal] apply result', applyResult);
      setAppliedIds(applyResult.ids || selectedChanges.map(change => change.id));
      setStatus('applied');
      showToast('success', `Scheduled ${applyResult.applied} change${applyResult.applied === 1 ? '' : 's'}.`);
      track('ai_modal_apply_complete', { applied: applyResult.applied, failed: applyResult.failed });
      showToast('info', 'Re-running AI…', 1600);
      executeRun();
    } catch (error) {
      const message = (error as Error).message || 'Failed to apply changes';
      setRunState(prev => ({ ...prev, error: message }));
      setStatus('error');
      showToast('error', message);
      console.log('[AIModal] apply error', message);
      track('ai_modal_error', { phase: 'apply', message });
    }
  }, [runState.result, selectedIds, apply, planId, executeRun, visibleChanges.length, onClose, showToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) {
        handleClose();
      }
      if (event.key === 'Enter' && status === 'review' && selectedIds.length > 0 && !busy) {
        handleApply();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    return () => {};
  }, [closeDisabled, status, selectedIds, busy, handleApply]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: 30, duration: 180, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        onClose();
      }
    });
  }, [cardTranslate, overlayOpacity, onClose, isClosing]);

  const renderStepper = () => {
    const activeStep = getActiveStep(status, hasChanges);
    return (
      <View style={styles.stepperContainer}>
        {STEP_LABELS.map((label, index) => {
          const isActive = index === activeStep;
          const isCompleted = status === 'applied' && index <= activeStep;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepIcon, isActive && styles.stepIconActive, isCompleted && styles.stepIconCompleted]}>
                {isCompleted ? <Check size={14} color="#ffffff" /> : <Circle size={14} color={isActive ? '#2563eb' : '#9ca3af'} />}
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{label}</Text>
              {index < STEP_LABELS.length - 1 && <View style={styles.stepDivider} />}
            </View>
          );
        })}
      </View>
    );
  };

  const renderLoading = () => (
    <View style={styles.contentBody}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.loadingText}>Analyzing schedule and capacity…</Text>
      </View>
      <View style={styles.skeletonContainer}>
        {[...Array(4)].map((_, idx) => (
          <View key={`skeleton-${idx}`} style={styles.skeletonRow} />
        ))}
      </View>
    </View>
  );

  const renderError = () => (
    <View style={styles.contentBody}>
      <View style={styles.errorContainer}>
        <View style={styles.errorBadge}>
          <AlertTriangle size={16} color="#b91c1c" />
          <Text style={styles.errorBadgeText}>Planner run failed</Text>
        </View>
        <Text style={styles.errorMessage}>{runState.error || 'Something went wrong while running the planner. Please try again.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => executeRun() }>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.contentBody}>
      <EmptyPanel
        zeroReason={runState.result?.zeroReason}
        onAction={(action) => {
          if (action === 'scan6') {
            showToast('info', 'Re-running AI…', 1600);
            executeRun();
          } else if (action === 'topoff') {
            showToast('info', 'Re-running AI…', 1600);
            executeRun();
          } else {
            showToast('info', 'Tune planner coming soon.');
          }
        }}
      />
    </View>
  );

  const renderReview = () => (
    <View style={styles.contentBody}>
      <ReviewList
        items={runState.result?.changes || []}
        appliedIds={appliedIds}
        selectedIds={selectedIds}
        onToggle={toggleSelection}
      />
    </View>
  );

  const renderApplied = () => (
    <View style={styles.contentBody}>
      <AppliedPanel
        appliedCount={appliedIds.length}
        labels={(runState.result?.changes || []).filter(change => appliedIds.includes(change.id)).map(change => change.label)}
        onViewAll={() => {
          showToast('info', 'View Activity coming soon.');
        }}
      />
      {renderReview()}
    </View>
  );

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return renderLoading();
      case 'error':
        return renderError();
      case 'empty':
        return renderEmpty();
      case 'review':
        return renderReview();
      case 'applied':
        return renderApplied();
      case 'applying':
        return renderReview();
      default:
        return null;
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      <View style={styles.centerWrap}>
        <Animated.View style={[styles.container, { transform: [{ translateY: cardTranslate }] }]}>
          {progressVisible && (
            <View style={styles.progressBar}>
              <Animated.View
                style={[styles.progressFill, {
                  transform: [{ translateX: progressTranslate }],
                }]}
              />
            </View>
          )}

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{contextSummary}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} disabled={closeDisabled}>
              <XCircle size={20} color={closeDisabled ? '#d1d5db' : '#6b7280'} />
            </TouchableOpacity>
          </View>

          {renderStepper()}
          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {busy && (
              <View style={styles.inlineStatus}>
                <Loader size={14} color="#2563eb" />
                <Text style={styles.inlineStatusText}>Planner is working…</Text>
              </View>
            )}
            {renderContent()}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerHint}>
              {hasChanges ? `${visibleChanges.length} selected` : '0 of 0 approved'}
            </Text>
            <View style={styles.footerActions}>
              <TouchableOpacity style={[styles.cancelButton, closeDisabled && styles.buttonDisabled]} onPress={handleClose} disabled={closeDisabled}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, (status === 'loading' || status === 'applying') && styles.buttonDisabled]}
                onPress={handleApply}
                disabled={status === 'loading' || status === 'applying'}
              >
                {status === 'applying' ? (
                  <View style={styles.primaryContent}>
                    <Animated.View style={[styles.spinnerDot, { transform: [{ scale: spinnerScale }] }]} />
                    <Text style={styles.primaryText}>Applying…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryText}>
                    {hasChanges ? `Apply ${visibleChanges.length} Changes` : 'Apply 0 Changes'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
      {toast && (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastOpacity }] }>
          <Text style={[styles.toastText, toast.type === 'success' && styles.toastSuccess, toast.type === 'error' && styles.toastError]}>{toast.message}</Text>
        </Animated.View>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17,24,39,0.3)',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 720,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 45,
    elevation: 12,
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#bfdbfe',
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 120,
    height: '100%',
    backgroundColor: '#2563eb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: Platform.OS === 'web' ? 'Outfit' : undefined,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  stepIconActive: {
    backgroundColor: '#2563eb1a',
  },
  stepIconCompleted: {
    backgroundColor: '#2563eb',
  },
  stepLabel: {
    marginLeft: 8,
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  stepLabelActive: {
    color: '#2563eb',
    fontWeight: '500',
  },
  stepDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8,
  },
  scrollBody: {
    maxHeight: 380,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 12,
  },
  contentBody: {
    gap: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#475569',
  },
  skeletonContainer: {
    gap: 12,
    marginTop: 8,
  },
  skeletonRow: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  errorContainer: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 12,
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBadgeText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 14,
  },
  errorMessage: {
    color: '#991b1b',
    fontSize: 13,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  retryButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  footerHint: {
    fontSize: 13,
    color: '#64748b',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  cancelText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    minWidth: 170,
  },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  spinnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  toast: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  toastText: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(37,99,235,0.95)',
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  toastSuccess: {
    backgroundColor: 'rgba(5,150,105,0.95)',
  },
  toastError: {
    backgroundColor: 'rgba(220,38,38,0.95)',
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  inlineStatusText: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '500',
  },
});

export default AIModal;

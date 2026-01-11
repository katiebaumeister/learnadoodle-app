/**
 * PlannerDiffModal
 * Modal showing schedule reschedule diffs with timeline visualization
 * Opens automatically when backend returns diff array
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { X, Check, RotateCcw } from 'lucide-react';
import { usePlannerDiffStore, DiffItem } from '../../state/usePlannerDiffStore';
import PlannerDiffTimelineItem from './PlannerDiffTimelineItem';
import { logApplyReschedule, logUndoReschedule } from '../../services/plannerInstrumentation';

// Import API client
// Import API client - adjust path based on your file structure
// The undo API function is defined in lib/apiClient.js
const undoLastReschedule = async () => {
  const REACT_APP_API_URL = typeof process !== 'undefined' && process.env ? process.env.REACT_APP_API_URL : '';
  try {
    const response = await fetch(`${REACT_APP_API_URL || ''}/api/schedule/undo_last_reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: new Error(errorText || response.statusText) };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

interface ChildLookup {
  [childId: string]: { name: string };
}

interface SubjectLookup {
  [subjectId: string]: { name: string };
}

export default function PlannerDiffModal({
  children = [],
  subjects = [],
  onAccept,
  onUndoComplete,
}: {
  children?: Array<{ id: string; first_name?: string; name?: string }>;
  subjects?: Array<{ id: string; name: string }>;
  onAccept?: () => void;
  onUndoComplete?: () => void;
}) {
  const { diffItems, modalOpen, closeModal, clearDiff, setDiffItems } = usePlannerDiffStore();
  const [undoing, setUndoing] = useState(false);

  // Listen for schedule diff events from AdjustScheduleModal
  React.useEffect(() => {
    const handleScheduleDiff = (event: CustomEvent) => {
      if (event.detail?.diff && Array.isArray(event.detail.diff)) {
        setDiffItems(event.detail.diff);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('scheduleDiffAvailable', handleScheduleDiff as EventListener);
      return () => {
        window.removeEventListener('scheduleDiffAvailable', handleScheduleDiff as EventListener);
      };
    }
  }, [setDiffItems]);

  // Build lookup maps
  const childLookup: ChildLookup = useMemo(() => {
    const lookup: ChildLookup = {};
    children.forEach((child) => {
      lookup[child.id] = {
        name: child.first_name || child.name || 'Child',
      };
    });
    return lookup;
  }, [children]);

  const subjectLookup: SubjectLookup = useMemo(() => {
    const lookup: SubjectLookup = {};
    subjects.forEach((subject) => {
      lookup[subject.id] = { name: subject.name };
    });
    return lookup;
  }, [subjects]);

  // Group diffs by child_id
  const groupedDiffs = useMemo(() => {
    const groups: { [childId: string]: DiffItem[] } = {};
    
    diffItems.forEach((diff) => {
      const childId = diff.child_id;
      if (!groups[childId]) {
        groups[childId] = [];
      }
      groups[childId].push(diff);
    });
    
    return groups;
  }, [diffItems]);

  const handleUndo = async () => {
    if (undoing) return;
    
    setUndoing(true);
    try {
      const { data, error } = await undoLastReschedule();
      
      if (error) {
        throw error;
      }

      // Log undo reschedule action
      const eventIds = diffItems.map(diff => diff.new_event?.id || diff.old_event?.id).filter(Boolean);
      logUndoReschedule(eventIds);

      // Clear diffs and close modal
      clearDiff();
      
      if (onUndoComplete) {
        onUndoComplete();
      }
    } catch (error: any) {
      // Show error toast or alert
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert(error?.message || 'Failed to undo reschedule. Please try again.');
      }
    } finally {
      setUndoing(false);
    }
  };

  const handleAccept = () => {
    // Log apply reschedule action
    const eventIds = diffItems.map(diff => diff.new_event?.id).filter(Boolean);
    logApplyReschedule(eventIds, diffItems.length);
    
    closeModal();
    if (onAccept) {
      onAccept();
    }
  };

  const handleClose = () => {
    closeModal();
  };

  if (!modalOpen || !diffItems || diffItems.length === 0) {
    return null;
  }

  const childIds = Object.keys(groupedDiffs);
  const totalDiffs = diffItems.length;

  return (
    <Modal
      visible={modalOpen}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Schedule Changes</Text>
              <Text style={styles.subtitle}>
                {totalDiffs} {totalDiffs === 1 ? 'event' : 'events'} rescheduled
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
          >
            {childIds.map((childId) => {
              const childDiffs = groupedDiffs[childId];
              const childName = childLookup[childId]?.name || 'Child';

              return (
                <View key={childId} style={styles.childGroup}>
                  <Text style={styles.childName}>{childName}</Text>
                  {childDiffs.map((diff, index) => (
                    <PlannerDiffTimelineItem
                      key={`${diff.task_id || diff.year_plan_id || index}-${index}`}
                      diff={diff}
                      subjectName={diff.subject_id ? subjectLookup[diff.subject_id]?.name : undefined}
                      childName={childName}
                    />
                  ))}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleUndo}
              disabled={undoing}
              accessibilityRole="button"
              {...(Platform.OS === 'web' ? { className: 'btnSecondary' } : {})}
            >
              {undoing ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <>
                  <RotateCcw size={16} color={Platform.OS === 'web' ? 'rgba(17,24,39,.92)' : '#6B7280'} />
                  <Text style={styles.buttonSecondaryText}>Undo</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footerRight}>
              <TouchableOpacity
                style={[styles.button, styles.buttonTertiary]}
                onPress={handleClose}
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { className: 'btnSecondary' } : {})}
              >
                <Text style={styles.buttonTertiaryText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleAccept}
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { className: 'btnPrimary' } : {})}
              >
                <Check size={16} color={Platform.OS === 'web' ? 'white' : '#FFFFFF'} />
                <Text style={styles.buttonPrimaryText}>Accept Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  modalContainer: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  childGroup: {
    marginBottom: 24,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  footerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // On web, btnPrimary/btnSecondary classes handle styling
    ...(Platform.OS === 'web' ? {
      height: 44,
      minWidth: 100,
    } : {
    paddingVertical: 10,
    paddingHorizontal: 16,
      borderRadius: 14,
    gap: 6,
    minWidth: 100,
    }),
  },
  buttonPrimary: {
    // On web, btnPrimary class handles styling
    ...(Platform.OS === 'web' ? {} : {
      backgroundColor: 'rgba(17,24,39,.92)',
    }),
  },
  buttonPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    // On web, CSS handles color
    ...(Platform.OS === 'web' ? {} : {
      color: '#FFFFFF',
    }),
  },
  buttonSecondary: {
    // On web, btnSecondary class handles styling
    ...(Platform.OS === 'web' ? {} : {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
      borderColor: 'rgba(17,24,39,.08)',
    }),
  },
  buttonSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    // On web, CSS handles color
    ...(Platform.OS === 'web' ? {} : {
      color: 'rgba(17,24,39,.92)',
    }),
  },
  buttonTertiary: {
    // On web, btnSecondary class handles styling
    ...(Platform.OS === 'web' ? {} : {
    backgroundColor: 'transparent',
    }),
  },
  buttonTertiaryText: {
    fontSize: 15,
    fontWeight: '600',
    // On web, CSS handles color
    ...(Platform.OS === 'web' ? {} : {
      color: 'rgba(17,24,39,.72)',
    }),
  },
});


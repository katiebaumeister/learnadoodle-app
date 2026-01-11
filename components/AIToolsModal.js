import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react';
import SuperpowerModal from './ai/SuperpowerModal';
import AIModal from './AIModal';
import PackWeekModal from './ai/PackWeekModal';
import { proposeReschedule } from '../lib/apiClient';

export default function AIToolsModal({ 
  visible, 
  onClose, 
  familyId, 
  children = [],
  onPlanYear,
  onHeatmap,
  onPackWeek,
  onCatchUp,
  onSummarizeProgress,
  onAnalytics,
  onWhatIfAnalysis,
}) {
  const [showSuperpowerModal, setShowSuperpowerModal] = useState(false);
  const [selectedSuperpower, setSelectedSuperpower] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [activeChildIds, setActiveChildIds] = useState([]);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalKey, setAiModalKey] = useState(null);
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);

  // Memoize superpowers array to prevent recreation on every render
  const superpowers = useMemo(() => [
    {
      id: 'fix-my-week',
      title: 'Fix My Week',
      description: 'Things got messy. Help me tidy and catch up.',
      modes: [
        {
          id: 'rebalance',
          title: 'Rebalance',
          description: 'Spread work more evenly so no day feels overloaded.',
          tagline: 'Good when week feels uneven',
          requires: () => true,
        },
        {
          id: 'catch-up',
          title: 'Catch Up',
          description: 'Find missed or overdue work and suggest a realistic catch-up plan.',
          tagline: 'Good when you\'ve missed days',
          requires: () => onCatchUp !== undefined,
        },
        {
          id: 'pack-week',
          title: 'Pack This Week',
          description: 'Fill open time this week with useful learning tasks from your backlog.',
          tagline: 'Make the most of the time you do have',
          requires: () => onPackWeek !== undefined,
        },
      ],
    },
    {
      id: 'plan-ahead',
      title: 'Plan Ahead',
      description: 'Help me think beyond just this week.',
      modes: [
        {
          id: 'plan-year',
          title: 'Plan the Year',
          description: 'Lay out a high-level plan for the whole year or term.',
          tagline: 'A bird\'s-eye view of the year, made practical',
          requires: () => onPlanYear !== undefined,
        },
        {
          id: 'what-if',
          title: 'What-If Scenarios',
          description: 'Test changes—like a new co-op day or a long trip—without touching your real calendar.',
          tagline: 'Try ideas safely before committing',
          requires: () => onWhatIfAnalysis !== undefined,
        },
      ],
    },
    {
      id: 'understand-progress',
      title: 'Understand Our Progress',
      description: 'Are we on track? What\'s working? What needs a tweak?',
      modes: [
        {
          id: 'summarize-progress',
          title: 'Progress Snapshot',
          description: 'A plain-language overview of what each child has been working on and how it\'s going.',
          tagline: 'From raw logs to a story you can actually read',
          requires: () => onSummarizeProgress !== undefined,
        },
        {
          id: 'analytics',
          title: 'Learning Analytics',
          description: 'Charts and numbers for hours, streaks, and subject balance.',
          tagline: 'See patterns over weeks and months',
          requires: () => onAnalytics !== undefined,
        },
        {
          id: 'heatmap',
          title: 'Curriculum Heatmap',
          description: 'Where has our effort gone this term?',
          tagline: 'Visualize subject coverage over time',
          requires: () => onHeatmap !== undefined,
        },
      ],
    },
  ], [onPlanYear, onHeatmap, onPackWeek, onCatchUp, onSummarizeProgress, onAnalytics, onWhatIfAnalysis]);

  const runRebalance = useCallback(async () => {
    if (!familyId) {
      return [];
    }
    
    // Use selected children or all children if none selected
    const childIdsToUse = activeChildIds.length > 0 
      ? activeChildIds 
      : children.map(c => c.id).filter(Boolean);

    if (childIdsToUse.length === 0) {
      throw new Error('No children available for scheduling');
    }
    
    try {
      const apiStartTime = Date.now();
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: childIdsToUse,
        horizonWeeks: 2,
        reason: 'rebalance',
      });
      
      const apiDuration = Date.now() - apiStartTime;

      if (result.error) throw result.error;
      
      // Transform API response to suggestion format
      // API returns: { proposal: { adds: [], moves: [], deletes: [] }, changes: [...] }
      const proposal = result.data?.proposal || {};
      const persistedChanges = result.data?.changes || [];

      const suggestions = [];
      
      // Transform persisted changes directly (more reliable than matching with proposal)
      persistedChanges.forEach((change, idx) => {
        const payload = change.payload || {};
        const changeType = change.change_type;
        
        if (changeType === 'add') {
          suggestions.push({
            id: change.id || `add-${idx}`,
            title: payload.title || 'New Event',
            proposedStart: payload.start,
            proposedEnd: payload.end,
            notes: `Add: ${payload.title || 'New event'}`,
            childId: payload.child_id,
            changeType: 'add',
            changeId: change.id, // Store for approval
          });
        } else if (changeType === 'move') {
          suggestions.push({
            id: change.id || `move-${idx}`,
            title: payload.reason || 'Move Event',
            proposedStart: payload.to_start,
            proposedEnd: payload.to_end,
            notes: `Move: ${payload.reason || 'Reschedule event'}`,
            eventId: payload.event_id || change.event_id,
            fromStart: payload.from_start,
            fromEnd: payload.from_end,
            changeType: 'move',
            changeId: change.id, // Store for approval
          });
        } else if (changeType === 'delete') {
          suggestions.push({
            id: change.id || `delete-${idx}`,
            title: payload.reason || 'Delete Event',
            proposedStart: null,
            proposedEnd: null,
            notes: `Delete: ${payload.reason || 'Remove event'}`,
            eventId: payload.event_id || change.event_id,
            changeType: 'delete',
            changeId: change.id, // Store for approval
          });
        }
      });

      return suggestions;
    } catch (err) {
      // Provide more helpful error messages
      if (err.message?.includes('rate_limit') || err.message?.includes('429')) {
        throw new Error('OpenAI rate limit reached. Please wait a moment and try again.');
      }
      throw new Error(err.message || 'Failed to rebalance schedule');
    }
  }, [familyId, activeChildIds, children]);

  const runWhatIf = useCallback(async () => {
    if (!familyId) return [];
    // Use selected children or all children if none selected
    const childIdsToUse = activeChildIds.length > 0 
      ? activeChildIds 
      : children.map(c => c.id).filter(Boolean);
    
    if (childIdsToUse.length === 0) {
      return []; // Return empty for what-if if no children
    }
    
    try {
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: childIdsToUse,
        horizonWeeks: 2,
        reason: 'what_if',
      });
      
      if (result.error) throw result.error;
      
      // Transform API response to suggestion format
      const proposal = result.data?.proposal || {};
      const persistedChanges = result.data?.changes || [];
      
      const suggestions = [];
      
      // Transform persisted changes directly (more reliable than matching with proposal)
      persistedChanges.forEach((change, idx) => {
        const payload = change.payload || {};
        const changeType = change.change_type;
        
        if (changeType === 'add') {
          suggestions.push({
            id: change.id || `whatif-add-${idx}`,
            title: payload.title || 'What-if Event',
            proposedStart: payload.start,
            proposedEnd: payload.end,
            notes: `What-if: ${payload.title || 'New scenario'}`,
            childId: payload.child_id,
            changeType: 'add',
            changeId: change.id,
          });
        } else if (changeType === 'move') {
          suggestions.push({
            id: change.id || `whatif-move-${idx}`,
            title: payload.reason || 'What-if Move',
            proposedStart: payload.to_start,
            proposedEnd: payload.to_end,
            notes: `What-if: ${payload.reason || 'Alternative schedule'}`,
            eventId: payload.event_id || change.event_id,
            fromStart: payload.from_start,
            fromEnd: payload.from_end,
            changeType: 'move',
            changeId: change.id,
          });
        } else if (changeType === 'delete') {
          suggestions.push({
            id: change.id || `whatif-delete-${idx}`,
            title: payload.reason || 'What-if Delete',
            proposedStart: null,
            proposedEnd: null,
            notes: `What-if: ${payload.reason || 'Remove event'}`,
            eventId: payload.event_id || change.event_id,
            changeType: 'delete',
            changeId: change.id,
          });
        }
      });
      
      return suggestions;
    } catch (err) {
      return [];
    }
  }, [familyId, activeChildIds, children]);

  const handleModeClick = (superpower, mode) => {
    // Don't close the main modal - open the tool modal on top
    // Handle different mode types
    if (mode.id === 'pack-week' && onPackWeek) {
      setShowPackWeekModal(true);
    } else if (mode.id === 'rebalance' || mode.id === 'catch-up' || mode.id === 'what-if') {
      setSelectedMode(mode);
      setAiModalKey(mode.id);
      setShowAIModal(true);
    } else if (mode.id === 'plan-year' && onPlanYear) {
      onClose(); // Close main modal for these
      onPlanYear();
    } else if (mode.id === 'heatmap' && onHeatmap) {
      onClose(); // Close main modal for these
      onHeatmap();
    } else if (mode.id === 'summarize-progress' && onSummarizeProgress) {
      onClose(); // Close main modal for these
      onSummarizeProgress();
    } else if (mode.id === 'analytics' && onAnalytics) {
      onClose(); // Close main modal for these
      onAnalytics();
    }
  };

  const handleAIAccept = async (suggestion) => {
    // Handle AI accept - this would typically add to calendar
};

  // Memoize catch-up runner
  const runCatchUp = useCallback(async () => {
    if (!familyId) return [];
    const childIdsToUse = activeChildIds.length > 0 
      ? activeChildIds 
      : children.map(c => c.id).filter(Boolean);
    
    if (childIdsToUse.length === 0) {
      throw new Error('No children available for scheduling');
    }
    
    try {
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: childIdsToUse,
        horizonWeeks: 2,
        reason: 'catch_up',
      });
      
      if (result.error) throw result.error;
      
      // Transform API response to suggestion format
      const proposal = result.data?.proposal || {};
      const persistedChanges = result.data?.changes || [];
      
      const suggestions = [];
      
      // Transform persisted changes directly (more reliable than matching with proposal)
      persistedChanges.forEach((change, idx) => {
        const payload = change.payload || {};
        const changeType = change.change_type;
        
        if (changeType === 'add') {
          suggestions.push({
            id: change.id || `catchup-add-${idx}`,
            title: payload.title || 'Catch Up Event',
            proposedStart: payload.start,
            proposedEnd: payload.end,
            notes: `Catch up: ${payload.title || 'Missed work'}`,
            childId: payload.child_id,
            changeType: 'add',
            changeId: change.id,
          });
        } else if (changeType === 'move') {
          suggestions.push({
            id: change.id || `catchup-move-${idx}`,
            title: payload.reason || 'Catch Up Move',
            proposedStart: payload.to_start,
            proposedEnd: payload.to_end,
            notes: `Catch up: ${payload.reason || 'Reschedule for catch-up'}`,
            eventId: payload.event_id || change.event_id,
            fromStart: payload.from_start,
            fromEnd: payload.from_end,
            changeType: 'move',
            changeId: change.id,
          });
        } else if (changeType === 'delete') {
          suggestions.push({
            id: change.id || `catchup-delete-${idx}`,
            title: payload.reason || 'Catch Up Delete',
            proposedStart: null,
            proposedEnd: null,
            notes: `Catch up: ${payload.reason || 'Remove event'}`,
            eventId: payload.event_id || change.event_id,
            changeType: 'delete',
            changeId: change.id,
          });
        }
      });
      
      return suggestions;
    } catch (err) {
      throw new Error('Failed to generate catch-up plan');
    }
  }, [familyId, activeChildIds, children]);

  // Memoize mode runners to ensure stable references
  const getModeRunner = useCallback((modeId) => {
    switch (modeId) {
      case 'rebalance':
        return runRebalance;
      case 'what-if':
        return runWhatIf;
      case 'catch-up':
        return runCatchUp;
      default:
        return null;
    }
  }, [runRebalance, runWhatIf, runCatchUp]);

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>AI Tools</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
              <Text style={styles.superpowerIntro}>
                Choose a superpower to get started:
              </Text>
              <View style={styles.superpowersContainer}>
                {superpowers.map((superpower) => (
                  <TouchableOpacity
                    key={superpower.id}
                    style={styles.superpowerCard}
                    onPress={() => {
                      setSelectedSuperpower(superpower);
                      setShowSuperpowerModal(true);
                    }}
                  >
                    <View style={styles.superpowerCardContent}>
                      <Text style={styles.superpowerTitle}>{superpower.title}</Text>
                      <Text style={styles.superpowerDescription}>{superpower.description}</Text>
                      <View style={styles.modesPreview}>
                        {superpower.modes.filter(m => m.requires()).slice(0, 3).map((mode) => (
                          <TouchableOpacity
                            key={mode.id}
                            style={styles.modePreviewBadge}
                            onPress={(e) => {
                              e.stopPropagation(); // Prevent card click
                              handleModeClick(superpower, mode);
                            }}
                          >
                            <Text style={styles.modePreviewText}>{mode.title}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Superpower Modal (only shown when clicking card, not badge) */}
      {selectedSuperpower && (
        <SuperpowerModal
          visible={showSuperpowerModal}
          onClose={() => {
            setShowSuperpowerModal(false);
            setSelectedSuperpower(null);
          }}
          superpower={selectedSuperpower}
          familyId={familyId}
          children={children}
          activeChildIds={activeChildIds}
          onPlanYear={onPlanYear}
          onHeatmap={onHeatmap}
          onCatchUp={onCatchUp}
          onSummarizeProgress={onSummarizeProgress}
          onAnalytics={onAnalytics}
          runRebalance={runRebalance}
          runWhatIf={runWhatIf}
          handleAIAccept={handleAIAccept}
        />
      )}

      {/* AI Modals for rebalance, catch-up, what-if - rendered outside Modal */}
      {selectedMode && (selectedMode.id === 'rebalance' || selectedMode.id === 'catch-up' || selectedMode.id === 'what-if') && (
        <AIModal
          key={`${aiModalKey}-${showAIModal}`} // Force remount when mode changes or modal opens
          title={selectedMode.title}
          open={showAIModal && aiModalKey === selectedMode.id}
          onClose={() => {
            setShowAIModal(false);
            setAiModalKey(null);
            setSelectedMode(null);
            // Don't close main modal - let user try another tool
          }}
          run={getModeRunner(selectedMode.id)}
          onAccept={handleAIAccept}
        />
      )}

      {/* Pack Week Modal */}
      <PackWeekModal
        visible={showPackWeekModal}
        familyId={familyId}
        children={children}
        onClose={() => setShowPackWeekModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '90%',
    maxWidth: 1000,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  superpowerIntro: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  superpowersContainer: {
    gap: 20,
  },
  superpowerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        borderColor: '#3b82f6',
        shadowOpacity: 0.15,
      },
    }),
  },
  superpowerCardContent: {
    padding: 24,
  },
  superpowerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  superpowerDescription: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 22,
  },
  modesPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modePreviewBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#dbeafe',
        borderColor: '#93c5fd',
      },
    }),
  },
  modePreviewText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1e40af',
  },
});


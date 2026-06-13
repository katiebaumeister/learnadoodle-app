import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react';
import AIModal from '../AIModal';
import PackWeekModal from './PackWeekModal';
import { proposeReschedule } from '../../lib/apiClient';

/**
 * Superpower Modal - Shows modes within a superpower
 * Each superpower has multiple internal modes (tools)
 */
export default function SuperpowerModal({
  visible,
  onClose,
  superpower,
  familyId,
  children = [],
  activeChildIds = [],
  onPlanYear,
  onHeatmap,
  onCatchUp,
  onSummarizeProgress,
  onAnalytics,
  runRebalance,
  runWhatIf,
  handleAIAccept,
}) {
  const [selectedMode, setSelectedMode] = useState(null);
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalKey, setAiModalKey] = useState(null);

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    
    // For modes that need immediate action, trigger them
    if (mode.id === 'pack-week') {
      setShowPackWeekModal(true);
    } else if (mode.id === 'rebalance' || mode.id === 'catch-up' || mode.id === 'what-if') {
      setAiModalKey(mode.id);
      setShowAIModal(true);
    } else if ((mode.id === 'school-year-settings' || mode.id === 'plan-year') && onPlanYear) {
      onPlanYear();
      onClose();
    } else if (mode.id === 'heatmap' && onHeatmap) {
      // Heatmap opens in full view
      onHeatmap();
      onClose();
    } else if (mode.id === 'summarize-progress' && onSummarizeProgress) {
      onSummarizeProgress();
      onClose();
    } else if (mode.id === 'analytics' && onAnalytics) {
      onAnalytics();
      onClose();
    }
  };

  // Close modal when pack week modal closes
  useEffect(() => {
    if (!showPackWeekModal && selectedMode?.id === 'pack-week') {
      setSelectedMode(null);
    }
  }, [showPackWeekModal, selectedMode]);

  const getModeRunner = (modeId) => {
    switch (modeId) {
      case 'rebalance':
        return runRebalance;
      case 'what-if':
        return runWhatIf;
      case 'catch-up':
        // Catch-up uses similar logic to rebalance but focuses on missed work
        return async () => {
          if (!familyId) return [];
          // Use selected children or all children if none selected
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
            
            // Transform persisted changes directly (more reliable than matching with proposal)
            const persistedChanges = result.data?.changes || [];
            const suggestions = [];
            
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
        };
      default:
        return null;
    }
  };

  if (!visible) return null;

  // Render AI modals and pack week modal outside the main modal
  const runner = selectedMode ? getModeRunner(selectedMode.id) : null;

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
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{superpower.title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
              <Text style={styles.description}>{superpower.description}</Text>
              
              <View style={styles.modesContainer}>
                {superpower.modes.map((mode) => {
                  const isAvailable = mode.requires ? mode.requires() : true;
                  if (!isAvailable) return null;

                  return (
                    <TouchableOpacity
                      key={mode.id}
                      style={styles.modeCard}
                      onPress={() => handleModeSelect(mode)}
                    >
                      <View style={styles.modeCardContent}>
                        <Text style={styles.modeTitle}>{mode.title}</Text>
                        <Text style={styles.modeDescription}>{mode.description}</Text>
                        <Text style={styles.modeTagline}>{mode.tagline}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pack Week Modal */}
      <PackWeekModal
        visible={showPackWeekModal}
        familyId={familyId}
        children={children}
        onClose={() => {
          setShowPackWeekModal(false);
          setSelectedMode(null);
        }}
      />

      {/* AI Modals for rebalance, catch-up, what-if */}
      {selectedMode && (selectedMode.id === 'rebalance' || selectedMode.id === 'catch-up' || selectedMode.id === 'what-if') && runner && (
        <AIModal
          title={selectedMode.title}
          open={showAIModal && aiModalKey === selectedMode.id}
          onClose={() => {
            setShowAIModal(false);
            setAiModalKey(null);
            setSelectedMode(null);
          }}
          run={runner}
          onAccept={handleAIAccept}
        />
      )}
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
    maxWidth: 600,
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
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
    padding: 20,
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 24,
    lineHeight: 22,
  },
  modesContainer: {
    gap: 16,
  },
  modeCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  modeCardContent: {
    padding: 20,
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  modeDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
    lineHeight: 20,
  },
  modeTagline: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },
});


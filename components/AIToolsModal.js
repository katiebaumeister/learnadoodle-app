import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react';
import CurriculumHeatmap from './year/CurriculumHeatmap';
import PackWeekModal from './ai/PackWeekModal';
import AIModal from './AIModal';
import { TOOL_KEYS } from '../lib/toolTypes';

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
  const [aiToolsSubtab, setAiToolsSubtab] = useState('plan-year');
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalKey, setAiModalKey] = useState(null);

  // Set default AI Tools subtab when modal opens
  useEffect(() => {
    if (visible) {
      if (onPlanYear) {
        setAiToolsSubtab('plan-year');
      } else if (onHeatmap) {
        setAiToolsSubtab('heatmap');
      } else if (onPackWeek) {
        setAiToolsSubtab('pack-week');
      } else if (onCatchUp) {
        setAiToolsSubtab('catch-up');
      } else if (onSummarizeProgress) {
        setAiToolsSubtab('summarize-progress');
      } else if (onWhatIfAnalysis) {
        setAiToolsSubtab('whatif');
      } else if (onAnalytics) {
        setAiToolsSubtab('analytics');
      }
    }
  }, [visible, onPlanYear, onHeatmap, onPackWeek, onCatchUp, onSummarizeProgress, onWhatIfAnalysis, onAnalytics]);

  const runWhatIf = async () => {
    // What-if analysis logic would go here
    return [];
  };

  const handleAIAccept = () => {
    // Handle AI accept logic
  };

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

            {/* Subtabs */}
            <View style={styles.subtabContainer}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.subtabRow}
              >
                {onPlanYear && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'plan-year' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('plan-year')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'plan-year' && styles.subtabTextActive]}>
                      Plan the Year
                    </Text>
                  </TouchableOpacity>
                )}
                {onHeatmap && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'heatmap' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('heatmap')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'heatmap' && styles.subtabTextActive]}>
                      Heatmap
                    </Text>
                  </TouchableOpacity>
                )}
                {onPackWeek && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'pack-week' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('pack-week')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'pack-week' && styles.subtabTextActive]}>
                      Pack Week
                    </Text>
                  </TouchableOpacity>
                )}
                {onCatchUp && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'catch-up' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('catch-up')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'catch-up' && styles.subtabTextActive]}>
                      Catch Up
                    </Text>
                  </TouchableOpacity>
                )}
                {onSummarizeProgress && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'summarize-progress' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('summarize-progress')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'summarize-progress' && styles.subtabTextActive]}>
                      Summarize Progress
                    </Text>
                  </TouchableOpacity>
                )}
                {onWhatIfAnalysis && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'whatif' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('whatif')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'whatif' && styles.subtabTextActive]}>
                      What-If Analysis
                    </Text>
                  </TouchableOpacity>
                )}
                {onAnalytics && (
                  <TouchableOpacity
                    style={[styles.subtab, aiToolsSubtab === 'analytics' && styles.subtabActive]}
                    onPress={() => setAiToolsSubtab('analytics')}
                  >
                    <Text style={[styles.subtabText, aiToolsSubtab === 'analytics' && styles.subtabTextActive]}>
                      Analytics
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
              {aiToolsSubtab === 'plan-year' && onPlanYear && (
                <View style={styles.aiToolContent}>
                  <Text style={styles.description}>
                    Plan your entire year with AI-powered curriculum scheduling.
                  </Text>
                  <TouchableOpacity style={styles.aiButton} onPress={onPlanYear}>
                    <Text style={styles.aiButtonText}>Plan the Year</Text>
                  </TouchableOpacity>
                </View>
              )}
              {aiToolsSubtab === 'heatmap' && onHeatmap && (
                <View style={styles.aiToolContent}>
                  <CurriculumHeatmap
                    familyId={familyId}
                    startDate={new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]}
                    endDate={new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]}
                    onClose={onClose}
                  />
                </View>
              )}
              {aiToolsSubtab === 'pack-week' && onPackWeek && (
                <View style={styles.aiToolContent}>
                  <Text style={styles.description}>
                    AI will help you pack your week efficiently by suggesting optimal task scheduling.
                  </Text>
                  <TouchableOpacity style={styles.aiButton} onPress={() => setShowPackWeekModal(true)}>
                    <Text style={styles.aiButtonText}>Pack This Week</Text>
                  </TouchableOpacity>
                </View>
              )}
              {aiToolsSubtab === 'catch-up' && onCatchUp && (
                <View style={styles.aiToolContent}>
                  <Text style={styles.description}>
                    AI will help you catch up on missed work and reschedule tasks.
                  </Text>
                  <TouchableOpacity style={styles.aiButton} onPress={onCatchUp}>
                    <Text style={styles.aiButtonText}>Catch Up</Text>
                  </TouchableOpacity>
                </View>
              )}
              {aiToolsSubtab === 'summarize-progress' && onSummarizeProgress && (
                <View style={styles.aiToolContent}>
                  <Text style={styles.description}>
                    Get an AI-generated summary of your learning progress.
                  </Text>
                  <TouchableOpacity style={styles.aiButton} onPress={onSummarizeProgress}>
                    <Text style={styles.aiButtonText}>Summarize Progress</Text>
                  </TouchableOpacity>
                </View>
              )}
              {aiToolsSubtab === 'whatif' && onWhatIfAnalysis && (
                <View style={styles.aiToolContent}>
                  <Text style={styles.description}>
                    Analyze different scheduling scenarios to see how changes would affect your calendar.
                  </Text>
                  <TouchableOpacity
                    style={styles.aiButton}
                    onPress={() => {
                      setAiModalKey(TOOL_KEYS.WHAT_IF);
                      setShowAIModal(true);
                    }}
                  >
                    <Text style={styles.aiButtonText}>Run What-if Analysis</Text>
                  </TouchableOpacity>
                </View>
              )}
              {aiToolsSubtab === 'analytics' && onAnalytics && (
                <View style={styles.aiToolContent}>
                  <Text style={styles.description}>
                    View detailed analytics and insights about your learning schedule.
                  </Text>
                  <TouchableOpacity style={styles.aiButton} onPress={onAnalytics}>
                    <Text style={styles.aiButtonText}>View Analytics</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Nested Modals */}
      <PackWeekModal
        visible={showPackWeekModal}
        familyId={familyId}
        children={children}
        onClose={() => setShowPackWeekModal(false)}
      />
      <AIModal
        title="What-if Analysis"
        open={showAIModal && aiModalKey === TOOL_KEYS.WHAT_IF}
        onClose={() => {
          setShowAIModal(false);
          setAiModalKey(null);
        }}
        run={runWhatIf}
        onAccept={handleAIAccept}
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
  subtabContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  subtabRow: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
    minHeight: 48,
  },
  subtab: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  subtabActive: {
    borderBottomColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  subtabText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  subtabTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  aiToolContent: {
    paddingVertical: 8,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  aiButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  aiButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});


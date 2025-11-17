import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform, Alert } from 'react-native';
import { X } from 'lucide-react';
import ScheduleRulesView from './ScheduleRulesView';
import BlackoutPanel from './planner/BlackoutPanel';
import GoogleCalendarConnect from './GoogleCalendarConnect';
import { useToast } from './Toast';

export default function PlannerSettingsModal({ visible, onClose, familyId, children = [] }) {
  const [settingsSubtab, setSettingsSubtab] = useState('schedule_rules');
  const [objectives, setObjectives] = useState([]);
  const toast = useToast();

  // Determine header title based on active subtab
  const getSettingsHeaderTitle = () => {
    switch (settingsSubtab) {
      case 'schedule_rules':
        return 'Schedule Rules';
      case 'blackouts':
        return 'Blackouts';
      case 'calendar':
        return 'Calendar Integrations';
      case 'objectives':
        return 'Weekly Objectives';
      default:
        return 'Settings';
    }
  };

  if (!visible) return null;

  return (
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
            <Text style={styles.headerTitle}>{getSettingsHeaderTitle()}</Text>
            <View style={styles.headerRight}>
              {settingsSubtab === 'objectives' && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      const newObjective = window.prompt('Enter a new weekly objective:');
                      if (newObjective && newObjective.trim()) {
                        setObjectives((prev) => [...prev, newObjective.trim()]);
                        toast.push('Objective added', 'success');
                      }
                    } else {
                      Alert.prompt(
                        'New Objective',
                        'Enter a new weekly objective:',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Add',
                            onPress: (text) => {
                              if (text && text.trim()) {
                                setObjectives((prev) => [...prev, text.trim()]);
                                toast.push('Objective added', 'success');
                              }
                            },
                          },
                        ],
                        'plain-text'
                      );
                    }
                  }}
                >
                  <Text style={styles.headerButtonText}>+ Add</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Subtabs */}
          <View style={styles.subtabContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subtabRow}
            >
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'schedule_rules' && styles.subtabActive]}
                onPress={() => setSettingsSubtab('schedule_rules')}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'schedule_rules' && styles.subtabTextActive]}>
                  Schedule Rules
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'blackouts' && styles.subtabActive]}
                onPress={() => setSettingsSubtab('blackouts')}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'blackouts' && styles.subtabTextActive]}>
                  Blackouts
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'calendar' && styles.subtabActive]}
                onPress={() => setSettingsSubtab('calendar')}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'calendar' && styles.subtabTextActive]}>
                  Calendar Integrations
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'objectives' && styles.subtabActive]}
                onPress={() => setSettingsSubtab('objectives')}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'objectives' && styles.subtabTextActive]}>
                  Weekly Objectives
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {settingsSubtab === 'schedule_rules' && (
              <ScheduleRulesView 
                familyId={familyId} 
                children={children}
                hideHeader={true}
              />
            )}
            {settingsSubtab === 'blackouts' && (
              <BlackoutPanel familyId={familyId} children={children} />
            )}
            {settingsSubtab === 'calendar' && (
              <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
                <View style={styles.integrationStack}>
                  <GoogleCalendarConnect
                    familyId={familyId}
                    onConnected={() => {
                      toast.push('Google Calendar ready. Run a sync to push upcoming events.', 'success');
                    }}
                  />
                  <View style={styles.integrationCard}>
                    <Text style={styles.integrationTitle}>Apple Calendar</Text>
                    <Text style={styles.integrationDescription}>
                      Subscribe to your Learnadoodle planner via ICS. Copy the link below into Apple Calendar.
                    </Text>
                    <TouchableOpacity style={styles.disabledButton} disabled>
                      <Text style={styles.disabledButtonText}>Copy ICS Link</Text>
                    </TouchableOpacity>
                    <Text style={styles.helperText}>
                      ICS subscriptions are coming soon. For now, you can manually download your schedule from the Planner.
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
            {settingsSubtab === 'objectives' && (
              <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
                <View style={styles.objectivesList}>
                  {objectives.map((obj, idx) => (
                    <View key={idx} style={styles.objectiveItem}>
                      <Text style={styles.objectiveText}>{obj}</Text>
                      <TouchableOpacity
                        style={styles.objectiveDelete}
                        onPress={() => {
                          setObjectives((prev) => prev.filter((_, i) => i !== idx));
                          toast.push('Objective removed', 'info');
                        }}
                      >
                        <X size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {objectives.length === 0 && (
                    <Text style={styles.emptyText}>No objectives set. Click "+ Add" to create one.</Text>
                  )}
                </View>
              </ScrollView>
            )}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
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
    overflow: 'hidden',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
  },
  integrationStack: {
    gap: 16,
  },
  integrationCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  integrationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  integrationDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  disabledButton: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    opacity: 0.6,
  },
  disabledButtonText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  objectivesList: {
    gap: 8,
  },
  objectiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  objectiveText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  objectiveDelete: {
    padding: 4,
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    padding: 40,
  },
});


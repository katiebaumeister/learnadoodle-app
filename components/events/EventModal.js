import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import EventDetails from './EventDetails';
import EventSyllabusTab from './EventSyllabusTab';
import { getEvent, getSyllabusById } from '../../lib/apiClient';

export default function EventModal({ eventId, visible, onClose, onEventUpdated, onEventDeleted, initialEvent = null, familyMembers = [], onEventPatched }) {
  const [event, setEvent] = useState(initialEvent);
  const [syllabus, setSyllabus] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(!initialEvent);

  useEffect(() => {
    if (visible && eventId) {
      if (initialEvent) {
        setEvent(initialEvent);
        setLoading(false);
      }
      loadEvent();
    } else {
      setEvent(initialEvent ?? null);
      setSyllabus(null);
      setActiveTab('details');
      setLoading(!initialEvent);
    }
  }, [visible, eventId, initialEvent]);

  const loadEvent = async () => {
    if (!eventId) return;
    
    if (!event && !initialEvent) {
      setLoading(true);
    }
    try {
      const { data, error } = await getEvent(eventId);
      
      if (error) {
        console.error('Error loading event:', error);
        setEvent(prev => prev || initialEvent || null);
        return;
      }
      
      setEvent(prev => ({ ...(prev || {}), ...data }));
      
      // If event has syllabus link, load syllabus
      if (data?.source_syllabus_id) {
        const { data: syllabusData, error: syllabusError } = await getSyllabusById(data.source_syllabus_id);
        if (!syllabusError && syllabusData) {
          setSyllabus(syllabusData);
        }
      }
    } catch (err) {
      console.error('Error in loadEvent:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEventUpdated = () => {
    loadEvent(); // Reload event data
    onEventUpdated?.();
  };

  const handleEventDeleted = () => {
    onEventDeleted?.();
    onClose();
  };

  const handleEventPatched = (patch) => {
    const patchWithId = {
      id: patch?.id || eventId || event?.id,
      ...patch,
    };
    setEvent((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (typeof patch.child_id !== 'undefined') {
        next.child_id = patch.child_id;
        const childMatch = familyMembers.find((m) => m.id === patch.child_id);
        if (childMatch) {
          next.child = {
            ...(prev.child || {}),
            id: childMatch.id,
            first_name: childMatch.name,
            name: childMatch.name,
          };
        } else if (patch.child_id === null) {
          next.child = null;
        }
      }
      if (typeof patch.tags !== 'undefined') {
        next.tags = patch.tags;
      }
      if (typeof patch.status !== 'undefined') {
        next.status = patch.status;
      }
      if (typeof patch.title !== 'undefined') {
        next.title = patch.title;
      }
      if (typeof patch.description !== 'undefined') {
        next.description = patch.description;
      }
      if (typeof patch.start_ts !== 'undefined') {
        next.start_ts = patch.start_ts;
      }
      if (typeof patch.end_ts !== 'undefined') {
        next.end_ts = patch.end_ts;
      }
      return next;
    });
    if (patchWithId.id) {
      onEventPatched?.(patchWithId);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Event Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'details' && styles.tabActive]}
              onPress={() => setActiveTab('details')}
            >
              <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>
                Details
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'syllabus' && styles.tabActive]}
              onPress={() => setActiveTab('syllabus')}
            >
              <Text style={[styles.tabText, activeTab === 'syllabus' && styles.tabTextActive]}>
                Syllabus
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.content}>
              {activeTab === 'details' && event && (
                <EventDetails
                  event={event}
                  onEventUpdated={handleEventUpdated}
                  onEventDeleted={handleEventDeleted}
                  onEventPatched={handleEventPatched}
                  familyMembers={familyMembers}
                />
              )}
              {activeTab === 'details' && !event && (
                <View style={styles.loadingContainer}>
                  <Text style={{ color: colors.muted }}>Event details not available.</Text>
                </View>
              )}
              {activeTab === 'syllabus' && event && (
                <EventSyllabusTab
                  event={event}
                  syllabus={syllabus}
                  onRelink={() => loadEvent()}
                  onOpenSyllabus={() => {
                    // Navigate to syllabus viewer
                    onClose();
                    // TODO: Navigate to syllabus viewer
                  }}
                />
              )}
              {activeTab === 'syllabus' && !event && (
                <View style={styles.loadingContainer}>
                  <Text style={{ color: colors.muted }}>No syllabus linked to this event.</Text>
                </View>
              )}
            </View>
          )}
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
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    ...shadows.large,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
});


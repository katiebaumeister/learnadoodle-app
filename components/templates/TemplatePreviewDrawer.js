import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { X, Calendar, Clock, BookOpen, Play } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getTemplatePreview } from '../../lib/services/templatesClient';
import { supabase } from '../../lib/supabase';

export default function TemplatePreviewDrawer({ template, isOpen, onClose, onApply }) {
  const [templateData, setTemplateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subjectNames, setSubjectNames] = useState({});

  useEffect(() => {
    if (isOpen && template) {
      loadTemplateData();
    }
  }, [isOpen, template]);

  const loadTemplateData = async () => {
    if (!template) return;
    setLoading(true);
    try {
      // Get subject names
      const { data: subjects } = await supabase
        .from('subject')
        .select('id, name');
      
      const names = {};
      (subjects || []).forEach(s => {
        names[s.id] = s.name;
      });
      setSubjectNames(names);

      setTemplateData(template.template_data || {});
    } catch (error) {
      console.error('Error loading template data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const events = templateData?.events || [];
  const durationDays = templateData?.duration_days || 0;

  // Group events by day offset
  const eventsByDay = {};
  events.forEach(event => {
    const day = event.days_offset || 0;
    if (!eventsByDay[day]) {
      eventsByDay[day] = [];
    }
    eventsByDay[day].push(event);
  });

  return (
    <View style={styles.overlay}>
      <View style={styles.drawer}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Calendar size={20} color={colors.accent} />
            <View style={styles.headerText}>
              <Text style={styles.title}>{template.template_name}</Text>
              {template.template_description && (
                <Text style={styles.subtitle}>{template.template_description}</Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <>
              {/* Template Info */}
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Clock size={16} color={colors.muted} />
                  <Text style={styles.infoText}>
                    Duration: {durationDays} {durationDays === 1 ? 'day' : 'days'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <BookOpen size={16} color={colors.muted} />
                  <Text style={styles.infoText}>
                    {events.length} {events.length === 1 ? 'event' : 'events'}
                  </Text>
                </View>
              </View>

              {/* Tags */}
              {template.tags && template.tags.length > 0 && (
                <View style={styles.tagsSection}>
                  {template.tags.map((tag, idx) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Timeline Preview */}
              <View style={styles.timelineSection}>
                <Text style={styles.sectionTitle}>Timeline Preview</Text>
                {Object.keys(eventsByDay).length === 0 ? (
                  <Text style={styles.emptyText}>No events in this template</Text>
                ) : (
                  Object.keys(eventsByDay)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(dayOffset => {
                      const dayEvents = eventsByDay[dayOffset];
                      const dayLabel = dayOffset === '0' ? 'Day 1' : `Day ${Number(dayOffset) + 1}`;
                      
                      return (
                        <View key={dayOffset} style={styles.dayGroup}>
                          <Text style={styles.dayLabel}>{dayLabel}</Text>
                          {dayEvents.map((event, idx) => (
                            <View key={idx} style={styles.eventPreview}>
                              <View style={styles.eventPreviewHeader}>
                                <Text style={styles.eventTitle}>{event.title}</Text>
                                <Text style={styles.eventTime}>{event.time_of_day}</Text>
                              </View>
                              <View style={styles.eventPreviewMeta}>
                                {event.subject_id && subjectNames[event.subject_id] && (
                                  <Text style={styles.eventSubject}>
                                    {subjectNames[event.subject_id]}
                                  </Text>
                                )}
                                <Text style={styles.eventDuration}>
                                  {event.duration_minutes || 30} min
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      );
                    })
                )}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => onApply(template)}
          >
            <Play size={18} color="#ffffff" />
            <Text style={styles.applyButtonText}>Apply this Template</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  infoSection: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
  },
  tagsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#374151',
  },
  timelineSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  eventPreview: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  eventPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  eventTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventPreviewMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  eventSubject: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventDuration: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});


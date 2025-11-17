import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getAllSyllabi, addLessonsToCalendar } from '../lib/syllabusProcessor';

const SyllabusViewer = ({ onClose, onEditSyllabus }) => {
  const [syllabi, setSyllabi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSyllabus, setExpandedSyllabus] = useState(null);

  useEffect(() => {
    loadSyllabi();
  }, []);

  const loadSyllabi = async () => {
    try {
      const loadedSyllabi = await getAllSyllabi();
      setSyllabi(loadedSyllabi);
    } catch (error) {
      console.error('Error loading syllabi:', error);
      Alert.alert('Error', 'Failed to load syllabi');
    } finally {
      setLoading(false);
    }
  };

  const toggleSyllabusExpansion = (syllabusId) => {
    setExpandedSyllabus(expandedSyllabus === syllabusId ? null : syllabusId);
  };

  const handleAddToCalendar = async (syllabus) => {
    if (!syllabus.units || !syllabus.auto_paced) {
      Alert.alert('Cannot Add to Calendar', 'This syllabus is not auto-paced. Please edit it to enable auto-pacing first.');
      return;
    }

    try {
      const result = await addLessonsToCalendar(syllabus.track_id, syllabus.units);
      Alert.alert(
        'Success!',
        `Added ${result.activities} activities and ${result.instances} scheduled lessons to your calendar.`
      );
      onClose(); // Close the viewer to return to calendar
    } catch (error) {
      console.error('Error adding to calendar:', error);
      Alert.alert('Error', 'Failed to add lessons to calendar');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#28a745';
      case 'completed': return '#6c757d';
      case 'paused': return '#ffc107';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading syllabi...</Text>
      </View>
    );
  }

  if (syllabi.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No Syllabi Found</Text>
        <Text style={styles.emptyText}>
          You haven't uploaded any course syllabi yet.{'\n'}
          Use the upload feature to get started!
        </Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Course Syllabi</Text>
      
      <ScrollView style={styles.scrollView}>
        {syllabi.map((syllabus) => (
          <View key={syllabus.id} style={styles.syllabusCard}>
            {/* Syllabus Header */}
            <TouchableOpacity
              style={styles.syllabusHeader}
              onPress={() => toggleSyllabusExpansion(syllabus.id)}
            >
              <View style={styles.syllabusInfo}>
                <Text style={styles.courseTitle}>{syllabus.name}</Text>
                <Text style={styles.providerName}>
                  {syllabus.provider_name || 'No provider specified'}
                </Text>
                <View style={styles.metaInfo}>
                  <Text style={styles.dateRange}>
                    {formatDate(syllabus.start_date)} - {formatDate(syllabus.end_date)}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(syllabus.status) }]}>
                    <Text style={styles.statusText}>{syllabus.status}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.expandIcon}>
                {expandedSyllabus === syllabus.id ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>

            {/* Expanded Content */}
            {expandedSyllabus === syllabus.id && (
              <View style={styles.expandedContent}>
                {/* Auto-pacing info */}
                {syllabus.auto_paced && (
                  <View style={styles.autoPacingInfo}>
                    <Text style={styles.autoPacingTitle}>✓ Auto-paced</Text>
                    <Text style={styles.autoPacingDetails}>
                      Lessons are automatically distributed across your school year
                    </Text>
                  </View>
                )}

                {/* Course outline */}
                {syllabus.course_outline && (
                  <View style={styles.outlineSection}>
                    <Text style={styles.outlineTitle}>Course Outline</Text>
                    <Text style={styles.outlineText}>{syllabus.course_outline}</Text>
                  </View>
                )}

                {/* Units and lessons */}
                {syllabus.units && syllabus.units.length > 0 && (
                  <View style={styles.unitsSection}>
                    <Text style={styles.unitsTitle}>Units & Lessons</Text>
                    {syllabus.units.map((unit, unitIndex) => (
                      <View key={unitIndex} style={styles.unitCard}>
                        <Text style={styles.unitTitle}>{unit.title}</Text>
                        {unit.lessons.map((lesson, lessonIndex) => (
                          <View key={lessonIndex} style={styles.lessonRow}>
                            <Text style={styles.lessonTitle}>• {lesson.title}</Text>
                            {lesson.scheduledDate && (
                              <Text style={styles.lessonDate}>
                                {formatDate(lesson.scheduledDate)}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onEditSyllabus(syllabus)}
                  >
                    <Text style={styles.actionButtonText}>Edit Syllabus</Text>
                  </TouchableOpacity>
                  
                  {syllabus.auto_paced && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.calendarButton]}
                      onPress={() => handleAddToCalendar(syllabus)}
                    >
                      <Text style={styles.calendarButtonText}>Add to Calendar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    margin: 20,
    color: '#333',
  },
  loadingText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
    color: '#666',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    margin: 20,
    color: '#666',
    lineHeight: 24,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  syllabusCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  syllabusHeader: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  syllabusInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  providerName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  metaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRange: {
    fontSize: 12,
    color: '#888',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  expandIcon: {
    fontSize: 18,
    color: '#666',
    marginLeft: 10,
  },
  expandedContent: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  autoPacingInfo: {
    backgroundColor: '#e8f5e8',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  autoPacingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
    marginBottom: 5,
  },
  autoPacingDetails: {
    fontSize: 12,
    color: '#666',
  },
  outlineSection: {
    marginBottom: 15,
  },
  outlineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  outlineText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  unitsSection: {
    marginBottom: 15,
  },
  unitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  unitCard: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  unitTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  lessonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  lessonTitle: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },
  lessonDate: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#6c757d',
    marginHorizontal: 5,
    alignItems: 'center',
  },
  calendarButton: {
    backgroundColor: '#0066cc',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  calendarButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#6c757d',
    padding: 15,
    margin: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SyllabusViewer;

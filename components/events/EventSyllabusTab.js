import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { BookOpen, Link, ExternalLink, Plus } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { linkEventSyllabus } from '../../lib/apiClient';

export default function EventSyllabusTab({ event, syllabus, onRelink, onOpenSyllabus }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(null);

  useEffect(() => {
    if (syllabus?.sections) {
      setSections(syllabus.sections);
    } else if (syllabus?.id) {
      loadSections();
    }
  }, [syllabus]);

  useEffect(() => {
    if (event?.source_section_id) {
      setSelectedSectionId(event.source_section_id);
    }
  }, [event]);

  const loadSections = async () => {
    if (!syllabus?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('syllabus_sections')
        .select('*')
        .eq('syllabus_id', syllabus.id)
        .order('position');

      if (error) throw error;
      setSections(data || []);
    } catch (err) {
      console.error('Error loading sections:', err);
    }
  };

  const handleRelink = async (sectionId) => {
    if (!sectionId || !event?.id) return;
    
    setLoading(true);
    try {
      const { error } = await linkEventSyllabus(event.id, sectionId);
      
      if (error) {
        Alert.alert('Error', 'Failed to link syllabus section');
        return;
      }
      
      setSelectedSectionId(sectionId);
      onRelink?.();
      Alert.alert('Success', 'Syllabus section linked successfully');
    } catch (err) {
      console.error('Error linking section:', err);
      Alert.alert('Error', 'Failed to link syllabus section');
    } finally {
      setLoading(false);
    }
  };

  const currentSection = sections.find(s => s.id === event?.source_section_id);

  if (!syllabus) {
    return (
      <View style={styles.emptyState}>
        <BookOpen size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>No Syllabus Attached</Text>
        <Text style={styles.emptyText}>
          Attach a syllabus section to link this event to course content
        </Text>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => {
            // TODO: Open syllabus selector
            Alert.alert('Attach Syllabus', 'Syllabus selector coming soon');
          }}
        >
          <Plus size={16} color={colors.white} />
          <Text style={styles.attachButtonText}>Attach Syllabus Section</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Syllabus Info */}
        <View style={styles.syllabusHeader}>
          <BookOpen size={20} color={colors.primary} />
          <View style={styles.syllabusInfo}>
            <Text style={styles.syllabusTitle}>{syllabus.title || 'Syllabus'}</Text>
            {syllabus.subject && (
              <Text style={styles.syllabusSubject}>
                {syllabus.subject.name || 'Subject'}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.openButton}
            onPress={() => onOpenSyllabus?.()}
          >
            <ExternalLink size={16} color={colors.primary} />
            <Text style={styles.openButtonText}>Open Full Syllabus</Text>
          </TouchableOpacity>
        </View>

        {/* Current Section */}
        {currentSection && (
          <View style={styles.currentSection}>
            <Text style={styles.sectionLabel}>Linked Section:</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{currentSection.title || 'Untitled Section'}</Text>
              {currentSection.description && (
                <Text style={styles.sectionDescription}>{currentSection.description}</Text>
              )}
              {currentSection.estimated_minutes && (
                <Text style={styles.sectionMinutes}>
                  {currentSection.estimated_minutes} minutes
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Relink Section */}
        <View style={styles.relinkSection}>
          <Text style={styles.sectionLabel}>Relink to Different Section:</Text>
          <View style={styles.sectionsList}>
            {sections.map((section) => (
              <TouchableOpacity
                key={section.id}
                style={[
                  styles.sectionItem,
                  selectedSectionId === section.id && styles.sectionItemSelected,
                  currentSection?.id === section.id && styles.sectionItemCurrent,
                ]}
                onPress={() => handleRelink(section.id)}
                disabled={loading || currentSection?.id === section.id}
              >
                <View style={styles.sectionItemContent}>
                  <Text style={styles.sectionItemTitle}>{section.title || 'Untitled'}</Text>
                  {section.description && (
                    <Text style={styles.sectionItemDescription} numberOfLines={2}>
                      {section.description}
                    </Text>
                  )}
                  {section.estimated_minutes && (
                    <Text style={styles.sectionItemMinutes}>
                      {section.estimated_minutes} min
                    </Text>
                  )}
                </View>
                {currentSection?.id === section.id && (
                  <View style={styles.currentBadge}>
                    <Link size={12} color={colors.white} />
                    <Text style={styles.currentBadgeText}>Current</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  attachButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  syllabusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  syllabusInfo: {
    flex: 1,
  },
  syllabusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  syllabusSubject: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 6,
  },
  openButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  currentSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: colors.panel,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 8,
  },
  sectionMinutes: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  relinkSection: {
    marginTop: 8,
  },
  sectionsList: {
    gap: 8,
  },
  sectionItem: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.blueSoft,
  },
  sectionItemCurrent: {
    borderColor: colors.greenBold,
    backgroundColor: colors.greenSoft,
  },
  sectionItemContent: {
    flex: 1,
  },
  sectionItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionItemDescription: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  sectionItemMinutes: {
    fontSize: 11,
    color: colors.muted,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.greenBold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
    marginLeft: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
});


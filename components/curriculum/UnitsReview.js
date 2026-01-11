/**
 * UnitsReview Component
 * Displays parsed units with skills for review and confirmation
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { CheckCircle, ChevronDown, ChevronUp, BookOpen, Target } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getParsedSyllabus } from '../../lib/services/curriculumAIClient';

export default function UnitsReview({ syllabusId, units: initialUnits, onConfirm, onBack }) {
  const [units, setUnits] = useState(initialUnits || []);
  const [expandedUnits, setExpandedUnits] = useState(new Set());
  const [loading, setLoading] = useState(!initialUnits);

  useEffect(() => {
    if (!initialUnits && syllabusId) {
      loadUnits();
    }
  }, [syllabusId]);

  const loadUnits = async () => {
    try {
      setLoading(true);
      const { data, error } = await getParsedSyllabus(syllabusId);
      if (error) throw error;
      if (data?.units) {
        setUnits(data.units);
        // Expand first unit by default
        if (data.units.length > 0) {
          setExpandedUnits(new Set([data.units[0].id]));
        }
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const toggleUnit = (unitId) => {
    const newExpanded = new Set(expandedUnits);
    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }
    setExpandedUnits(newExpanded);
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'beginner':
        return colors.greenBold;
      case 'intermediate':
        return colors.orangeBold;
      case 'advanced':
        return colors.redBold;
      default:
        return colors.muted;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading units...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Review Parsed Units</Text>
      <Text style={styles.description}>
        Review the extracted units, lessons, and skills. You can edit these after confirming.
      </Text>

      <ScrollView style={styles.unitsList} showsVerticalScrollIndicator={false}>
        {units.map((unit) => {
          const isExpanded = expandedUnits.has(unit.id);
          const unitSkills = unit.skills || [];
          const totalLessons = unit.lessons?.length || 0;
          const totalMinutes = unit.estimated_minutes || 0;

          return (
            <View key={unit.id} style={styles.unitCard}>
              <TouchableOpacity
                style={styles.unitHeader}
                onPress={() => toggleUnit(unit.id)}
              >
                <View style={styles.unitHeaderLeft}>
                  <BookOpen size={20} color={colors.primary} />
                  <View style={styles.unitInfo}>
                    <Text style={styles.unitTitle}>{unit.heading || 'Untitled Unit'}</Text>
                    <Text style={styles.unitMeta}>
                      {totalLessons} lessons • {totalMinutes} min
                      {unitSkills.length > 0 && ` • ${unitSkills.length} skills`}
                    </Text>
                  </View>
                </View>
                {isExpanded ? (
                  <ChevronUp size={20} color={colors.muted} />
                ) : (
                  <ChevronDown size={20} color={colors.muted} />
                )}
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.unitContent}>
                  {unit.notes && (
                    <Text style={styles.unitNotes}>{unit.notes}</Text>
                  )}

                  {/* Skills */}
                  {unitSkills.length > 0 && (
                    <View style={styles.skillsSection}>
                      <Text style={styles.sectionTitle}>Skills</Text>
                      <View style={styles.skillsList}>
                        {unitSkills.map((skill, idx) => (
                          <View key={idx} style={styles.skillTag}>
                            <Target size={12} color={getDifficultyColor(skill.difficulty)} />
                            <Text style={styles.skillText}>{skill.skill}</Text>
                            {skill.difficulty && (
                              <View
                                style={[
                                  styles.difficultyBadge,
                                  { backgroundColor: getDifficultyColor(skill.difficulty) + '20' },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.difficultyText,
                                    { color: getDifficultyColor(skill.difficulty) },
                                  ]}
                                >
                                  {skill.difficulty}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Lessons */}
                  {totalLessons > 0 && (
                    <View style={styles.lessonsSection}>
                      <Text style={styles.sectionTitle}>Lessons</Text>
                      {unit.lessons.map((lesson, idx) => (
                        <View key={lesson.id || idx} style={styles.lessonItem}>
                          <Text style={styles.lessonTitle}>{lesson.heading || `Lesson ${idx + 1}`}</Text>
                          {lesson.estimated_minutes && (
                            <Text style={styles.lessonMeta}>{lesson.estimated_minutes} min</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <CheckCircle size={16} color={colors.card} />
          <Text style={styles.confirmButtonText}>Confirm & Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  unitsList: {
    flex: 1,
    marginBottom: 20,
  },
  unitCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  unitHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  unitInfo: {
    flex: 1,
  },
  unitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  unitMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  unitContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unitNotes: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
    lineHeight: 20,
  },
  skillsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  skillsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillText: {
    fontSize: 12,
    color: colors.text,
  },
  difficultyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  difficultyText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  lessonsSection: {
    marginTop: 8,
  },
  lessonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 6,
  },
  lessonTitle: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  lessonMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
});


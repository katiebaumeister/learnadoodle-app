/**
 * Gradebook & Mastery Tab
 * Combines gradebook, mastery charts, and standards coverage analytics
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { BookOpen, BarChart3, Target, Calculator } from 'lucide-react';
import { colors } from '../../../theme/colors';
import GradebookView from '../../gradebook/GradebookView';
import MasteryCharts from '../../gradebook/MasteryCharts';
import StandardsCoverageDashboard from '../../gradebook/StandardsCoverageDashboard';
import ChildAccordion from '../ChildAccordion';

export default function GradebookMasteryTab({
  familyId,
  selectedChildren,
  children = [],
  resolvedChildIds,
}) {
  const [activeSection, setActiveSection] = useState({}); // { childId: 'gradebook' | 'mastery' | 'standards' }
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);

  // If single child selected, use that; otherwise show accordion
  const displayChildren = selectedChildren === 'all' 
    ? children 
    : children.filter(c => resolvedChildIds.includes(c.id));

  if (displayChildren.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No children selected</Text>
      </View>
    );
  }

  // Single child view
  if (displayChildren.length === 1) {
    const child = displayChildren[0];
    const section = activeSection[child.id] || 'gradebook';
    return (
      <View style={styles.container}>
        {/* Section Tabs */}
        <View style={styles.sectionTabs}>
          <TouchableOpacity
            style={[styles.sectionTab, section === 'gradebook' && styles.sectionTabActive]}
            onPress={() => setActiveSection({ [child.id]: 'gradebook' })}
          >
            <Calculator size={18} color={section === 'gradebook' ? colors.text : colors.muted} />
            <Text style={[styles.sectionTabText, section === 'gradebook' && styles.sectionTabTextActive]}>
              Gradebook
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sectionTab, section === 'mastery' && styles.sectionTabActive]}
            onPress={() => setActiveSection({ [child.id]: 'mastery' })}
          >
            <BarChart3 size={18} color={section === 'mastery' ? colors.text : colors.muted} />
            <Text style={[styles.sectionTabText, section === 'mastery' && styles.sectionTabTextActive]}>
              Mastery Charts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sectionTab, section === 'standards' && styles.sectionTabActive]}
            onPress={() => setActiveSection({ [child.id]: 'standards' })}
          >
            <Target size={18} color={section === 'standards' ? colors.text : colors.muted} />
            <Text style={[styles.sectionTabText, section === 'standards' && styles.sectionTabTextActive]}>
              Standards Coverage
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content}>
          {section === 'gradebook' && (
            <GradebookView 
              childId={child.id} 
              subjectId={selectedSubjectId}
            />
          )}
          {section === 'mastery' && (
            <MasteryCharts 
              childId={child.id} 
              subjectId={selectedSubjectId}
            />
          )}
          {section === 'standards' && (
            <StandardsCoverageDashboard 
              childId={child.id}
              subject={null}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // Multiple children - use accordion
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gradebook & Mastery</Text>
        <Text style={styles.subtitle}>View grades, mastery progress, and standards coverage</Text>
      </View>

      <ScrollView style={styles.content}>
        {displayChildren.map((child) => {
          const section = activeSection[child.id] || 'gradebook';
          return (
            <ChildAccordion
              key={child.id}
              child={child}
              defaultExpanded={displayChildren.length === 1}
            >
              <View style={styles.childContent}>
                {/* Section Tabs for each child */}
                <View style={styles.sectionTabs}>
                  <TouchableOpacity
                    style={[styles.sectionTab, section === 'gradebook' && styles.sectionTabActive]}
                    onPress={() => setActiveSection({ ...activeSection, [child.id]: 'gradebook' })}
                  >
                    <Calculator size={18} color={section === 'gradebook' ? colors.text : colors.muted} />
                    <Text style={[styles.sectionTabText, section === 'gradebook' && styles.sectionTabTextActive]}>
                      Gradebook
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sectionTab, section === 'mastery' && styles.sectionTabActive]}
                    onPress={() => setActiveSection({ ...activeSection, [child.id]: 'mastery' })}
                  >
                    <BarChart3 size={18} color={section === 'mastery' ? colors.text : colors.muted} />
                    <Text style={[styles.sectionTabText, section === 'mastery' && styles.sectionTabTextActive]}>
                      Mastery
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sectionTab, section === 'standards' && styles.sectionTabActive]}
                    onPress={() => setActiveSection({ ...activeSection, [child.id]: 'standards' })}
                  >
                    <Target size={18} color={section === 'standards' ? colors.text : colors.muted} />
                    <Text style={[styles.sectionTabText, section === 'standards' && styles.sectionTabTextActive]}>
                      Standards
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Content based on selected section */}
                {section === 'gradebook' && (
                  <GradebookView 
                    childId={child.id} 
                    subjectId={selectedSubjectId}
                  />
                )}
                {section === 'mastery' && (
                  <MasteryCharts 
                    childId={child.id} 
                    subjectId={selectedSubjectId}
                  />
                )}
                {section === 'standards' && (
                  <StandardsCoverageDashboard 
                    childId={child.id}
                    subject={null}
                  />
                )}
              </View>
            </ChildAccordion>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  content: {
    flex: 1,
  },
  sectionTabs: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
  },
  sectionTabActive: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
  },
  sectionTabTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  childContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 64,
  },
  emptyText: {
    fontSize: 16,
    color: colors.muted,
  },
});


/**
 * Child Micro Summaries Container
 * Shows "What each child needs today" for all children
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { generateInsights, buildInsightContext } from '../../lib/services/insightEngine';
import ChildMicroSummary from './ChildMicroSummary';

export default function ChildMicroSummaries({
  children = [],
  homeData,
  selectedDate = new Date(),
  onViewChild,
}) {
  const summaries = useMemo(() => {
    if (!children.length || !homeData) {
      return [];
    }

    const context = buildInsightContext(homeData, selectedDate);
    const insights = generateInsights(context);

    // Generate per-child summaries
    return children.map(child => {
      const childContext = {
        ...context,
        currentChild: child,
      };
      
      // Get child-specific insights
      const childInsights = generateInsights(childContext);
      
      // Build micro-summary
      let summary = null;
      if (childInsights.child_insight) {
        summary = childInsights.child_insight;
      } else if (childInsights.tactical) {
        summary = childInsights.tactical;
      } else if (childInsights.strategic) {
        summary = childInsights.strategic;
      } else {
        // Generate a simple summary based on today's events
        const childEvents = (homeData.learning || []).filter(
          e => e.child_id === child.id
        );
        if (childEvents.length > 0) {
          summary = `${child.first_name || child.name} has ${childEvents.length} learning session${childEvents.length > 1 ? 's' : ''} today.`;
        } else {
          summary = `${child.first_name || child.name} has a light day — good for review or exploration.`;
        }
      }

      return {
        child,
        summary,
      };
    });
  }, [children, homeData, selectedDate]);

  if (summaries.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What each child needs today</Text>
      <View style={styles.summariesList}>
        {summaries.map((item, index) => (
          <TouchableOpacity
            key={item.child.id}
            onPress={() => onViewChild && onViewChild(item.child.id)}
            activeOpacity={0.7}
          >
            <ChildMicroSummary
              child={item.child}
              summary={item.summary}
              onViewChild={onViewChild}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E2E2E',
    marginBottom: 12,
    fontFamily: Platform.OS === 'web' ? 'Cooper Hewitt, sans-serif' : undefined,
  },
  summariesList: {
    gap: 12,
  },
});


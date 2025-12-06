/**
 * Family Overview Cards
 * Co-Star style multi-card cluster showing what's shifting this week
 * 3-4 cards max, single-sentence interpretations
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function FamilyOverviewCards({ 
  summary = null,
  children = [],
  onNavigate 
}) {
  if (!summary) return null;
  
  const cards = [];
  const resolvedChildIds = children.map(c => c.id);
  
  // Check missing logs
  const missingLogs = summary.attendanceStatus?.missingLogs || [];
  if (missingLogs.length > 0) {
    const childWithMissing = children.find(c => {
      // Find child with most missing logs (simplified - could be enhanced)
      return true; // For now, just show first child
    });
    const childName = childWithMissing?.first_name || childWithMissing?.name || 'A child';
    cards.push({
      id: 'missing_logs',
      text: `${childName} has ${missingLogs.length} missing log${missingLogs.length > 1 ? 's' : ''} — easy fix today or tomorrow`,
      action: 'View logs',
      onPress: () => onNavigate?.('records?tab=attendance'),
    });
  }
  
  // Check low coverage
  const weekHours = Math.floor((summary.attendanceStatus?.thisWeek?.totalMinutes || 0) / 60);
  if (weekHours < 20 && children.length > 0) {
    const child = children[0];
    const childName = child?.first_name || child?.name || 'A child';
    cards.push({
      id: 'low_coverage',
      text: `Low coverage for ${childName} — needs 1–2 more reading blocks`,
      action: 'Plan blocks',
      onPress: () => onNavigate?.('planner'),
    });
  }
  
  // Check missing evidence
  const missingEvidenceCount = summary.missingEvidence?.total || 0;
  if (missingEvidenceCount === 0 && children.length > 0) {
    const child = children.find(c => {
      const childEvidence = summary.missingEvidence?.byChild?.[c.id];
      return !childEvidence || childEvidence === 0;
    }) || children[0];
    const childName = child?.first_name || child?.name || 'A child';
    cards.push({
      id: 'no_evidence',
      text: `${childName} uploaded no evidence this week — try 1 artifact by Friday`,
      action: 'Upload',
      onPress: () => onNavigate?.('records?tab=portfolio'),
    });
  }
  
  // Check attendance pace
  if (weekHours < 15) {
    cards.push({
      id: 'light_attendance',
      text: 'Attendance pace is light — recommended 1 catch-up block',
      action: 'View progress',
      onPress: () => onNavigate?.('records'),
    });
  }
  
  // Limit to 3-4 cards max
  const displayCards = cards.slice(0, 4);
  
  if (displayCards.length === 0) return null;
  
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Here's what's shifting this week</Text>
      <View style={styles.divider} />
      <View style={styles.bulletsList}>
        {displayCards.map((card) => (
          <TouchableOpacity
            key={card.id}
            style={styles.bulletItem}
            onPress={card.onPress}
            activeOpacity={0.7}
          >
            <Text style={styles.bulletText}>• {card.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  bulletsList: {
    gap: 6,
  },
  bulletItem: {
    paddingVertical: 2,
  },
  bulletText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
});


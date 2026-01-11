/**
 * Child Micro Summary Component
 * "What each child needs today" - Co-Star style micro-summaries
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { UserCircle, ArrowRight } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function ChildMicroSummary({
  child,
  summary,
  onViewChild,
}) {
  if (!summary) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <UserCircle size={18} color={colors.accent} />
        </View>
        <Text style={styles.childName}>{child?.first_name || child?.name || 'Child'}</Text>
        {onViewChild && (
          <View style={styles.viewLink}>
            <ArrowRight size={12} color={colors.muted} />
          </View>
        )}
      </View>
      <Text style={styles.summaryText}>{summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    ...(Platform.OS === 'web' 
      ? { boxShadow: shadows.sm.boxShadow }
      : {
          shadowColor: shadows.sm.shadowColor,
          shadowOffset: shadows.sm.shadowOffset,
          shadowOpacity: shadows.sm.shadowOpacity,
          shadowRadius: shadows.sm.shadowRadius,
          elevation: shadows.sm.elevation,
        }
    ),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  viewLink: {
    padding: 4,
  },
  summaryText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    fontFamily: Platform.OS === 'web' ? 'Cooper Hewitt, sans-serif' : undefined,
  },
});


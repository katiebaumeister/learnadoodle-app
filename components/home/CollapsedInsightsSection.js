/**
 * Collapsed Insights Section
 * Co-Star style - heavy data hidden by default, accessible via "View full insights"
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function CollapsedInsightsSection({ 
  title = "View full insights",
  children 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.headerText}>{title}</Text>
        {isExpanded ? (
          <ChevronUp size={16} color={colors.muted} />
        ) : (
          <ChevronDown size={16} color={colors.muted} />
        )}
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  content: {
    paddingTop: 16,
    gap: 16,
  },
});


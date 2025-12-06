import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

export default function DailyEmotionalLine({ familyId, learning = [] }) {
  const [emotionalLine, setEmotionalLine] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (familyId) {
      generateEmotionalLine();
    } else {
      setLoading(false);
    }
  }, [familyId, learning]);

  const generateEmotionalLine = async () => {
    setLoading(true);
    try {
      // Calculate schedule density
      const eventCount = learning.length;
      const totalMinutes = learning.reduce((sum, event) => {
        const start = new Date(event.start_ts || event.start_local);
        const end = new Date(event.end_ts || event.end_local);
        return sum + (end - start) / (1000 * 60);
      }, 0);

      const density = eventCount > 0 ? totalMinutes / (eventCount * 60) : 0;
      
      // Generate emotional line based on schedule density
      // For now, use simple rules - can be enhanced with AI later
      let line = '';
      if (eventCount === 0) {
        line = "Today feels spacious — a good day for gentle learning.";
      } else if (density < 1.5) {
        line = "It's a light day. A little curiosity will go a long way.";
      } else if (density < 3) {
        line = "Everyone's energy is steady today.";
      } else {
        line = "Today might feel a bit full — small steps count.";
      }

      setEmotionalLine(line);
    } catch (err) {
      console.error('[DailyEmotionalLine] Error:', err);
      // Fallback
      setEmotionalLine("Today feels spacious — a good day for gentle learning.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }

  if (!emotionalLine) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{emotionalLine}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  text: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
});


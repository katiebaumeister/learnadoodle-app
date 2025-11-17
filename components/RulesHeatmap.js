import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';

const RulesHeatmap = ({ familyId, selectedChildId, selectedScope, style }) => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (familyId && (selectedScope === 'family' || selectedChildId)) {
      loadHeatmapData();
    }
  }, [familyId, selectedChildId, selectedScope]);

  const loadHeatmapData = async () => {
    try {
      setLoading(true);
      
      // Generate next 14 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14);
      
      let availabilityData = [];
      
      if (selectedScope === 'family') {
        // Get family-wide availability
        const { data, error } = await supabase
          .rpc('get_family_availability', {
            p_family_id: familyId,
            p_from_date: startDate.toISOString().split('T')[0],
            p_to_date: endDate.toISOString().split('T')[0]
          });

        if (error) throw error;
        availabilityData = data || [];
      } else {
        // Get child-specific availability
        const { data, error } = await supabase
          .rpc('get_child_availability', {
            p_child_id: selectedChildId,
            p_from_date: startDate.toISOString().split('T')[0],
            p_to_date: endDate.toISOString().split('T')[0]
          });

        if (error) throw error;
        availabilityData = data || [];
      }

      // Format data for heatmap
      const formattedData = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        let dayData;
        if (selectedScope === 'family') {
          // For family view, aggregate across all children
          dayData = availabilityData.find(item => item.date === dateStr);
        } else {
          dayData = availabilityData.find(item => item.date === dateStr);
        }

        formattedData.push({
          date: dateStr,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNumber: date.getDate(),
          availability: dayData || { day_status: 'off', start_time: null, end_time: null },
        });
      }

      setHeatmapData(formattedData);
    } catch (error) {
      console.error('Error loading heatmap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (dayStatus) => {
    switch (dayStatus) {
      case 'off': return '#ef4444'; // Red
      case 'teach': return '#10b981'; // Green
      case 'partial': return '#f59e0b'; // Orange
      default: return '#6b7280'; // Gray
    }
  };

  const getStatusText = (dayStatus) => {
    switch (dayStatus) {
      case 'off': return 'Off';
      case 'teach': return 'Teach';
      case 'partial': return 'Partial';
      default: return 'Unknown';
    }
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const renderHeatmapDay = (day) => {
    const statusColor = getStatusColor(day.availability.day_status);
    const statusText = getStatusText(day.availability.day_status);

    return (
      <TouchableOpacity
        key={day.date}
        style={[styles.dayCard, { backgroundColor: statusColor }]}
        onPress={() => setShowDetails(!showDetails)}
      >
        <Text style={styles.dayName}>{day.dayName}</Text>
        <Text style={styles.dayNumber}>{day.dayNumber}</Text>
        <Text style={styles.statusText}>{statusText}</Text>
        
        {showDetails && day.availability.start_time && day.availability.end_time && (
          <Text style={styles.timeText}>
            {formatTime(day.availability.start_time)} - {formatTime(day.availability.end_time)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderLegend = () => (
    <View style={styles.legend}>
      <Text style={styles.legendTitle}>Teaching Schedule</Text>
      <View style={styles.legendItems}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#10b981' }]} />
          <Text style={styles.legendText}>Teaching Hours</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendText}>Off Days</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.legendText}>Partial Days</Text>
        </View>
      </View>
    </View>
  );

  const renderSummary = () => {
    const teachDays = heatmapData.filter(day => day.availability.day_status === 'teach').length;
    const offDays = heatmapData.filter(day => day.availability.day_status === 'off').length;
    const partialDays = heatmapData.filter(day => day.availability.day_status === 'partial').length;

    return (
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Next 14 Days</Text>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNumber}>{teachDays}</Text>
            <Text style={styles.summaryLabel}>Teaching Days</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNumber}>{offDays}</Text>
            <Text style={styles.summaryLabel}>Off Days</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNumber}>{partialDays}</Text>
            <Text style={styles.summaryLabel}>Partial Days</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.loadingText}>Loading schedule...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule Overview</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadHeatmapData}
        >
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {renderSummary()}
      
      <View style={styles.heatmapContainer}>
        <View style={styles.heatmapGrid}>
          {heatmapData.map(renderHeatmapDay)}
        </View>
      </View>
      
      {renderLegend()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  refreshButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  summary: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  heatmapContainer: {
    marginBottom: 16,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayCard: {
    width: '13%',
    aspectRatio: 1,
    borderRadius: 6,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 1,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 1,
  },
  statusText: {
    fontSize: 8,
    color: '#ffffff',
    textAlign: 'center',
  },
  timeText: {
    fontSize: 7,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
    marginTop: 1,
  },
  legend: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  legendItem: {
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginBottom: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#6b7280',
  },
});

export default RulesHeatmap;

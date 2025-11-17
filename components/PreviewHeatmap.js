import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import WhyChip from './WhyChip';

const PreviewHeatmap = ({ previewData, selectedChildId, selectedScope }) => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [familyId, setFamilyId] = useState(null);

  useEffect(() => {
    if (selectedScope === 'child' && selectedChildId) {
      loadHeatmapData();
    }
  }, [selectedChildId, selectedScope]);

  const loadHeatmapData = async () => {
    try {
      setLoading(true);
      
      // Get family ID for WhyChip
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('family_id')
        .eq('id', selectedChildId)
        .single();
      
      if (childError) throw childError;
      setFamilyId(childData.family_id);
      
      // Generate next 14 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14);
      
      // Get availability data
      const { data: availabilityData, error: availabilityError } = await supabase
        .rpc('get_child_availability', {
          p_child_id: selectedChildId,
          p_from_date: startDate.toISOString().split('T')[0],
          p_to_date: endDate.toISOString().split('T')[0]
        });

      if (availabilityError) throw availabilityError;

      // Get events data
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('child_id', selectedChildId)
        .gte('start_ts', startDate.toISOString())
        .lte('start_ts', endDate.toISOString())
        .eq('status', 'scheduled');

      if (eventsError) throw eventsError;

      // Combine and format data
      const formattedData = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const availability = availabilityData?.find(item => item.date === dateStr);
        const events = eventsData?.filter(event => 
          event.start_ts.split('T')[0] === dateStr
        ) || [];

        formattedData.push({
          date: dateStr,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNumber: date.getDate(),
          availability: availability || { day_status: 'off', start_time: null, end_time: null },
          events: events,
        });
      }

      setHeatmapData(formattedData);
    } catch (error) {
      console.error('Error loading heatmap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshCache = async () => {
    try {
      setLoading(true);
      
      // Get family ID from child
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('family_id')
        .eq('id', selectedChildId)
        .single();
      
      if (childError) throw childError;
      
      // Refresh cache for next 90 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + 90);
      
      const { error: refreshError } = await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: childData.family_id,
        p_from_date: startDate.toISOString().split('T')[0],
        p_to_date: endDate.toISOString().split('T')[0]
      });
      
      if (refreshError) throw refreshError;
      
      // Reload heatmap data
      await loadHeatmapData();
      
      Alert.alert('Success', 'Cache refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing cache:', error);
      Alert.alert('Error', 'Failed to refresh cache. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (dayStatus, hasEvents) => {
    if (dayStatus === 'off') return '#ef4444'; // Red
    if (dayStatus === 'teach') return hasEvents ? '#fbbf24' : '#10b981'; // Yellow if has events, green if free
    if (dayStatus === 'partial') return '#f59e0b'; // Orange
    return '#6b7280'; // Gray for unknown
  };

  const getStatusText = (dayStatus, hasEvents) => {
    if (dayStatus === 'off') return 'Off';
    if (dayStatus === 'teach') return hasEvents ? 'Busy' : 'Free';
    if (dayStatus === 'partial') return 'Partial';
    return 'Unknown';
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const renderHeatmapDay = (day) => {
    const hasEvents = day.events.length > 0;
    const statusColor = getStatusColor(day.availability.day_status, hasEvents);
    const statusText = getStatusText(day.availability.day_status, hasEvents);

    return (
      <View key={day.date} style={styles.dayContainer}>
        <View style={[styles.dayCard, { backgroundColor: statusColor }]}>
          <Text style={styles.dayName}>{day.dayName}</Text>
          <Text style={styles.dayNumber}>{day.dayNumber}</Text>
          <Text style={styles.statusText}>{statusText}</Text>
          
          {day.availability.start_time && day.availability.end_time && (
            <Text style={styles.timeText}>
              {formatTime(day.availability.start_time)} - {formatTime(day.availability.end_time)}
            </Text>
          )}
          
          {hasEvents && (
            <Text style={styles.eventsCount}>
              {day.events.length} event{day.events.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        
        {familyId && (
          <WhyChip
            childId={selectedChildId}
            date={day.date}
            familyId={familyId}
            style={styles.whyChip}
          />
        )}
      </View>
    );
  };

  const renderLegend = () => (
    <View style={styles.legend}>
      <Text style={styles.legendTitle}>Legend</Text>
      <View style={styles.legendItems}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#10b981' }]} />
          <Text style={styles.legendText}>Free (teach)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#fbbf24' }]} />
          <Text style={styles.legendText}>Busy (has events)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendText}>Off</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.legendText}>Partial</Text>
        </View>
      </View>
    </View>
  );

  const renderSummary = () => {
    const freeDays = heatmapData.filter(day => 
      day.availability.day_status === 'teach' && day.events.length === 0
    ).length;
    const busyDays = heatmapData.filter(day => 
      day.availability.day_status === 'teach' && day.events.length > 0
    ).length;
    const offDays = heatmapData.filter(day => 
      day.availability.day_status === 'off'
    ).length;
    const partialDays = heatmapData.filter(day => 
      day.availability.day_status === 'partial'
    ).length;

    return (
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Next 14 Days Summary</Text>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNumber}>{freeDays}</Text>
            <Text style={styles.summaryLabel}>Free Days</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryNumber}>{busyDays}</Text>
            <Text style={styles.summaryLabel}>Busy Days</Text>
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
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading preview...</Text>
      </View>
    );
  }

  if (selectedScope !== 'child' || !selectedChildId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Select a child to see the preview heatmap
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {renderSummary()}
      
      <View style={styles.heatmapContainer}>
        <Text style={styles.heatmapTitle}>14-Day Preview</Text>
        <View style={styles.heatmapGrid}>
          {heatmapData.map(renderHeatmapDay)}
        </View>
      </View>
      
      {renderLegend()}
      
      <View style={styles.refreshContainer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadHeatmapData}
        >
          <Text style={styles.refreshButtonText}>Refresh Preview</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.refreshButton, styles.cacheRefreshButton]}
          onPress={refreshCache}
        >
          <Text style={styles.refreshButtonText}>Refresh Cache</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  summary: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  heatmapContainer: {
    marginBottom: 20,
  },
  heatmapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dayContainer: {
    width: '22%',
    alignItems: 'center',
  },
  dayCard: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    marginBottom: 4,
  },
  whyChip: {
    marginTop: 4,
  },
  dayName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 2,
  },
  timeText: {
    fontSize: 8,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
  },
  eventsCount: {
    fontSize: 8,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
    marginTop: 2,
  },
  legend: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  legendItems: {
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#374151',
  },
  refreshContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  refreshButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  cacheRefreshButton: {
    backgroundColor: '#f59e0b',
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
});

export default PreviewHeatmap;

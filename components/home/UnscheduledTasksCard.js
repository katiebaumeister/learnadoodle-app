import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Calendar, Clock, Zap, GripVertical } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { buildPlannerLink } from '../../lib/url';

// Get API base URL - use relative path if API is proxied, or absolute if separate server
const API_BASE = typeof window !== 'undefined' 
  ? (process.env.REACT_APP_API_URL || window.location.origin)
  : '';

export default function UnscheduledTasksCard({ familyId, onDragStart, onAutoPlace, onNavigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    loadBacklog();
  }, [familyId]);

  const loadBacklog = async () => {
    try {
      setLoading(true);
      // Use RPC directly
      const { data, error } = await supabase.rpc('get_flexible_backlog', {
        p_family_id: familyId
      });
      
      if (error) {
        console.error('Error loading flexible backlog:', error);
        setItems([]);
      } else {
        setItems(data || []);
      }
    } catch (err) {
      console.error('Error loading backlog:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDue = (dueTs) => {
    if (!dueTs) return null;
    const due = new Date(dueTs);
    const today = new Date();
    const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    if (days < 0) return `Overdue ${Math.abs(days)}d`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days <= 7) return `Due ${days}d`;
    return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Calendar size={16} color={colors.violetBold} />
          <Text style={styles.title}>Unscheduled tasks</Text>
        </View>
          <View style={styles.headerRight}>
            <Text style={styles.count}>{items.length}</Text>
            {onNavigate && (
              <TouchableOpacity
                onPress={() => {
                  onNavigate(buildPlannerLink({ view: 'week' }));
                  if (typeof window !== 'undefined') {
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('openBacklogDrawer'));
                    }, 500);
                  }
                }}
                style={styles.viewButton}
              >
                <Text style={styles.viewButtonText}>View backlog</Text>
              </TouchableOpacity>
            )}
          </View>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <View key={`${item.source}-${item.id}`} style={styles.item}>
            <TouchableOpacity
              style={styles.dragHandle}
              onPressIn={() => onDragStart?.(item)}
            >
              <GripVertical size={14} color={colors.muted} />
            </TouchableOpacity>
            
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.itemMeta}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Flexible</Text>
                </View>
                {item.estimated_minutes && (
                  <View style={styles.chip}>
                    <Clock size={10} color={colors.muted} />
                    <Text style={styles.chipText}>{item.estimated_minutes}m</Text>
                  </View>
                )}
                {item.due_ts && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{formatDue(item.due_ts)}</Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={styles.autoPlaceButton}
              onPress={() => onAutoPlace?.(item)}
            >
              <Zap size={12} color={colors.accent} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={styles.autoPlaceAllButton}
        onPress={() => {
          items.forEach(item => onAutoPlace?.(item));
        }}
      >
        <Zap size={14} color={colors.accentContrast} />
        <Text style={styles.autoPlaceAllText}>Auto-place all</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  count: {
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  list: {
    maxHeight: 300,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  dragHandle: {
    padding: 4,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 10,
    color: colors.muted,
  },
  autoPlaceButton: {
    padding: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
  },
  autoPlaceAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  autoPlaceAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    padding: 16,
  },
});


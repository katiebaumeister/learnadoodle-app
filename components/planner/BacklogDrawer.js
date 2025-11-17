import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Modal, TextInput, Alert } from 'react-native';
import { X, Filter, AlertCircle, Tag, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import FlexibleList from '../backlog/FlexibleList';
import SuggestionList from '../backlog/SuggestionList';
import { scheduleFlexible, acceptSuggestion, getPlanSuggestions } from '../../lib/apiClient';

const PRIORITY_COLORS = {
  high: { bg: colors.redSoft, text: colors.redBold },
  medium: { bg: colors.orangeSoft, text: colors.orangeBold },
  low: { bg: colors.blueSoft, text: colors.blueBold },
};

const TYPE_COLORS = {
  quiz: { bg: colors.violetSoft, text: colors.violetBold },
  test: { bg: colors.redSoft, text: colors.redBold },
  practice: { bg: colors.greenSoft, text: colors.greenBold },
  project: { bg: colors.indigoSoft, text: colors.indigoBold },
  reading: { bg: colors.blueSoft, text: colors.blueBold },
};

export default function BacklogDrawer({ 
  open, 
  onClose, 
  childId, 
  subjectId = null,
  familyId,
  onDragStart 
}) {
  const [activeTab, setActiveTab] = useState('flexible'); // 'flexible' | 'suggestions'
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterTests, setFilterTests] = useState(false);
  const [filterHighPriority, setFilterHighPriority] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [allTags, setAllTags] = useState([]);

  console.log('BacklogDrawer rendered, open:', open);

  useEffect(() => {
    if (open) {
      if (activeTab === 'flexible' && familyId) {
        loadFlexibleBacklog();
      } else if (activeTab === 'suggestions' && familyId) {
        loadSuggestions();
      } else if (activeTab === 'backlog' && childId) {
        loadBacklog();
      }
    }
  }, [open, activeTab, childId, familyId, subjectId, search, filterOverdue, filterTests, filterHighPriority, selectedTag]);

  const loadFlexibleBacklog = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_flexible_backlog', {
        p_family_id: familyId
      });

      if (error) throw error;

      let filtered = data || [];

      // Apply filters
      if (filterOverdue) {
        const today = new Date();
        filtered = filtered.filter(item => {
          if (!item.due_ts) return false;
          return new Date(item.due_ts) < today;
        });
      }

      if (search) {
        filtered = filtered.filter(item => 
          item.title.toLowerCase().includes(search.toLowerCase())
        );
      }

      setItems(filtered);
    } catch (error) {
      console.error('Error loading flexible backlog:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await getPlanSuggestions({
        familyId,
        childId: childId || null,
      });
      
      if (error) {
        console.error('Error loading suggestions:', error);
        setSuggestions([]);
        setLoading(false);
        return;
      }

      let filtered = data || [];

      if (search) {
        filtered = filtered.filter(s => 
          s.title?.toLowerCase().includes(search.toLowerCase())
        );
      }

      setSuggestions(filtered);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBacklog = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('events')
        .select('*')
        .eq('child_id', childId)
        .eq('status', 'backlog')
        .order('created_at', { ascending: false });

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      let filtered = data || [];

      // Apply filters
      if (filterOverdue) {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter(item => item.due_date && item.due_date < today);
      }

      if (filterTests) {
        filtered = filtered.filter(item => ['quiz', 'test'].includes(item.type));
      }

      if (filterHighPriority) {
        filtered = filtered.filter(item => item.priority === 'high');
      }

      if (selectedTag) {
        filtered = filtered.filter(item => item.tags && item.tags.includes(selectedTag));
      }

      setItems(filtered);

      // Extract all unique tags
      const tags = new Set();
      filtered.forEach(item => {
        if (item.tags) {
          item.tags.forEach(tag => tags.add(tag));
        }
      });
      setAllTags(Array.from(tags));

    } catch (error) {
      console.error('Error loading backlog:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (item) => {
    if (Platform.OS === 'web') {
      onDragStart?.(item);
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return dueDate < today;
  };

  // Always render Modal component, let it handle visibility
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay} nativeID="backlog-drawer-overlay">
        <TouchableOpacity 
          style={styles.overlayTouchable} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        <View style={styles.drawer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Backlog</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'flexible' && styles.tabActive]}
              onPress={() => setActiveTab('flexible')}
            >
              <Text style={[styles.tabText, activeTab === 'flexible' && styles.tabTextActive]}>
                Flexible
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'suggestions' && styles.tabActive]}
              onPress={() => setActiveTab('suggestions')}
            >
              <Text style={[styles.tabText, activeTab === 'suggestions' && styles.tabTextActive]}>
                Syllabus Suggestions
              </Text>
            </TouchableOpacity>
            {childId && (
              <TouchableOpacity
                style={[styles.tab, activeTab === 'backlog' && styles.tabActive]}
                onPress={() => setActiveTab('backlog')}
              >
                <Text style={[styles.tabText, activeTab === 'backlog' && styles.tabTextActive]}>
                  Backlog
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search tasks..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
            <TouchableOpacity
              style={[styles.filterChip, filterOverdue && styles.filterChipActive]}
              onPress={() => setFilterOverdue(!filterOverdue)}
              activeOpacity={0.7}
            >
              <AlertCircle size={14} color={filterOverdue ? colors.redBold : colors.text} />
              <Text style={[styles.filterChipText, filterOverdue && styles.filterChipTextActive]}>
                Overdue
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filterTests && styles.filterChipActive]}
              onPress={() => setFilterTests(!filterTests)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, filterTests && styles.filterChipTextActive]}>
                Tests
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filterHighPriority && styles.filterChipActive]}
              onPress={() => setFilterHighPriority(!filterHighPriority)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, filterHighPriority && styles.filterChipTextActive]}>
                High Priority
              </Text>
            </TouchableOpacity>

            {allTags.map(tag => (
              <TouchableOpacity
                key={tag}
                style={[styles.filterChip, selectedTag === tag && styles.filterChipActive]}
                onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
                activeOpacity={0.7}
              >
                <Tag size={14} color={selectedTag === tag ? colors.accent : colors.text} />
                <Text style={[styles.filterChipText, selectedTag === tag && styles.filterChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Content */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
            {loading ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : activeTab === 'flexible' ? (
              <FlexibleList
                items={items}
                onDragStart={handleDragStart}
                onAutoPlace={async (item) => {
                  try {
                    if (!familyId) {
                      console.error('No familyId for auto-place');
                      return;
                    }
                    
                    const { data, error } = await supabase.rpc('find_slot_for_flexible', {
                      p_family_id: familyId,
                      p_child_id: item.child_id || childId,
                      p_estimated_minutes: item.estimated_minutes || 30,
                      p_due_ts: item.due_ts,
                    });
                    
                    if (error) {
                      console.error('Error finding slot:', error);
                      Alert.alert('Error', 'Could not find a slot for this task');
                      return;
                    }
                    
                    if (data?.slot) {
                      const { error: scheduleError } = await scheduleFlexible({
                        source: item.source,
                        id: item.id,
                        targetDate: data.slot.start_ts,
                        familyId,
                        childId: item.child_id || childId,
                      });
                      
                      if (scheduleError) {
                        console.error('Error scheduling:', scheduleError);
                        Alert.alert('Error', 'Failed to schedule task');
                        return;
                      }
                      
                      // Reload backlog
                      loadFlexibleBacklog();
                      Alert.alert('Success', 'Task scheduled successfully');
                    } else {
                      Alert.alert('No Slot Found', 'Could not find an available time slot for this task');
                    }
                  } catch (err) {
                    console.error('Error auto-placing:', err);
                    Alert.alert('Error', 'Failed to auto-place task');
                  }
                }}
                onDelete={async (id) => {
                  Alert.alert(
                    'Delete Task',
                    'Are you sure you want to delete this flexible task?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            // Delete from events table if it's an event
                            const { error: eventError } = await supabase
                              .from('events')
                              .delete()
                              .eq('id', id)
                              .eq('status', 'backlog');
                            
                            if (eventError) {
                              // Try deleting from backlog_items if it exists
                              const { error: backlogError } = await supabase
                                .from('backlog_items')
                                .delete()
                                .eq('id', id);
                              
                              if (backlogError) {
                                throw backlogError;
                              }
                            }
                            
                            // Reload backlog
                            loadFlexibleBacklog();
                          } catch (err) {
                            console.error('Error deleting task:', err);
                            Alert.alert('Error', 'Failed to delete task');
                          }
                        },
                      },
                    ]
                  );
                }}
              />
            ) : activeTab === 'suggestions' ? (
              <SuggestionList
                items={suggestions}
                onAccept={async (item) => {
                  try {
                    const { error } = await acceptSuggestion({
                      id: item.id,
                      startTs: item.suggested_start_ts || new Date().toISOString(),
                    });
                    if (error) {
                      console.error('Error accepting suggestion:', error);
                      return;
                    }
                    // Reload suggestions
                    loadSuggestions();
                  } catch (err) {
                    console.error('Error in acceptSuggestion:', err);
                  }
                }}
                onDismiss={async (id) => {
                  try {
                    const { error } = await supabase
                      .from('plan_suggestions')
                      .update({ status: 'dismissed' })
                      .eq('id', id);
                    if (error) throw error;
                    loadSuggestions();
                  } catch (err) {
                    console.error('Error dismissing suggestion:', err);
                  }
                }}
              />
            ) : (
              items.length > 0 ? (
                items.map(item => (
                  <BacklogCard
                    key={item.id}
                    item={item}
                    onDragStart={handleDragStart}
                    isOverdue={isOverdue(item.due_date)}
                  />
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No backlog items</Text>
                  <Text style={styles.emptyHint}>
                    Add tasks to schedule them on your calendar
                  </Text>
                </View>
              )
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BacklogCard({ item, onDragStart, isOverdue }) {
  const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.low;
  const typeStyle = TYPE_COLORS[item.type] || TYPE_COLORS.practice;

  return (
    <View
      style={[styles.card, isOverdue && styles.cardOverdue]}
      draggable={Platform.OS === 'web'}
      onDragStart={() => onDragStart?.(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {isOverdue && (
          <View style={styles.overdueBadge}>
            <AlertCircle size={12} color={colors.redBold} />
          </View>
        )}
      </View>

      <View style={styles.cardMeta}>
        <View style={[styles.badge, { backgroundColor: priorityStyle.bg }]}>
          <Text style={[styles.badgeText, { color: priorityStyle.text }]}>
            {item.priority || 'medium'}
          </Text>
        </View>

        {item.type && (
          <View style={[styles.badge, { backgroundColor: typeStyle.bg }]}>
            <Text style={[styles.badgeText, { color: typeStyle.text }]}>
              {item.type}
            </Text>
          </View>
        )}

        <View style={styles.estimateBadge}>
          <Text style={styles.estimateText}>{item.estimate_minutes || 60}m</Text>
        </View>
      </View>

      {item.due_date && (
        <View style={styles.cardFooter}>
          <Calendar size={12} color={colors.muted} />
          <Text style={[styles.dueDate, isOverdue && styles.dueDateOverdue]}>
            Due: {new Date(item.due_date).toLocaleDateString()}
          </Text>
        </View>
      )}

      {item.tags && item.tags.length > 0 && (
        <View style={styles.tags}>
          {item.tags.slice(0, 3).map((tag, idx) => (
            <View key={idx} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999999,
    }),
  },
  overlayTouchable: {
    flex: 1,
  },
  drawer: {
    width: 380,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    ...shadows.md,
    ...(Platform.OS === 'web' && {
      position: 'relative',
      zIndex: 9999999,
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    padding: 16,
  },
  searchInput: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontSize: 14,
    color: colors.text,
    outlineStyle: 'none',
  },
  filters: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexGrow: 0,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueBold,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.text,
  },
  filterChipTextActive: {
    fontWeight: '500',
    color: colors.blueBold,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    ...(Platform.OS === 'web' && {
      cursor: 'grab',
    }),
  },
  cardOverdue: {
    borderColor: colors.redBold,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  overdueBadge: {
    padding: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  estimateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  estimateText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  dueDate: {
    fontSize: 12,
    color: colors.muted,
  },
  dueDateOverdue: {
    color: colors.redBold,
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.panel,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    color: colors.muted,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});

function FlexibleTaskCard({ item, onDragStart }) {
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

  return (
    <View style={styles.card} draggable={Platform.OS === 'web'} onDragStart={() => onDragStart?.(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Flexible</Text>
        </View>
      </View>
      <View style={styles.cardMeta}>
        {item.estimated_minutes && (
          <View style={styles.estimateBadge}>
            <Text style={styles.estimateText}>{item.estimated_minutes}m</Text>
          </View>
        )}
        {item.due_ts && (
          <View style={styles.cardFooter}>
            <Calendar size={12} color={colors.muted} />
            <Text style={styles.dueDate}>{formatDue(item.due_ts)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SuggestionCard({ suggestion, onDragStart }) {
  return (
    <View style={styles.card} draggable={Platform.OS === 'web'} onDragStart={() => onDragStart?.(suggestion)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{suggestion.title}</Text>
        <View style={[styles.badge, { backgroundColor: colors.violetSoft }]}>
          <Text style={[styles.badgeText, { color: colors.violetBold }]}>Suggestion</Text>
        </View>
      </View>
      <View style={styles.cardMeta}>
        {suggestion.estimated_minutes && (
          <View style={styles.estimateBadge}>
            <Text style={styles.estimateText}>{suggestion.estimated_minutes}m</Text>
          </View>
        )}
        {suggestion.target_day && (
          <View style={styles.cardFooter}>
            <Calendar size={12} color={colors.muted} />
            <Text style={styles.dueDate}>
              {new Date(suggestion.target_day).toLocaleDateString()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}


import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { 
  X, Search as SearchIcon, Calculator, BookOpen, FlaskConical, 
  ChevronDown, ChevronRight, Clock, Calendar, User, Filter,
  Edit, Eye, Move, CheckCircle, ExternalLink, Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSubjectAccent } from '../theme/designTokens';

// Subject icons mapping
const getSubjectIcon = (subjectName) => {
  if (!subjectName) return null;
  const name = subjectName.toLowerCase();
  if (name.includes('math') || name.includes('mathematics') || name.includes('algebra')) {
    return Calculator;
  }
  if (name.includes('science') || name.includes('biology') || name.includes('chemistry')) {
    return FlaskConical;
  }
  if (name.includes('reading') || name.includes('language') || name.includes('english')) {
    return BookOpen;
  }
  return null;
};

// Get subject color
const getSubjectColor = (subjectName) => {
  const accent = getSubjectAccent(subjectName);
  return accent.bold;
};

export default function EventSearch({ familyId, children = [], onEventSelect, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchMode, setSearchMode] = useState('Events');
  const [hoveredResult, setHoveredResult] = useState(null);
  
  // Recency sections state
  const [recentSearches, setRecentSearches] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [popularSubjects, setPopularSubjects] = useState([]);
  const [frequentlyViewed, setFrequentlyViewed] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});
  
  // Power filters state
  const [selectedChild, setSelectedChild] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState(null);
  
  // Animation for smooth entry
  const [isMounted, setIsMounted] = useState(false);
  const searchInputRef = useRef(null);
  
  useEffect(() => {
    setIsMounted(true);
    // Auto-focus search on mount (web only)
    if (Platform.OS === 'web' && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
    
    // Load recency data
    loadRecencyData();
    
    // Keyboard shortcut handler (⌘K or Ctrl+K)
    if (Platform.OS === 'web') {
      const handleKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  const loadRecencyData = async () => {
    // Load recent searches from localStorage
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem('ld_recent_searches');
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    }
    
    // Load recently viewed events
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem('ld_recently_viewed');
      if (stored) {
        setRecentlyViewed(JSON.parse(stored).slice(0, 5));
      }
    }
    
    // Calculate popular subjects from recent events
    if (familyId) {
      try {
        const { data: recentEvents } = await supabase
          .from('events')
          .select('subject_name, subject')
          .eq('family_id', familyId)
          .gte('start_ts', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(100);
        
        if (recentEvents) {
          const subjectCounts = {};
          recentEvents.forEach(event => {
            const subject = event.subject_name || event.subject || 'Other';
            subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
          });
          const popular = Object.entries(subjectCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);
          setPopularSubjects(popular);
        }
      } catch (err) {
      }
    }
  };

  const saveRecentSearch = (query) => {
    if (Platform.OS === 'web' && query.trim()) {
      const stored = localStorage.getItem('ld_recent_searches') || '[]';
      const searches = JSON.parse(stored);
      const updated = [query, ...searches.filter(s => s !== query)].slice(0, 10);
      localStorage.setItem('ld_recent_searches', JSON.stringify(updated));
      setRecentSearches(updated.slice(0, 5));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !familyId) {
      setSearchResults([]);
      return;
    }
    
    saveRecentSearch(searchQuery);
    setIsSearching(true);
    try {
      const query = searchQuery.toLowerCase();
      const results = [];
      
      // Create a map of child IDs to names for quick lookup
      const childMap = {};
      children.forEach(child => {
        childMap[child.id] = child.first_name || 'Unknown';
      });
      
      // Build query with filters
      let eventsQuery = supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId);
      
      // Apply power filters
      if (selectedChild) {
        eventsQuery = eventsQuery.eq('child_id', selectedChild);
      }
      if (selectedType) {
        eventsQuery = eventsQuery.eq('event_type', selectedType);
      }
      if (selectedStatus === 'Completed') {
        eventsQuery = eventsQuery.eq('completed', true);
      } else if (selectedStatus === 'Missed') {
        eventsQuery = eventsQuery.eq('completed', false)
          .lt('start_ts', new Date().toISOString());
      } else if (selectedStatus === 'Upcoming') {
        eventsQuery = eventsQuery.gte('start_ts', new Date().toISOString());
      }
      if (selectedTimeframe === 'Today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        eventsQuery = eventsQuery.gte('start_ts', today.toISOString())
          .lt('start_ts', tomorrow.toISOString());
      } else if (selectedTimeframe === 'This Week') {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        eventsQuery = eventsQuery.gte('start_ts', weekStart.toISOString())
          .lt('start_ts', weekEnd.toISOString());
      } else if (selectedTimeframe === 'Next 30 days') {
        const thirtyDays = new Date();
        thirtyDays.setDate(thirtyDays.getDate() + 30);
        eventsQuery = eventsQuery.gte('start_ts', new Date().toISOString())
          .lte('start_ts', thirtyDays.toISOString());
      }
      
      // Search by title/description
      eventsQuery = eventsQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('start_ts', { ascending: true })
        .limit(100);

      const { data: events, error: eventsError } = await eventsQuery;

      if (eventsError) {
      } else if (events) {
        events.forEach(event => {
          const childName = event.child_id ? (childMap[event.child_id] || 'Unknown') : 'Unknown';
          const date = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : '';
          const eventType = event.event_type || event.source || 'event';
          const subjectName = event.subject_name || event.subject || '';
          const startTime = event.start_ts ? new Date(event.start_ts) : null;
          results.push({
            id: event.id,
            title: event.title,
            type: eventType,
            childName,
            childId: event.child_id,
            date,
            displayDate: date ? new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date',
            time: startTime ? startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
            subjectName,
            event: event
          });
        });
      }

      // Search by child name
      const childMatches = children.filter(child => {
        const firstName = (child.first_name || '').toLowerCase();
        const lastName = (child.last_name || '').toLowerCase();
        return firstName.includes(query) || lastName.includes(query);
      });

      if (childMatches.length > 0) {
        const childIds = childMatches.map(c => c.id);
        let childQuery = supabase
          .from('events')
          .select('*')
          .eq('family_id', familyId)
          .in('child_id', childIds)
          .order('start_ts', { ascending: true })
          .limit(100);

        const { data: childEvents, error: childError } = await childQuery;

        if (childError) {
        } else if (childEvents) {
          childEvents.forEach(event => {
            if (!results.find(r => r.id === event.id)) {
              const childName = event.child_id ? (childMap[event.child_id] || 'Unknown') : 'Unknown';
              const date = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : '';
              const eventType = event.event_type || event.source || 'event';
              const subjectName = event.subject_name || event.subject || '';
              const startTime = event.start_ts ? new Date(event.start_ts) : null;
              results.push({
                id: event.id,
                title: event.title,
                type: eventType,
                childName,
                childId: event.child_id,
                date,
                displayDate: date ? new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date',
                time: startTime ? startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
                subjectName,
                event: event
              });
            }
          });
        }
      }

      setSearchResults(results);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounce search
  useEffect(() => {
    if (searchQuery.trim()) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, familyId, selectedChild, selectedType, selectedStatus, selectedTimeframe]);

  // Group results by date
  const groupResultsByDate = (results) => {
    const grouped = {};
    results.forEach(result => {
      const key = result.date || 'No date';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(result);
    });
    return grouped;
  };

  const groupedResults = groupResultsByDate(searchResults);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleQuickAction = (action, result) => {
    if (action === 'view' && onEventSelect) {
      onEventSelect(result.event);
    } else if (action === 'edit') {
      // TODO: Open edit modal
} else if (action === 'complete') {
      // TODO: Mark as complete
} else if (action === 'planner') {
      // TODO: Navigate to planner
}
  };

  const suggestedFilters = [
    { label: 'Math', icon: Calculator, color: '#4f46e5' },
    { label: 'Reading', icon: BookOpen, color: '#7c3aed' },
    { label: 'Science', icon: FlaskConical, color: '#059669' },
  ];

  const powerFilters = {
    children: children.map(c => ({ id: c.id, name: c.first_name })),
    types: ['Class', 'Self-paced', 'AI-generated', 'Assignment', 'Project', 'Event'],
    statuses: ['Completed', 'Missed', 'Upcoming'],
    timeframes: ['Today', 'This Week', 'Next 30 days'],
  };

  const searchModes = ['Events', 'Assignments', 'Notes', 'Everything'];

  return (
    <View 
      style={[
        styles.container,
        !isMounted && Platform.OS === 'web' && styles.containerInitial,
        isMounted && Platform.OS === 'web' && styles.containerAnimated,
      ]}
    >
      {/* Header with description */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>Search Events</Text>
              <Text style={styles.headerDescription}>
                Find anything across your planner — classes, tasks, AI-generated sessions, notes, and more.
              </Text>
            </View>
            {onClose && (
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Sticky Search Area */}
      <View style={styles.stickyHeader}>
        {/* Search Input */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchInput, isSearchFocused && styles.searchInputFocused]}>
            <SearchIcon size={18} color="#9ca3af" style={{ marginRight: 10, opacity: 0.7 }} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchTextInput}
              placeholder="Search events"
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {Platform.OS === 'web' && (
              <View style={styles.keyboardShortcut}>
                <Text style={styles.keyboardShortcutText}>⌘ K</Text>
              </View>
            )}
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Mode Switch */}
        <View style={styles.modeSwitch}>
          {searchModes.map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.modeButton, searchMode === mode && styles.modeButtonActive]}
              onPress={() => setSearchMode(mode)}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeButtonText, searchMode === mode && styles.modeButtonTextActive]}>
                {mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Power Filters */}
        {searchQuery && (
          <View style={styles.powerFiltersContainer}>
            <View style={styles.powerFiltersRow}>
              {selectedChild && (
                <TouchableOpacity
                  style={styles.powerFilterChip}
                  onPress={() => setSelectedChild(null)}
                >
                  <User size={12} color="#6b7280" />
                  <Text style={styles.powerFilterText}>
                    {children.find(c => c.id === selectedChild)?.first_name}
                  </Text>
                  <X size={12} color="#6b7280" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
              {selectedType && (
                <TouchableOpacity
                  style={styles.powerFilterChip}
                  onPress={() => setSelectedType(null)}
                >
                  <Filter size={12} color="#6b7280" />
                  <Text style={styles.powerFilterText}>{selectedType}</Text>
                  <X size={12} color="#6b7280" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
              {selectedStatus && (
                <TouchableOpacity
                  style={styles.powerFilterChip}
                  onPress={() => setSelectedStatus(null)}
                >
                  <Text style={styles.powerFilterText}>{selectedStatus}</Text>
                  <X size={12} color="#6b7280" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
              {selectedTimeframe && (
                <TouchableOpacity
                  style={styles.powerFilterChip}
                  onPress={() => setSelectedTimeframe(null)}
                >
                  <Calendar size={12} color="#6b7280" />
                  <Text style={styles.powerFilterText}>{selectedTimeframe}</Text>
                  <X size={12} color="#6b7280" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.powerFiltersGrid}>
              {powerFilters.children.length > 0 && (
                <View style={styles.powerFilterGroup}>
                  <Text style={styles.powerFilterLabel}>By child</Text>
                  <View style={styles.powerFilterChips}>
                    {powerFilters.children.map(child => (
                      <TouchableOpacity
                        key={child.id}
                        style={[styles.powerFilterChipSmall, selectedChild === child.id && styles.powerFilterChipActive]}
                        onPress={() => setSelectedChild(selectedChild === child.id ? null : child.id)}
                      >
                        <User size={12} color={selectedChild === child.id ? '#6d8bff' : '#6b7280'} />
                        <Text style={[styles.powerFilterTextSmall, selectedChild === child.id && styles.powerFilterTextActive]}>
                          {child.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={styles.powerFilterGroup}>
                <Text style={styles.powerFilterLabel}>By type</Text>
                <View style={styles.powerFilterChips}>
                  {powerFilters.types.map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.powerFilterChipSmall, selectedType === type && styles.powerFilterChipActive]}
                      onPress={() => setSelectedType(selectedType === type ? null : type)}
                    >
                      <Text style={[styles.powerFilterTextSmall, selectedType === type && styles.powerFilterTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.powerFilterGroup}>
                <Text style={styles.powerFilterLabel}>By status</Text>
                <View style={styles.powerFilterChips}>
                  {powerFilters.statuses.map(status => (
                    <TouchableOpacity
                      key={status}
                      style={[styles.powerFilterChipSmall, selectedStatus === status && styles.powerFilterChipActive]}
                      onPress={() => setSelectedStatus(selectedStatus === status ? null : status)}
                    >
                      <Text style={[styles.powerFilterTextSmall, selectedStatus === status && styles.powerFilterTextActive]}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.powerFilterGroup}>
                <Text style={styles.powerFilterLabel}>By timeframe</Text>
                <View style={styles.powerFilterChips}>
                  {powerFilters.timeframes.map(timeframe => (
                    <TouchableOpacity
                      key={timeframe}
                      style={[styles.powerFilterChipSmall, selectedTimeframe === timeframe && styles.powerFilterChipActive]}
                      onPress={() => setSelectedTimeframe(selectedTimeframe === timeframe ? null : timeframe)}
                    >
                      <Calendar size={12} color={selectedTimeframe === timeframe ? '#6d8bff' : '#6b7280'} />
                      <Text style={[styles.powerFilterTextSmall, selectedTimeframe === timeframe && styles.powerFilterTextActive]}>
                        {timeframe}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Suggested Filters - Only show when no query */}
        {!searchQuery && (
          <View style={styles.filtersCard}>
            <Text style={styles.sectionLabel}>Suggested Filters</Text>
            <View style={styles.filtersRow}>
              {suggestedFilters.map((filter) => {
                const IconComponent = filter.icon;
                return (
                  <TouchableOpacity
                    key={filter.label}
                    style={styles.filterChip}
                    onPress={() => setSearchQuery(filter.label)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' ? {
                      className: 'chip',
                      title: `Show all ${filter.label.toLowerCase()} events`
                    } : {})}
                  >
                    <IconComponent size={14} color={filter.color} />
                    <Text style={styles.filterChipText}>{filter.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Content Container */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.contentWrapper}>
          {/* Recency Sections - Only show when no query */}
          {!searchQuery && (
            <View style={styles.recencySections}>
              {recentSearches.length > 0 && (
                <View style={styles.recencySection}>
                  <TouchableOpacity
                    style={styles.recencySectionHeader}
                    onPress={() => toggleSection('recentSearches')}
                  >
                    {expandedSections.recentSearches ? (
                      <ChevronDown size={16} color="#6b7280" />
                    ) : (
                      <ChevronRight size={16} color="#6b7280" />
                    )}
                    <Text style={styles.recencySectionTitle}>Recent Searches</Text>
                  </TouchableOpacity>
                  {expandedSections.recentSearches && (
                    <View style={styles.recencySectionContent}>
                      {recentSearches.map((search, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.recencyItem}
                          onPress={() => setSearchQuery(search)}
                        >
                          <Clock size={14} color="#9ca3af" />
                          <Text style={styles.recencyItemText}>{search}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
              
              {recentlyViewed.length > 0 && (
                <View style={styles.recencySection}>
                  <TouchableOpacity
                    style={styles.recencySectionHeader}
                    onPress={() => toggleSection('recentlyViewed')}
                  >
                    {expandedSections.recentlyViewed ? (
                      <ChevronDown size={16} color="#6b7280" />
                    ) : (
                      <ChevronRight size={16} color="#6b7280" />
                    )}
                    <Text style={styles.recencySectionTitle}>Recently Viewed Events</Text>
                  </TouchableOpacity>
                  {expandedSections.recentlyViewed && (
                    <View style={styles.recencySectionContent}>
                      {recentlyViewed.map((item, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.recencyItem}
                          onPress={() => {
                            if (onEventSelect) onEventSelect(item);
                          }}
                        >
                          <Eye size={14} color="#9ca3af" />
                          <Text style={styles.recencyItemText}>{item.title || 'Untitled'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
              
              {popularSubjects.length > 0 && (
                <View style={styles.recencySection}>
                  <TouchableOpacity
                    style={styles.recencySectionHeader}
                    onPress={() => toggleSection('popularSubjects')}
                  >
                    {expandedSections.popularSubjects ? (
                      <ChevronDown size={16} color="#6b7280" />
                    ) : (
                      <ChevronRight size={16} color="#6b7280" />
                    )}
                    <Text style={styles.recencySectionTitle}>Popular Subjects This Week</Text>
                  </TouchableOpacity>
                  {expandedSections.popularSubjects && (
                    <View style={styles.recencySectionContent}>
                      {popularSubjects.map((subject, idx) => {
                        const IconComponent = getSubjectIcon(subject);
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={styles.recencyItem}
                            onPress={() => setSearchQuery(subject)}
                          >
                            {IconComponent && <IconComponent size={14} color={getSubjectColor(subject)} />}
                            <Text style={styles.recencyItemText}>{subject}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Empty State - No Query */}
          {!searchQuery && searchResults.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <SearchIcon size={64} color="#d1d5db" style={{ opacity: 0.15 }} />
                <Sparkles size={32} color="#7c8cff" style={{ position: 'absolute', top: 16, right: 16, opacity: 0.3 }} />
              </View>
              <Text style={styles.emptyStateText}>Start typing to search across all events.</Text>
              <Text style={styles.emptyStateHint}>
                Try these examples: "Biographies", "Science", "Math"
              </Text>
              <View style={styles.emptyStateChips}>
                <TouchableOpacity
                  style={styles.emptyStateChip}
                  onPress={() => setSearchQuery('Algebra I')}
                >
                  <Text style={styles.emptyStateChipText}>Try: Algebra I</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emptyStateChip}
                  onPress={() => setSearchQuery(`${children[0]?.first_name || 'Enzo'}'s Reading`)}
                >
                  <Text style={styles.emptyStateChipText}>Try: {children[0]?.first_name || 'Enzo'}'s Reading</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emptyStateChip}
                  onPress={() => setSearchQuery('Last week')}
                >
                  <Text style={styles.emptyStateChipText}>Try: Last week</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Search Results - Grouped */}
          {searchQuery.length > 0 && (
            <View style={styles.resultsContainer}>
              {isSearching ? (
                <View style={styles.loadingState}>
                  <Text style={styles.loadingText}>Searching...</Text>
                </View>
              ) : searchResults.length > 0 ? (
                <View style={styles.resultsList}>
                  {Object.entries(groupedResults).map(([date, dateResults]) => (
                    <View key={date} style={styles.resultGroup}>
                      <Text style={styles.resultGroupHeader}>{date}</Text>
                      {dateResults.map((result, index) => {
                        const SubjectIcon = getSubjectIcon(result.subjectName);
                        const subjectColor = getSubjectColor(result.subjectName);
                        return (
                          <TouchableOpacity
                            key={`${result.id}-${index}`}
                            style={styles.resultCard}
                            onPress={() => {
                              if (onEventSelect) {
                                onEventSelect(result.event);
                              }
                            }}
                            activeOpacity={0.7}
                            {...(Platform.OS === 'web' && {
                              onMouseEnter: () => setHoveredResult(result.id),
                              onMouseLeave: () => setHoveredResult(null),
                            })}
                          >
                            <View style={styles.resultCardContent}>
                              <View style={styles.resultCardLeft}>
                                {SubjectIcon && (
                                  <View style={[styles.subjectDot, { backgroundColor: subjectColor + '20' }]}>
                                    <SubjectIcon size={12} color={subjectColor} />
                                  </View>
                                )}
                                <View style={styles.resultCardText}>
                                  <Text style={styles.resultTitle}>{result.title}</Text>
                                  <Text style={styles.resultMeta}>
                                    {result.time && `${result.time} • `}
                                    {result.childName}
                                    {result.subjectName && ` • ${result.subjectName}`}
                                  </Text>
                                </View>
                              </View>
                              {hoveredResult === result.id && Platform.OS === 'web' && (
                                <View style={styles.resultActions}>
                                  <TouchableOpacity
                                    style={styles.resultAction}
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleQuickAction('view', result);
                                    }}
                                  >
                                    <Eye size={14} color="#6b7280" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.resultAction}
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleQuickAction('edit', result);
                                    }}
                                  >
                                    <Edit size={14} color="#6b7280" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.resultAction}
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleQuickAction('complete', result);
                                    }}
                                  >
                                    <CheckCircle size={14} color="#6b7280" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.resultAction}
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleQuickAction('planner', result);
                                    }}
                                  >
                                    <ExternalLink size={14} color="#6b7280" />
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.noResultsState}>
                  <Text style={styles.noResultsText}>No results found</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa', // Softer background
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(229, 231, 235, 0.6)',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(4px)',
      transition: 'opacity 0.15s cubic-bezier(0.16, 0.84, 0.44, 1), transform 0.15s cubic-bezier(0.16, 0.84, 0.44, 1)',
      boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.04)', // Shadow separating from calendar
      borderTopLeftRadius: 12, // Rounded top-left corner
    }),
  },
  containerInitial: {
    ...(Platform.OS === 'web' && {
      opacity: 0,
      transform: 'translateX(10px)',
    }),
  },
  containerAnimated: {
    ...(Platform.OS === 'web' && {
      opacity: 1,
      transform: 'translateX(0)',
    }),
  },
  header: {
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243, 244, 246, 0.7)',
    backgroundColor: '#fafafa',
  },
  headerTop: {
    marginBottom: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    maxWidth: 480,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  stickyHeader: {
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: 'rgba(250, 250, 250, 0.95)',
      backdropFilter: 'blur(4px)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(243, 244, 246, 0.7)',
    }),
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    height: 42,
    ...(Platform.OS === 'web' && {
      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)', // Inset shadow
      transition: 'all 0.2s ease',
    }),
  },
  searchInputFocused: {
    borderColor: '#6d8bff', // Auto-focus glow (soft purple)
    ...(Platform.OS === 'web' && {
      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05), 0 0 0 3px rgba(109, 139, 255, 0.1)', // Focus glow
    }),
  },
  searchTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    padding: 0,
    margin: 0,
  },
  keyboardShortcut: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    marginRight: 8,
    ...(Platform.OS === 'web' && {
      borderWidth: 1,
      borderColor: '#e5e7eb',
    }),
  },
  keyboardShortcutText: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
    letterSpacing: 0.5,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    }),
  },
  modeButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  powerFiltersContainer: {
    marginBottom: 12,
  },
  powerFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  powerFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 16,
  },
  powerFilterText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  powerFiltersGrid: {
    gap: 16,
  },
  powerFilterGroup: {
    marginBottom: 12,
  },
  powerFilterLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#9ca3af',
    marginBottom: 8,
    fontWeight: '600',
  },
  powerFilterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  powerFilterChipSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  powerFilterChipActive: {
    backgroundColor: '#e6eaff',
    borderColor: '#6d8bff',
  },
  powerFilterTextSmall: {
    fontSize: 12,
    color: '#6b7280',
  },
  powerFilterTextActive: {
    color: '#6d8bff',
    fontWeight: '500',
  },
  filtersCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(107, 114, 128, 0.8)',
    marginBottom: 12,
    fontWeight: '600',
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // On web, chip class handles styling
    ...(Platform.OS === 'web' ? {
      height: 32,
    } : {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#f3f4f6',
    }),
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    // On web, CSS handles color
    ...(Platform.OS === 'web' ? {} : {
      color: '#4b5563',
    }),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  contentWrapper: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  recencySections: {
    marginBottom: 24,
  },
  recencySection: {
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  recencySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  recencySectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  recencySectionContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  recencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      ':hover': {
        backgroundColor: '#f9fafb',
        borderRadius: 6,
      },
    }),
  },
  recencyItemText: {
    fontSize: 13,
    color: '#6b7280',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
    paddingVertical: 40,
  },
  emptyStateIcon: {
    position: 'relative',
    marginBottom: 24,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  emptyStateChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  emptyStateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyStateChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  resultsContainer: {
    marginTop: 8,
  },
  loadingState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  resultsList: {
    gap: 24,
  },
  resultGroup: {
    marginBottom: 24,
  },
  resultGroupHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      ':hover': {
        borderColor: '#e5e7eb',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  resultCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  resultCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  subjectDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCardText: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  resultMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  resultAction: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#f3f4f6',
      },
    }),
  },
  noResultsState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

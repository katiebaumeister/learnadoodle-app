import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function EventSearch({ familyId, children = [], onEventSelect, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !familyId) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const query = searchQuery.toLowerCase();
      const results = [];
      
      // Create a map of child IDs to names for quick lookup
      const childMap = {};
      children.forEach(child => {
        childMap[child.id] = child.first_name || 'Unknown';
      });
      
      // Search events by title/description
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('start_ts', { ascending: true })
        .limit(100);

      if (eventsError) {
        console.error('Events search error:', eventsError);
      } else if (events) {
        events.forEach(event => {
          const childName = event.child_id ? (childMap[event.child_id] || 'Unknown') : 'Unknown';
          const date = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : '';
          const eventType = event.event_type || event.source || 'event';
          results.push({
            id: event.id,
            title: event.title,
            type: eventType,
            childName,
            date,
            displayDate: date ? new Date(date).toLocaleDateString() : 'No date',
            event: event
          });
        });
      }

      // Search by child name - find matching children first
      const childMatches = children.filter(child => {
        const firstName = (child.first_name || '').toLowerCase();
        const lastName = (child.last_name || '').toLowerCase();
        return firstName.includes(query) || lastName.includes(query);
      });

      if (childMatches.length > 0) {
        const childIds = childMatches.map(c => c.id);
        const { data: childEvents, error: childError } = await supabase
          .from('events')
          .select('*')
          .eq('family_id', familyId)
          .in('child_id', childIds)
          .order('start_ts', { ascending: true })
          .limit(100);

        if (childError) {
          console.error('Child events search error:', childError);
        } else if (childEvents) {
          childEvents.forEach(event => {
            // Avoid duplicates
            if (!results.find(r => r.id === event.id)) {
              const childName = event.child_id ? (childMap[event.child_id] || 'Unknown') : 'Unknown';
              const date = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : '';
              const eventType = event.event_type || event.source || 'event';
              results.push({
                id: event.id,
                title: event.title,
                type: eventType,
                childName,
                date,
                displayDate: date ? new Date(date).toLocaleDateString() : 'No date',
                event: event
              });
            }
          });
        }
      }

      // Also search lessons if they exist (optional)
      try {
        const { data: lessons, error: lessonsError } = await supabase
          .from('lessons')
          .select('*')
          .eq('family_id', familyId)
          .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
          .order('lesson_date', { ascending: true })
          .limit(50);

        if (!lessonsError && lessons) {
          lessons.forEach(lesson => {
            const childName = lesson.child_id ? (childMap[lesson.child_id] || 'Unknown') : 'Unknown';
            const date = lesson.lesson_date || '';
            results.push({
              id: lesson.id,
              title: lesson.title || 'Untitled Lesson',
              type: 'lesson',
              childName,
              date,
              displayDate: date ? new Date(date).toLocaleDateString() : 'No date',
              event: lesson
            });
          });
        }
      } catch (lessonsErr) {
        // Lessons table might not exist, that's okay
        console.log('Lessons search skipped');
      }

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
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
  }, [searchQuery, familyId]);

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {onClose && (
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: '#f3f4f6',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={16} color="#6b7280" />
        </TouchableOpacity>
      )}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
            Search Events
          </Text>
          <Text style={{ fontSize: 14, color: '#6b7280' }}>
            Search by event name, child name, or description
          </Text>
        </View>

        {/* Search Input */}
        <View style={{ marginBottom: 24, flexShrink: 0 }}>
          <View 
            style={{
              backgroundColor: isSearchFocused ? '#ffffff' : '#f8fafc',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isSearchFocused ? '#e1e5e9' : 'transparent',
              paddingHorizontal: 16,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center'
            }}
          >
            <TextInput
              style={{ 
                flex: 1,
                fontSize: 14, 
                color: '#374151',
                backgroundColor: 'transparent',
                borderWidth: 0,
                padding: 0,
                margin: 0,
                outline: 'none'
              }}
              placeholder="Search events"
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                onPress={() => setSearchQuery('')}
                style={{ padding: 4 }}
              >
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Results */}
        {searchQuery.length > 0 && (
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 12
            }}>
              Search Results
            </Text>
            {isSearching ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <Text style={{ color: '#6b7280', textAlign: 'center' }}>Searching...</Text>
              </View>
            ) : searchResults.length > 0 ? (
              <View style={{ gap: 8 }}>
                {searchResults.map((result, index) => (
                  <TouchableOpacity
                    key={`search-result-${result.type}-${result.id}-${index}`}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: 6,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: '#e1e5e9'
                    }}
                    onPress={() => {
                      if (onEventSelect) {
                        onEventSelect(result.event);
                      }
                    }}
                  >
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '500',
                      color: '#111827',
                      marginBottom: 4
                    }}>
                      {result.title}
                    </Text>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}>
                      {result.type} • {result.childName} • {result.displayDate}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                  No results found
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Empty State */}
        {!searchQuery && (
          <View style={{ marginTop: 20, flexShrink: 0 }}>
            <Text style={{
              fontSize: 14,
              color: '#6b7280',
              textAlign: 'left'
            }}>
              Enter a search query to find events
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}


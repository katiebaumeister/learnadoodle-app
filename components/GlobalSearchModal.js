import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, ActivityIndicator, Platform, Modal } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getChildren } from '../lib/apiClient';

export default function GlobalSearchModal({ onClose, onNavigate }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [familyId, setFamilyId] = useState(null);
  const inputRef = useRef(null);

  // Get family_id on mount
  useEffect(() => {
    const fetchFamilyId = async () => {
      if (!user) return;
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();
        if (profileData?.family_id) {
          setFamilyId(profileData.family_id);
        }
      } catch (error) {
        console.error('Error fetching family_id:', error);
      }
    };
    fetchFamilyId();
  }, [user]);

  // Focus input when modal opens
  useEffect(() => {
    if (Platform.OS === 'web' && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (!familyId) {
      return;
    }

    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const results = [];
        const searchLower = query.toLowerCase();

        // Fetch children for name lookup
        let childrenData = null;
        let childrenError = null;
        
        // Try direct Supabase query first
        const supabaseResult = await supabase
          .from('children')
          .select('id, first_name')
          .eq('family_id', familyId)
          .eq('archived', false);
        
        childrenData = supabaseResult.data;
        childrenError = supabaseResult.error;

        // Fallback to API endpoint if direct query fails
        if (childrenError) {
          console.warn('[GlobalSearchModal] Direct Supabase query failed, trying API endpoint:', childrenError);
          try {
            const apiResult = await getChildren();
            if (apiResult.data && !apiResult.error) {
              // Map API response format to expected format
              childrenData = apiResult.data.map(child => ({
                id: child.id,
                first_name: child.name || child.first_name || ''
              }));
              childrenError = null;
              console.log('[GlobalSearchModal] Successfully fetched children via API:', childrenData.length);
            } else {
              console.error('[GlobalSearchModal] API endpoint also failed:', apiResult.error);
            }
          } catch (apiErr) {
            console.error('[GlobalSearchModal] Error calling API endpoint:', apiErr);
          }
        }

        if (childrenError && !childrenData) {
          console.error('Error fetching children for search:', childrenError);
        }

        console.log('[GlobalSearchModal] Children query result:', { 
          data: childrenData, 
          error: childrenError, 
          count: childrenData?.length || 0,
          familyId 
        });

        const childrenMap = {};
        if (childrenData) {
          childrenData.forEach((child) => {
            childrenMap[child.id] = child.first_name || 'Unknown';
          });
        }

        // 0) Search Children by name and add their sections
        const childSections = [
          { key: 'overview', label: 'Overview' },
          { key: 'schedule', label: 'Schedule' },
          { key: 'assignments', label: 'Assignments' },
          { key: 'projects', label: 'Projects' },
          { key: 'syllabus', label: 'Syllabus' },
          { key: 'portfolio', label: 'Portfolio' },
          { key: 'notes', label: 'Notes' },
        ];

        if (childrenData) {
          const matchingChildren = childrenData.filter((child) => {
            const firstName = (child.first_name || '').toLowerCase();
            return firstName.includes(searchLower);
          });

          console.log('[GlobalSearchModal] Matching children for query:', {
            query: searchLower,
            totalChildren: childrenData.length,
            matchingCount: matchingChildren.length,
            matches: matchingChildren.map(c => ({ 
              id: c.id, 
              first_name: c.first_name
            }))
          });

          matchingChildren.forEach((child) => {
            const childName = child.first_name || 'Unknown';
            const firstName = (child.first_name || '').toLowerCase();
            const childMatches = firstName.includes(searchLower);
            
            // Add child profile result
            results.push({
              id: `child-${child.id}`,
              type: 'child',
              title: childName,
              subtitle: 'Child Profile',
              payload: { childId: child.id, section: 'overview' },
            });

            // Add child section results - show all sections when child name matches
            childSections.forEach((section) => {
              const sectionMatches = section.label.toLowerCase().includes(searchLower);
              // Show sections if this child matches OR section name matches
              if (childMatches || sectionMatches) {
                results.push({
                  id: `child-${child.id}-${section.key}`,
                  type: 'child-section',
                  title: `${childName} - ${section.label}`,
                  subtitle: `View ${section.label.toLowerCase()}`,
                  payload: { childId: child.id, section: section.key },
                });
              }
            });
          });
        }

        // 1) Search Events
        const { data: events, error: eventsError } = await supabase
          .from('events')
          .select('id, title, start_ts, child_id')
          .eq('family_id', familyId)
          .ilike('title', `%${query}%`)
          .limit(10)
          .order('start_ts', { ascending: false });

        if (eventsError) {
          console.error('Error fetching events for search:', eventsError);
        }

        if (events) {
          events.forEach((e) => {
            const childName = e.child_id ? (childrenMap[e.child_id] || 'Unknown') : 'Unknown';
            const dateStr = e.start_ts
              ? new Date(e.start_ts).toLocaleDateString()
              : '';
            results.push({
              id: `event-${e.id}`,
              type: 'event',
              title: e.title,
              subtitle: `${childName} • ${dateStr}`,
              payload: { eventId: e.id },
            });
          });
        }

        // 2) Search Documents (syllabi)
        const { data: syllabi, error: syllabiError } = await supabase
          .from('syllabi')
          .select('id, title, child_id, subject_id')
          .eq('family_id', familyId)
          .ilike('title', `%${query}%`)
          .limit(5);

        if (syllabiError) {
          console.error('Error fetching syllabi for search:', syllabiError);
        }

        if (syllabi) {
          syllabi.forEach((s) => {
            const childName = s.child_id ? (childrenMap[s.child_id] || 'Unknown') : 'Unknown';
            results.push({
              id: `syllabus-${s.id}`,
              type: 'document',
              title: s.title,
              subtitle: `${childName} • Syllabus`,
              payload: { syllabusId: s.id },
            });
          });
        }

        // 3) Search Uploads
        const { data: uploads, error: uploadsError } = await supabase
          .from('uploads')
          .select('id, title, child_id')
          .eq('family_id', familyId)
          .ilike('title', `%${query}%`)
          .limit(5);

        if (uploadsError) {
          console.error('Error fetching uploads for search:', uploadsError);
        }

        if (uploads) {
          uploads.forEach((u) => {
            const childName = u.child_id ? (childrenMap[u.child_id] || 'Unknown') : 'Unknown';
            results.push({
              id: `upload-${u.id}`,
              type: 'document',
              title: u.title,
              subtitle: `${childName} • Upload`,
              payload: { uploadId: u.id },
            });
          });
        }

        // 4) Static Commands
        const allCommands = [
          {
            id: 'cmd-planner',
            type: 'function',
            title: 'Go to Planner',
            subtitle: 'Open calendar view',
            payload: { kind: 'navigate', href: '/planner' },
          },
          {
            id: 'cmd-home',
            type: 'function',
            title: 'Go to Home',
            subtitle: 'Daily insights and headlines',
            payload: { kind: 'navigate', href: '/' },
          },
          {
            id: 'cmd-explore',
            type: 'function',
            title: 'Go to Explore',
            subtitle: 'Browse external courses',
            payload: { kind: 'navigate', href: '/explore' },
          },
          {
            id: 'cmd-records',
            type: 'function',
            title: 'Go to Records',
            subtitle: 'View documents and records',
            payload: { kind: 'navigate', href: '/records' },
          },
        ];

        const cmdMatches = allCommands.filter((c) =>
          c.title.toLowerCase().includes(searchLower) ||
          c.subtitle.toLowerCase().includes(searchLower)
        );
        results.push(...cmdMatches);

        console.log('[GlobalSearchModal] Final results before setting:', {
          totalResults: results.length,
          byType: results.reduce((acc, r) => {
            acc[r.type] = (acc[r.type] || 0) + 1;
            return acc;
          }, {}),
          childResults: results.filter(r => r.type === 'child' || r.type === 'child-section').length,
          sampleResults: results.slice(0, 5).map(r => ({ id: r.id, type: r.type, title: r.title }))
        });

        setResults(results);
      } catch (e) {
        console.error('search failed', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(id);
  }, [query, familyId]);

  // Keyboard navigation
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handler = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[activeIndex]) {
          handleSelect(results[activeIndex]);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [results, activeIndex, onClose]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const r of results) {
      let key = 'Commands';
      if (r.type === 'event') {
        key = 'Planner Events';
      } else if (r.type === 'document') {
        key = 'Docs & Records';
      } else if (r.type === 'course') {
        key = 'Explore Courses';
      } else if (r.type === 'child' || r.type === 'child-section') {
        key = 'Children';
      } else if (r.type === 'subject') {
        key = 'Subjects';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    console.log('[GlobalSearchModal] Grouped results:', {
      groupKeys: Object.keys(groups),
      groupCounts: Object.entries(groups).reduce((acc, [k, v]) => {
        acc[k] = v.length;
        return acc;
      }, {}),
      childrenGroup: groups['Children']?.slice(0, 3).map(r => ({ id: r.id, type: r.type, title: r.title }))
    });
    return groups;
  }, [results]);

  const handleSelect = (item) => {
    // Get navigation handler from window (set by WebLayout) or prop
    const navHandler = onNavigate || (Platform.OS === 'web' ? window.__ldSearchNavigate : null);

    if (!navHandler) {
      // Fallback to window.location if no navigation handler
      if (Platform.OS === 'web') {
        if (item.type === 'event') {
          const eventId = item.payload?.eventId || item.id.replace('event-', '');
          window.location.href = `/planner?eventId=${eventId}`;
        } else if (item.type === 'document') {
          window.location.href = `/records`;
        } else if (item.type === 'child') {
          const childId = item.payload?.childId || item.id.replace('child-', '');
          window.location.href = `/children-list?childId=${childId}`;
        } else if (item.type === 'subject') {
          const subjectId = item.payload?.subjectId || item.id.replace('subject-', '');
          window.location.href = `/records?subjectId=${subjectId}`;
        } else if (item.type === 'function') {
          const payload = item.payload || {};
          if (payload.kind === 'navigate' && payload.href) {
            window.location.href = payload.href;
          }
        }
      }
      onClose();
      return;
    }

    // Use app's navigation system
    if (item.type === 'event') {
      // Extract eventId from payload or id
      let eventId = item.payload?.eventId;
      if (!eventId && item.id) {
        eventId = item.id.replace('event-', '');
      }
      navHandler('planner', null, { eventId });
      onClose();
    } else if (item.type === 'document') {
      navHandler('records');
      onClose();
    } else if (item.type === 'child' || item.type === 'child-section') {
      const childId = item.payload?.childId || item.id.replace(/^child-/, '').replace(/-\w+$/, '');
      const section = item.payload?.section || 'overview';
      navHandler('children-list', childId, { section });
      onClose();
    } else if (item.type === 'subject') {
      const subjectId = item.payload?.subjectId || item.id.replace('subject-', '');
      navHandler('records', null, { subjectId });
      onClose();
    } else if (item.type === 'function') {
      const payload = item.payload || {};
      if (payload.kind === 'navigate' && payload.href) {
        // Parse href and navigate
        const path = payload.href.replace(/^\//, '');
        if (path === 'planner' || path.startsWith('planner')) {
          navHandler('planner');
        } else if (path === 'explore' || path.startsWith('explore')) {
          navHandler('explore');
        } else if (path === 'records' || path.startsWith('records')) {
          navHandler('records');
        } else {
          navHandler('home');
        }
      } else if (payload.kind === 'openModal' && payload.modalId) {
        window.dispatchEvent(
          new CustomEvent('ld:open-modal', { detail: payload.modalId })
        );
      }
      onClose();
    }
  };

  const handleQueryChange = (text) => {
    setQuery(text);
    setActiveIndex(0);
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalContent}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Search bar */}
          <View style={styles.searchBar}>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search Learnadoodle… events, docs, commands"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              autoFocus
            />
            {Platform.OS === 'web' && (
              <View style={styles.shortcutHint}>
                <View style={styles.shortcutKey}>
                  <Text style={styles.shortcutText}>⌘K</Text>
                </View>
              </View>
            )}
          </View>

          {/* Results */}
          <ScrollView style={styles.resultsContainer} keyboardShouldPersistTaps="handled">
            {loading && (
              <View style={styles.emptyState}>
                <ActivityIndicator size="small" color="#64748b" />
                <Text style={styles.emptyText}>Searching…</Text>
              </View>
            )}

            {!loading && !query && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  Start typing to search events, records, and commands.
                </Text>
              </View>
            )}

            {!loading && query && results.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No results for "{query}".
                </Text>
              </View>
            )}

            {!loading && results.length > 0 && (
              <View>
                {Object.entries(grouped).map(([groupLabel, items]) => (
                  <View key={groupLabel} style={styles.group}>
                    <Text style={styles.groupLabel}>{groupLabel}</Text>
                    {items.map((item) => {
                      const index = results.indexOf(item);
                      const isActive = index === activeIndex;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => handleSelect(item)}
                          style={[
                            styles.resultItem,
                            isActive && styles.resultItemActive,
                          ]}
                          onMouseEnter={() => {
                            if (Platform.OS === 'web') {
                              setActiveIndex(index);
                            }
                          }}
                        >
                          <Text style={styles.resultTitle}>{item.title}</Text>
                          {item.subtitle && (
                            <Text style={styles.resultSubtitle}>{item.subtitle}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              ↑↓ to navigate • Enter to select • Esc to close
            </Text>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 96 : 40,
  },
  modalContent: {
    width: Platform.OS === 'web' ? '100%' : '90%',
    maxWidth: 672,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  shortcutHint: {
    display: Platform.OS === 'web' ? 'flex' : 'none',
  },
  shortcutKey: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f3f4f6',
  },
  shortcutText: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: Platform.OS === 'web' ? 'system-ui' : undefined,
  },
  resultsContainer: {
    maxHeight: 320,
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  group: {
    marginTop: 8,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#9ca3af',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  resultItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  resultItemActive: {
    backgroundColor: '#f3f4f6',
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  resultSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 11,
    color: '#9ca3af',
  },
});


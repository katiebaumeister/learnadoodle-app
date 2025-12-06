import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, useWindowDimensions } from 'react-native';
import { ChevronLeft, ChevronRight, Sparkles, Calendar, LayoutGrid, Clock, Kanban, Plus, ChevronDown, Users, ListTodo, CalendarPlus, BookOpen } from 'lucide-react';
import MonthGrid from './MonthGrid';
import WeekGrid from './WeekGrid';
import DayAgenda from './DayAgenda';
import BoardView from './BoardView';
import MobileCardView from './MobileCardView';
import { addMonths, addDays, addWeeks, format, startOfToday, startOfWeek } from './utils/date';
import { colors, shadows } from '../../theme/colors';

const VIEWS = [
  { key: 'Month', label: 'Month', icon: Calendar },
  { key: 'Week', label: 'Week', icon: LayoutGrid },
  { key: 'Day', label: 'Day', icon: Clock },
  { key: 'Board', label: 'Board', icon: Kanban },
];
const DEFAULT_VIEW = 'Month';

export default function CenterPane({
  date,
  events = [],
  selectedDate,
  onSelectDate,
  onCreateTask,
  filters,
  onEventSelect,
  onEventRightClick,
  onEventComplete,
  onNavigateToIntelligence,
  children = [],
  onChildFilterChange,
  blackoutDates = [],
}) {
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 768;
  const [mode, setMode] = useState(DEFAULT_VIEW);
  const [viewDate, setViewDate] = useState(selectedDate || date || startOfToday());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [hoveredPill, setHoveredPill] = useState(null);
  const [hoveredNav, setHoveredNav] = useState(false);
  const [hoveredAI, setHoveredAI] = useState(false);
  const [hoveredAdd, setHoveredAdd] = useState(false);
  const [hoveredNavButton, setHoveredNavButton] = useState(null);
  const addButtonRef = useRef(null);
  const [addMenuPosition, setAddMenuPosition] = useState({ x: 0, y: 0 });
  const monthPickerRef = useRef(null);
  const [monthPickerPosition, setMonthPickerPosition] = useState({ x: 0, y: 0 });
  
  // Update viewDate when selectedDate or date changes
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    } else if (date) {
      setViewDate(date);
    }
  }, [selectedDate, date]);
  
  
  // Navigation handlers
  const handlePrev = () => {
    let newDate;
    if (mode === 'Month') {
      newDate = addMonths(viewDate, -1);
    } else if (mode === 'Week' || mode === 'Board') {
      newDate = addDays(viewDate, -7);
    } else if (mode === 'Day') {
      newDate = addDays(viewDate, -1);
    }
    setViewDate(newDate);
    if (onSelectDate) onSelectDate(newDate);
  };
  
  const handleNext = () => {
    let newDate;
    if (mode === 'Month') {
      newDate = addMonths(viewDate, 1);
    } else if (mode === 'Week' || mode === 'Board') {
      newDate = addDays(viewDate, 7);
    } else if (mode === 'Day') {
      newDate = addDays(viewDate, 1);
    }
    setViewDate(newDate);
    if (onSelectDate) onSelectDate(newDate);
  };
  
  const handleToday = () => {
    const today = startOfToday();
    setViewDate(today);
    if (onSelectDate) onSelectDate(today);
  };
  
  // Format date for display
  const getDateLabel = () => {
    if (mode === 'Month') {
      return format(viewDate, 'MMMM yyyy');
    } else if (mode === 'Week') {
      const weekStart = startOfWeek(viewDate);
      const weekEnd = addDays(weekStart, 6);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    } else if (mode === 'Day') {
      return format(viewDate, 'EEEE, MMMM d, yyyy');
    } else if (mode === 'Board') {
      const weekStart = startOfWeek(viewDate);
      const weekEnd = addDays(weekStart, 6);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
    }
    return '';
  };

  const filtered = useMemo(() => {
    let out = events;
    // Only filter by childIds if filters.childIds is an array with items (not null)
    if (filters?.childIds && Array.isArray(filters.childIds) && filters.childIds.length > 0) {
      out = out.filter(e => {
        const childId = e.childId || e.student_id || e.child_id;
        return childId && filters.childIds.includes(childId);
      });
    }
    // Only filter by subjects if filters.subjects is an array with items
    if (filters?.subjects && Array.isArray(filters.subjects) && filters.subjects.length > 0) {
      out = out.filter(e => {
        const subject = e.subject || e.subjectName || e.subject_name;
        return subject && filters.subjects.includes(subject);
      });
    }
    return out;
  }, [events, filters]);

  // Get child filter display text
  const getChildFilterText = () => {
    if (!filters?.childIds || !Array.isArray(filters.childIds) || filters.childIds.length === 0) {
      return 'All Children';
    }
    if (filters.childIds.length === 1 && children.length > 0) {
      const child = children.find(c => c.id === filters.childIds[0]);
      return child ? (child.first_name || child.name) : '1 Child';
    }
    return `${filters.childIds.length} Children`;
  };

  // Close add menu and month picker when clicking outside
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleClickOutside = (e) => {
        // Check if click is on menu items (they stop propagation)
        if (e.target.closest && (
          e.target.closest('[data-add-menu]') || 
          e.target.closest('[data-month-picker]')
        )) {
          return;
        }
        
        if (showAddMenu) {
          setShowAddMenu(false);
        }
        if (showMonthPicker) {
          setShowMonthPicker(false);
        }
      };
      
      if (showAddMenu || showMonthPicker) {
        // Small delay to prevent immediate close
        const timeoutId = setTimeout(() => {
          document.addEventListener('mousedown', handleClickOutside);
        }, 100);
        return () => {
          clearTimeout(timeoutId);
          document.removeEventListener('mousedown', handleClickOutside);
        };
      }
    }
  }, [showAddMenu, showMonthPicker]);

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Top Bar with translucent background */}
      <View style={styles.topBar}>
        {/* Left: View mode pills + Child filter */}
        <View style={styles.leftSection}>
          <View style={styles.viewModeGroup}>
            {VIEWS.map(view => {
              const Icon = view.icon;
              const isActive = mode === view.key;
              return (
                <TouchableOpacity
                  key={view.key}
                  onPress={() => {
                    setMode(view.key);
                  }}
                  onMouseEnter={() => Platform.OS === 'web' && setHoveredPill(view.key)}
                  onMouseLeave={() => Platform.OS === 'web' && setHoveredPill(null)}
                  style={[
                    styles.viewModePill,
                    isActive && styles.viewModePillActive,
                    Platform.OS === 'web' && hoveredPill === view.key && !isActive && styles.viewModePillHover,
                  ]}
                  activeOpacity={0.7}
                >
                  <Icon size={12} color={isActive ? colors.blueBold : colors.muted} />
                  <Text style={[
                    styles.viewModeText,
                    isActive && styles.viewModeTextActive,
                  ]}>
                    {view.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          {/* Child filter chip */}
          {onChildFilterChange && children.length > 0 && (
            <TouchableOpacity
              style={[
                styles.childFilterChip,
                Platform.OS === 'web' && hoveredPill === 'filter' && styles.viewModePillHover,
              ]}
              onPress={() => {
                // Toggle between all and first child for now
                // Could open a dropdown here
                const currentIds = filters?.childIds || [];
                if (currentIds.length === 0) {
                  onChildFilterChange([children[0].id]);
                } else {
                  onChildFilterChange([]);
                }
              }}
              onMouseEnter={() => Platform.OS === 'web' && setHoveredPill('filter')}
              onMouseLeave={() => Platform.OS === 'web' && setHoveredPill(null)}
              activeOpacity={0.7}
            >
              <Users size={12} color={colors.muted} />
              <Text style={styles.childFilterText}>{getChildFilterText()}</Text>
              <ChevronDown size={12} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Center: Month label (clickable) */}
        <View 
          ref={monthPickerRef} 
          style={styles.centerSection}
          onLayout={(event) => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              const { x, y, width, height } = event.nativeEvent.layout;
              // Get the element's position relative to viewport
              if (monthPickerRef.current) {
                const element = monthPickerRef.current;
                if (element && element.measure) {
                  element.measure((fx, fy, fwidth, fheight, px, py) => {
                    setMonthPickerPosition({ x: px + fwidth / 2 - 100, y: py + fheight + 4 });
                  });
                } else {
                  // Fallback: use layout coordinates
                  setMonthPickerPosition({ x: x + width / 2 - 100, y: y + height + 4 });
                }
              }
            }
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setShowMonthPicker(!showMonthPicker);
            }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={styles.monthLabel}>{getDateLabel()}</Text>
            <ChevronDown size={14} color={colors.muted} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          
          {/* Month Picker Dropdown */}
          {showMonthPicker && (
            <View 
              {...(Platform.OS === 'web' ? { 'data-month-picker': 'true' } : {})}
              style={[
                styles.monthPicker,
                Platform.OS === 'web' && {
                  position: 'fixed',
                  left: monthPickerPosition.x,
                  top: monthPickerPosition.y,
                  zIndex: 1001,
                }
              ]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.monthPickerHeader}>
                <TouchableOpacity
                  onPress={() => {
                    const newDate = addMonths(viewDate, -12);
                    setViewDate(newDate);
                  }}
                  style={styles.monthPickerNav}
                >
                  <ChevronLeft size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.monthPickerYear}>{format(viewDate, 'yyyy')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const newDate = addMonths(viewDate, 12);
                    setViewDate(newDate);
                  }}
                  style={styles.monthPickerNav}
                >
                  <ChevronRight size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.monthPickerGrid}>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                  const isCurrent = format(viewDate, 'MMM') === month;
                  const monthDate = new Date(viewDate.getFullYear(), index, 1);
                  return (
                    <TouchableOpacity
                      key={month}
                      onPress={() => {
                        setViewDate(monthDate);
                        setShowMonthPicker(false);
                      }}
                      style={[
                        styles.monthPickerItem,
                        isCurrent && styles.monthPickerItemActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.monthPickerItemText,
                        isCurrent && styles.monthPickerItemTextActive,
                      ]}>
                        {month}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
        
        {/* Right: Navigation + Actions */}
        <View style={styles.rightSection}>
          {/* Combined Today + Arrows capsule */}
          <View 
            style={[
              styles.navCapsule,
              Platform.OS === 'web' && hoveredNav && styles.navCapsuleHover,
            ]}
            onMouseEnter={() => Platform.OS === 'web' && setHoveredNav(true)}
            onMouseLeave={() => Platform.OS === 'web' && setHoveredNav(false)}
          >
          <TouchableOpacity
            onPress={handlePrev}
            onMouseEnter={() => Platform.OS === 'web' && setHoveredNavButton('prev')}
            onMouseLeave={() => Platform.OS === 'web' && setHoveredNavButton(null)}
            style={[
              styles.navButton,
              Platform.OS === 'web' && hoveredNavButton === 'prev' && styles.navButtonHover,
            ]}
            activeOpacity={0.7}
          >
              <ChevronLeft size={14} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleToday}
            style={styles.todayButton}
            activeOpacity={0.7}
          >
              <Text style={styles.todayText}>Today</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleNext}
            onMouseEnter={() => Platform.OS === 'web' && setHoveredNavButton('next')}
            onMouseLeave={() => Platform.OS === 'web' && setHoveredNavButton(null)}
            style={[
              styles.navButton,
              Platform.OS === 'web' && hoveredNavButton === 'next' && styles.navButtonHover,
            ]}
            activeOpacity={0.7}
          >
              <ChevronRight size={14} color={colors.text} />
          </TouchableOpacity>
        </View>
        
        {/* Ask Planner AI Button */}
        {onNavigateToIntelligence && (
          <TouchableOpacity
            onPress={() => {
              const currentChildOrAll = filters?.childIds && filters.childIds.length > 0 
                ? filters.childIds[0] 
                : 'all';
              onNavigateToIntelligence({
                tab: 'planner-ai',
                child: currentChildOrAll,
                timeframe: 'thisWeek'
              });
            }}
            onMouseEnter={() => Platform.OS === 'web' && setHoveredAI(true)}
            onMouseLeave={() => Platform.OS === 'web' && setHoveredAI(false)}
            style={[
              styles.aiButton,
              Platform.OS === 'web' && hoveredAI && styles.aiButtonHover,
            ]}
            activeOpacity={0.8}
          >
              <Sparkles size={13} color="#ffffff" />
              <Text style={styles.aiButtonText}>Ask Planner AI</Text>
          </TouchableOpacity>
        )}
        
          {/* Add Event Button with Quick Menu */}
        {onCreateTask && (
          <View 
            ref={addButtonRef} 
            style={{ position: 'relative' }}
            onLayout={(event) => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                const { x, y, width, height } = event.nativeEvent.layout;
                if (addButtonRef.current) {
                  const element = addButtonRef.current;
                  if (element && element.measure) {
                    element.measure((fx, fy, fwidth, fheight, px, py) => {
                      setAddMenuPosition({ x: px + fwidth - 180, y: py + fheight + 4 });
                    });
                  } else {
                    // Fallback: use layout coordinates
                    setAddMenuPosition({ x: x + width - 180, y: y + height + 4 });
                  }
                }
              }
            }}
          >
          <TouchableOpacity
              onPress={() => {
                setShowAddMenu(!showAddMenu);
              }}
              onMouseEnter={() => Platform.OS === 'web' && setHoveredAdd(true)}
              onMouseLeave={() => Platform.OS === 'web' && setHoveredAdd(false)}
              style={[
                styles.addButton,
                Platform.OS === 'web' && hoveredAdd && styles.addButtonHover,
              ]}
              activeOpacity={0.8}
            >
              <Plus size={16} color="#ffffff" />
            </TouchableOpacity>
            
            {/* Quick Add Menu */}
            {showAddMenu && (
              <View 
                {...(Platform.OS === 'web' ? { 'data-add-menu': 'true' } : {})}
                style={[
                  styles.addMenu,
                  Platform.OS === 'web' && {
                    position: 'fixed',
                    left: addMenuPosition.x,
                    top: addMenuPosition.y,
                    zIndex: 1001,
                  }
                ]}
                onStartShouldSetResponder={() => true}
              >
                <TouchableOpacity
                  style={styles.addMenuItem}
                  onPress={(e) => {
                    e.stopPropagation();
                    setShowAddMenu(false);
                    if (onCreateTask) onCreateTask();
                  }}
                  activeOpacity={0.7}
                >
                  <CalendarPlus size={14} color={colors.text} />
                  <Text style={styles.addMenuItemText}>Add Event</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addMenuItem}
                  onPress={(e) => {
                    e.stopPropagation();
                    setShowAddMenu(false);
                    if (onCreateTask) onCreateTask();
                  }}
                  activeOpacity={0.7}
          >
                  <ListTodo size={14} color={colors.text} />
                  <Text style={styles.addMenuItemText}>Add Task</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addMenuItem}
                  onPress={(e) => {
                    e.stopPropagation();
                    setShowAddMenu(false);
                    if (onCreateTask) onCreateTask();
                  }}
                  activeOpacity={0.7}
                >
                  <BookOpen size={14} color={colors.text} />
                  <Text style={styles.addMenuItemText}>Add Learning Block</Text>
          </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        </View>
      </View>

      {/* Center view */}
      {isMobile ? (
        <MobileCardView
          date={viewDate}
          events={filtered}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onEventPress={onEventSelect}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      ) : (
        <>
          {mode === 'Month' && (
            <MonthGrid
              date={viewDate}
              events={filtered}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              blackoutDates={blackoutDates}
            />
          )}
          {mode === 'Week' && (
            <WeekGrid
              anchorDate={viewDate}
              events={filtered}
              onSelectDate={onSelectDate}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
            />
          )}
          {mode === 'Day' && (
            <DayAgenda
              date={viewDate}
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
            />
          )}
          {mode === 'Board' && (
            <BoardView
              weekAnchor={viewDate}
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Platform.OS === 'web' 
      ? 'rgba(255, 255, 255, 0.7)' 
      : 'rgba(255, 255, 255, 0.95)',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }),
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
    minHeight: 50,
    height: 50,
    zIndex: 10,
    elevation: 2,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    }),
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  viewModeGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  viewModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(248, 249, 255, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  },
  viewModePillActive: {
    backgroundColor: colors.blueSoft,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    borderWidth: 1.5,
  },
  viewModePillHover: {
    backgroundColor: 'rgba(248, 249, 255, 0.85)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  viewModeText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  viewModeTextActive: {
    fontWeight: '600',
    color: colors.blueBold,
  },
  childFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(248, 249, 255, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  childFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  centerSection: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -50 }],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transform: 'translateX(-50%)',
    }),
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  navCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 249, 255, 0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
    height: 32,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  navCapsuleHover: {
    backgroundColor: 'rgba(248, 249, 255, 0.9)',
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  navButton: {
    padding: 0,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  navButtonHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    borderRadius: 16,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 32,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  todayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6b9aff', // Softer periwinkle blue
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 4px rgba(107, 154, 255, 0.2)',
    }),
  },
  aiButtonHover: {
    backgroundColor: '#5b8def',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(107, 154, 255, 0.3), 0 0 8px rgba(107, 154, 255, 0.1)',
      transform: 'translateY(-1px)',
    }),
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6b9aff', // Softer periwinkle blue
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 4px rgba(107, 154, 255, 0.2)',
    }),
  },
  addButtonHover: {
    backgroundColor: '#4a7dd8',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 8px rgba(91, 141, 239, 0.35)',
      transform: 'scale(1.05)',
    }),
  },
  addMenu: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    minWidth: 160,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      zIndex: 1000,
    }),
    ...shadows.md,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    }),
  },
  addMenuItemHover: {
    backgroundColor: colors.bgSubtle,
  },
  addMenuItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  monthPicker: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    minWidth: 200,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      zIndex: 1000,
    }),
    ...shadows.md,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthPickerNav: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  monthPickerYear: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  monthPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  monthPickerItem: {
    width: '30%',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    }),
  },
  monthPickerItemActive: {
    backgroundColor: colors.blueSoft,
  },
  monthPickerItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  monthPickerItemTextActive: {
    fontWeight: '600',
    color: colors.blueBold,
  },
});


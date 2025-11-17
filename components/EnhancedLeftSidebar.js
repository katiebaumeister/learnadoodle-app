import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Home, Plus, Calendar, ChevronDown, ChevronRight, MoreHorizontal, Search, Users, BookOpen, FileText, ClipboardCheck, BookTemplate, Upload, Sparkles, Settings } from 'lucide-react';
import { colors, shadows } from '../theme/colors';

/**
 * Enhanced left sidebar with Notion-like features:
 * - Resizable with drag handle (min/max constraints)
 * - Collapsible sections with persistent state
 * - Keyboard accessible resizing
 * - Hover states and smooth animations
 * - localStorage persistence for width and collapsed sections
 */

const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 280;

const LS_WIDTH_KEY = 'sidebarWidthPx';
const LS_COLLAPSE_KEY = 'sidebarCollapseMap';

// Custom hook for localStorage persistence
function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (Platform.OS !== 'web') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, value]);

  return [value, setValue];
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

// Collapsible Section Component
function Section({ 
  id, 
  label, 
  collapsedMap, 
  setCollapsedMap, 
  onAdd, 
  children,
  icon: Icon,
  isDivider = false
}) {
  const collapsed = !!collapsedMap[id];
  const [hovered, setHovered] = useState(false);
  
  const toggle = () => {
    setCollapsedMap((m) => ({ ...m, [id]: !m[id] }));
  };

  return (
    <View style={styles.section}>
      {isDivider && <View style={styles.divider} />}
      <View 
        style={styles.sectionHeader}
        onMouseEnter={() => Platform.OS === 'web' && setHovered(true)}
        onMouseLeave={() => Platform.OS === 'web' && setHovered(false)}
      >
        <TouchableOpacity
          style={styles.sectionHeaderButton}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
          accessibilityExpanded={!collapsed}
        >
          <View style={styles.sectionHeaderContent}>
            {collapsed ? (
              <ChevronRight size={14} color="#6b7280" />
            ) : (
              <ChevronDown size={14} color="#6b7280" />
            )}
            {Icon && <Icon size={14} color="#6b7280" style={{ marginLeft: 4 }} />}
            <Text style={styles.sectionLabel}>{label}</Text>
          </View>
        </TouchableOpacity>
        
        {hovered && onAdd && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`Add to ${label}`}
          >
            <Plus size={14} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>
      
      {!collapsed && (
        <View style={styles.sectionContent}>
          {children}
        </View>
      )}
    </View>
  );
}

// Expandable Item Component (for items with sub-items)
function ExpandableItem({ 
  id, 
  label, 
  icon: Icon,
  active,
  onClick,
  collapsedMap,
  setCollapsedMap,
  subItems = [],
  onAdd,
  activeTab,
  activeSubtab,
  onTabChange
}) {
  const collapsed = !!collapsedMap[id];
  const [hovered, setHovered] = useState(false);
  
  const toggle = () => {
    setCollapsedMap((m) => ({ ...m, [id]: !m[id] }));
  };

  return (
    <View style={styles.expandableContainer}>
      <View
        style={[
          styles.expandableHeader,
          active && styles.sidebarItemActive,
          hovered && !active && styles.sidebarItemHover
        ]}
        onMouseEnter={() => Platform.OS === 'web' && setHovered(true)}
        onMouseLeave={() => Platform.OS === 'web' && setHovered(false)}
      >
        <View style={styles.expandableItem}>
          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation();
              toggle();
            }}
            style={styles.expandToggle}
            accessibilityRole="button"
            accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
          >
            {collapsed ? (
              <ChevronRight size={14} color="#6b7280" />
            ) : (
              <ChevronDown size={14} color="#6b7280" />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.expandableItemMain}
            onPress={() => {
              onClick();
              if (subItems.length > 0 && collapsed) {
                toggle();
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            {Icon && <Icon size={16} color={active ? '#1e40af' : '#6b7280'} />}
            <Text style={[
              styles.sidebarItemText,
              active && styles.sidebarItemTextActive
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        </View>
        
        {hovered && onAdd && (
          <TouchableOpacity
            style={styles.itemAddButton}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`Add ${label}`}
          >
            <Plus size={12} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>
      
      {!collapsed && subItems.length > 0 && (
        <View style={styles.subItemsContainer}>
          {subItems.map(subItem => {
            // Determine if this item is active
            // For records items (attendance/reports), check activeSubtab
            // For child items (child-{id}), check if activeTab is children-list and activeSubtab matches child ID
            let isActive;
            if (subItem.id === 'attendance' || subItem.id === 'reports') {
              isActive = activeTab === 'records' && activeSubtab === subItem.id;
            } else if (subItem.id.startsWith('child-')) {
              const childId = subItem.id.replace('child-', '');
              isActive = activeTab === 'children-list' && activeSubtab === childId;
            } else {
              isActive = activeTab === subItem.id;
            }
            
            return (
              <SidebarItem
                key={subItem.id}
                item={subItem}
                active={isActive}
                onClick={() => {
                  // For child items, pass the child data if available
                  if (subItem.onClick) {
                    subItem.onClick();
                  } else {
                    // For attendance/reports, set records tab with subtab
                    if (subItem.id === 'attendance' || subItem.id === 'reports') {
                      onTabChange('records', subItem.id, subItem.data);
                    } else {
                      // For child items or other items, pass the item ID
                      onTabChange(subItem.id, null, subItem.data);
                    }
                  }
                }}
                indent={1}
              />
            );
          })}
        </View>
      )}
      
      {!collapsed && subItems.length === 0 && onAdd && (
        <View style={styles.subItemsContainer}>
          <TouchableOpacity 
            style={styles.emptyStateButton}
            onPress={onAdd}
          >
            <Text style={styles.emptyStateText}>+ Add {label}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Sidebar Item Component
function SidebarItem({ item, active, onClick, onContextMenu, indent = 0 }) {
  const [hovered, setHovered] = useState(false);

  return (
    <View
      style={[
        styles.sidebarItem,
        { paddingLeft: 12 + indent * 16 },
        active && styles.sidebarItemActive,
        hovered && !active && styles.sidebarItemHover
      ]}
      onMouseEnter={() => Platform.OS === 'web' && setHovered(true)}
      onMouseLeave={() => Platform.OS === 'web' && setHovered(false)}
    >
      <TouchableOpacity
        style={styles.sidebarItemButton}
        onPress={onClick}
        onLongPress={onContextMenu}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        {item.icon && <item.icon size={16} color={active ? '#1e40af' : '#6b7280'} />}
        <Text style={[
          styles.sidebarItemText,
          active && styles.sidebarItemTextActive
        ]}>
          {item.label}
        </Text>
      </TouchableOpacity>
      
      {hovered && onContextMenu && (
        <TouchableOpacity
          style={styles.itemMoreButton}
          onPress={onContextMenu}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <MoreHorizontal size={14} color="#6b7280" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function EnhancedLeftSidebar({ 
  activeTab = 'home',
  activeSubtab = null,
  onTabChange = () => {},
  onAddChild = () => {},
  onSearch = () => {},
  onNewMenu = () => {},
  onSettings = () => {},
  children = []
}) {
  const [width, setWidth] = useLocalStorageState(LS_WIDTH_KEY, DEFAULT_WIDTH);
  const [collapsedSections, setCollapsedSections] = useLocalStorageState(LS_COLLAPSE_KEY, {});
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(width);
  const gutterRef = useRef(null);

  // Handle mouse drag for resizing
  const handleMouseDown = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartWidth(width);
    e.preventDefault();
  }, [width]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStartX;
    const newWidth = clamp(dragStartWidth + delta, MIN_WIDTH, MAX_WIDTH);
    setWidth(newWidth);
  }, [isDragging, dragStartX, dragStartWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Keyboard navigation for resize
  const handleKeyDown = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    const step = e.shiftKey ? 20 : 5;
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setWidth(w => clamp(w - step, MIN_WIDTH, MAX_WIDTH));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setWidth(w => clamp(w + step, MIN_WIDTH, MAX_WIDTH));
        break;
      case 'Home':
        e.preventDefault();
        setWidth(MIN_WIDTH);
        break;
      case 'End':
        e.preventDefault();
        setWidth(MAX_WIDTH);
        break;
    }
  }, []);

  // Family section - main navigation items
  const plannerItems = [
    { id: 'add-activity', label: 'Add to Plan', icon: null },
  ];

  const childrenItems = (children && children.length > 0) ? children.map(child => ({
    id: `child-${child.id}`,
    label: child.name || child.first_name || 'Unnamed',
    icon: null,
    data: child
  })) : [];

  const lessonPlanItems = [
    // Will be populated dynamically, for now empty state
  ];

  const documentItems = [
    // Will be populated dynamically, for now empty state
  ];

  const recordsItems = [
    { id: 'attendance', label: 'Attendance', icon: null },
    { id: 'reports', label: 'Reports', icon: null },
  ];

  return (
    <View style={[styles.container, { width }]}>
      {/* Scrollable Content */}
      <ScrollView 
        style={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Logo / Brand */}
        <View style={styles.logoSection}>
          <Text style={styles.logoText}>Learnadoodle</Text>
        </View>

        {/* Search - Cmd+K */}
        <TouchableOpacity 
          style={styles.searchButton}
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Search size={16} color="#6b7280" />
          <Text style={styles.searchText}>Search...</Text>
          <Text style={styles.searchShortcut}>⌘K</Text>
        </TouchableOpacity>

        {/* Home - Top Level */}
        <TouchableOpacity
          style={[
            styles.topLevelItem,
            activeTab === 'home' && styles.topLevelItemActive
          ]}
          onPress={() => onTabChange('home')}
          accessibilityRole="button"
          accessibilityLabel="Home"
        >
          <Home size={16} color={activeTab === 'home' ? '#1e40af' : '#6b7280'} />
          <Text style={[
            styles.topLevelItemText,
            activeTab === 'home' && styles.topLevelItemTextActive
          ]}>
            Home
          </Text>
        </TouchableOpacity>

        {/* Planner - Top Level, Right Under Home */}
        <TouchableOpacity
          style={[
            styles.topLevelItem,
            activeTab === 'calendar' && styles.topLevelItemActive
          ]}
          onPress={() => onTabChange('calendar')}
          accessibilityRole="button"
          accessibilityLabel="Planner"
        >
          <Calendar size={16} color={activeTab === 'calendar' ? '#1e40af' : '#6b7280'} />
          <Text style={[
            styles.topLevelItemText,
            activeTab === 'calendar' && styles.topLevelItemTextActive
          ]}>
            Planner
          </Text>
        </TouchableOpacity>

        {/* New Button - Under Planner */}
        <TouchableOpacity
          style={styles.newButton}
          onPress={onNewMenu}
          accessibilityRole="button"
          accessibilityLabel="New menu"
        >
          <Plus size={16} color="#6b7280" />
          <Text style={styles.newButtonText}>New</Text>
        </TouchableOpacity>

        {/* Divider after New */}
        <View style={styles.divider} />

        {/* Family Section */}
        <Section
          id="family"
          label="Family"
          collapsedMap={collapsedSections}
          setCollapsedMap={setCollapsedSections}
        >

          {/* Children - Expandable */}
          <ExpandableItem
            id="children"
            label="Children"
            icon={Users}
            active={activeTab === 'children-list' || activeTab?.startsWith('child-')}
            onClick={() => onTabChange('children-list', null)}
            collapsedMap={collapsedSections}
            setCollapsedMap={setCollapsedSections}
            subItems={childrenItems}
            onAdd={onAddChild}
            activeTab={activeTab}
            activeSubtab={activeSubtab}
            onTabChange={onTabChange}
          />

          {/* Lesson Plans - Expandable */}
          <ExpandableItem
            id="lesson-plans"
            label="Lesson Plans"
            icon={BookOpen}
            active={activeTab === 'lesson-plans'}
            onClick={() => onTabChange('lesson-plans')}
            collapsedMap={collapsedSections}
            setCollapsedMap={setCollapsedSections}
            subItems={lessonPlanItems}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />

          {/* Documents - Expandable */}
          <ExpandableItem
            id="documents"
            label="Documents"
            icon={FileText}
            active={activeTab === 'documents'}
            onClick={() => onTabChange('documents')}
            collapsedMap={collapsedSections}
            setCollapsedMap={setCollapsedSections}
            subItems={documentItems}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />

          {/* Records - Expandable */}
          <ExpandableItem
            id="records"
            label="Records"
            icon={ClipboardCheck}
            active={activeTab === 'records' && !activeSubtab}
            onClick={() => onTabChange('records', null)}
            collapsedMap={collapsedSections}
            setCollapsedMap={setCollapsedSections}
            subItems={recordsItems}
            activeTab={activeTab}
            activeSubtab={activeSubtab}
            onTabChange={onTabChange}
          />
        </Section>

        {/* Settings - Standalone at bottom */}
        <View style={styles.divider} />
        <SidebarItem
          item={{ id: 'settings', label: 'Settings', icon: Settings }}
          active={false}
          onClick={onSettings}
        />
      </ScrollView>

      {/* Resize Handle / Gutter */}
      {Platform.OS === 'web' && (
        <View
          ref={gutterRef}
          style={[
            styles.resizeGutter,
            isDragging && styles.resizeGutterActive
          ]}
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="separator"
          aria-label="Resize sidebar"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panel,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    height: '100%',
    position: 'relative',
    flexDirection: 'row',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  logoSection: {
    marginBottom: 16,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: '-0.5px',
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  searchText: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '500',
    color: colors.muted,
    flex: 1,
  },
  searchShortcut: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
    marginHorizontal: -4,
  },
  topLevelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  topLevelItemActive: {
    backgroundColor: colors.blueSoft,
  },
  topLevelItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 10,
    flex: 1,
  },
  topLevelItemTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  newButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 10,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionHeaderButton: {
    flex: 1,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#f9fafb',
  },
  sectionContent: {
    marginTop: 4,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  sidebarItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sidebarItemHover: {
    backgroundColor: '#f9fafb',
  },
  sidebarItemActive: {
    backgroundColor: '#eff6ff',
  },
  sidebarItemText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  sidebarItemTextActive: {
    color: '#1e40af',
    fontWeight: '500',
  },
  itemMoreButton: {
    padding: 4,
    borderRadius: 4,
  },
  emptyStateButton: {
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#6b7280',
  },
  expandableContainer: {
    marginBottom: 4,
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  expandableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  expandToggle: {
    padding: 4,
    marginRight: 2,
  },
  expandableItemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  itemAddButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#f9fafb',
  },
  subItemsContainer: {
    marginLeft: 24,
    marginTop: 2,
  },
  resizeGutter: {
    width: 6,
    cursor: 'col-resize',
    backgroundColor: 'transparent',
    transition: 'background-color 0.15s ease',
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  resizeGutterActive: {
    backgroundColor: '#3b82f6',
  },
});


import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Calendar, LayoutGrid, Clock, Kanban, ChevronLeft, ChevronRight, ChevronDown, Sparkles, Plus } from 'lucide-react';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../theme/pastelDesignTokens';
import { format } from './planner/utils/date';

const VIEWS = [
  { key: 'Month', label: 'Month', icon: Calendar },
  { key: 'Day', label: 'Board', icon: Clock },
  { key: 'Board', label: 'Board', icon: Kanban },
];

export default function PlannerTopBar({
  viewMode = 'Month',
  onViewChange,
  currentDate,
  onPrev,
  onNext,
  onToday,
  onAskPlannerAI,
  onAdd,
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showViewPicker, setShowViewPicker] = useState(false);
  const viewPickerRef = useRef(null);
  const [viewPickerPosition, setViewPickerPosition] = useState({ x: 0, y: 0 });

  const dateLabel = currentDate ? format(currentDate, 'MMMM yyyy') : 'December 2025';
  const currentView = VIEWS.find(v => v.key === viewMode) || VIEWS[0];

  // Handle view picker dropdown with DOM manipulation for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (showViewPicker) {
        // Remove existing picker
        const existingPicker = document.getElementById('view-picker');
        if (existingPicker) existingPicker.remove();
        
        // Function to create dropdown
        const createDropdown = (x, y) => {
          const picker = document.createElement('div');
          picker.id = 'view-picker';
          picker.setAttribute('data-view-picker', 'true');
          picker.style.cssText = `
            position: fixed;
            top: ${y}px;
            left: ${x - 120}px;
            background-color: ${tokens.surface || '#ffffff'};
            border-radius: 8px;
            border: 1px solid ${tokens.border || '#e5e7eb'};
            padding: 4px 0;
            min-width: 140px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 1000;
          `;
          
          VIEWS.forEach((view) => {
          const isActive = viewMode === view.key;
          const menuItem = document.createElement('div');
          menuItem.style.cssText = `
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: ${isActive ? '600' : '500'};
            color: ${isActive ? tokens.accent : tokens.textSecondary};
            background-color: ${isActive ? tokens.accentSoft : 'transparent'};
          `;
          
          const label = document.createElement('span');
          label.textContent = view.label;
          menuItem.appendChild(label);
          
          menuItem.onclick = (e) => {
            e.stopPropagation();
            setShowViewPicker(false);
            if (onViewChange) {
              onViewChange(view.key);
            }
          };
          
          menuItem.onmouseenter = () => {
            if (!isActive) {
              menuItem.style.backgroundColor = tokens.bgSubtle || '#f3f4f6';
            }
          };
          
          menuItem.onmouseleave = () => {
            if (!isActive) {
              menuItem.style.backgroundColor = 'transparent';
            }
          };
          
            picker.appendChild(menuItem);
          });
          
          document.body.appendChild(picker);
          
          const handleClickOutside = (e) => {
            if (e.target.closest && !e.target.closest('[data-view-picker]')) {
              setShowViewPicker(false);
            }
          };
          
          setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
          }, 100);
          
          return () => {
            const pickerToRemove = document.getElementById('view-picker');
            if (pickerToRemove) pickerToRemove.remove();
            document.removeEventListener('mousedown', handleClickOutside);
          };
        };
        
        // Get button position and create dropdown
        setTimeout(() => {
          let pickerX = 0;
          let pickerY = 0;
          
          if (viewPickerRef.current) {
            // Try to find the actual DOM element
            const element = viewPickerRef.current;
            // React Native Web wraps TouchableOpacity in a div
            if (element && element._nativeNode) {
              const rect = element._nativeNode.getBoundingClientRect();
              pickerX = rect.right;
              pickerY = rect.bottom;
            } else if (element && typeof element.getBoundingClientRect === 'function') {
              const rect = element.getBoundingClientRect();
              pickerX = rect.right;
              pickerY = rect.bottom;
            } else if (element.measure) {
              // Fallback to measure
              element.measure((x, y, width, height, pageX, pageY) => {
                createDropdown(pageX + width, pageY + height);
              });
              return; // Early return, will create dropdown in measure callback
            }
          }
          
          // If we have coordinates, create dropdown
          if (pickerX > 0 || pickerY > 0) {
            createDropdown(pickerX, pickerY);
          } else {
            // Fallback: try to find button by data attribute
            const button = document.querySelector('[data-view-dropdown-button="true"]');
            if (button) {
              const rect = button.getBoundingClientRect();
              createDropdown(rect.right, rect.bottom);
            }
          }
        }, 10);
        
        return () => {
          const pickerToRemove = document.getElementById('view-picker');
          if (pickerToRemove) pickerToRemove.remove();
        };
      } else {
        const existingPicker = document.getElementById('view-picker');
        if (existingPicker) existingPicker.remove();
      }
    }
  }, [showViewPicker, viewMode, tokens, currentView.label]);

  return (
    <View style={[styles.container, { backgroundColor: tokens.surface, borderBottomColor: tokens.border }]}>
      {/* Left Section: View Mode Selection Dropdown */}
      <View style={styles.leftSection}>
        <TouchableOpacity
          ref={viewPickerRef}
          {...(Platform.OS === 'web' ? { 'data-view-dropdown-button': 'true' } : {})}
          onPress={() => {
            // Toggle dropdown - position will be calculated in useEffect
            setShowViewPicker(!showViewPicker);
          }}
          style={[
            styles.viewButton,
            { borderColor: tokens.border },
            showViewPicker && { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
          ]}
        >
          {(() => {
            const Icon = currentView.icon;
            return <Icon size={16} color={showViewPicker ? tokens.accent : tokens.textSecondary} />;
          })()}
          <Text
            style={[
              styles.viewButtonText,
              { color: showViewPicker ? tokens.accent : tokens.textSecondary },
            ]}
          >
            {currentView.label}
          </Text>
          <ChevronDown size={14} color={tokens.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Center Section: Current Date */}
      <View style={styles.centerSection}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(!showDatePicker)}
        >
          <Text style={[styles.dateText, { color: tokens.text }]}>{dateLabel}</Text>
          <ChevronDown size={14} color={tokens.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Right Section: Navigation & Actions */}
      <View style={styles.rightSection}>
        {/* Date Navigation */}
        <View style={styles.navGroup}>
          <TouchableOpacity
            style={[styles.navButton, { borderColor: tokens.border }]}
            onPress={onPrev}
          >
            <ChevronLeft size={16} color={tokens.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.todayButton, { borderColor: tokens.border, backgroundColor: tokens.bg }]}
            onPress={onToday}
          >
            <Text style={[styles.todayButtonText, { color: tokens.text }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, { borderColor: tokens.border }]}
            onPress={onNext}
          >
            <ChevronRight size={16} color={tokens.text} />
          </TouchableOpacity>
        </View>

        {/* Ask Planner AI Button */}
        <TouchableOpacity
          style={[styles.aiButton, { backgroundColor: '#4285F4' }]}
          onPress={onAskPlannerAI}
        >
          <Sparkles size={16} color="#FFFFFF" />
          <Text style={styles.aiButtonText}>Ask Planner AI</Text>
        </TouchableOpacity>

        {/* Add Button */}
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: '#4285F4' }]}
          onPress={onAdd}
        >
          <Plus size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    height: 64,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }),
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  viewModeGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    justifyContent: 'flex-end',
  },
  navGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 36,
  },
  aiButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus, Users, Activity, BookOpen, FileText, ClipboardCheck, Copy, Upload, Sparkles, Target } from 'lucide-react';
import { checkFeatureFlags } from '../lib/services/yearClient';

/**
 * Global "+ New" menu that appears in top bar and sidebar footer
 * Context-aware: reorders items based on current page
 * Keyboard accessible: N opens menu
 */
export default function GlobalNewMenu({ 
  visible,
  onClose,
  position = { x: 0, y: 0 },
  currentContext = 'home',
  onAddChild,
  onAddActivity,
  onAddLessonPlan,
  onAddSyllabus,
  onAddAttendance,
  onCopyFromTemplate,
  onImportFromFile,
  onAIGenerate,
  onPlanYear,
}) {
  const [yearPlansEnabled, setYearPlansEnabled] = useState(false);
  
  // Debug: Log if onPlanYear is provided
  useEffect(() => {
    console.log('[GlobalNewMenu] onPlanYear provided:', !!onPlanYear, typeof onPlanYear);
  }, [onPlanYear]);

  useEffect(() => {
    checkFeatureFlags().then(flags => {
      console.log('[GlobalNewMenu] Year plans enabled:', flags.yearPlans);
      setYearPlansEnabled(flags.yearPlans);
    }).catch(err => {
      console.error('[GlobalNewMenu] Error checking feature flags:', err);
      // Default to false if check fails (safer)
      setYearPlansEnabled(false);
    });
  }, []);

  useEffect(() => {
    if (visible && Platform.OS === 'web') {
      const handleClickOutside = (e) => {
        onClose();
      };
      
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      
      // Small delay to prevent immediate close
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }, 100);
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [visible, onClose]);

  if (!visible) return null;

  // Define all primary actions
  const primaryActions = [
    { 
      id: 'add-child',
      label: 'Add Child', 
      icon: Users,
      context: 'children-list',
      onPress: () => { onClose(); onAddChild?.(); }
    },
    { 
      id: 'add-activity',
      label: 'Add to Plan', 
      icon: Activity,
      context: 'calendar',
      onPress: () => { onClose(); onAddActivity?.(); }
    },
    { 
      id: 'add-lesson-plan',
      label: 'Add Lesson Plan', 
      icon: BookOpen,
      context: 'lesson-plans',
      onPress: () => { onClose(); onAddLessonPlan?.(); }
    },
    { 
      id: 'add-syllabus',
      label: 'Add Syllabus', 
      icon: FileText,
      context: 'documents',
      onPress: () => { onClose(); onAddSyllabus?.(); }
    },
    { 
      id: 'add-attendance',
      label: 'Add Attendance', 
      icon: ClipboardCheck,
      context: 'attendance',
      onPress: () => { onClose(); onAddAttendance?.(); }
    },
    ...(onPlanYear && yearPlansEnabled ? [{
      id: 'plan-year',
      label: 'Year Plan',
      icon: Target,
      context: 'calendar',
      onPress: () => { onClose(); onPlanYear?.(); }
    }] : []),
  ];

  // Secondary actions
  const secondaryActions = [
    { 
      label: 'Copy from Template…', 
      icon: Copy,
      onPress: () => { onClose(); onCopyFromTemplate?.(); }
    },
    { 
      label: 'Import from File…', 
      icon: Upload,
      onPress: () => { onClose(); onImportFromFile?.(); }
    },
    { 
      label: 'AI-Generate…', 
      icon: Sparkles,
      onPress: () => { onClose(); onAIGenerate?.(); }
    },
  ];

  // Sort primary actions based on context
  const sortedPrimaryActions = [...primaryActions].sort((a, b) => {
    if (a.context === currentContext) return -1;
    if (b.context === currentContext) return 1;
    return 0;
  });

  return (
    <View 
      style={[
        styles.container,
        Platform.OS === 'web' ? {
          position: 'fixed',
          left: position.x,
          top: position.y,
        } : {}
      ]}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Primary Actions */}
      {sortedPrimaryActions.map((action, index) => (
        <TouchableOpacity
          key={action.id}
          style={[
            styles.menuItem,
            index === 0 && styles.menuItemFirst,
            action.context === currentContext && styles.menuItemHighlighted
          ]}
          onPress={action.onPress}
        >
          {action.icon && <action.icon size={16} color="#374151" />}
          <Text style={styles.menuItemText}>{action.label}</Text>
          {action.context === currentContext && (
            <View style={styles.contextBadge}>
              <Text style={styles.contextBadgeText}>Suggested</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Secondary Actions */}
      {secondaryActions.map((action, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.menuItem,
            index === secondaryActions.length - 1 && styles.menuItemLast
          ]}
          onPress={action.onPress}
        >
          {action.icon && <action.icon size={16} color="#6b7280" />}
          <Text style={styles.menuItemText}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 240,
    zIndex: 10000,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemFirst: {
    backgroundColor: '#f9fafb',
  },
  menuItemLast: {
    // No special styling, just marker
  },
  menuItemHighlighted: {
    backgroundColor: '#eff6ff',
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  contextBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contextBadgeText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
});


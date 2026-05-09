import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus, Users, Activity, FileText, Sparkles, GraduationCap } from 'lucide-react';

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
  onAddSyllabus,
  onAddSubject,
  onAIGenerate,
}) {
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  // Calculate menu height and adjust position to prevent overflow
  useEffect(() => {
    if (visible && Platform.OS === 'web') {
      // Approximate menu height: 
      // - 4 primary actions * 48px (12px padding * 2 + 24px content) = 192px
      // - 1 divider = 9px (4px margin * 2 + 1px height)
      // - 1 secondary action = 48px
      // Total: ~249px, add some buffer = ~280px
      const estimatedMenuHeight = 280;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      let adjustedY = position.y;
      let adjustedX = position.x;
      
      // Check if menu would overflow bottom of screen
      if (position.y + estimatedMenuHeight > viewportHeight) {
        // Position above the trigger button instead
        // The position.y is already below the button, so we need to go back up
        // by the menu height plus the gap we added (1px) plus button height
        const buttonHeight = 40; // Approximate button height
        const gap = 1; // Gap we added in WebLayout
        adjustedY = position.y - estimatedMenuHeight - buttonHeight - gap; // Position above with same gap
        
        // Ensure it doesn't go above viewport
        if (adjustedY < 16) {
          adjustedY = 16; // 16px margin from top
        }
      }
      
      // Check if menu would overflow right edge
      const menuWidth = 240; // minWidth from styles
      if (position.x + menuWidth > viewportWidth) {
        adjustedX = viewportWidth - menuWidth - 16; // 16px margin from edge
      }
      
      // Check if menu would overflow left edge
      if (adjustedX < 16) {
        adjustedX = 16;
      }
      
      setAdjustedPosition({ x: adjustedX, y: adjustedY });
    } else {
      setAdjustedPosition(position);
    }
  }, [visible, position]);

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
      id: 'add-subject',
      label: 'Add Subject', 
      icon: GraduationCap,
      context: 'settings',
      onPress: () => { onClose(); onAddSubject?.(); }
    },
    { 
      id: 'add-activity',
      label: 'Add Event', 
      icon: Activity,
      context: 'calendar',
      onPress: () => { onClose(); onAddActivity?.(); }
    },
    { 
      id: 'add-syllabus',
      label: 'Add Syllabus', 
      icon: FileText,
      context: 'documents',
      onPress: () => { onClose(); onAddSyllabus?.(); }
    },
  ];

  // Secondary actions
  const secondaryActions = [
    { 
      label: 'AI Tools', 
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
          left: adjustedPosition.x,
          top: adjustedPosition.y,
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


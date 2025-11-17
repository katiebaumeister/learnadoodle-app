import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Edit, Copy, Trash2, Sparkles } from 'lucide-react';

/**
 * Context menu component for right-click actions on items
 * Shows actions like Rename, Duplicate, Copy to, AI actions, Delete
 */
export default function ContextMenu({ 
  visible, 
  position = { x: 0, y: 0 },
  onClose,
  actions = [],
  itemType = 'item'
}) {
  useEffect(() => {
    if (visible && Platform.OS === 'web') {
      const handleClickOutside = (e) => {
        onClose();
      };
      
      // Small delay to prevent immediate close
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [visible, onClose]);

  if (!visible) return null;

  // Default actions if none provided
  const defaultActions = [
    {
      label: 'Rename',
      icon: Edit,
      onPress: () => {
        onClose();
        if (Platform.OS === 'web') window.alert('Rename coming soon!');
      }
    },
    {
      label: 'Duplicate',
      icon: Copy,
      onPress: () => {
        onClose();
        if (Platform.OS === 'web') window.alert('Duplicate coming soon!');
      }
    },
    {
      label: 'Copy to...',
      icon: Copy,
      onPress: () => {
        onClose();
        if (Platform.OS === 'web') window.alert('Copy to coming soon!');
      }
    },
    {
      label: 'AI Summarize',
      icon: Sparkles,
      onPress: () => {
        onClose();
        if (Platform.OS === 'web') window.alert('AI Summarize coming soon!');
      }
    },
    {
      label: 'AI Expand',
      icon: Sparkles,
      onPress: () => {
        onClose();
        if (Platform.OS === 'web') window.alert('AI Expand coming soon!');
      }
    },
    {
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onPress: () => {
        onClose();
        if (Platform.OS === 'web') {
          if (window.confirm('Are you sure you want to delete this item?')) {
            // Handle delete
          }
        }
      }
    },
  ];

  const menuActions = actions.length > 0 ? actions : defaultActions;

  return (
    <View 
      style={[
        styles.container,
        {
          position: 'absolute',
          left: position.x,
          top: position.y,
        }
      ]}
    >
      {menuActions.map((action, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.menuItem,
            action.destructive && styles.menuItemDestructive,
            index === 0 && styles.menuItemFirst,
            index === menuActions.length - 1 && styles.menuItemLast
          ]}
          onPress={action.onPress}
        >
          {action.icon && (
            <action.icon 
              size={16} 
              color={action.destructive ? '#ef4444' : '#374151'} 
            />
          )}
          <Text style={[
            styles.menuItemText,
            action.destructive && styles.menuItemTextDestructive
          ]}>
            {action.label}
          </Text>
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
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 200,
    zIndex: 9999,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemFirst: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  menuItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  menuItemDestructive: {
    backgroundColor: '#fef2f2',
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  menuItemTextDestructive: {
    color: '#ef4444',
  },
});


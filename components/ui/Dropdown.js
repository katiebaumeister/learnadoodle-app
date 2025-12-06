/**
 * Dropdown Component
 * Dropdown menu with boundary detection and proper positioning
 * 
 * Usage:
 * <Dropdown
 *   visible={showDropdown}
 *   triggerRef={buttonRef}
 *   onClose={() => setShowDropdown(false)}
 *   placement="bottom-start" // 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
 * >
 *   <DropdownItem icon={Edit} label="Edit" onPress={handleEdit} />
 *   <DropdownItem icon={Trash} label="Delete" onPress={handleDelete} />
 * </Dropdown>
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Modal, TouchableOpacity, Text } from 'react-native';
import { colors, shadows } from '../../theme/colors';

export default function Dropdown({
  visible,
  triggerRef,
  onClose,
  children,
  placement = 'bottom-start', // 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  offset = 8, // Distance from trigger
  maxHeight = 400,
  width = 200,
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);
  
  useEffect(() => {
    if (!visible || !triggerRef?.current || Platform.OS !== 'web') return;
    
    const updatePosition = () => {
      if (!triggerRef.current) return;
      
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let top = 0;
      let left = 0;
      
      // Calculate position based on placement
      if (placement.startsWith('bottom')) {
        top = triggerRect.bottom + offset;
      } else {
        top = triggerRect.top - offset;
      }
      
      if (placement.endsWith('start')) {
        left = triggerRect.left;
      } else {
        left = triggerRect.right - width;
      }
      
      // Boundary detection - adjust if would overflow viewport
      if (left + width > viewportWidth) {
        left = viewportWidth - width - 16; // 16px margin from edge
      }
      if (left < 0) {
        left = 16;
      }
      
      if (placement.startsWith('bottom') && top + maxHeight > viewportHeight) {
        // Flip to top if bottom would overflow
        top = triggerRect.top - offset;
      }
      if (placement.startsWith('top') && top < 0) {
        // Flip to bottom if top would overflow
        top = triggerRect.bottom + offset;
      }
      
      setPosition({ top, left });
    };
    
    updatePosition();
    
    // Update on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, triggerRef, placement, offset, width, maxHeight]);
  
  useEffect(() => {
    if (!visible) return;
    
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        triggerRef?.current &&
        !triggerRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    
    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [visible, onClose, triggerRef]);
  
  if (!visible) return null;
  
  if (Platform.OS === 'web') {
    return (
      <View
        ref={dropdownRef}
        style={[
          styles.dropdown,
          {
            position: 'fixed',
            top: position.top,
            left: position.left,
            width,
            maxHeight,
            zIndex: 1000,
          },
        ]}
      >
        {children}
      </View>
    );
  }
  
  // Mobile: use Modal
  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.dropdown, { width, maxHeight }]}>
          {children}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// DropdownItem sub-component
export function DropdownItem({ icon: Icon, label, onPress, danger = false }) {
  return (
    <TouchableOpacity
      style={[styles.item, danger && styles.itemDanger]}
      onPress={onPress}
    >
      {Icon && (
        <Icon 
          size={16} 
          color={danger ? colors.red : colors.text} 
          style={styles.itemIcon}
        />
      )}
      <Text style={[styles.itemText, danger && styles.itemTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    backgroundColor: colors.card,
    borderRadius: 8, // rounded-lg
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: shadows.md.boxShadow,
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, // px-4
    paddingVertical: 12, // py-3
    gap: 12, // gap-3
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: colors.panel,
      },
    }),
  },
  itemDanger: {
    ...(Platform.OS === 'web' && {
      ':hover': {
        backgroundColor: colors.redSoft,
      },
    }),
  },
  itemIcon: {
    flexShrink: 0,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  itemTextDanger: {
    color: colors.red,
  },
});


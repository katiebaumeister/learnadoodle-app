/**
 * Dropdown Component
 * Dropdown menu with boundary detection and proper positioning
 * 
 * Usage:
 * <Dropdown
 *   visible={showDropdown}
 *   triggerRef={buttonRef}
 *   onClose={() => setShowDropdown(false)}
 *   placement="bottom-start" // 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-down' | 'right-up'
 * >
 *   <DropdownItem icon={Edit} label="Edit" onPress={handleEdit} />
 *   <DropdownItem icon={Trash} label="Delete" onPress={handleDelete} />
 * </Dropdown>
 */
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  variant = 'default', // 'default' | 'context'
}) {
  const [position, setPosition] = useState(null);
  const dropdownRef = useRef(null);
  
  useLayoutEffect(() => {
    if (!visible || !triggerRef?.current || Platform.OS !== 'web') {
      setPosition(null);
      return undefined;
    }
    
    const updatePosition = () => {
      if (!triggerRef.current) return;
      
      // Handle React Native refs that may need _nativeNode
      const triggerNode = triggerRef.current._nativeNode || triggerRef.current;
      if (!triggerNode || !triggerNode.getBoundingClientRect) return;
      
      const triggerRect = triggerNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let top = 0;
      let left = 0;
      
      // Handle special right-down and right-up placements (similar to collapse menu)
      if (placement === 'right-down') {
        // Position to the right and below the trigger
        left = triggerRect.right + window.scrollX + offset;
        top = triggerRect.bottom + window.scrollY + offset;
        setPosition({ top, left });
        return;
      } else if (placement === 'right-up') {
        // Position to the right and above the trigger
        // Estimate height: ~48px per item (padding + border) × number of items
        const itemCount = React.Children.count(children);
        const estimatedHeight = itemCount * 48; // Approximate height per item
        left = triggerRect.right + window.scrollX + offset;
        // Position dropdown so its bottom edge is just above the button's top
        top = triggerRect.top + window.scrollY - estimatedHeight - offset;
        setPosition({ top, left });
        return;
      }
      
      // Calculate position based on standard placement
      if (placement.startsWith('bottom')) {
        top = triggerRect.bottom + offset;
      } else if (placement.startsWith('top')) {
        top = triggerRect.top - offset;
      } else {
        // Default to bottom
        top = triggerRect.bottom + offset;
      }
      
      if (placement.endsWith('start')) {
        left = triggerRect.left;
      } else if (placement.endsWith('end')) {
        left = triggerRect.right - width;
      } else {
        // Default to start
        left = triggerRect.left;
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
  }, [visible, triggerRef, placement, offset, width, maxHeight, children]);
  
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
  
  if (!visible || !position) return null;
  
  if (Platform.OS === 'web') {
    // Use portal for web to escape stacking context issues
    let ReactDOM;
    try {
      ReactDOM = require('react-dom');
    } catch (e) {
      // ReactDOM not available, fall back to normal rendering
    }
    
    const dropdownContent = (
      <View
        ref={dropdownRef}
        style={[
          styles.dropdown,
          variant === 'context' && styles.dropdownContext,
          {
            position: 'fixed',
            top: position.top,
            left: position.left,
            width,
            maxHeight,
            zIndex: 99999,
            isolation: 'isolate', // Create new stacking context
          },
        ]}
      >
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child, {
            variant,
            isLast: index === React.Children.count(children) - 1,
          });
        })}
      </View>
    );
    
    // Render to document.body via portal if available, otherwise render normally
    if (ReactDOM && typeof document !== 'undefined' && document.body) {
      return ReactDOM.createPortal(dropdownContent, document.body);
    }
    
    return dropdownContent;
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
        <View style={[styles.dropdown, variant === 'context' && styles.dropdownContext, { width, maxHeight }]}>
          {React.Children.map(children, (child, index) => {
            if (!React.isValidElement(child)) return child;
            return React.cloneElement(child, {
              variant,
              isLast: index === React.Children.count(children) - 1,
            });
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// DropdownItem sub-component
export function DropdownItem({
  icon: Icon,
  label,
  onPress,
  danger = false,
  variant = 'default',
  isLast = false,
}) {
  const isContext = variant === 'context';
  return (
    <TouchableOpacity
      style={[
        isContext ? styles.contextItem : styles.item,
        danger && (isContext ? styles.contextItemDanger : styles.itemDanger),
        isContext && isLast && styles.contextItemLast,
      ]}
      onPress={onPress}
    >
      {Icon && (
        <Icon
          size={16}
          color={danger ? colors.red : (isContext ? '#374151' : colors.text)}
          style={styles.itemIcon}
        />
      )}
      <Text style={[
        isContext ? styles.contextItemText : styles.itemText,
        danger && styles.itemTextDanger,
      ]}>
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
  dropdownContext: {
    borderRadius: 12,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
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
  contextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      ':hover': {
        backgroundColor: '#F8FAFC',
      },
    }),
  },
  contextItemLast: {
    borderBottomWidth: 0,
  },
  contextItemDanger: {
    ...(Platform.OS === 'web' && {
      ':hover': {
        backgroundColor: colors.redSoft,
      },
    }),
  },
  contextItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});


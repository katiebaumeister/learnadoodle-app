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
  matchTriggerWidth = false,
  variant = 'default', // 'default' | 'context'
  panelProps = null,
  anchorPoint = null,
}) {
  const [position, setPosition] = useState(null);
  const dropdownRef = useRef(null);
  
  useLayoutEffect(() => {
    if (!visible || Platform.OS !== 'web') {
      setPosition(null);
      return undefined;
    }
    
    const updatePosition = () => {
      if (anchorPoint) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const resolvedWidth = width;
        const itemCount = React.Children.count(children);
        const estimatedHeight = Math.min(maxHeight, Math.max(itemCount * 44, 44));
        let top = anchorPoint.y + offset;
        let left = anchorPoint.x;
        if (left + resolvedWidth > viewportWidth) {
          left = viewportWidth - resolvedWidth - 16;
        }
        if (left < 16) left = 16;
        if (top + estimatedHeight > viewportHeight) {
          top = anchorPoint.y - estimatedHeight - offset;
        }
        if (top < 8) top = 8;
        setPosition({ top, left, width: resolvedWidth });
        return true;
      }

      if (!triggerRef?.current) return false;
      
      // Handle React Native refs that may need _nativeNode
      const triggerNode = triggerRef.current._nativeNode || triggerRef.current;
      if (!triggerNode || !triggerNode.getBoundingClientRect) return false;
      
      const triggerRect = triggerNode.getBoundingClientRect();
      if (!triggerRect.width && !triggerRect.height) return false;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const resolvedWidth = matchTriggerWidth ? triggerRect.width : width;
      
      let top = 0;
      let left = 0;
      
      // Handle special right-down and right-up placements (similar to collapse menu)
      if (placement === 'right-down') {
        // Position to the right and below the trigger
        left = triggerRect.right + window.scrollX + offset;
        top = triggerRect.bottom + window.scrollY + offset;
        setPosition({ top, left, width: resolvedWidth });
        return true;
      } else if (placement === 'right-up') {
        // Position to the right and above the trigger
        // Estimate height: ~48px per item (padding + border) × number of items
        const itemCount = React.Children.count(children);
        const estimatedHeight = itemCount * 48; // Approximate height per item
        left = triggerRect.right + window.scrollX + offset;
        // Position dropdown so its bottom edge is just above the button's top
        top = triggerRect.top + window.scrollY - estimatedHeight - offset;
        setPosition({ top, left, width: resolvedWidth });
        return true;
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
        left = triggerRect.right - resolvedWidth;
      } else {
        // Default to start
        left = triggerRect.left;
      }
      
      // Boundary detection - adjust if would overflow viewport
      if (left + resolvedWidth > viewportWidth) {
        left = viewportWidth - resolvedWidth - 16; // 16px margin from edge
      }
      if (left < 0) {
        left = 16;
      }
      
      const itemCount = React.Children.count(children);
      const estimatedHeight = Math.min(maxHeight, Math.max(itemCount * 44, 44));

      if (placement.startsWith('bottom') && top + estimatedHeight > viewportHeight) {
        // Flip to top if bottom would overflow
        top = triggerRect.top - estimatedHeight - offset;
      }
      if (placement.startsWith('top')) {
        top = triggerRect.top - estimatedHeight - offset;
        if (top < 8) {
          top = triggerRect.bottom + offset;
        }
      }
      
      setPosition({ top, left, width: resolvedWidth });
      return true;
    };
    
    let rafId = null;
    const scheduleUpdate = () => {
      if (updatePosition()) return;
      rafId = window.requestAnimationFrame(() => {
        updatePosition();
      });
    };

    scheduleUpdate();
    
    // Update on scroll/resize
    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);
    
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [visible, triggerRef, anchorPoint, placement, offset, width, maxHeight, matchTriggerWidth, children]);
  
  useEffect(() => {
    if (!visible) return;
    
    const handleClickOutside = (e) => {
      const dropdownNode = dropdownRef.current?._nativeNode || dropdownRef.current;
      const triggerNode = triggerRef?.current?._nativeNode || triggerRef?.current;
      const target = e.target;
      if (
        dropdownNode &&
        typeof dropdownNode.contains === 'function' &&
        dropdownNode.contains(target)
      ) {
        return;
      }
      if (
        triggerNode &&
        typeof triggerNode.contains === 'function' &&
        triggerNode.contains(target)
      ) {
        return;
      }
      onClose();
    };
    
    // Defer so the opening click doesn't immediately close the menu
    const attachTimer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 0);
    
    return () => {
      clearTimeout(attachTimer);
      document.removeEventListener('click', handleClickOutside, true);
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
        {...(panelProps || {})}
        style={[
          styles.dropdown,
          variant === 'context' && styles.dropdownContext,
          {
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: position.width ?? width,
            maxHeight,
            zIndex: 100100,
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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


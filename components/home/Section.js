import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useHiddenSections } from '../hooks/useHiddenSections';

const Section = ({ id, title, children, className = '' }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const { hide } = useHiddenSections();

  const handleMenuPress = (event) => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({
          top: y + height + 8,
          right: window.innerWidth - x - width + 8
        });
        setShowMenu(true);
      });
    }
  };

  const handleHide = () => {
    hide(id);
    setShowMenu(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <View 
      style={[
        styles.section,
        className
      ]}
      onMouseEnter={() => setShowMenu(false)}
      onMouseLeave={() => setShowMenu(false)}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity
          ref={triggerRef}
          style={styles.menuTrigger}
          onPress={handleMenuPress}
          onFocus={() => setShowMenu(false)}
          accessibilityLabel="Section options"
          accessibilityRole="button"
        >
          <Text style={styles.menuTriggerText}>⋯</Text>
        </TouchableOpacity>
      </View>
      
      {children}

      {showMenu && (
        <Modal
          visible={true}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowMenu(false)}
        >
          <View style={styles.menuOverlay}>
            <View 
              ref={menuRef}
              style={[
                styles.menu,
                {
                  position: 'fixed',
                  top: menuPosition.top,
                  right: menuPosition.right
                }
              ]}
              role="menu"
              aria-label="Section options menu"
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleHide}
                role="menuitem"
                accessibilityLabel="Hide this section"
              >
                <Text style={styles.menuItemText}>Hide this on Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = {
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.025,
  },
  menuTrigger: {
    padding: 8,
    borderRadius: 6,
    opacity: 0,
    transition: 'opacity 0.2s ease',
  },
  menuTriggerText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  menuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  menu: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 160,
    zIndex: 50,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
};

export default Section;

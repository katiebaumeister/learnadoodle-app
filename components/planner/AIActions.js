import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Sparkles, ChevronDown, Zap, Calendar, HelpCircle, Target } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { checkFeatureFlags } from '../../lib/services/yearClient';

export default function AIActions({ 
  onPackThisWeek,
  onRebalance4Weeks,
  onWhatIf,
  onPlanYear,
  disabled = false
}) {
  const [yearPlansEnabled, setYearPlansEnabled] = useState(false);
  
  useEffect(() => {
    checkFeatureFlags().then(flags => {
      setYearPlansEnabled(flags.yearPlans);
    });
  }, []);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (showMenu && Platform.OS === 'web' && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const newPosition = {
            top: rect.bottom + 8,
            left: rect.left,
          };
          setMenuPosition(newPosition);
          
          // Directly update DOM element styles for immediate effect
          if (menuRef.current && menuRef.current.setNativeProps) {
            menuRef.current.setNativeProps({
              style: {
                position: 'fixed',
                top: newPosition.top,
                left: newPosition.left,
                zIndex: 9999999,
              }
            });
          } else if (menuRef.current) {
            // Fallback for web DOM manipulation
            const element = menuRef.current;
            if (element && element.style) {
              element.style.position = 'fixed';
              element.style.top = `${newPosition.top}px`;
              element.style.left = `${newPosition.left}px`;
              element.style.zIndex = '9999999';
            }
          }
        }
      };
      
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showMenu]);

  useEffect(() => {
    if (showMenu && Platform.OS === 'web') {
      // Move menu to document.body to escape overflow constraints
      // Use requestAnimationFrame to ensure element is rendered
      const moveToBody = () => {
        const menuElement = document.getElementById('ai-actions-menu');
        if (menuElement && menuElement.parentElement !== document.body) {
          // Store original parent
          const originalParent = menuElement.parentElement;
          document.body.appendChild(menuElement);
          
          return () => {
            // Clean up: move back to original parent or remove
            if (menuElement && menuElement.parentElement === document.body) {
              if (originalParent && originalParent !== document.body) {
                originalParent.appendChild(menuElement);
              } else {
                menuElement.remove();
              }
            }
          };
        }
      };
      
      // Wait for next frame to ensure element is rendered
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(moveToBody);
      }, 0);
      
      return () => {
        clearTimeout(timeoutId);
        const menuElement = document.getElementById('ai-actions-menu');
        if (menuElement && menuElement.parentElement === document.body) {
          menuElement.remove();
        }
      };
    }
  }, [showMenu]);

  useEffect(() => {
    if (showMenu && Platform.OS === 'web') {
      const handleClickOutside = (e) => {
        if (buttonRef.current && !buttonRef.current.contains(e.target)) {
          const menuElement = document.getElementById('ai-actions-menu');
          if (menuElement && !menuElement.contains(e.target)) {
            setShowMenu(false);
          }
        }
      };
      
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showMenu]);

  const handleAction = (action) => {
    setShowMenu(false);
    action?.();
  };

  const renderMenuContent = () => (
    <View 
      ref={menuRef}
      id="ai-actions-menu"
      nativeID="ai-actions-menu"
      style={{
        position: 'fixed',
        top: menuPosition.top,
        left: menuPosition.left,
        minWidth: 280,
        maxWidth: 400,
        backgroundColor: '#ffffff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e1e5e9',
        zIndex: 9999999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
    >
      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => handleAction(onPackThisWeek)}
        activeOpacity={0.7}
      >
        <Zap size={16} color="#374151" />
        <View style={styles.menuItemContent}>
          <Text style={styles.menuItemTitle}>Pack This Week</Text>
          <Text style={styles.menuItemDesc}>Fill remaining capacity from backlog</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => handleAction(onRebalance4Weeks)}
        activeOpacity={0.7}
      >
        <Calendar size={16} color="#374151" />
        <View style={styles.menuItemContent}>
          <Text style={styles.menuItemTitle}>Rebalance 4 Weeks</Text>
          <Text style={styles.menuItemDesc}>Optimize across next month</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => handleAction(onWhatIf)}
        activeOpacity={0.7}
      >
        <HelpCircle size={16} color="#374151" />
        <View style={styles.menuItemContent}>
          <Text style={styles.menuItemTitle}>What-if...</Text>
          <Text style={styles.menuItemDesc}>Test temporary conflicts</Text>
        </View>
      </TouchableOpacity>

      {yearPlansEnabled && onPlanYear && (
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleAction(onPlanYear)}
          activeOpacity={0.7}
        >
          <Target size={16} color="#374151" />
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemTitle}>Plan the Year</Text>
            <Text style={styles.menuItemDesc}>Create annual plan with pacing</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
      <View style={styles.container} ref={Platform.OS === 'web' ? buttonRef : null}>
        <TouchableOpacity
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={() => setShowMenu(!showMenu)}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Sparkles size={16} color={colors.accentContrast} />
          <Text style={styles.buttonText}>AI</Text>
          <ChevronDown size={14} color={colors.accentContrast} />
        </TouchableOpacity>
      </View>

      {showMenu && Platform.OS === 'web' && (
        renderMenuContent()
      )}

      {showMenu && Platform.OS !== 'web' && (
        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleAction(onPackThisWeek)}
            activeOpacity={0.7}
          >
            <Zap size={16} color="#374151" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>Pack This Week</Text>
              <Text style={styles.menuItemDesc}>Fill remaining capacity from backlog</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleAction(onRebalance4Weeks)}
            activeOpacity={0.7}
          >
            <Calendar size={16} color="#374151" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>Rebalance 4 Weeks</Text>
              <Text style={styles.menuItemDesc}>Optimize across next month</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleAction(onWhatIf)}
            activeOpacity={0.7}
          >
            <HelpCircle size={16} color="#374151" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>What-if...</Text>
              <Text style={styles.menuItemDesc}>Test temporary conflicts</Text>
            </View>
          </TouchableOpacity>

          {yearPlansEnabled && onPlanYear && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleAction(onPlanYear)}
              activeOpacity={0.7}
            >
              <Target size={16} color="#374151" />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Plan the Year</Text>
                <Text style={styles.menuItemDesc}>Create annual plan with pacing</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
    ...(Platform.OS === 'web' && {
      overflow: 'visible',
    }),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accentContrast,
  },
  menu: {
    minWidth: 280,
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    } : {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 8,
      zIndex: 1001,
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  menuItemContent: {
    flex: 1,
    gap: 4,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  menuItemDesc: {
    fontSize: 12,
    color: '#6b7280',
  },
});


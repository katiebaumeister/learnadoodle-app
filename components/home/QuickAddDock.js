import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Animated } from 'react-native';
import { Plus, Calendar, GraduationCap, BookOpen, Globe, UserPlus } from 'lucide-react';

export default function QuickAddDock({
  onAddEvent,
  onAddGrade,
  onAddMaterial,
  onAddSubject,
  onAddChild,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const actions = [
    { key: 'event', label: 'Event', icon: Calendar, onPress: onAddEvent },
    { key: 'grade', label: 'Grade', icon: GraduationCap, onPress: onAddGrade },
    { key: 'material', label: 'Material', icon: BookOpen, onPress: onAddMaterial },
    { key: 'subject', label: 'Subject', icon: Globe, onPress: onAddSubject },
    { key: 'child', label: 'Child', icon: UserPlus, onPress: onAddChild },
  ];

  const handleAction = (action) => {
    setIsOpen(false);
    if (action.onPress) {
      action.onPress();
    }
  };

  const handlePressIn = () => {
    setIsPressed(true);
    Animated.timing(scaleAnim, {
      toValue: 0.98,
      duration: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const handleHoverIn = () => {
    setIsHovered(true);
  };

  const handleHoverOut = () => {
    setIsHovered(false);
  };

  return (
    <>
      <Animated.View
        style={[
          styles.dockButtonContainer,
          {
            transform: [
              { scale: scaleAnim },
              ...(Platform.OS === 'web' 
                ? [{ translateY: isHovered ? -1 : 0 }]
                : [{ translateY: translateYAnim }]
              ),
            ],
          },
        ]}
        {...(Platform.OS === 'web' && {
          onMouseEnter: handleHoverIn,
          onMouseLeave: handleHoverOut,
        })}
      >
        <TouchableOpacity
          style={[
            styles.dockButton,
            isHovered && styles.dockButtonHovered,
          ]}
          onPress={() => setIsOpen(true)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.dockButtonText}>Quick add</Text>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.actionsList}>
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <TouchableOpacity
                    key={action.key}
                    style={styles.actionItem}
                    onPress={() => handleAction(action)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.actionIcon}>
                      <Icon size={20} color="#64748b" />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dockButtonContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 1000,
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
    }),
  },
  dockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b', // Dark navy/charcoal instead of near-black
    paddingVertical: 10, // Reduced from 12
    paddingHorizontal: 18, // Reduced from 20
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)', // Inner highlight
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)', // Softer shadow
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    } : {
      elevation: 6, // Reduced from 8
    }),
  },
  dockButtonHovered: {
    ...(Platform.OS === 'web' && {
      backgroundColor: '#334155', // Lighten by ~5%
    }),
  },
  dockButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500', // Reduced from 600 (semi-bold)
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }),
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 8,
    minWidth: 200,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    }),
  },
  actionsList: {
    gap: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

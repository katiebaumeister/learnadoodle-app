/**
 * Planner Walkthrough Component
 * Shows a step-by-step tutorial for new users when they have no events
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function PlannerWalkthrough({ 
  visible, 
  onClose, 
  onComplete,
  step = 1,
  targetRefs = {} // Refs to position dialogs relative to elements
}) {
  const [currentStep, setCurrentStep] = useState(step);
  const [positions, setPositions] = useState({});

  useEffect(() => {
    if (visible && Platform.OS === 'web') {
      // Calculate positions for each step
      const calculatePositions = () => {
        const newPositions = {};
        
        // Step 1: Position below and to the left of NEW button, aligned with button
        if (targetRefs.newButtonRef?.current) {
          const node = targetRefs.newButtonRef.current._nativeNode || targetRefs.newButtonRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            const dialogWidth = 360;
            const gap = 20;
            
            // Position to the left of the button, aligned with its right edge
            let leftPos = rect.right - dialogWidth;
            
            // If that would go off screen, position it to the left of the button
            if (leftPos < 16) {
              leftPos = rect.left - dialogWidth - gap;
              // Ensure dialog doesn't go off the left edge of screen
              if (leftPos < 16) {
                leftPos = 16; // Minimum 16px from left edge
              }
            }
            
            newPositions.step1 = {
              top: rect.bottom + 20, // Position below the button with spacing
              left: leftPos,
            };
          }
        }
        
        // Step 2: Position below middle buttons (Tasks, Filters, Plan & Optimize)
        if (targetRefs.middleButtonsRef?.current) {
          const node = targetRefs.middleButtonsRef.current._nativeNode || targetRefs.middleButtonsRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            newPositions.step2 = {
              top: rect.bottom + 12,
              left: rect.left + (rect.width / 2) - 200, // Center the dialog
            };
          }
        }
        
        // Step 3: Position pointing to sidebar (use fixed position since sidebar is on left)
        // Sidebar is typically around 240px wide, so position dialog to the right of it
        // Position it higher up, between Intelligence and Library items (approximately 200-250px from top)
        newPositions.step3 = {
          top: 220, // Position higher up, between Intelligence and Library
          left: 240 + 12, // Right of sidebar (240px sidebar width + 12px gap)
        };
        
        setPositions(newPositions);
      };
      
      calculatePositions();
      window.addEventListener('resize', calculatePositions);
      window.addEventListener('scroll', calculatePositions);
      
      return () => {
        window.removeEventListener('resize', calculatePositions);
        window.removeEventListener('scroll', calculatePositions);
      };
    }
  }, [visible, targetRefs, currentStep]);

  if (!visible) return null;

  const steps = [
    {
      id: 1,
      title: "Add your first event",
      message: "Add your first event here, whether a quick lesson, routine sports session, or last minute appointment.",
      position: positions.step1,
    },
    {
      id: 2,
      title: "Explore core features",
      message: "Use these buttons to switch views (Tasks, Filters, Plan & Optimize) and manage your schedule.",
      position: positions.step2,
    },
    {
      id: 3,
      title: "Discover Learnadoodle's specialty features",
      message: "Learnadoodle's specialty analysis of events, full material library, grades, and more can be found in the other tabs.",
      position: positions.step3,
    },
  ];

  const currentStepData = steps.find(s => s.id === currentStep);
  const isLastStep = currentStep === steps.length;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!currentStepData || !currentStepData.position) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop overlay */}
        <View style={styles.backdrop} />
        
        {/* Dialog positioned relative to target element */}
        <View
          style={[
            styles.dialog,
            currentStep === 3 && styles.dialogWide,
            {
              position: 'fixed',
              top: currentStepData.position.top,
              left: currentStepData.position.left,
            },
          ]}
        >
          {/* Arrow pointing to target */}
          {currentStep === 1 && (
            <View style={[styles.arrow, styles.arrowUp, styles.arrowRightAligned]} />
          )}
          {currentStep === 2 && (
            <View style={[styles.arrow, styles.arrowUp]} />
          )}
          {currentStep === 3 && (
            <View style={[styles.arrow, styles.arrowLeft]} />
          )}
          
          <View style={styles.dialogContent}>
            <View style={styles.header}>
              <View>
                <Text style={styles.stepIndicator}>
                  Step {currentStep} of {steps.length}
                </Text>
                <Text style={styles.title}>{currentStepData.title}</Text>
              </View>
              <TouchableOpacity onPress={handleSkip} style={styles.closeButton}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.message}>{currentStepData.message}</Text>
            
            <View style={styles.footer}>
              <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              
              <View style={styles.navigationButtons}>
                {currentStep > 1 && (
                  <TouchableOpacity onPress={handlePrevious} style={styles.navButton}>
                    <ChevronLeft size={16} color={colors.text} />
                    <Text style={styles.navButtonText}>Previous</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
                  <Text style={styles.nextButtonText}>
                    {isLastStep ? 'Get Started' : 'Next'}
                  </Text>
                  {!isLastStep && <ChevronRight size={16} color="#FFFFFF" />}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dialog: {
    width: 360,
    maxWidth: '90vw',
    zIndex: 10000,
    position: 'relative',
  },
  dialogWide: {
    width: 480,
    maxWidth: '90vw',
  },
  arrow: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    alignSelf: 'center',
  },
  arrowUp: {
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    marginBottom: -1,
  },
  arrowLeft: {
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderRightWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#FFFFFF',
    alignSelf: 'flex-start',
    marginLeft: 0,
    marginBottom: -1,
    position: 'absolute',
    left: -12,
    top: '50%',
    marginTop: -12,
  },
  arrowRight: {
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
    alignSelf: 'flex-end',
    marginRight: 20,
    marginBottom: -1,
  },
  arrowRightAligned: {
    alignSelf: 'flex-end',
    marginRight: 20,
  },
  dialogContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepIndicator: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  navigationButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  navButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  nextButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

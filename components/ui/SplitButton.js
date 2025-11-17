import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus, ChevronDown, Upload, Copy } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function SplitButton({ 
  onAddDoc, 
  onImportFile, 
  onCopyTemplate, 
  label = 'Add' 
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleClick = (e) => {
        if (ref.current && ref.current.contains && !ref.current.contains(e.target)) {
          setOpen(false);
        }
      };
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, []);

  const handlePrimaryClick = () => {
    onAddDoc();
  };

  const handleDropdownToggle = (e) => {
    if (Platform.OS === 'web') {
      e.stopPropagation();
    }
    setOpen(prev => !prev);
  };

  const handleMenuItemClick = (action) => {
    setOpen(false);
    action();
  };

  return (
    <View style={styles.container} ref={ref}>
      <View style={styles.buttonGroup}>
        <TouchableOpacity 
          onPress={handlePrimaryClick} 
          style={styles.primaryButton}
          activeOpacity={0.7}
        >
          <Plus size={16} color={colors.accentContrast} />
          <Text style={styles.primaryButtonText}>{label}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={handleDropdownToggle} 
          style={styles.dropdownToggle}
          activeOpacity={0.7}
        >
          <ChevronDown size={16} color={colors.accentContrast} />
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.dropdown}>
          <TouchableOpacity 
            onPress={() => handleMenuItemClick(onImportFile)}
            style={styles.menuItem}
            activeOpacity={0.7}
          >
            <Upload size={16} color={colors.text} />
            <Text style={styles.menuItemText}>Import from file</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => handleMenuItemClick(onCopyTemplate)}
            style={styles.menuItem}
            activeOpacity={0.7}
          >
            <Copy size={16} color={colors.text} />
            <Text style={styles.menuItemText}>Copy from template</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 100,
  },
  buttonGroup: {
    flexDirection: 'row',
    borderRadius: colors.radiusMd,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    ...shadows.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accentContrast,
  },
  dropdownToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.accent,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.2)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    width: 200,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
    ...(Platform.OS === 'web' && {
      boxShadow: shadows.md.boxShadow,
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      ':hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  menuItemText: {
    fontSize: 14,
    color: colors.text,
  },
});


import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { getSupportProfile, updateSupportProfile } from '../lib/services/recordsClient';

const ColorModeContext = createContext();

export function useColorMode() {
  const context = useContext(ColorModeContext);
  if (!context) {
    // Return default colors if context not available (for components outside provider)
    return {
      colorMode: 'default',
      colors: COLOR_MODES.default,
      loading: false,
    };
  }
  return context;
}

// Color mode definitions
const COLOR_MODES = {
  default: {
    background: '#FFFFFF',
    text: '#2E2E2E',
    muted: '#8B8B8B',
    accent: '#8B7CF6',
    border: '#E8E8E8',
    card: '#FFFFFF',
    bgSubtle: '#F8F9FF',
    panel: '#F6F8FF',
  },
  high_contrast: {
    background: '#FFFFFF',
    text: '#000000',
    muted: '#333333',
    accent: '#0000FF',
    border: '#000000',
    card: '#FFFFFF',
    bgSubtle: '#F0F0F0',
    panel: '#E8E8E8',
  },
  low_contrast: {
    background: '#F5F5F5',
    text: '#4A4A4A',
    muted: '#9B9B9B',
    accent: '#9B8CF6',
    border: '#D0D0D0',
    card: '#FAFAFA',
    bgSubtle: '#F0F0F0',
    panel: '#E8E8E8',
  },
  colorblind_friendly: {
    background: '#FFFFFF',
    text: '#1A1A1A',
    muted: '#666666',
    accent: '#0066CC',
    border: '#CCCCCC',
    card: '#FFFFFF',
    bgSubtle: '#F5F5F5',
    panel: '#EEEEEE',
  },
  dyslexia_friendly: {
    background: '#FEFEFE',
    text: '#2C2C2C',
    muted: '#6B6B6B',
    accent: '#4A90E2',
    border: '#D4D4D4',
    card: '#FFFFFF',
    bgSubtle: '#F8F8F8',
    panel: '#F0F0F0',
  },
  autism_friendly: {
    background: '#F8F8F8',
    text: '#2D2D2D',
    muted: '#7A7A7A',
    accent: '#6B8E23',
    border: '#C8C8C8',
    card: '#FCFCFC',
    bgSubtle: '#F0F0F0',
    panel: '#E8E8E8',
  },
};

// Apply color mode to CSS variables (web only)
const applyColorModeToCSS = (colors) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  
  const root = document.documentElement;
  if (!root) return;
  
  // Map color mode colors to CSS variables
  root.style.setProperty('--ld-bg', colors.background);
  root.style.setProperty('--ld-paper', colors.card);
  root.style.setProperty('--ld-surface', colors.card);
  root.style.setProperty('--ld-text', colors.text);
  root.style.setProperty('--ld-ink', colors.text);
  root.style.setProperty('--ld-muted', colors.muted);
  root.style.setProperty('--ld-primary', colors.accent);
  root.style.setProperty('--ld-border', colors.border);
  root.style.setProperty('--ld-rail', colors.bgSubtle || colors.background);
  
  // Update body background
  if (document.body) {
    document.body.style.backgroundColor = colors.background;
    document.body.style.color = colors.text;
  }
};

export function ColorModeProvider({ children, childId }) {
  const [colorMode, setColorMode] = useState('default');
  const [colorPreferences, setColorPreferences] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childId) {
      loadColorMode();
    } else {
      setLoading(false);
    }
  }, [childId]);

  // Apply color mode to CSS when it changes
  useEffect(() => {
    const colors = getColors();
    applyColorModeToCSS(colors);
  }, [colorMode, colorPreferences]);

  const loadColorMode = async () => {
    try {
      const profile = await getSupportProfile(childId);
      if (profile) {
        // Set color mode (default to 'default' if not set)
        setColorMode(profile.color_mode || 'default');
        // Set color preferences (default to empty object if not set)
        setColorPreferences(profile.color_preferences || {});
      }
    } catch (error) {
      console.error('Error loading color mode:', error);
      // On error, keep defaults
      setColorMode('default');
      setColorPreferences({});
    } finally {
      setLoading(false);
    }
  };

  const getColors = () => {
    const baseColors = COLOR_MODES[colorMode] || COLOR_MODES.default;
    // Merge with custom preferences if provided
    return {
      ...baseColors,
      ...colorPreferences,
    };
  };

  const updateColorMode = async (newMode, preferences = {}) => {
    setColorMode(newMode);
    setColorPreferences(preferences);
    
    // Persist to database
    if (childId) {
      try {
        await updateSupportProfile(childId, newMode, preferences);
      } catch (error) {
        console.error('Error saving color mode:', error);
      }
    }
  };

  const value = {
    colorMode,
    setColorMode: updateColorMode,
    colorPreferences,
    setColorPreferences,
    colors: getColors(),
    loading,
    refresh: loadColorMode,
  };

  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  );
}


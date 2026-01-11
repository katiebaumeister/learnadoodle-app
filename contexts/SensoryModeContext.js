import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';

const SensoryModeContext = createContext();

const STORAGE_KEY = 'ld.sensoryMode';
const DEFAULT_MODE = 'pastel';

export function useSensoryMode() {
  const context = useContext(SensoryModeContext);
  if (!context) {
    // Return default mode if context not available (for components outside provider)
    return {
      mode: DEFAULT_MODE,
      setMode: () => {},
    };
  }
  return context;
}

export function SensoryModeProvider({ children }) {
  const [mode, setModeState] = useState(DEFAULT_MODE);
  const [loading, setLoading] = useState(true);

  // Load mode from storage on mount
  useEffect(() => {
    loadMode();
  }, []);

  const loadMode = async () => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const savedMode = localStorage.getItem(STORAGE_KEY);
        if (savedMode && ['pastel', 'low', 'contrast'].includes(savedMode)) {
          setModeState(savedMode);
        }
      } else {
        // For native, could use AsyncStorage or similar
        // For now, just use default
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const setMode = (newMode) => {
    if (!['pastel', 'low', 'contrast'].includes(newMode)) {
      newMode = DEFAULT_MODE;
    }
    
    setModeState(newMode);
    
    // Persist to storage
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, newMode);
      }
    } catch (error) {
    }
  };

  const value = {
    mode,
    setMode,
    loading,
  };

  return (
    <SensoryModeContext.Provider value={value}>
      {children}
    </SensoryModeContext.Provider>
  );
}


















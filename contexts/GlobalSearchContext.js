import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import GlobalSearchModal from '../components/GlobalSearchModal';

const GlobalSearchContext = createContext(null);

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error('useGlobalSearch must be used inside GlobalSearchProvider');
  }
  return ctx;
}

export const GlobalSearchProvider = ({ children, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handler = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const metaPressed = isMac ? e.metaKey : e.ctrlKey;

      if (metaPressed && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <GlobalSearchContext.Provider value={{ openSearch, closeSearch, onNavigate }}>
      {children}
      {isOpen && <GlobalSearchModal onClose={closeSearch} onNavigate={onNavigate} />}
    </GlobalSearchContext.Provider>
  );
};


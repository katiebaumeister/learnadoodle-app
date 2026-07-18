import React, { createContext, useContext, useState, useCallback, lazy, Suspense } from 'react';

const GlobalSearchModal = lazy(() => import('../components/GlobalSearchModal'));

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

  // Cmd/Ctrl+K is owned by WebLayout's global Doodle pane.
  // Keep GlobalSearchModal available for explicit openSearch() callers only.

  return (
    <GlobalSearchContext.Provider value={{ openSearch, closeSearch, onNavigate }}>
      {children}
      {isOpen && (
        <Suspense fallback={null}>
          <GlobalSearchModal onClose={closeSearch} onNavigate={onNavigate} />
        </Suspense>
      )}
    </GlobalSearchContext.Provider>
  );
};


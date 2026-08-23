import React, { createContext, useContext, useState, useEffect } from 'react';
import { writeAppSearchParams } from '../lib/url';

const FiltersContext = createContext();

export function FiltersProvider({ children }) {
  const [filters, setFilters] = useState({
    childId: null,
    subjectId: null,
    date: null,
    view: null, // 'week' | 'month' | 'day'
    weekStart: null,
  });

  // Load filters from URL on mount (web only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const newFilters = {
        childId: params.get('child') || null,
        subjectId: params.get('subject') || null,
        date: params.get('date') || null,
        view: params.get('view') || null,
        weekStart: params.get('weekStart') || null,
      };
      
      // Only update if there are actual params
      if (Object.values(newFilters).some(v => v !== null)) {
        setFilters(newFilters);
      }
    }
  }, []);

  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    
    // Update URL (web only)
    if (typeof window !== 'undefined') {
      writeAppSearchParams(
        Object.fromEntries(
          Object.entries(newFilters).map(([key, value]) => {
            const urlKey = key === 'childId' ? 'child' : key === 'subjectId' ? 'subject' : key;
            return [urlKey, value || null];
          })
        )
      );
    }
  };

  const clearFilters = () => {
    setFilters({
      childId: null,
      subjectId: null,
      date: null,
      view: null,
      weekStart: null,
    });
    
    if (typeof window !== 'undefined') {
      writeAppSearchParams({
        child: null,
        subject: null,
        date: null,
        view: null,
        weekStart: null,
      });
    }
  };

  return (
    <FiltersContext.Provider value={{ filters, updateFilters, clearFilters }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error('useFilters must be used within FiltersProvider');
  }
  return context;
}


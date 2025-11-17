import { useState, useEffect } from 'react';
import { sampleData } from '../../lib/sampleData';

export const usePinnedViews = () => {
  const [pinnedViews, setPinnedViews] = useState([]);

  useEffect(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('pinnedViews');
    if (saved) {
      try {
        const parsedViews = JSON.parse(saved);
        setPinnedViews(parsedViews);
      } catch (error) {
        console.error('Failed to parse pinned views:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Save to localStorage whenever pinned views change
    localStorage.setItem('pinnedViews', JSON.stringify(pinnedViews));
  }, [pinnedViews]);

  const addPinnedView = (viewName) => {
    if (!pinnedViews.includes(viewName)) {
      setPinnedViews(prev => [...prev, viewName]);
    }
  };

  const removePinnedView = (viewName) => {
    setPinnedViews(prev => prev.filter(view => view !== viewName));
  };

  const getAvailableViews = () => {
    return sampleData.availableViews.filter(view => !pinnedViews.includes(view));
  };

  return {
    pinnedViews,
    addPinnedView,
    removePinnedView,
    getAvailableViews
  };
};

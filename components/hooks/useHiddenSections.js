import { useState, useEffect } from 'react';

export const useHiddenSections = () => {
  const [hidden, setHidden] = useState(new Set());

  useEffect(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('hiddenSections');
    if (saved) {
      try {
        const hiddenArray = JSON.parse(saved);
        setHidden(new Set(hiddenArray));
      } catch (error) {
        console.error('Failed to parse hidden sections:', error);
      }
    }
  }, []);

  const hide = (id) => {
    const newHidden = new Set(hidden);
    newHidden.add(id);
    setHidden(newHidden);
    localStorage.setItem('hiddenSections', JSON.stringify([...newHidden]));
  };

  const show = (id) => {
    const newHidden = new Set(hidden);
    newHidden.delete(id);
    setHidden(newHidden);
    localStorage.setItem('hiddenSections', JSON.stringify([...newHidden]));
  };

  const isHidden = (id) => hidden.has(id);

  return { hidden, hide, show, isHidden };
};

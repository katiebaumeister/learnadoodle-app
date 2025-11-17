import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import LoadingScreen from './LoadingScreen';
import { baseCssLayer, cssVariableMap } from '../theme/designTokens';

export default function WebInitializer({ children }) {
  const [isWebReady, setIsWebReady] = useState(false);

  useEffect(() => {
    // Only apply web-specific logic on web platform
    if (Platform.OS !== 'web') {
      setIsWebReady(true);
      return;
    }

    // Web-specific initialization
    const applyDesignTokens = () => {
      const root = document.documentElement;
      if (root) {
        Object.entries(cssVariableMap).forEach(([token, value]) => {
          root.style.setProperty(token, value);
        });
      }

      if (!document.getElementById('ld-base-styles')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'ld-base-styles';
        styleTag.innerHTML = baseCssLayer;
        document.head.appendChild(styleTag);
      }
    };

    const initializeWeb = () => {
      // Wait for DOM to be fully ready
      if (document.readyState === 'complete') {
        // Add a small delay to ensure all JavaScript bundles are loaded
        setTimeout(() => {
          applyDesignTokens();
          setIsWebReady(true);
        }, 1000);
      } else {
        // Wait for DOM to be ready
        window.addEventListener('load', () => {
          setTimeout(() => {
            applyDesignTokens();
            setIsWebReady(true);
          }, 1000);
        });
      }
    };

    initializeWeb();
  }, []);

  if (!isWebReady) {
    return <LoadingScreen message="Loading web application" timeout={15000} />;
  }

  return children;
}

import React from 'react';
import { Platform } from 'react-native';

// Try to use expo-router version, fallback to legacy
let BottomToolbarComponent;

try {
  // Try to import expo-router version
  const { BottomToolbar: ExpoRouterToolbar } = require('./BottomToolbarExpoRouter');
  BottomToolbarComponent = ExpoRouterToolbar;
} catch {
  // Fallback to legacy version
  const { BottomToolbarLegacy } = require('./BottomToolbarLegacy');
  BottomToolbarComponent = BottomToolbarLegacy;
}

export function BottomToolbar(props) {
  // If expo-router hooks are available, use them
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return <BottomToolbarComponent {...props} />;
  }
  
  try {
    const { useRouter, usePathname } = require('expo-router');
    // If we can require expo-router, use the expo-router version
    const ExpoRouterVersion = require('./BottomToolbarExpoRouter').BottomToolbar;
    return <ExpoRouterVersion {...props} />;
  } catch {
    // Use legacy version with navigation props
    return <BottomToolbarComponent {...props} />;
  }
}

// Export legacy version as well
export { BottomToolbarLegacy } from './BottomToolbarLegacy';

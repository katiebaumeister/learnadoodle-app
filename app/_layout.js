import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SensoryModeProvider } from '../contexts/SensoryModeContext';
import { AuthProvider } from '../contexts/AuthContext';
import { getModeTokens } from '../theme/pastelDesignTokens';

// Try to import expo-router, fallback gracefully if not available
let Stack;
try {
  const expoRouter = require('expo-router');
  Stack = expoRouter.Stack;
} catch {
  Stack = null;
}

// Fallback hook if context not available
function useSensoryModeSafe() {
  try {
    const { useSensoryMode } = require('../contexts/SensoryModeContext');
    const context = useSensoryMode();
    return context;
  } catch {
    return { mode: 'pastel' };
  }
}

function LayoutContent({ children }) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.bg,
          minHeight: Platform.OS === 'web' ? '100vh' : '100%',
        },
      ]}
    >
      {children}
    </View>
  );
}

export default function RootLayout({ children }) {
  if (Stack) {
    // Expo Router is available - use Stack navigator
    return (
      <AuthProvider>
        <SensoryModeProvider>
          <LayoutContent>
            <Stack
              screenOptions={{
                headerShown: false,
              }}
            />
          </LayoutContent>
        </SensoryModeProvider>
      </AuthProvider>
    );
  }
  
  // Expo Router not available - render children directly
  return (
    <AuthProvider>
      <SensoryModeProvider>
        <LayoutContent>
          {children}
        </LayoutContent>
      </SensoryModeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

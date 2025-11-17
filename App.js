import React from 'react';

import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, StyleSheet, Platform } from 'react-native';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GlobalSearchProvider } from './contexts/GlobalSearchContext';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import EditChildScreen from './screens/EditChildScreen';
import LoadingScreen from './components/LoadingScreen';
import SupabaseReady from './components/SupabaseReady';
import WebInitializer from './components/WebInitializer';
import WebLayout from './components/WebLayout';
import WebAuthScreen from './components/WebAuthScreen';
import PasswordResetPage from './components/PasswordResetPage';
import WebRouter from './components/WebRouter';

const Stack = createStackNavigator();

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Initializing app" timeout={8000} />;
  }

  // Render different layouts based on platform
  if (Platform.OS === 'web') {
    return <WebRouter />;
  }

  // Mobile layout with React Navigation
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Remove all transitions
          cardStyleInterpolator: () => ({
            cardStyle: {
              transform: [{ translateX: 0 }],
            },
          }),
          transitionSpec: {
            open: {
              animation: 'timing',
              config: {
                duration: 0,
              },
            },
            close: {
              animation: 'timing',
              config: {
                duration: 0,
              },
            },
          },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="EditChild"
          component={EditChildScreen}
          options={{
            headerShown: true,
            title: 'Edit Child',
            headerStyle: {
              backgroundColor: '#f8f9fa',
            },
            headerTintColor: '#333',
            headerTitleStyle: {
              fontWeight: '600',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            },
            // Remove transitions for this screen too
            cardStyleInterpolator: () => ({
              cardStyle: {
                transform: [{ translateX: 0 }],
              },
            }),
            transitionSpec: {
              open: {
                animation: 'timing',
                config: {
                  duration: 0,
                },
              },
              close: {
                animation: 'timing',
                config: {
                  duration: 0,
                },
              },
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <WebInitializer>
      <SupabaseReady>
        <AuthProvider>
          <GlobalSearchProvider>
            <AppContent />
          </GlobalSearchProvider>
        </AuthProvider>
      </SupabaseReady>
    </WebInitializer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});

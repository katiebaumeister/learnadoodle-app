import React, { Suspense, lazy } from 'react';

import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, StyleSheet, Platform } from 'react-native';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GlobalSearchProvider } from './contexts/GlobalSearchContext';
import SupabaseReady from './components/SupabaseReady';
import WebInitializer from './components/WebInitializer';

const WebRouter = lazy(() => import('./components/WebRouter'));
const AuthScreen = lazy(() => import('./screens/AuthScreen'));
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const EditChildScreen = lazy(() => import('./screens/EditChildScreen'));

const Stack = createStackNavigator();

function AppContent() {
  const { user, loading } = useAuth();

  // On web, render immediately so landing page shows without waiting for auth (no blank screen)
  // Auth loading is handled inside WebRouter (shows landing/auth until session is ready)
  if (Platform.OS === 'web') {
    return (
      <Suspense
        fallback={
          <View
            style={styles.webBootstrapFallback}
            accessibilityLabel="Loading"
          />
        }
      >
        <WebRouter />
      </Suspense>
    );
  }

  // On native, don't render until auth is ready
  if (loading) {
    return null;
  }

  // Mobile layout with React Navigation (screens lazy-loaded so web export stays smaller)
  const nativeFallback = <View style={styles.loadingContainer} />;

  if (!user) {
    return (
      <Suspense fallback={nativeFallback}>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
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
            <Stack.Screen name="Auth" component={AuthScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={nativeFallback}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
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
    </Suspense>
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
  webBootstrapFallback: {
    flex: 1,
    ...(Platform.OS === 'web' ? { minHeight: '100vh' } : {}),
    backgroundColor: '#F6F7FB',
  },
});

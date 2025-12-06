import React from 'react';
import { Redirect } from 'expo-router';
import HomeScreen from './home';

export default function Index() {
  // Redirect to home screen
  return <Redirect href="/home" />;
}

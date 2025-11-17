import React from 'react';
import { View, Text } from 'react-native';

export default function CalendarPage() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0e1116', padding: 16 }}>
      <Text style={{ color: '#e6eef8', fontSize: 24 }}>Calendar Test</Text>
      <Text style={{ color: '#e6eef8', fontSize: 16, marginTop: 16 }}>This is a test calendar page</Text>
    </View>
  );
}

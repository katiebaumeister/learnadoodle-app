import React from 'react';
import { View, Text } from 'react-native';

const demo = [
  { title: "Lilly's Art", time: "3:30–4:30 PM", days: "Mon, Wed, Fri" },
  { title: "Lilly's ELA", time: "9:00–10:00 AM", days: "Mon–Fri" },
  { title: "Lilly's Math", time: "10:30–11:30 AM", days: "Mon, Wed, Fri" },
  { title: "Max's ELA", time: "2:00–3:30 PM", days: "Mon, Wed, Fri" },
  { title: "Max's Math", time: "—", days: "—" },
];

export default function RightSidebar({ tracks = demo }) {
  return (
    <View style={{ 
      backgroundColor: '#11151b', 
      borderWidth: 1, 
      borderColor: '#232a33', 
      borderRadius: 12, 
      padding: 16 
    }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#e6eef8' }}>Learning Tracks & Schedule</Text>
      <View style={{ marginTop: 16 }}>
        {tracks.map((t, i) => (
          <View key={i} style={{ 
            borderRadius: 12, 
            borderWidth: 1, 
            borderColor: '#232a33', 
            backgroundColor: '#151a21', 
            padding: 12, 
            marginBottom: 12 
          }}>
            <Text style={{ fontWeight: '500', color: '#e6eef8' }}>{t.title}</Text>
            <Text style={{ fontSize: 14, color: '#c0cad6' }}>{t.time}</Text>
            <Text style={{ fontSize: 12, color: '#c0cad6' }}>{t.days}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

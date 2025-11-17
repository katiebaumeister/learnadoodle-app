import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export default function LeftSidebar() {
  return (
    <View style={{ 
      backgroundColor: '#11151b', 
      borderWidth: 1, 
      borderColor: '#232a33', 
      borderRadius: 12, 
      padding: 16 
    }}>
      <Text style={{ marginBottom: 16, fontSize: 14, color: '#c0cad6' }}>August 2025</Text>
      
      {/* Mini month – simplified static grid for now */}
      <View style={{ width: '100%' }}>
        {/* Day headers */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((h) => (
            <View key={h} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#c0cad6' }}>{h}</Text>
            </View>
          ))}
        </View>
        {/* Calendar days */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: 35 }).map((_, i) => (
            <View key={i} style={{ 
              width: '14.28%', 
              height: 24, 
              borderRadius: 6, 
              backgroundColor: 'rgba(21, 26, 33, 0.6)', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Text style={{ fontSize: 11, color: '#c0cad6' }}>{i % 30 + 1}</Text>
            </View>
          ))}
        </View>
      </View>
      
      <View style={{ 
        marginTop: 24, 
        borderRadius: 12, 
        borderWidth: 1, 
        borderColor: '#232a33', 
        backgroundColor: '#151a21', 
        padding: 12 
      }}>
        <Text style={{ fontSize: 12, letterSpacing: 0.5, color: '#c0cad6' }}>ACCOUNT</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#e6eef8' }}>katiebaumeister@icloud.com</Text>
        <TouchableOpacity style={{ 
          marginTop: 12, 
          width: '100%', 
          borderRadius: 8, 
          borderWidth: 1, 
          borderColor: '#232a33', 
          paddingHorizontal: 12, 
          paddingVertical: 8 
        }}>
          <Text style={{ fontSize: 14, color: '#e6eef8', textAlign: 'center' }}>+ Add calendar account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

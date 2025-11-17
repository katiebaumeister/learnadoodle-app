import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { formatMonthYear } from './utils/date';

export default function CalendarHeader({ date, onPrev, onNext, onToday }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={onPrev}
          style={{ 
            borderRadius: 8, 
            borderWidth: 1, 
            borderColor: '#232a33', 
            paddingHorizontal: 8, 
            paddingVertical: 4, 
            marginRight: 8 
          }}
        >
          <Text style={{ color: '#e6eef8', fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={onNext}
          style={{ 
            borderRadius: 8, 
            borderWidth: 1, 
            borderColor: '#232a33', 
            paddingHorizontal: 8, 
            paddingVertical: 4, 
            marginRight: 8 
          }}
        >
          <Text style={{ color: '#e6eef8', fontSize: 18 }}>›</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={onToday}
          style={{ 
            borderRadius: 20, 
            backgroundColor: '#151a21', 
            paddingHorizontal: 12, 
            paddingVertical: 4 
          }}
        >
          <Text style={{ fontSize: 14, color: '#e6eef8' }}>Today</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={{ fontSize: 24, fontWeight: '600', color: '#e6eef8' }}>
        {formatMonthYear(date)}
      </Text>
      
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          style={{ 
            borderRadius: 8, 
            borderWidth: 1, 
            borderColor: '#232a33', 
            backgroundColor: '#151a21', 
            paddingHorizontal: 12, 
            paddingVertical: 4, 
            fontSize: 14, 
            color: '#e6eef8',
            marginRight: 8
          }}
          placeholder="Search events"
          placeholderTextColor="#c0cad6"
        />
        <View style={{ 
          height: 32, 
          width: 32, 
          borderRadius: 16, 
          backgroundColor: '#151a21' 
        }} />
      </View>
    </View>
  );
}

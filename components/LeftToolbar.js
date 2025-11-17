import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Home, Plus, Calendar } from 'lucide-react'

export default function LeftToolbar({ onHome, onAdd, onCalendar }) {
  return (
    <View style={styles.toolbar}>
      <TouchableOpacity style={styles.toolbarItem} onPress={onHome}>
        <Home size={24} color="#666666" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.toolbarItem} onPress={onAdd}>
        <Plus size={24} color="#666666" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.toolbarItem} onPress={onCalendar}>
        <Calendar size={24} color="#666666" />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    width: 80,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#f1f3f4',
    paddingVertical: 16,
    paddingTop: 64,
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
  },
  toolbarItem: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  toolbarItemHover: {
    backgroundColor: '#f8f9fa',
    transform: 'scale(1.05)',
  },
  toolbarItemActive: {
    backgroundColor: '#1a1a1a',
  },
  toolbarItemActiveHover: {
    backgroundColor: '#000000',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.15)',
  },
  toolbarIcon: {
    width: 24,
    height: 24,
    transition: 'all 0.2s ease',
  },
  toolbarIconActive: {
    color: '#ffffff',
  },
  toolbarIconInactive: {
    color: '#666666',
  },
  toolbarIconHover: {
    color: '#1a1a1a',
  },
})



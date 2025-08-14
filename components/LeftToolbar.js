import React from 'react'
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native'
import { Home, Plus, Calendar, Settings } from 'lucide-react'

export default function LeftToolbar({ onHome, onAdd, onCalendar, onSettings, onAdmin }) {
  return (
    <View style={styles.container}>
      <View style={styles.topButtons}>
        <TouchableOpacity style={styles.iconBtn} onPress={onHome}>
          <Home size={24} color="#37352f" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onAdd}>
          <Plus size={24} color="#37352f" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onCalendar}>
          <Calendar size={24} color="#37352f" />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomButtons}>
        <TouchableOpacity style={styles.iconBtn} onPress={onAdmin}>
          <Text style={styles.adminText}>🔐</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onSettings}>
          <Settings size={24} color="#37352f" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e1e1e1',
    backgroundColor: '#ffffff',
    height: '100vh',
    paddingVertical: 8,
  },
  topButtons: { gap: 8, alignItems: 'center' },
  iconBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f0f0f0'
  },
  bottomButtons: { marginTop: 'auto', marginBottom: 8 },
  adminText: { fontSize: 20, textAlign: 'center' },
})



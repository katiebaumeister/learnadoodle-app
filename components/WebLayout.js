import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import LeftToolbar from './LeftToolbar'
import WebContent from './WebContent'
import SettingsModal from './SettingsModal'

export default function WebLayout({ navigation, routeParams }) {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('home')
  const [activeSubtab, setActiveSubtab] = useState('dashboard')
  const [sidebarKey, setSidebarKey] = useState(0) // Force sidebar refresh
  const [showSettings, setShowSettings] = useState(false)
  const [hoveredUserButton, setHoveredUserButton] = useState(false)
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingDoodlePrompt, setPendingDoodlePrompt] = useState(null)

  const handleChildAdded = () => {
    setSidebarKey(prev => prev + 1)
  }

  const handleSyllabusUpload = () => {
    setShowSyllabusUpload(true)
  }

  const handleSyllabusProcessed = (syllabusData) => {
    console.log('Syllabus processed:', syllabusData)
    setShowSyllabusUpload(false)
  }

  const handleSignOut = async () => {
    try {
      console.log('Sign out initiated')
      const { error } = await signOut()
      if (error) {
        console.error('Sign out error:', error)
        // Use a web-compatible alert
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Error signing out: ' + error.message)
        } else {
          console.error('Error signing out:', error.message)
        }
      } else {
        console.log('Sign out successful')
        // The AuthContext will automatically redirect to login
        // No need to reload the page
      }
    } catch (error) {
      console.error('Sign out exception:', error)
      // Use a web-compatible alert
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('An error occurred while signing out')
      } else {
        console.error('Sign out error:', error)
      }
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {/* Search Section */}
        <View style={styles.searchSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for anything..."
            placeholderTextColor="#9aa0a6"
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => {
              if (!searchQuery.trim()) return
              setPendingDoodlePrompt(searchQuery.trim())
              setActiveTab('search')
              setSearchOpen(false)
            }}
          />
          
          {/* Search Dropdown */}
          {searchOpen && (
            <View style={styles.searchDropdown}>
              <View style={styles.dropdownSection}>
                <Text style={styles.dropdownTitle}>Recent searches</Text>
                <TouchableOpacity 
                  style={styles.dropdownItem}
                  onPress={() => { 
                    setSearchQuery('Chat history…')
                    setSearchOpen(false)
                  }}
                >
                  <Text style={styles.dropdownItemText}>Chat history…</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.dropdownSection}>
                <Text style={styles.dropdownTitle}>Ideas for you</Text>
                {[
                  'How is Lilly doing in Math?',
                  'What activities can we do related to Max\'s handwriting class?',
                  'Reschedule Lilly\'s Tuesday English for Wednesday'
                ].map((suggestion, index) => (
                  <TouchableOpacity 
                    key={index}
                    style={styles.dropdownItem}
                    onPress={() => { 
                      setSearchQuery(suggestion)
                      setPendingDoodlePrompt(suggestion)
                      setActiveTab('search')
                      setSearchOpen(false)
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* User Section */}
        <View style={styles.userSection}>
          <TouchableOpacity 
            style={[styles.userButton, hoveredUserButton && styles.userButtonHovered]}
            onPress={() => setShowSettings(true)}
            onMouseEnter={() => setHoveredUserButton(true)}
            onMouseLeave={() => setHoveredUserButton(false)}
          >
            <Text style={[styles.userInitial, hoveredUserButton && styles.userInitialHovered]}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Main Content Area */}
      <View style={styles.contentArea}>
        <LeftToolbar
          onHome={() => setActiveTab('home')}
          onAdd={() => setActiveTab('add-options')}
          onCalendar={() => setActiveTab('calendar')}
          onSettings={() => setShowSettings(true)}
          onAdmin={() => setActiveTab('admin-password')}
        />
        <View style={styles.mainContent}>
          <WebContent
            activeTab={activeTab}
            activeSubtab={activeSubtab}
            user={user}
            onChildAdded={handleChildAdded}
            navigation={navigation}
            showSyllabusUpload={showSyllabusUpload}
            onSyllabusProcessed={handleSyllabusProcessed}
            onCloseSyllabusUpload={() => setShowSyllabusUpload(false)}
            onTabChange={setActiveTab}
            pendingDoodlePrompt={pendingDoodlePrompt}
            onConsumeDoodlePrompt={() => setPendingDoodlePrompt(null)}
          />
        </View>
      </View>
      
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        user={user}
        onSignOut={handleSignOut}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    height: '100vh',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
    backgroundColor: '#ffffff',
    height: 72,
    position: 'relative',
  },
  searchSection: {
    flex: 1,
    marginRight: 20,
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 28,
    backgroundColor: '#f8f9fa',
    color: '#37352f',
    fontSize: 16,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  },
  searchDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    marginTop: 8,
    padding: 16,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    zIndex: 1000,
  },
  dropdownSection: {
    marginBottom: 20,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  userSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    cursor: 'pointer',
  },
  userButtonHovered: {
    backgroundColor: '#e8e8e8',
    borderColor: '#d1d1d1',
  },
  userInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
  },
  userInitialHovered: {
    color: '#37352f',
  },
  contentArea: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
}) 
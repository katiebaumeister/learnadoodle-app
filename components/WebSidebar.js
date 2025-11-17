import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import {
  Home,
  Search,
  Calendar,
  Users,
  Baby,
  FileText,
  User,
  Upload,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useFocusEffect } from '@react-navigation/native'

// Lucide icon component
const Icon = ({ name, size = 16, color = '#37352f' }) => {
  const icons = {
    home: Home,
    search: Search,
    calendar: Calendar,
    family: Users,
    child: Baby,
    templates: FileText,
    person: User,
    upload: Upload,
    sparkles: Sparkles,
  }
  
  const IconComponent = icons[name] || Home
  
  return <IconComponent size={size} color={color} />
}

export default function WebSidebar({ activeTab, activeSubtab, onTabChange, onSubtabChange, onSyllabusUpload }) {
  const [expandedTabs, setExpandedTabs] = useState(['family-space'])
  const [hoveredTab, setHoveredTab] = useState(null)
  const [hoveredSubtab, setHoveredSubtab] = useState(null)
  const [children, setChildren] = useState([])

  // Fetch children from database
  useEffect(() => {
    fetchChildren()
  }, [])

  // Refetch children when screen is focused (e.g., returning from edit screen)
  useFocusEffect(
    React.useCallback(() => {
      fetchChildren()
    }, [])
  )

  const fetchChildren = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Fetch family_id from profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .single()
        if (profileError) {
          console.error('Error fetching profile:', profileError)
          setChildren([])
          return
        }
        const family_id = profile?.family_id
        if (!family_id) {
          console.error('No family_id found for user')
          setChildren([])
          return
        }
        // Fetch children by family_id
        const { data, error } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', family_id)
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Error fetching children:', error)
        } else {
          setChildren(data || [])
        }
      }
    } catch (error) {
      console.error('Error fetching children:', error)
    }
  }

  const toggleTab = (tabId) => {
    setExpandedTabs(prev => 
      prev.includes(tabId) 
        ? prev.filter(id => id !== tabId)
        : [...prev, tabId]
    )
  }

  const renderSubSubtabs = (subSubtabs, parentId) => {
    if (!subSubtabs) return null
    
    return (
      <View style={styles.subSubtabs}>
        {subSubtabs.map((subSubtab) => (
          <TouchableOpacity
            key={subSubtab.id}
            style={[
              styles.subSubtabButton,
              activeSubtab === subSubtab.id && styles.activeSubSubtabButton
            ]}
            onPress={() => {
              onSubtabChange(subSubtab.id)
            }}
          >
            <Text style={[
              styles.subSubtabLabel,
              activeSubtab === subSubtab.id && styles.activeSubSubtabLabel
            ]}>
              {subSubtab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )
  }

  // Generate dynamic sidebar data
  const generateSidebarData = () => {
    const baseData = [
      {
        id: 'home',
        label: 'Home',
        icon: 'home',
        type: 'top-level',
        subtabs: []
      },
      {
        id: 'search',
        label: 'Ask Doodle',
        icon: 'search',
        type: 'top-level',
        subtabs: []
      },
      {
        id: 'calendar',
        label: 'Calendar',
        icon: 'calendar',
        type: 'top-level',
        subtabs: []
      },
      {
        id: 'add-child',
        label: 'Add a Child',
        icon: 'baby',
        type: 'family',
        subtabs: []
      },
      {
        id: 'inspire-learning',
        label: 'Inspire Learning',
        icon: 'sparkles',
        type: 'top-level',
        subtabs: []
      }
    ]

    // Add dynamic children
    const childrenData = children.map((child, index) => ({
      id: `child-${child.id}`,
                  label: child.first_name,
      icon: 'person',
      type: 'child',
      subtabs: [
        { id: `lesson-plan-${child.id}`, label: 'Lesson Plan' },
        { 
          id: `to-do-list-${child.id}`, 
          label: 'To-Do List',
          subSubtabs: [
            { id: `by-class-${child.id}`, label: 'By Class' },
            { id: `by-activity-${child.id}`, label: 'By Activity' },
            { id: `all-tasks-${child.id}`, label: 'All Tasks' },
          ]
        },
        { id: `projects-${child.id}`, label: 'Projects' },
        { id: `notes-pages-${child.id}`, label: 'Notes Pages' },
        { id: `calendar-schedule-${child.id}`, label: 'Calendar & Schedule' },
        { id: `syllabus-upload-${child.id}`, label: 'Upload Syllabus' },
      ]
    }))

    return [...baseData, ...childrenData]
  }

  const sidebarData = generateSidebarData()

  return (
    <View style={styles.sidebar}>
      <ScrollView style={styles.navigation} showsVerticalScrollIndicator={false}>
        {sidebarData.map((tab) => (
          <View key={tab.id} style={styles.tabGroup}>
            {tab.type === 'header' ? (
              <View style={styles.headerTab}>
                {tab.icon && <Icon name={tab.icon} size={14} />}
                <Text style={styles.headerLabel}>{tab.label}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  tab.type === 'top-level' && styles.topLevelButton,
                  tab.type === 'section' && styles.sectionButton,
                  tab.type === 'child' && styles.childButton,
                  tab.type === 'family' && styles.familyButton,
                  tab.type === 'management' && styles.managementButton,
                  activeTab === tab.id && styles.activeTabButton,
                  hoveredTab === tab.id && styles.hoveredTabButton
                ]}
                onPress={() => {
                  // Handle add child specially
                  if (tab.id === 'add-child') {
                    // This will trigger the onboarding flow
                    onTabChange(tab.id)
                    return
                  }
                  
                  onTabChange(tab.id)
                  if (tab.subtabs.length > 0 && !expandedTabs.includes(tab.id)) {
                    toggleTab(tab.id)
                  }
                  // Set first subtab as active when tab is selected
                  if (tab.subtabs.length > 0) {
                    onSubtabChange(tab.subtabs[0].id)
                  }
                }}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab(null)}
              >
                {tab.subtabs.length > 0 && hoveredTab === tab.id ? (
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => toggleTab(tab.id)}
                  >
                    <Text style={[
                      styles.expandIcon,
                      expandedTabs.includes(tab.id) && styles.expandedIcon
                    ]}>
                      {expandedTabs.includes(tab.id) ? '↓' : '>'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  tab.icon && <Icon name={tab.icon} size={16} />
                )}
                <Text style={[
                  styles.tabLabel,
                  tab.type === 'top-level' && styles.topLevelLabel,
                  tab.type === 'section' && styles.sectionLabel,
                  tab.type === 'child' && styles.childLabel,
                  tab.type === 'family' && styles.familyLabel,
                  tab.type === 'management' && styles.managementLabel,
                  activeTab === tab.id && styles.activeTabLabel
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )}
            
            {expandedTabs.includes(tab.id) && tab.subtabs.length > 0 && (
              <View style={styles.subtabs}>
                {tab.subtabs.map((subtab) => (
                  <View key={subtab.id}>
                    <TouchableOpacity
                      style={[
                        styles.subtabButton,
                        activeSubtab === subtab.id && styles.activeSubtabButton,
                        hoveredSubtab === subtab.id && styles.hoveredSubtabButton
                      ]}
                      onPress={() => {
                        // For special subtabs that should be the activeTab, set the activeTab to the subtab ID
                        if (subtab.id.startsWith('syllabus-upload-') || 
                            subtab.id.startsWith('to-do-list-') ||
                            subtab.id.startsWith('projects-') ||
                            subtab.id.startsWith('notes-pages-')) {
                          onTabChange(subtab.id)
                        } else {
                          onTabChange(tab.id)
                          onSubtabChange(subtab.id)
                        }
                      }}
                      onMouseEnter={() => setHoveredSubtab(subtab.id)}
                      onMouseLeave={() => setHoveredSubtab(null)}
                    >
                      {subtab.subSubtabs && hoveredSubtab === subtab.id ? (
                        <TouchableOpacity
                          style={styles.expandButton}
                          onPress={() => toggleTab(subtab.id)}
                        >
                          <Text style={[
                            styles.expandIcon,
                            expandedTabs.includes(subtab.id) && styles.expandedIcon
                          ]}>
                            {expandedTabs.includes(subtab.id) ? '↓' : '>'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.bullet}>-</Text>
                      )}
                      <Text style={[
                        styles.subtabLabel,
                        activeSubtab === subtab.id && styles.activeSubtabLabel
                      ]}>
                        {subtab.label}
                      </Text>
                    </TouchableOpacity>
                    
                    {subtab.subSubtabs && expandedTabs.includes(subtab.id) && (
                      renderSubSubtabs(subtab.subSubtabs, subtab.id)
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: 280,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#f1f3f4',
    paddingVertical: 24,
    paddingHorizontal: 20,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
  },
  logoSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  logo: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    letterSpacing: '-0.02em',
  },
  navSection: {
    marginBottom: 32,
  },
  navTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 16,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 4,
    borderRadius: 12,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  navItemHover: {
    backgroundColor: '#f8f9fa',
  },
  navItemActive: {
    backgroundColor: '#1a1a1a',
  },
  navItemActiveHover: {
    backgroundColor: '#000000',
  },
  navIcon: {
    marginRight: 16,
    width: 20,
    height: 20,
  },
  navText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    transition: 'all 0.2s ease',
  },
  navTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  navTextHover: {
    color: '#1a1a1a',
  },
  expandIcon: {
    marginLeft: 'auto',
    transition: 'all 0.2s ease',
  },
  expandIconExpanded: {
    transform: 'rotate(180deg)',
  },
  subtabContainer: {
    marginLeft: 36,
    marginTop: 8,
    marginBottom: 16,
  },
  subtabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 2,
    borderRadius: 8,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  subtabItemHover: {
    backgroundColor: '#f8f9fa',
  },
  subtabItemActive: {
    backgroundColor: '#f1f3f4',
  },
  subtabIcon: {
    marginRight: 12,
    width: 16,
    height: 16,
    opacity: 0.7,
  },
  subtabText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    transition: 'all 0.2s ease',
  },
  subtabTextHover: {
    color: '#1a1a1a',
  },
  subtabTextActive: {
    color: '#1a1a1a',
    fontWeight: '500',
  },
  specialSubtab: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  specialSubtabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1a1a1a',
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  addButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  addButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.2)',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  addButtonIcon: {
    marginRight: 8,
    width: 16,
    height: 16,
  },
  bottomSection: {
    marginTop: 'auto',
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  userInfo: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userEmail: {
    fontSize: 12,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  signOutButton: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  signOutButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#dc2626',
  },
  signOutButtonText: {
    color: '#666666',
    fontSize: 13,
    fontWeight: '500',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  signOutButtonTextHover: {
    color: '#dc2626',
  },
}) 
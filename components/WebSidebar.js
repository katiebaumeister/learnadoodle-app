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
      }
    ]

    // Add dynamic children
    const childrenData = children.map((child, index) => ({
      id: `child-${child.id}`,
      label: child.name,
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
    width: 240,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e1e1e1',
    height: '100vh',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
    backgroundColor: '#ffffff',
  },
  logo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#37352f',
  },
  navigation: {
    flex: 1,
    paddingTop: 10,
  },
  tabGroup: {
    marginBottom: 4,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 6,
    position: 'relative',
    gap: 8,
  },
  topLevelButton: {
    backgroundColor: 'transparent',
  },
  sectionButton: {
    backgroundColor: '#f1f3f4',
    marginTop: 8,
  },
  childButton: {
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  familyButton: {
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  managementButton: {
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  activeTabButton: {
    backgroundColor: '#f1f3f4',
  },
  tabLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
  },
  topLevelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
  },
  childLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
  },
  familyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
  },
  managementLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
  },
  activeTabLabel: {
    fontWeight: '600',
    color: '#37352f',
  },
  expandButton: {
    padding: 4,
  },
  expandIcon: {
    fontSize: 10,
    color: '#787774',
  },
  expandedIcon: {
    transform: [{ rotate: '0deg' }],
  },
  subtabs: {
    marginLeft: 16,
    marginTop: 4,
  },
  subtabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginVertical: 1,
    borderRadius: 4,
  },
  activeSubtabButton: {
    backgroundColor: '#f1f3f4',
  },
  subtabLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
  },
  activeSubtabLabel: {
    color: '#37352f',
    fontWeight: '500',
  },
  subSubtabs: {
    marginLeft: 16,
    marginTop: 2,
  },
  subSubtabButton: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginVertical: 1,
    borderRadius: 4,
  },
  activeSubSubtabButton: {
    backgroundColor: '#f1f3f4',
  },
  subSubtabLabel: {
    fontSize: 12,
    color: '#787774',
  },
  activeSubSubtabLabel: {
    color: '#37352f',
    fontWeight: '500',
  },
  headerTab: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
    gap: 8,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
  },
  bullet: {
    fontSize: 12,
    color: '#787774',
    marginRight: 8,
    fontWeight: 'bold',
  },
  hoveredTabButton: {
    backgroundColor: '#f1f3f4',
  },
  hoveredSubtabButton: {
    backgroundColor: '#f1f3f4',
  },
}) 
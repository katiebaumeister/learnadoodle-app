import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import WebLayout from '../components/WebLayout'
import { supabase } from '../lib/supabase'

export default function HomeScreen({ navigation, route }) {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [isWeb, setIsWeb] = useState(false)
  const [todaysLearning, setTodaysLearning] = useState([])
  const [loadingLearning, setLoadingLearning] = useState(true)
  const [children, setChildren] = useState([])

  useEffect(() => {
    // Check if we're running on web
    if (Platform.OS === 'web') {
      setIsWeb(true)
    }
  }, [])

  // Handle navigation parameters from edit screen
  useEffect(() => {
    if (route.params?.activeTab && route.params?.activeSubtab) {
      // Pass the navigation parameters to WebLayout
      // The WebLayout will handle setting the active tab and subtab
    }
  }, [route.params])

  // Fetch today's learning data
  useEffect(() => {
    fetchTodaysLearning()
  }, [])

  const fetchTodaysLearning = async () => {
    try {
      setLoadingLearning(true)
      
      // Get user's profile to find family_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user?.id)
        .single()
      
      if (profileError) throw profileError
      if (!profile?.family_id) return

      // Get children in the family
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name, age, grade')
        .eq('family_id', profile.family_id)
      
      if (childrenError) throw childrenError
      setChildren(childrenData || [])

      // Get today's date
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD format

      // Fetch today's actual calendar events
      const todaysEvents = await fetchTodaysCalendarEvents(profile.family_id, todayStr, childrenData)

      // Group events by child
      const learningByChild = childrenData?.map(child => {
        const childEvents = todaysEvents.filter(event => 
          event.child_name && JSON.parse(event.child_name).includes(child.first_name)
        )
        return {
          child,
          events: childEvents
        }
      }).filter(item => item.events.length > 0)

      setTodaysLearning(learningByChild || [])
    } catch (error) {
      console.error('Error fetching today\'s learning:', error)
    } finally {
      setLoadingLearning(false)
    }
  }

  const fetchTodaysCalendarEvents = async (familyId, todayStr, childrenData) => {
    const events = []

    try {
      // Fetch today's activity instances (lessons and activities)
      const { data: activityInstances, error: aiError } = await supabase
        .from('activity_instances')
        .select(`
          *,
          activities:activity_id(name, description, minutes)
        `)
        .eq('family_id', familyId)
        .eq('scheduled_date', todayStr)
        .order('scheduled_time', { ascending: true })

      if (!aiError && activityInstances) {
        activityInstances.forEach(instance => {
          events.push({
            ...instance,
            type: 'lesson',
            eventType: instance.activities?.name ? 'activity' : 'lesson'
          })
        })
      }

      // Fetch today's holidays
      const { data: holidays, error: holidayError } = await supabase
        .from('holidays')
        .select('*')
        .eq('family_id', familyId)
        .eq('holiday_date', todayStr)

      if (!holidayError && holidays) {
        holidays.forEach(holiday => {
          events.push({
            ...holiday,
            type: 'holiday',
            eventType: 'holiday',
            title: holiday.holiday_name,
            description: holiday.description
          })
        })
      }

    } catch (error) {
      console.error('Error fetching calendar events:', error)
    }

    return events
  }



  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      const { error } = await signOut()
      if (error) {
        Alert.alert('Error', 'Failed to sign out: ' + error.message)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out: ' + error.message)
    } finally {
      setSigningOut(false)
    }
  }

  if (isWeb) {
    return <WebLayout navigation={navigation} routeParams={route.params} />
  }

  // Render original mobile layout
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>You are successfully authenticated</Text>

        <View style={styles.userInfo}>
          <Text style={styles.userInfoTitle}>User Information:</Text>
          <Text style={styles.userInfoText}>Email: {user?.email}</Text>
          <Text style={styles.userInfoText}>ID: {user?.id}</Text>
          <Text style={styles.userInfoText}>
            Created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
          </Text>
        </View>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>What you can do:</Text>
          <View style={styles.featureItem}>
            <Text style={styles.featureText}>• Access protected content</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureText}>• Store user-specific data</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureText}>• Manage your profile</Text>
          </View>
        </View>



        {/* Today's Events Section */}
        <View style={styles.todaysLearningSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.todaysLearningTitle}>Today's Schedule</Text>
            <TouchableOpacity 
              style={styles.viewCalendarButton}
              onPress={() => navigation.navigate('WebLayout', { activeTab: 'calendar' })}
            >
              <Text style={styles.viewCalendarText}>View Calendar</Text>
            </TouchableOpacity>
          </View>
          {loadingLearning ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#38B6FF" />
              <Text style={styles.loadingText}>Loading today's events...</Text>
            </View>
          ) : todaysLearning.length > 0 ? (
            todaysLearning.map((item, index) => (
              <View key={index} style={styles.childLearningCard}>
                <View style={styles.childHeader}>
                  <Text style={styles.childName}>{item.child.first_name}</Text>
                  <Text style={styles.childGrade}>Grade {item.child.grade}</Text>
                </View>
                {item.events.map((event, eventIndex) => (
                  <TouchableOpacity 
                    key={eventIndex} 
                    style={[
                      styles.eventItem,
                      event.eventType === 'holiday' && styles.holidayEvent,
                      event.eventType === 'activity' && styles.activityEvent
                    ]}
                    onPress={() => navigation.navigate('WebLayout', { 
                      activeTab: 'calendar',
                      selectedEventId: event.id,
                      selectedDate: event.scheduled_date || event.holiday_date
                    })}
                  >
                    <View style={styles.eventHeader}>
                      <Text style={[
                        styles.eventTitle,
                        event.eventType === 'holiday' && styles.holidayTitle
                      ]}>
                        {event.title}
                      </Text>
                      <View style={[
                        styles.eventTypeBadge,
                        event.eventType === 'holiday' && styles.holidayBadge,
                        event.eventType === 'activity' && styles.activityBadge
                      ]}>
                        <Text style={styles.eventTypeText}>
                          {event.eventType === 'holiday' ? 'Holiday' : 
                           event.eventType === 'activity' ? 'Activity' : 'Lesson'}
                        </Text>
                      </View>
                    </View>
                    
                    {event.scheduled_time && (
                      <Text style={styles.eventTime}>
                        {String(event.scheduled_time).slice(0,5)}
                        {event.minutes && ` (${event.minutes} min)`}
                      </Text>
                    )}
                    
                    {event.description && (
                      <Text style={styles.eventDescription} numberOfLines={2}>
                        {event.description}
                      </Text>
                    )}
                    
                    {event.status && event.eventType !== 'holiday' && (
                      <View style={[
                        styles.statusBadge,
                        event.status === 'completed' && styles.completedStatus,
                        event.status === 'in_progress' && styles.inProgressStatus,
                        event.status === 'planned' && styles.plannedStatus
                      ]}>
                        <Text style={styles.statusText}>
                          {event.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))
          ) : (
            <View style={styles.noLearningContainer}>
              <Text style={styles.noLearningText}>No events scheduled for today</Text>
              <Text style={styles.noLearningSubtext}>Plan your day by adding lessons, activities, or days off</Text>
              
              <View style={styles.addButtonsContainer}>
                <TouchableOpacity 
                  style={[styles.addButton, styles.addLessonButton]}
                  onPress={() => navigation.navigate('WebLayout', { 
                    activeTab: 'calendar', 
                    showNewEventForm: true,
                    defaultEventType: 'lesson'
                  })}
                >
                  <Text style={styles.addButtonText}>Add Lesson</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.addButton, styles.addActivityButton]}
                  onPress={() => navigation.navigate('WebLayout', { 
                    activeTab: 'calendar', 
                    showNewEventForm: true,
                    defaultEventType: 'activity'
                  })}
                >
                  <Text style={styles.addButtonText}>Add Activity</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.addButton, styles.addHolidayButton]}
                  onPress={() => navigation.navigate('WebLayout', { 
                    activeTab: 'calendar', 
                    showNewEventForm: true,
                    defaultEventType: 'holiday'
                  })}
                >
                  <Text style={styles.addButtonText}>Add Day Off</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]} 
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 40,
  },
  userInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 5px 10px rgba(0, 0, 0, 0.2)',
  },
  userInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 10,
  },
  userInfoText: {
    fontSize: 14,
    color: '#4a5568',
    marginBottom: 5,
  },
  features: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
    boxShadow: '0 5px 10px rgba(0, 0, 0, 0.2)',
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 15,
  },
  featureItem: {
    marginBottom: 8,
  },
  featureText: {
    fontSize: 16,
    color: '#4a5568',
  },
  signOutButton: {
    backgroundColor: '#e53e3e',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    boxShadow: '0 3px 5px rgba(0, 0, 0, 0.2)',
  },
  signOutButtonDisabled: {
    backgroundColor: '#a0aec0',
  },
  signOutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Today's Learning Styles
  todaysLearningSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 5px 10px rgba(0, 0, 0, 0.2)',
  },
  todaysLearningTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 15,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  childLearningCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#38B6FF',
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  childGrade: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trackItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  trackName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: 4,
  },
  trackSchedule: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  roadmapPreview: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  roadmapLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  roadmapContent: {
    fontSize: 12,
    color: '#38B6FF',
    fontStyle: 'italic',
  },
  noLearningContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noLearningText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  noLearningSubtext: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  // New styles for improved event display
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  viewCalendarButton: {
    backgroundColor: '#38B6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  viewCalendarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  eventItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  holidayEvent: {
    borderLeftColor: '#f59e0b',
    borderLeftWidth: 4,
    backgroundColor: '#fffbeb',
  },
  activityEvent: {
    borderLeftColor: '#10b981',
    borderLeftWidth: 4,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    flex: 1,
    marginRight: 8,
  },
  holidayTitle: {
    color: '#92400e',
  },
  eventTypeBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  holidayBadge: {
    backgroundColor: '#fbbf24',
  },
  activityBadge: {
    backgroundColor: '#a7f3d0',
  },
  eventTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4a5568',
    textTransform: 'uppercase',
  },
  eventTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  eventDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  completedStatus: {
    backgroundColor: '#d1fae5',
  },
  inProgressStatus: {
    backgroundColor: '#fef3c7',
  },
  plannedStatus: {
    backgroundColor: '#e0e7ff',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  addEventButton: {
    backgroundColor: '#38B6FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 10,
  },
  addEventText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // New styles for multiple add buttons
  addButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 15,
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  addLessonButton: {
    backgroundColor: '#38B6FF',
  },
  addActivityButton: {
    backgroundColor: '#10b981',
  },
  addHolidayButton: {
    backgroundColor: '#f59e0b',
  },
  addButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
}) 
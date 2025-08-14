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
        .select('id, name, age, grade')
        .eq('family_id', profile.family_id)
      
      if (childrenError) throw childrenError
      setChildren(childrenData || [])

      // Get today's date and day of week
      const today = new Date()
      const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, etc.
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const todayName = dayNames[dayOfWeek]

      // Get learning tracks for today
      const { data: tracks, error: tracksError } = await supabase
        .from('subject_track')
        .select('id, name, class_schedule, study_days, roadmap, course_outline, status')
        .eq('family_id', profile.family_id)
        .eq('status', 'active')
      
      if (tracksError) throw tracksError

      // Filter tracks that are active today
      const todaysTracks = tracks?.filter(track => {
        if (!track.study_days) return false
        return track.study_days.includes(todayName)
      }) || []

      // Group tracks by child
      const learningByChild = childrenData?.map(child => {
        const childTracks = todaysTracks.filter(track => 
          track.name.includes(child.name)
        )
        return {
          child,
          tracks: childTracks
        }
      }).filter(item => item.tracks.length > 0)

      setTodaysLearning(learningByChild || [])
    } catch (error) {
      console.error('Error fetching today\'s learning:', error)
    } finally {
      setLoadingLearning(false)
    }
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

        {/* Today's Learning Section */}
        <View style={styles.todaysLearningSection}>
          <Text style={styles.todaysLearningTitle}>Today's Learning</Text>
          {loadingLearning ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#38B6FF" />
              <Text style={styles.loadingText}>Loading today's schedule...</Text>
            </View>
          ) : todaysLearning.length > 0 ? (
            todaysLearning.map((item, index) => (
              <View key={index} style={styles.childLearningCard}>
                <View style={styles.childHeader}>
                  <Text style={styles.childName}>{item.child.name}</Text>
                  <Text style={styles.childGrade}>Grade {item.child.grade}</Text>
                </View>
                {item.tracks.map((track, trackIndex) => (
                  <View key={trackIndex} style={styles.trackItem}>
                    <Text style={styles.trackName}>{track.name}</Text>
                    <Text style={styles.trackSchedule}>{track.class_schedule}</Text>
                    {track.roadmap && (
                      <View style={styles.roadmapPreview}>
                        <Text style={styles.roadmapLabel}>Current Unit:</Text>
                        <Text style={styles.roadmapContent}>
                          {typeof track.roadmap === 'string' 
                            ? track.roadmap 
                            : track.roadmap.units?.[0]?.name || 'Unit in progress'
                          }
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))
          ) : (
            <View style={styles.noLearningContainer}>
              <Text style={styles.noLearningText}>No learning activities scheduled for today</Text>
              <Text style={styles.noLearningSubtext}>Check the calendar for upcoming lessons</Text>
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
}) 
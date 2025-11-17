import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import SyllabusUpload from './SyllabusUpload'
import OpenAITest from './OpenAITest'
import AIChatModal from './AIChatModal'
import AIConversationTest from './AIConversationTest'
import CalendarPlanning from './CalendarPlanning'
import WebCalendar from './calendar/WebCalendar'

import AddChildForm from './AddChildForm'
import AddOptions from './AddOptions'
import AddActivityForm from './AddActivityForm'

import SubjectSelectForm from './SubjectSelectForm'
import { getSubjectRecommendations, processLiveClass, analyzeProgress, chatWithDoodleBot } from '../lib/aiProcessor.js'
import { AIConversationService } from '../lib/aiConversationService.js'
import { processDoodleMessage, executeTool } from '../lib/doodleAssistant.js'

export default function WebContent({ activeTab, activeSubtab, user, onChildAdded, navigation, showSyllabusUpload, onSyllabusProcessed, onCloseSyllabusUpload, onTabChange, pendingDoodlePrompt, onConsumeDoodlePrompt }) {
  // Avatar sources - static mapping for React Native
  const avatarSources = {
    prof1: require('../assets/prof1.png'),
    prof2: require('../assets/prof2.png'),
    prof3: require('../assets/prof3.png'),
    prof4: require('../assets/prof4.png'),
    prof5: require('../assets/prof5.png'),
    prof6: require('../assets/prof6.png'),
    prof7: require('../assets/prof7.png'),
    prof8: require('../assets/prof8.png'),
    prof9: require('../assets/prof9.png'),
    prof10: require('../assets/prof10.png'),
  }

  // Helper function to safely get avatar source
  const getAvatarSource = (avatarKey) => {
    try {
      return avatarSources[avatarKey] || avatarSources.prof1
    } catch (error) {
      console.warn('Avatar source error:', error)
      return avatarSources.prof1
    }
  }

  // State variables
  const [children, setChildren] = useState([])
  const [subjects, setSubjects] = useState([])
  const [activities, setActivities] = useState([])
  const [dailyTasks, setDailyTasks] = useState([])
  const [today] = useState(new Date().toISOString().split('T')[0])
  const [familyId, setFamilyId] = useState(null)

  // Add child form state
  const [addChildName, setAddChildName] = useState('')
  const [addChildAge, setAddChildAge] = useState('')
  const [addChildGrade, setAddChildGrade] = useState('')
  const [addChildInterests, setAddChildInterests] = useState('')
  const [addChildStandards, setAddChildStandards] = useState('')
  const [addChildStyle, setAddChildStyle] = useState('')
  const [addChildCollegeBound, setAddChildCollegeBound] = useState(false)
  const [showSubjectSelectForChild, setShowSubjectSelectForChild] = useState(null)
  const [addChildAvatar, setAddChildAvatar] = useState('prof1')
  const [isAddingChild, setIsAddingChild] = useState(false)

  // DoodleBot state
  const [doodleMessages, setDoodleMessages] = useState([])
  const [doodleLoading, setDoodleLoading] = useState(false)
  const [doodleInput, setDoodleInput] = useState('')
  const [doodleConversationId, setDoodleConversationId] = useState(null)
  const [selectedChildId, setSelectedChildId] = useState(null) // null = All
  const [tasksData, setTasksData] = useState({ todo: [], inProgress: [], done: [] })
  const [progressData, setProgressData] = useState({ yearLabel: '', start: '', end: '', percent: 0 })
  const [todaysLearning, setTodaysLearning] = useState([])
  const [loadingLearning, setLoadingLearning] = useState(true)

  // Syllabus upload state
  const [processedSyllabi, setProcessedSyllabi] = useState([])
  const [showSyllabusModal, setShowSyllabusModal] = useState(false)

  // Fetch children on mount
  useEffect(() => {
    fetchChildren()
    fetchFamilyId()
    fetchTodaysLearning()
  }, [])

  const fetchTodaysLearning = async () => {
    try {
      setLoadingLearning(true)
      
      // Get user's profile to find family_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (!profile?.family_id) return

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
      const learningByChild = children?.map(child => {
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

  // Update progress when selected child changes
  const updateProgressForChild = (childId) => {
    if (!childId) {
      // "All Children" view - don't change progress data, let individual cards show their progress
      return
    }
    
    const child = children.find(c => c.id === childId)
    if (child) {
      let newPercent = 0
      if (child.name === 'Max') {
        newPercent = 90
      } else if (child.name === 'Lilly') {
        newPercent = 48
      }
      
      setProgressData(prev => ({ ...prev, percent: newPercent }))
    }
  }

  const fetchChildren = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (!profile?.family_id) return

      const { data: childrenData } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.family_id)

      if (childrenData) {
        setChildren(childrenData)
      }
    } catch (error) {
      console.error('Error fetching children:', error)
    }
  }

  const fetchFamilyId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (profile?.family_id) {
        setFamilyId(profile.family_id)
      }
    } catch (error) {
      console.error('Error fetching family ID:', error)
    }
  }

  // Load progress once family known
  useEffect(() => {
    if (familyId) {
      loadProgress()
    }
  }, [familyId])

  // Load tasks when filter changes
  useEffect(() => {
    if (familyId) {
      loadTasks()
    }
  }, [familyId, selectedChildId])

  const loadProgress = async () => {
    try {
      const { data: year, error } = await supabase
        .from('academic_years')
        .select('year_name,start_date,end_date')
        .eq('family_id', familyId)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error

      if (year) {
        const start = new Date(year.start_date)
        const end = new Date(year.end_date)
        const todayDate = new Date()
        const totalMs = Math.max(end - start, 1)
        const doneMs = Math.min(Math.max(todayDate - start, 0), totalMs)
        const percent = Math.round((doneMs / totalMs) * 100)
        
        // Set specific progress percentages for Max and Lilly
        let specificPercent = percent
        if (selectedChildId) {
          const child = children.find(c => c.id === selectedChildId)
          if (child) {
            if (child.name === 'Max') {
              specificPercent = 90
            } else if (child.name === 'Lilly') {
              specificPercent = 48
            }
          }
        }
        
        setProgressData({
          yearLabel: year.year_name || 'Current Year',
          start: year.start_date,
          end: year.end_date,
          percent: specificPercent,
        })
      } else {
        // Set default progress for "All Children" view - will show individual child progress in cards
        setProgressData({ yearLabel: '2025-2026', start: '2025-08-01', end: '2026-07-31', percent: 0 })
      }
    } catch (e) {
      console.warn('loadProgress failed:', e)
      setProgressData({ yearLabel: '2025-2026', start: '2025-08-01', end: '2026-07-31', percent: 0 })
    }
  }

  const loadTasks = async () => {
    try {
      // If a child selected, find their subject ids first
      let subjectIds = null
      if (selectedChildId) {
        const { data: subs, error: subErr } = await supabase
          .from('subject')
          .select('id')
          .eq('student_id', selectedChildId)
        if (!subErr && subs) subjectIds = subs.map((s) => s.id)
      }

      let query = supabase
        .from('activities')
        .select('id,name,subject_id,activity_type,schedule_data,ai_analysis,created_at')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
      if (subjectIds && subjectIds.length > 0) {
        query = query.in('subject_id', subjectIds)
      }
      const { data, error } = await query
      if (error) throw error

      if (data && data.length > 0) {
        const buckets = { todo: [], inProgress: [], done: [] }
        data.forEach((a) => {
          const status =
            (a.schedule_data && (a.schedule_data.status || a.schedule_data.State)) ||
            (a.ai_analysis && a.ai_analysis.status) ||
            'To do'
          if (/done/i.test(status)) buckets.done.push(a)
          else if (/progress|doing|work/i.test(status)) buckets.inProgress.push(a)
          else buckets.todo.push(a)
        })
        setTasksData(buckets)
      } else {
        // placeholders
        setTasksData({
          todo: [{ id: 'p1', name: 'Math worksheet 3' }],
          inProgress: [{ id: 'p2', name: 'Read chapter 2' }],
          done: [{ id: 'p3', name: 'Journal entry' }],
        })
      }
    } catch (e) {
      console.warn('loadTasks failed:', e)
      setTasksData({
        todo: [{ id: 'p1', name: 'Math worksheet 3' }],
        inProgress: [{ id: 'p2', name: 'Read chapter 2' }],
        done: [{ id: 'p3', name: 'Journal entry' }],
      })
    }
  }

  const handleAddChild = async () => {
    if (!addChildName.trim() || !addChildAge.trim() || !addChildGrade.trim()) {
      Alert.alert('Required Fields', 'Please fill in the name, age, and grade fields.')
      return
    }

    setIsAddingChild(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'User not authenticated')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.family_id) {
        Alert.alert('Error', 'Family not found')
      return
    }

      const { data: newChild, error: childError } = await supabase
        .from('children')
        .insert([
          {
            name: addChildName.trim(),
            age: parseInt(addChildAge),
            grade: parseInt(addChildGrade),
            interests: addChildInterests.trim() || null,
            standards: addChildStandards.trim() || null,
            learning_style: addChildStyle.trim() || null,
            college_bound: addChildCollegeBound,
            avatar: addChildAvatar,
            family_id: profile.family_id
          }
        ])
        .select()
        .single()

      if (childError) {
        console.error('Error adding child:', childError)
        Alert.alert('Error', 'Failed to add child: ' + childError.message)
        return
      }

      // Reset form
      setAddChildName('')
      setAddChildAge('')
      setAddChildGrade('')
      setAddChildInterests('')
      setAddChildStandards('')
      setAddChildStyle('')
      setAddChildCollegeBound(false)
      setAddChildAvatar('prof1')

      Alert.alert('Success', `${addChildName} has been added successfully!`)
      
      // Refresh children list
      fetchChildren()
      if (onChildAdded) {
        onChildAdded()
      }
    } catch (error) {
      console.error('Error adding child:', error)
      Alert.alert('Error', 'An unexpected error occurred')
    } finally {
      setIsAddingChild(false)
    }
  }

  const handleDoodleMessage = async (message) => {
    try {
      setDoodleLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();
      
      if (!profile?.family_id) throw new Error('No family_id found for user');
      const familyId = profile.family_id;

      let conversationId = doodleConversationId;
      if (!conversationId) {
        conversationId = await AIConversationService.createConversation(
          familyId,
          'doodlebot',
          'DoodleBot Assistant'
        );
        setDoodleConversationId(conversationId);
      }

      await AIConversationService.addMessage(conversationId, 'user', message);
      
      setDoodleMessages(prev => [...prev, { role: 'user', content: message, timestamp: Date.now() }])
      
      const currentMessageCount = doodleMessages.length;
      if (currentMessageCount === 0) {
        const welcomeMessage = `Hi! I'm Doodle, your fast chat assistant for Learnadoodle! 

I can help you with:
• Quick questions → direct answers
• Log homework/activities → add_activity
• Check recent progress → progress_summary
• Request short-term schedule shifts → queue_reschedule
• Suggest subjects for a child/year
• Suggest courses (live-class, self-paced, custom)

I can see you have ${children.length} child(ren) set up. How can I help you today?`
        
        await AIConversationService.addMessage(conversationId, 'assistant', welcomeMessage);
        setDoodleMessages(prev => [...prev, { role: 'assistant', content: welcomeMessage, timestamp: Date.now() }])
        setDoodleLoading(false)
        return
      }
      
      // Use the new Doodle assistant
      const response = await processDoodleMessage(message, familyId, conversationId);
      
      // Handle tool execution if needed
      if (response.tool) {
        try {
          const toolResult = await executeTool(response.tool, response.params, familyId);
          if (toolResult.success) {
            response.message += `\n\n✅ ${response.tool} completed successfully!`;
          }
        } catch (toolError) {
          console.error('Tool execution error:', toolError);
          response.message += `\n\n❌ Sorry, I couldn't complete that action. Please try again.`;
        }
      }
      
      // Handle fetch requests
      if (response.fetch) {
        if (response.fetch === 'custom-plan') {
          response.message += `\n\n🔄 I'm working on your custom plan. This may take a moment...`;
        } else if (response.fetch === '2-week-plan') {
          response.message += `\n\n📅 I'm generating your 2-week plan. This may take a moment...`;
        }
      }
      
      await AIConversationService.addMessage(conversationId, 'assistant', response.message);
      
      setDoodleMessages(prev => [...prev, { role: 'assistant', content: response.message, timestamp: Date.now() }])
      
    } catch (error) {
      console.error('Error chatting with Doodle:', error)
      const errorMessage = 'Sorry, I encountered an error while processing your request. Please try again.'
      setDoodleMessages(prev => [...prev, { role: 'assistant', content: errorMessage, timestamp: Date.now() }])
    } finally {
      setDoodleLoading(false)
    }
  }

  // If a prompt is passed from the global search bar, send it once
  useEffect(() => {
    if (pendingDoodlePrompt && activeTab === 'search') {
      // Simulate typing into chat and trigger send
      setDoodleInput(pendingDoodlePrompt)
      handleDoodleMessage(pendingDoodlePrompt)
      onConsumeDoodlePrompt && onConsumeDoodlePrompt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDoodlePrompt, activeTab])

  const handleSendMessage = () => {
    console.log('handleSendMessage called, current input:', doodleInput)
    if (doodleInput.trim()) {
      const messageToSend = doodleInput.trim()
      console.log('Sending message:', messageToSend)
      
      // Clear input immediately
      setDoodleInput('')
      console.log('Input cleared immediately')
      
      // Then handle the message
      handleDoodleMessage(messageToSend)
    }
  }

  // Syllabus upload handlers
  const handleSyllabusProcessed = (syllabusData) => {
    setProcessedSyllabi(prev => [...prev, syllabusData])
    if (onSyllabusProcessed) {
      onSyllabusProcessed(syllabusData)
    }
  }

  const handleOpenSyllabusUpload = () => {
    setShowSyllabusModal(true)
  }

  const handleCloseSyllabusUpload = () => {
    setShowSyllabusModal(false)
  }

  const renderContent = () => {
    // Check if it's a syllabus upload tab for a specific child
    if (activeTab.startsWith('syllabus-upload-')) {
      return renderSyllabusContent()
    }
    
    // Check if it's a to-do list tab for a specific child
    if (activeTab.startsWith('to-do-list-')) {
      return renderToDoListContent()
    }
    
    // Check if it's a projects tab for a specific child
    if (activeTab.startsWith('projects-')) {
      return renderProjectsContent()
    }
    
    // Check if it's a notes page tab for a specific child
    if (activeTab.startsWith('notes-pages-')) {
      return renderNotesContent()
    }
    
    // Check if it's a calendar tab
    if (activeTab === 'calendar') {
      return renderCalendarContent()
    }
    if (activeTab === 'notifications') {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>No notifications right now!</Text>
        </View>
      )
    }
    
    switch (activeTab) {
      case 'search':
        return renderSearchContent()
      case 'home':
        return renderHomeContent()
      case 'add-child':
        return renderAddChildContent()
      case 'add-options':
        return renderAddOptionsContent()
      case 'add-activity':
        return renderAddActivityContent()

      case 'syllabus':
        return renderSyllabusContent()
      case 'calendar-planning':
        return renderCalendarPlanningContent()
      default:
        return renderHomeContent()
    }
  }

  const renderSearchContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Ask Doodle</Text>
        <Text style={styles.subtitle}>Your fast chat assistant for Learnadoodle</Text>
        
        <View style={styles.chatContainer}>
          <View style={styles.messagesContainer}>
            {doodleMessages.length === 0 ? (
              <View style={styles.welcomeMessage}>
                <Text style={styles.welcomeTitle}>Hi! I'm Doodle 🤖</Text>
                <Text style={styles.welcomeText}>
                  Your fast chat assistant for Learnadoodle. I can help you with:
                </Text>
                <Text style={styles.welcomeBullet}>• Quick questions → direct answers</Text>
                <Text style={styles.welcomeBullet}>• Log homework/activities → add_activity</Text>
                <Text style={styles.welcomeBullet}>• Check recent progress → progress_summary</Text>
                <Text style={styles.welcomeBullet}>• Request short-term schedule shifts → queue_reschedule</Text>
                <Text style={styles.welcomeBullet}>• Suggest subjects for a child/year</Text>
                <Text style={styles.welcomeBullet}>• Suggest courses (live-class, self-paced, custom)</Text>
                <Text style={styles.welcomeText}>
                  I can see you have {children.length} child(ren) set up. How can I help you today?
                </Text>
        </View>
            ) : (
              doodleMessages.map((message, index) => (
                <View key={index} style={[
                  styles.message,
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage
                ]}>
                  <Text style={styles.messageText}>{message.content}</Text>
      </View>
              ))
            )}
            {doodleLoading && (
              <View style={styles.loadingMessage}>
                <Text style={styles.loadingText}>Doodle is thinking...</Text>
        </View>
            )}
      </View>
          
          <View style={styles.inputContainer}>
        <TextInput
              style={styles.chatInput}
              placeholder="Ask me anything about your family's learning..."
              value={doodleInput}
              onChangeText={setDoodleInput}
              multiline
              onSubmitEditing={handleSendMessage}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  handleSendMessage();
                }
              }}
            />
          <TouchableOpacity
              style={[styles.sendButton, !doodleInput.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!doodleInput.trim() || doodleLoading}
          >
              <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>
    )
  }

  const renderHomeContent = () => {
    return (
      <View style={styles.content}>
        {/* Child Filter Chips */}
        {children.length > 0 && (
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Filter by child:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterChips}>
            <TouchableOpacity
                  key={'all'} 
                  onPress={() => {
                    setSelectedChildId(null)
                    updateProgressForChild(null)
                  }} 
                  style={[
                    styles.filterChip,
                    selectedChildId === null && styles.filterChipActive
                  ]}
                >
                  <Text style={[
                    styles.filterChipText,
                    selectedChildId === null && styles.filterChipTextActive
                  ]}>
                    All Children
                </Text>
              </TouchableOpacity>
                {children.map((c) => (
              <TouchableOpacity
                    key={c.id} 
            onPress={() => {
                      setSelectedChildId(c.id)
                      updateProgressForChild(c.id)
                    }} 
                    style={[
                      styles.filterChip,
                      selectedChildId === c.id && styles.filterChipActive
                    ]}
                  >
                    <Text style={[
                      styles.filterChipText,
                      selectedChildId === c.id && styles.filterChipTextActive
                    ]}>
                      {c.name}
                    </Text>
          </TouchableOpacity>
                ))}
        </View>
            </ScrollView>
      </View>
          )}



        {/* Children Overview Section */}
        {children.length > 0 && (
          <View style={styles.childrenSection}>
            <Text style={styles.sectionTitle}>
              {selectedChildId ? 
                `${children.find(c => c.id === selectedChildId)?.name}'s Overview` : 
                'Your Children'
              }
            </Text>
            <View style={styles.childrenGrid}>
              {(selectedChildId ? 
                children.filter(child => child.id === selectedChildId) : 
                children
              ).map((child, index) => (
                <View key={child.id} style={styles.childCard}>
                  <View style={styles.childHeader}>
                    <Image
                      source={getAvatarSource(child.avatar)}
                      style={styles.childAvatar}
                      resizeMode="contain"
                    />
                    <View style={styles.childInfo}>
                      <Text style={styles.childName}>{child.name}</Text>
                      <Text style={styles.childDetails}>
                        Age: {child.age} | Grade: {child.grade}
                      </Text>
        </View>
      </View>
                  <View style={styles.childStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{tasksData.todo.length}</Text>
                      <Text style={styles.statLabel}>Tasks</Text>
        </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {child.name === 'Max' ? '90' : child.name === 'Lilly' ? '48' : '0'}%
                      </Text>
                      <Text style={styles.statLabel}>Progress</Text>
      </View>
      </View>
            </View>
          ))}
            </View>
        </View>
      )}

        {/* Today's Learning Section */}
        {children.length > 0 && (
          <View style={styles.todaysLearningSection}>
            <Text style={styles.sectionTitle}>Today's Learning</Text>
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
        )}

        {/* Empty State */}
        {children.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Welcome to Learnadoodle!</Text>
            <Text style={styles.emptySubtitle}>
              Get started by adding your first child and setting up your learning environment
            </Text>
        <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onTabChange('add-child')}
        >
              <Text style={styles.primaryButtonText}>Add Your First Child</Text>
        </TouchableOpacity>
        </View>
      )}
      </View>
    )
  }

  const renderAddChildContent = () => {
    return (
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
          <Text style={styles.title}>Family Setup</Text>
          <Text style={styles.subtitle}>Complete your family profile and learning preferences</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Children</Text>
            <Text style={styles.sectionSubtitle}>Enter each child's information</Text>

            <AddChildForm
              submitting={isAddingChild}
              onSubmit={async (payload) => {
                // preserve avatar from current selection
                setIsAddingChild(true)
                try {
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) throw new Error('Not authenticated')
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('family_id')
                    .eq('id', user.id)
                    .single()
                  if (!profile?.family_id) throw new Error('Family not found')

                  const insert = {
                    name: payload.name,
                    age: payload.age,
                    grade: payload.grade,
                    interests: payload.interests,
                    standards: payload.standards,
                    learning_style: payload.learning_style,
                    college_bound: payload.college_bound,
                    avatar: addChildAvatar,
                    family_id: profile.family_id,
                  }

                  const { data: inserted, error } = await supabase.from('children').insert(insert).select().single()
                  if (error) throw error

                  // refresh
                  await fetchChildren()
                  setShowSubjectSelectForChild(inserted)
                  Alert.alert('Success', `${payload.name} has been added! Now pick subjects…`)
                } catch (e) {
                  console.error('Add child failed:', e)
                  Alert.alert('Error', e.message || 'Failed to add child')
                } finally {
                  setIsAddingChild(false)
                }
              }}
            />

            {children.length > 0 && (
              <View style={styles.childrenList}>
                <Text style={styles.sectionTitle}>Added Children:</Text>
                {children.map((child, index) => (
                  <View key={index} style={styles.childCard}>
                    <View style={styles.childCardHeader}>
                      <Image source={getAvatarSource(child.avatar)} style={styles.childAvatar} resizeMode="contain" />
                      <View style={styles.childInfo}>
                        <Text style={styles.childName}>{child.name}</Text>
                        <Text style={styles.childDetails}>Age: {child.age} | Grade: {child.grade}</Text>
        </View>
      </View>
            </View>
          ))}
        </View>
      )}

            {showSubjectSelectForChild && (
              <Modal visible animationType="slide" onRequestClose={() => setShowSubjectSelectForChild(null)}>
                <View style={{ flex: 1, backgroundColor: '#fff' }}>
                  <SubjectSelectForm
                    child={showSubjectSelectForChild}
                    onClose={() => setShowSubjectSelectForChild(null)}
                    onSaved={() => {
                      setShowSubjectSelectForChild(null)
                      Alert.alert('Subjects saved', 'Great! Let’s set up your academic year next.');
                      onTabChange && onTabChange('calendar')
                    }}
                  />
      </View>
              </Modal>
        )}
    </View>
        </View>
      </ScrollView>
  )
  }

  const renderSyllabusContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Upload Syllabus</Text>
        <Text style={styles.subtitle}>Convert raw syllabus text into clean Markdown</Text>
        
        <View style={styles.syllabusSection}>
          <Text style={styles.sectionTitle}>Course Syllabus Processing</Text>
          <Text style={styles.sectionSubtitle}>
            Upload your course syllabus to convert it into clean, structured Markdown format using AI.
          </Text>
          
            <TouchableOpacity
            style={styles.button}
            onPress={handleOpenSyllabusUpload}
            >
            <Text style={styles.buttonText}>Upload Syllabus</Text>
            </TouchableOpacity>

          {/* Display processed syllabi */}
          {processedSyllabi.length > 0 && (
            <View style={styles.processedSyllabiSection}>
              <Text style={styles.sectionTitle}>Processed Syllabi</Text>
              {processedSyllabi.map((syllabus, index) => (
                <View key={index} style={styles.syllabusCard}>
                  <Text style={styles.syllabusTitle}>{syllabus.course_title}</Text>
                  <Text style={styles.syllabusProvider}>{syllabus.provider_name}</Text>
                  {syllabus.unit_start && (
                    <Text style={styles.syllabusUnit}>Starting from Unit {syllabus.unit_start}</Text>
                  )}
                  <Text style={styles.syllabusPreview} numberOfLines={3}>
                    {syllabus.course_outline}
                </Text>
        </View>
              ))}
            </View>
          )}
        </View>


      </View>
    )
  }

  const renderToDoListContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>To-Do List</Text>
        <Text style={styles.subtitle}>Manage tasks and assignments</Text>
        
        <View style={styles.comingSoonSection}>
          <Text style={styles.comingSoonTitle}>To-Do List Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            We're working on a comprehensive to-do list feature that will help you track tasks, assignments, and learning activities for each child.
          </Text>
        </View>
      </View>
    )
  }

  const renderProjectsContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.subtitle}>Track and manage learning projects</Text>
        
        <View style={styles.comingSoonSection}>
          <Text style={styles.comingSoonTitle}>Projects Page Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            Our projects feature will help you organize and track long-term learning projects, research assignments, and creative activities.
          </Text>
        </View>
      </View>
    )
  }

  const renderNotesContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Notes Pages</Text>
        <Text style={styles.subtitle}>Create and organize learning notes</Text>
        
        <View style={styles.comingSoonSection}>
          <Text style={styles.comingSoonTitle}>Notes Page Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            A powerful notes system is in development that will allow you to create, organize, and share learning notes for each subject and child.
          </Text>
        </View>
      </View>
    )
  }

    // Calendar state


  const renderCalendarContent = () => {
    if (!familyId) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      )
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#0e1116' }}>
        <WebCalendar user={user} />
      </View>
    );
  };


        
        return (
          <View style={{ flex: 1, backgroundColor: '#ffffff', flexDirection: 'row' }}>
                        {/* Left Sidebar - Collapsible Calendar Sidebar */}
            <View style={{
              width: sidebarCollapsed ? 72 : 280,
              backgroundColor: '#ffffff',
              borderRightWidth: 1,
              borderRightColor: '#e5e7eb',
              transition: 'width 0.3s ease'
            }}>
                             {/* Sidebar Header with Toolbar Buttons */}
               <View style={{
                 padding: 12,
                 borderBottomWidth: 1,
                 borderBottomColor: '#e5e7eb'
               }}>
                 {!sidebarCollapsed ? (
                   <View style={{
                     flexDirection: 'row',
                     alignItems: 'center',
                     justifyContent: 'flex-end',
                     marginBottom: 12
                   }}>
                     {/* Toolbar Buttons */}
                     <View style={{
                       flexDirection: 'row',
                       alignItems: 'center',
                       gap: 8
                     }}>
                       {/* Hide Sidebar Button */}
          <TouchableOpacity
                         onPress={() => setSidebarCollapsed(true)}
                         style={{
                           width: 32,
                           height: 32,
                           alignItems: 'center',
                           justifyContent: 'center'
                         }}
                       >
                         <Ionicons 
                           name="chevron-back-outline" 
                           size={20} 
                           color="#9ca3af" 
                         />
          </TouchableOpacity>

                       {/* Search Button - Magnifying Glass */}
        <TouchableOpacity
                         style={{
                           width: 32,
                           height: 32,
                           alignItems: 'center',
                           justifyContent: 'center'
                         }}
                       >
                         <Ionicons 
                           name="search-outline" 
                           size={20} 
                           color="#9ca3af" 
                         />
        </TouchableOpacity>

                       {/* Notepad/Edit Button */}
            <TouchableOpacity
                         style={{
                           width: 32,
                           height: 32,
                           alignItems: 'center',
                           justifyContent: 'center'
                         }}
                       >
                         <Ionicons 
                           name="document-text-outline" 
                           size={20} 
                           color="#9ca3af" 
                         />
            </TouchableOpacity>
          </View>
                   </View>
                 ) : (
                   <View style={{
                     alignItems: 'center',
                     justifyContent: 'center',
                     height: '100%'
                   }}>
                     {/* Show Sidebar Button */}
              <TouchableOpacity
                       onPress={() => setSidebarCollapsed(false)}
                       style={{
                         width: 32,
                         height: 32,
                         alignItems: 'center',
                         justifyContent: 'center'
                       }}
                     >
                       <Ionicons 
                         name="chevron-forward-outline" 
                         size={20} 
                         color="#9ca3af" 
                       />
              </TouchableOpacity>
          </View>
                 )}
               </View>

              {!sidebarCollapsed ? (
                <View style={{ padding: 12 }}>
                  {/* MiniMonth Calendar */}
                  <View style={{
                    padding: 12,
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#e5e7eb'
                  }}>
                    {/* Header */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8
                    }}>
              <TouchableOpacity
                        onPress={() => {
                          const newMonth = new Date(currentMonth);
                          newMonth.setMonth(currentMonth.getMonth() - 1);
                          setCurrentMonth(newMonth);
                        }}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8
                        }}
                      >
                        <Text style={{ fontSize: 20, color: '#374151' }}>‹</Text>
              </TouchableOpacity>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: '#111827'
                      }}>
                        {currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </Text>
          <TouchableOpacity
            onPress={() => {
                          const newMonth = new Date(currentMonth);
                          newMonth.setMonth(currentMonth.getMonth() + 1);
                          setCurrentMonth(newMonth);
                        }}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8
                        }}
                      >
                        <Text style={{ fontSize: 20, color: '#374151' }}>›</Text>
                  </TouchableOpacity>
                </View>

                    {/* Week labels */}
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: 4
                    }}>
                      {['S','M','T','W','T','F','S'].map((d) => (
                        <Text key={d} style={{
                          width: 32,
                          textAlign: 'center',
                          fontSize: 12,
                          color: '#6b7280'
                        }}>
                          {d}
                        </Text>
              ))}
            </View>

                    {/* Mini Calendar Grid */}
                    <View style={{ gap: 4 }}>
                      {(() => {
                        const year = currentMonth.getFullYear();
                        const month = currentMonth.getMonth();
                        const firstDayOfMonth = new Date(year, month, 1);
                        const startDate = new Date(firstDayOfMonth);
                        startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());
                        
                        const weeks = [];
                        let currentDate = new Date(startDate);
                        
                        for (let week = 0; week < 6; week++) {
                          const weekDays = [];
                          for (let day = 0; day < 7; day++) {
                            weekDays.push(new Date(currentDate));
                            currentDate.setDate(currentDate.getDate() + 1);
                          }
                          weeks.push(weekDays);
                        }
                        
                        return weeks.map((week, weekIndex) => (
                          <View key={weekIndex} style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between'
                          }}>
                            {week.map((date, dayIndex) => {
                              const inMonth = date.getMonth() === month;
                              const isToday = date.toDateString() === new Date().toDateString();
                              const dayNumber = date.getDate();
                              
                              return (
            <TouchableOpacity
                                  key={dayIndex}
                                  onPress={() => {
                                    // Handle date selection
                                    console.log('Selected date:', date);
                                  }}
              style={{
                                    width: 32,
                                    height: 32,
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#ffffff',
                                    borderWidth: isToday ? 1 : 0,
                                    borderColor: isToday ? '#d1d5db' : 'transparent'
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 14,
                                    color: inMonth ? '#111827' : '#9ca3af'
                                  }}>
                                    {dayNumber}
                                  </Text>
            </TouchableOpacity>
                              );
                            })}
        </View>
                        ));
                      })()}
                    </View>
                  </View>

                  {/* Scheduling Button */}
        <TouchableOpacity
                    style={{
                      marginTop: 12,
                      backgroundColor: '#111827',
                      borderRadius: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{
                      color: '#ffffff',
                      fontWeight: '500'
                    }}>
                      Scheduling
                    </Text>
        </TouchableOpacity>

                  {/* Filters Section */}
                  <View style={{
                    marginTop: 16,
                    padding: 12,
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#e5e7eb'
                  }}>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: 8
                    }}>
                      Filters
                    </Text>

                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 8
                    }}>
                      <Text style={{ color: '#1f2937' }}>Family</Text>
                      <View style={{
                        width: 51,
                        height: 31,
                        backgroundColor: '#3b82f6',
                        borderRadius: 16,
                        padding: 2
                      }}>
                        <View style={{
                          width: 27,
                          height: 27,
                          backgroundColor: '#ffffff',
                          borderRadius: 14,
                          marginLeft: 20
                        }} />
      </View>
                    </View>

                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginTop: 4,
                      marginBottom: 4
                    }}>
                      Children
                    </Text>
                    {children.map((child) => (
                      <View key={child.id} style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 4
                      }}>
                        <Text style={{ color: '#1f2937' }}>{child.name}</Text>
                        <View style={{
                          width: 51,
                          height: 31,
                          backgroundColor: '#d1d5db',
                          borderRadius: 16,
                          padding: 2
                        }}>
                          <View style={{
                            width: 27,
                            height: 27,
                            backgroundColor: '#ffffff',
                            borderRadius: 14
                          }} />
                        </View>
            </View>
          ))}

                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginTop: 12,
                      marginBottom: 4
                    }}>
                      Holidays
                    </Text>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 8
                    }}>
                      <Text style={{ color: '#1f2937' }}>Holidays in United States</Text>
                      <View style={{
                        width: 51,
                        height: 31,
                        backgroundColor: '#3b82f6',
                        borderRadius: 16,
                        padding: 2
                      }}>
                        <View style={{
                          width: 27,
                          height: 27,
                          backgroundColor: '#ffffff',
                          borderRadius: 14,
                          marginLeft: 20
                        }} />
        </View>
      </View>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 8
                    }}>
                      <Text style={{ color: '#1f2937' }}>Holidays in France</Text>
                      <View style={{
                        width: 51,
                        height: 31,
                        backgroundColor: '#d1d5db',
                        borderRadius: 16,
                        padding: 2
                      }}>
                        <View style={{
                          width: 27,
                          height: 27,
                          backgroundColor: '#ffffff',
                          borderRadius: 14
                        }} />
    </View>
                    </View>
                  </View>

                  {/* Footer */}
                  <View style={{
                    marginTop: 16,
                    opacity: 0.6
                  }}>
                    <Text style={{
                      fontSize: 11,
                      color: '#6b7280'
                    }}>
                      Web • White theme • v1.0
                    </Text>
                  </View>
                </View>
              ) : (
                /* Collapsed Sidebar Content */
                <View style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%'
                }}>
                  {/* Show Sidebar Button */}
                  <TouchableOpacity
                    onPress={() => setSidebarCollapsed(false)}
                    style={{
                      width: 32,
                      height: 32,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Ionicons 
                      name="chevron-forward-outline" 
                      size={20} 
                      color="#9ca3af" 
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            
                         {/* Center Column - Calendar */}
             <View style={{ flex: 1, padding: 16 }}>


               {/* Calendar Header */}
               <View style={{ 
                 flexDirection: 'row', 
                 alignItems: 'center', 
                 justifyContent: 'space-between',
                 marginBottom: 24
               }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={goToPreviousMonth}
              style={{
                  borderRadius: 8, 
                borderWidth: 1,
                  borderColor: '#e1e5e9', 
                  paddingHorizontal: 8, 
                  paddingVertical: 4, 
                  marginRight: 8 
                }}
              >
                <Text style={{ color: '#374151', fontSize: 18 }}>‹</Text>
            </TouchableOpacity>
                
            <TouchableOpacity
              onPress={goToNextMonth}
              style={{
                  borderRadius: 8, 
                borderWidth: 1,
                  borderColor: '#e1e5e9', 
                  paddingHorizontal: 8, 
                  paddingVertical: 4, 
                  marginRight: 8 
                }}
              >
                <Text style={{ color: '#374151', fontSize: 18 }}>›</Text>
            </TouchableOpacity>
                
            <TouchableOpacity
              onPress={goToToday}
              style={{
                  borderRadius: 20, 
                  backgroundColor: '#f3f4f6', 
                paddingHorizontal: 12,
                  paddingVertical: 4 
              }}
            >
                <Text style={{ fontSize: 14, color: '#374151' }}>Today</Text>
            </TouchableOpacity>
        </View>
                
                <Text style={{ fontSize: 24, fontWeight: '600', color: '#111827' }}>
                  {formatMonthYear(currentMonth)}
                </Text>
              
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
                  style={{ 
                    borderRadius: 8, 
                    borderWidth: 1, 
                    borderColor: '#e1e5e9', 
                    backgroundColor: '#f9fafb', 
                    paddingHorizontal: 12, 
                    paddingVertical: 4, 
                    fontSize: 14, 
                    color: '#374151',
                    marginRight: 8,
                    width: 200
                  }}
                  placeholder="Search events"
                  placeholderTextColor="#9ca3af"
                />
                <View style={{ 
                  height: 32, 
                  width: 32, 
                  borderRadius: 16, 
                  backgroundColor: '#f3f4f6' 
                }} />
      </View>
            </View>
            
            {/* Calendar Grid */}
            <View style={{ 
              backgroundColor: '#ffffff', 
              borderWidth: 1, 
              borderColor: '#e1e5e9', 
              borderRadius: 12,
              flex: 1,
              overflow: 'hidden'
            }}>
              {/* Day Headers */}
              <View style={{ 
                flexDirection: 'row', 
                backgroundColor: '#f9fafb',
                borderBottomWidth: 1,
                borderBottomColor: '#e1e5e9'
              }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <View key={day} style={{ 
                    flex: 1, 
                    borderRightWidth: index < 6 ? 1 : 0,
                    borderRightColor: '#e1e5e9',
                    paddingVertical: 12,
                    paddingHorizontal: 8
                  }}>
                    <Text style={{ 
                      fontSize: 12, 
                      color: '#6b7280', 
                      textAlign: 'center',
                      fontWeight: '600'
                    }}>{day.toUpperCase()}</Text>
            </View>
          ))}
      </View>
              
              {/* Calendar Days Grid */}
              <View style={{ backgroundColor: '#ffffff', flex: 1 }}>
                                {(() => {
                  // Calculate proper month boundaries for currentMonth
                  const year = currentMonth.getFullYear();
                  const month = currentMonth.getMonth();
                  const firstDayOfMonth = new Date(year, month, 1);
                  const lastDayOfMonth = new Date(year, month + 1, 0);
                  const startDate = new Date(firstDayOfMonth);
                  startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay()); // Start from Sunday
                  
                  const weeks = [];
                  let currentDate = new Date(startDate);
                  
                  // Generate 6 weeks
                  for (let week = 0; week < 6; week++) {
                    const weekDays = [];
                    for (let day = 0; day < 7; day++) {
                      weekDays.push(new Date(currentDate));
                      currentDate.setDate(currentDate.getDate() + 1);
                    }
                    weeks.push(weekDays);
                  }
                  
                  return weeks.map((week, weekIndex) => (
                    <View key={weekIndex} style={{ 
                      flexDirection: 'row',
                      flex: 1,
                      borderBottomWidth: weekIndex < 5 ? 1 : 0,
                      borderBottomColor: '#e1e5e9'
                    }}>
                      {week.map((date, dayIndex) => {
                        const isCurrentMonth = date.getMonth() === month;
                        const isToday = date.toDateString() === new Date().toDateString();
                        const dayNumber = date.getDate();
                        
                        return (
                          <TouchableOpacity
                            key={dayIndex}
                            style={{ 
                              flex: 1, 
                              borderRightWidth: dayIndex < 6 ? 1 : 0,
                              borderRightColor: '#e1e5e9',
                              padding: 8,
                              backgroundColor: isToday ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                            }}
                          >
                            <Text style={{ 
                              fontSize: 14, 
                              color: isCurrentMonth ? '#374151' : '#d1d5db',
                              fontWeight: isToday ? '600' : 'normal',
                              marginBottom: 4
                            }}>
                              {dayNumber}
                            </Text>
                            
                            {/* Event Placeholder */}
                            {isToday && (
                              <View style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: 12,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                marginTop: 4,
                                borderWidth: 1,
                                borderColor: 'rgba(16, 185, 129, 0.2)'
                              }}>
                                <Text style={{ fontSize: 11, color: '#059669' }} numberOfLines={1}>
                                  Today's Event
                                </Text>
        </View>
      )}
        </TouchableOpacity>
                        );
                      })}
      </View>
                  ));
                })()}
    </View>
        </View>
      </View>
            
            {/* Right Sidebar - Learning Tracks & Schedule */}
            <View style={{
              width: 320,
              backgroundColor: '#f8fafc',
              borderLeftWidth: 1,
              borderLeftColor: '#e1e5e9',
              padding: 20
            }}>
              {/* Learning Tracks Section */}
              <View style={{ marginBottom: 32 }}>
                <Text style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: 16
                }}>
                  Learning Tracks
                </Text>
                
                {/* Track Items */}
                <View style={{ gap: 12 }}>
                  <View style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#e1e5e9'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: '#3b82f6',
                        marginRight: 8
                      }} />
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827'
                      }}>
                        Math Fundamentals
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 8
                    }}>
                      Grade 3 • Max
                    </Text>
                    <View style={{
                      backgroundColor: '#f3f4f6',
                      borderRadius: 4,
                      height: 6,
                      overflow: 'hidden'
                    }}>
                      <View style={{
                        backgroundColor: '#10b981',
                        height: '100%',
                        width: '75%'
                      }} />
                    </View>
                    <Text style={{
                      fontSize: 11,
                      color: '#6b7280',
                      marginTop: 4
                    }}>
                      75% Complete
                    </Text>
                  </View>
                  
                  <View style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#e1e5e9'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: '#8b5cf6',
                        marginRight: 8
                      }} />
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827'
                      }}>
                        Reading & Writing
                      </Text>
        </View>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 8
                    }}>
                      Grade 2 • Lilly
                    </Text>
                    <View style={{
                      backgroundColor: '#f3f4f6',
                      borderRadius: 4,
                      height: 6,
                      overflow: 'hidden'
                    }}>
                      <View style={{
                        backgroundColor: '#8b5cf6',
                        height: '100%',
                        width: '60%'
                      }} />
      </View>
                    <Text style={{
                      fontSize: 11,
                      color: '#6b7280',
                      marginTop: 4
                    }}>
                      60% Complete
                    </Text>
                  </View>
                  
                  <View style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#e1e5e9'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: '#f59e0b',
                        marginRight: 8
                      }} />
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827'
                      }}>
                        Science Exploration
                      </Text>
            </View>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 8
                    }}>
                      Grade 3 • Max
                    </Text>
                    <View style={{
                      backgroundColor: '#f3f4f6',
                      borderRadius: 4,
                      height: 6,
                      overflow: 'hidden'
                    }}>
                      <View style={{
                        backgroundColor: '#f59e0b',
                        height: '100%',
                        width: '45%'
                      }} />
          </View>
                    <Text style={{
                      fontSize: 11,
                      color: '#6b7280',
                      marginTop: 4
                    }}>
                      45% Complete
                    </Text>
                  </View>
                </View>
              </View>
              
              {/* Today's Schedule Section */}
              <View>
                <Text style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: 16
                }}>
                  Today's Schedule
                </Text>
                
                {/* Schedule Items */}
                <View style={{ gap: 12 }}>
                  <View style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#e1e5e9'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#ef4444',
                        marginRight: 8
                      }} />
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827'
                      }}>
                        9:00 AM - Math
                      </Text>
            </View>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}>
                      Fractions & Decimals • Max
                    </Text>
          </View>
                  
                  <View style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#e1e5e9'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#10b981',
                        marginRight: 8
                      }} />
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827'
                      }}>
                        10:30 AM - Reading
                      </Text>
            </View>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}>
                      Chapter 5 • Lilly
                    </Text>
          </View>
                  
                  <View style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#e1e5e9'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#3b82f6',
                        marginRight: 8
                      }} />
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827'
                      }}>
                        2:00 PM - Science
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}>
                      Plant Growth Experiment • Max
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )
  }
      
  const renderCalendarPlanningContent = () => {
    if (!familyId) {
        return (
          <View style={styles.content}>
          <Text style={styles.title}>Calendar Planning</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
          </View>
        )
    }
      
        return (
          <View style={styles.content}>
        <CalendarPlanning 
          familyId={familyId}
          academicYear={null}
          showOnboardingBanner={false}
          onBack={() => onTabChange('calendar')}
        />
          </View>
        )
  }
      
  const renderAddOptionsContent = () => {
        return (
          <View style={styles.content}>
        <AddOptions
          onBack={() => onTabChange('home')}
          onAddSyllabus={() => onTabChange('syllabus')}
          onAddActivity={() => onTabChange('add-activity')}
          onAddChild={() => onTabChange('add-child')}
        />
          </View>
        )
  }
      
  const renderAddActivityContent = () => {
    if (!familyId) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>Add Activity</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      )
    }
    
    return (
      <View style={styles.content}>
        <AddActivityForm
          familyId={familyId}
          onBack={() => onTabChange('add-options')}
          onActivityAdded={(activity) => {
            console.log('Activity added:', activity);
            // Could refresh activities list here if needed
          }}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {renderContent()}
      
      {/* Syllabus Upload Modal */}
      <SyllabusUpload
        visible={showSyllabusModal}
        onClose={handleCloseSyllabusUpload}
        onSyllabusProcessed={handleSyllabusProcessed}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 32,
    backgroundColor: '#ffffff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 16,
  },
  cardBlue: { backgroundColor: '#eef6ff' },
  cardPink: { backgroundColor: '#fff0f5' },
  cardGreen: { backgroundColor: '#f0fff4' },
  cardYellow: { backgroundColor: '#fffbea' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  taskColumns: { flexDirection: 'row', gap: 12 },
  taskColumn: { flex: 1 },
  taskColumnTitle: { fontWeight: '600', color: '#555', marginBottom: 6 },
  taskItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#eaeaea', marginBottom: 6 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: '#bbb', backgroundColor: '#fff' },
  taskText: { color: '#333' },
  primaryBtn: { backgroundColor: '#38B6FF', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  innerSearch: { borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', marginBottom: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 6, borderColor: '#38B6FF', backgroundColor: '#e6f4ff' },
  bulletLine: { color: '#555', marginTop: 2 },
  detailLine: { color: '#333' },
  scrollContainer: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#666666',
    marginBottom: 32,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: 26,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    letterSpacing: '-0.01em',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  form: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  avatarOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  avatarOptionSelected: {
    borderColor: '#38B6FF',
    boxShadow: '0 2px 8px rgba(56, 182, 255, 0.3)',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  checkboxText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#38B6FF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  childrenList: {
    marginTop: 24,
  },
  childCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  childCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  childDetails: {
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  chatContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  messagesContainer: {
    minHeight: 400,
    padding: 24,
    backgroundColor: '#fafbfc',
  },
  welcomeMessage: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeBullet: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  message: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    marginLeft: 'auto',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    marginRight: 'auto',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userMessageText: {
    color: '#ffffff',
  },
  loadingMessage: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    gap: 12,
  },
  chatInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#f8f9fa',
  },
  sendButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  syllabusSection: {
    marginBottom: 32,
  },
  processedSyllabiSection: {
    marginTop: 24,
  },
  syllabusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  syllabusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  syllabusProvider: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  syllabusUnit: {
    fontSize: 14,
    color: '#38B6FF',
    marginBottom: 8,
  },
  syllabusPreview: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  comingSoonSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 500,
  },
  filterSection: {
    marginBottom: 32,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 12,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  filterChipActive: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.15)',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  actionButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  progressItem: {
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  focusContent: {
    marginTop: 16,
  },
  focusText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  focusSubjects: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subjectTag: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  resourceList: {
    marginTop: 16,
  },
  resourceItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    marginBottom: 10,
    alignItems: 'center',
  },
  resourceText: {
    fontSize: 14,
    color: '#333',
  },
  childrenSection: {
    marginBottom: 40,
  },
  childrenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  childCard: {
    width: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  childCardHover: {
    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.08), 0 3px 10px rgba(0, 0, 0, 0.06)',
    transform: 'translateY(-2px)',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  childAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  childDetails: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  childStats: {
    flexDirection: 'row',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  primaryButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  primaryButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 8px 25px rgba(26, 26, 26, 0.25)',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  // Update existing card styles to work with new layout
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    flex: 1,
    minWidth: 280,
  },
  cardBlue: {
    borderLeftWidth: 4,
    borderLeftColor: '#38B6FF',
  },
  // Today's Learning Styles
  todaysLearningSection: {
    marginTop: 24,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  childLearningCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#38B6FF',
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
  cardGreen: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  cardYellow: {
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  cardPink: {
    borderLeftWidth: 4,
    borderLeftColor: '#E91E63',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  formContainer: {
    maxWidth: 600,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formSubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formRow: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
  },
  formInputFocus: {
    borderColor: '#1a1a1a',
    boxShadow: '0 0 0 3px rgba(26, 26, 26, 0.1)',
  },
  formButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  formButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.2)',
  },
  formButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  avatarOptionSelected: {
    borderColor: '#1a1a1a',
    transform: 'scale(1.1)',
  },
  gradeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  gradeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f8f9fa',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  gradeChipSelected: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  gradeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  gradeChipTextSelected: {
    color: '#ffffff',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#e9ecef',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  checkboxChecked: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subjectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
  },
  subjectCard: {
    width: 200,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  subjectCardHover: {
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
    transform: 'translateY(-2px)',
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subjectDetails: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subjectToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleSwitch: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e9ecef',
    padding: 2,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  toggleSwitchActive: {
    backgroundColor: '#1a1a1a',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
  },
  toggleThumbActive: {
    transform: 'translateX(16px)',
  },
  aiHelpButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    marginTop: 16,
  },
  aiHelpButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
  },
  aiHelpButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  calendarHeader: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    backgroundColor: '#fafbfc',
  },
  calendarTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarGrid: {
    padding: 24,
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  calendarCellHover: {
    backgroundColor: '#f8f9fa',
  },
  calendarCellToday: {
    backgroundColor: '#1a1a1a',
  },
  calendarCellText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarCellTextToday: {
    color: '#ffffff',
  },
  calendarCellTextOther: {
    color: '#cccccc',
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    maxWidth: 500,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  modalClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modalCloseHover: {
    backgroundColor: '#e9ecef',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 24,
  },
  quickAction: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  quickActionHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
    transform: 'translateY(-1px)',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  successContainer: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  successText: {
    fontSize: 14,
    color: '#16a34a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
}) 
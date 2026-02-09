import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { ChevronDown } from 'lucide-react';

export default function FAQPage({ onNavigateToLogin, onNavigateToSignUp }) {
  const [expandedQuestion, setExpandedQuestion] = useState(null);

  const faqSections = [
    {
      id: 'about',
      title: 'About Learnadoodle',
      questions: [
        { id: 'about-1', q: 'What is Learnadoodle?', a: 'Learnadoodle is a learning planner designed specifically for family learning - including homeschooling, afterschool enrichment, and flexible education planning. It helps you build, track, and adapt schedules, subjects, lessons, and records in one place.' },
        { id: 'about-2', q: 'Who is Learnadoodle for?', a: 'Parents, caregivers, and learners of all ages - from early learners to teens and even college students - can use Learnadoodle to organize learning, manage subjects, track progress, and build lifelong learning habits.' },
        { id: 'about-3', q: 'Can kids use Learnadoodle too?', a: 'Yes. Younger students can check off tasks and view their daily goals, while older learners can take more control of planning, pacing, and progress tracking.' },
      ]
    },
    {
      id: 'getting-started',
      title: 'Getting Started',
      questions: [
        { id: 'gs-1', q: 'How do I begin with Learnadoodle?', a: 'Create an account, add your family members (students), set up subjects and materials, and schedule lessons, assignments, and enrichment events. It\'s fine to start simple - you can add detail over time.' },
        { id: 'gs-2', q: 'Do I need a curriculum before using Learnadoodle?', a: 'No. You can start without a set curriculum and build your plan as you go. Learnadoodle can help organize free resources or combine programs you already use.' },
        { id: 'gs-3', q: 'How do I manage multiple children with different schedules?', a: 'Learnadoodle lets you assign subjects and materials individually or share them across children, and you can plan events separately for each child\'s pacing.' },
      ]
    },
    {
      id: 'planner',
      title: 'Planner & Calendar',
      questions: [
        { id: 'pl-1', q: 'How does the planner work?', a: 'You can view lessons and activities in daily, weekly, or monthly calendar formats. Add tasks, field trips, enrichment activities, and checkpoints directly into the calendar.' },
        { id: 'pl-2', q: 'What if plans change?', a: 'You can reschedule, skip, or drag events, and Learnadoodle\'s adaptive structure helps keep pacing and records aligned with real life.' },
        { id: 'pl-3', q: 'Does Learnadoodle integrate with my device calendars?', a: 'Calendar integration is part of the planning workflow; connections to external calendars help keep family schedules synchronized.' },
      ]
    },
    {
      id: 'subjects',
      title: 'Subjects & Materials',
      questions: [
        { id: 'sub-1', q: 'What is a subject?', a: 'A subject is a topic area - e.g., Math, History, Art - that organizes related lessons, materials, assignments, and events.' },
        { id: 'sub-2', q: 'Can materials be shared across subjects or children?', a: 'Yes. Materials like PDFs, lesson plans, or books can be uploaded once and reused wherever needed.' },
        { id: 'sub-3', q: 'What types of materials can I upload?', a: 'Syllabi, lesson plans, assignments, resources, assessments, books, photos, and other learning documents can all live in your library.' },
      ]
    },
    {
      id: 'records',
      title: 'Records, Progress & Attendance',
      questions: [
        { id: 'rec-1', q: 'Do I need to keep attendance or records?', a: 'Many states require attendance or progress documentation for homeschooling. Learnadoodle automatically timestamps lessons and logs completed work, making records easy to maintain.' },
        { id: 'rec-2', q: 'How do I track progress?', a: 'Progress can be marked by lesson completion, grades, checklists, or narrative notes. Upload work samples to build a portfolio over time.' },
        { id: 'rec-3', q: 'Can I export reports?', a: 'Yes - Learnadoodle helps generate summaries showing attendance, subject coverage, activities, and accomplishments.' },
      ]
    },
    {
      id: 'account',
      title: 'Account & Data',
      questions: [
        { id: 'acc-1', q: 'Who owns my data?', a: 'You do. All your family\'s plans, materials, and records are yours and can be exported or deleted at any time.' },
        { id: 'acc-2', q: 'Is my data private and secure?', a: 'Yes - Learnadoodle protects your data and does not share it outside your account.' },
      ]
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header with Login/Sign Up buttons */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.logo}>learnadoodle</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={onNavigateToLogin}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.loginButtonText}>LOG IN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signUpButton}
              onPress={onNavigateToSignUp}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.signUpButtonText}>GET STARTED</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.pageContainer}>
          <Text style={styles.pageTitle}>Frequently Asked Questions</Text>
          
          {faqSections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              
              {section.questions.map((item) => (
                <View key={item.id} style={styles.faqItem}>
                  <TouchableOpacity
                    style={styles.faqQuestionRow}
                    onPress={() => setExpandedQuestion(expandedQuestion === item.id ? null : item.id)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.faqQuestion}>{item.q}</Text>
                    <View style={[
                      styles.chevronContainer,
                      expandedQuestion === item.id && styles.chevronExpanded
                    ]}>
                      <ChevronDown 
                        size={20} 
                        color="#ffffff"
                      />
                    </View>
                  </TouchableOpacity>
                  {expandedQuestion === item.id && (
                    <View style={styles.faqAnswerContainer}>
                      <Text style={styles.faqAnswer}>{item.a}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
  header: {
    backgroundColor: '#60a5fa',
    paddingVertical: 12,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }),
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
  },
  logo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    textTransform: 'lowercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loginButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  signUpButton: {
    backgroundColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  signUpButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  pageContainer: {
    maxWidth: 800,
    width: '100%',
    marginHorizontal: 'auto',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  pageTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 48,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  section: {
    marginBottom: 64,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  faqItem: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 16,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  faqQuestion: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    marginRight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chevronContainer: {
    transform: [{ rotate: '-90deg' }],
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
    }),
  },
  chevronExpanded: {
    transform: [{ rotate: '0deg' }],
  },
  faqAnswerContainer: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  faqAnswer: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255, 255, 255, 0.9)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

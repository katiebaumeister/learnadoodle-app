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
import { PLANNER_FAQ } from './planner/plannerFaqContent';

export default function FAQPage({ onNavigateToLogin, onNavigateToSignUp }) {
  const [expandedQuestion, setExpandedQuestion] = useState(null);

  const faqSections = [
    {
      id: 'about',
      title: 'About Learnadoodle',
      questions: [
        { id: 'about-1', q: 'What is Learnadoodle?', a: 'Learnadoodle is a family learning operations platform for planning, scheduling, materials, progress tracking, and records. It is built to support homeschooling, afterschool, pods, tutors, and flexible family learning models in one workspace.' },
        { id: 'about-2', q: 'Who is Learnadoodle for?', a: 'Primary use is parent-led family learning teams, including caregivers, tutors, and learners. It works for early learners through teens, and can support older independent students with parent-defined permission levels.' },
        { id: 'about-3', q: 'Can kids use Learnadoodle too?', a: 'Yes. Children can use learner accounts with parent-selected permission levels, from guided support to independent planning. Access can be tuned per learner in Family Members via Edit Child.' },
      ]
    },
    {
      id: 'getting-started',
      title: 'Getting Started',
      questions: [
        { id: 'gs-1', q: 'How do I begin with Learnadoodle?', a: 'Start with Family Members (add children), then create Subjects, then add events in Planner. Next, refine recurring cadence and metrics in Subjects > Schedule, and set family-wide defaults in Planning Preferences.' },
        { id: 'gs-2', q: 'Do I need a curriculum before using Learnadoodle?', a: 'No. You can begin with lightweight planning: subjects + a few events + basic cadence. Add materials, structure, and detail over time as your family routine becomes clearer.' },
        { id: 'gs-3', q: 'How do I manage multiple children with different schedules?', a: 'Assign subjects and events per learner, then use Subjects > Schedule to tune cadence/metrics per child. Shared events can include multiple learners while still preserving learner-specific attendance and progress records.' },
        { id: 'gs-4', q: 'Where do I go in the app for common tasks?', a: 'Home = quick status and daily flow, Planner = event scheduling/editing, Subjects = curriculum/cadence/metrics, Library = materials, Family Members = invites/access/permissions, Planning Preferences = family-wide scheduling rules.' },
      ]
    },
    {
      id: 'planner',
      title: 'Planner & Calendar',
      questions: PLANNER_FAQ,
    },
    {
      id: 'user-controls',
      title: 'User Controls & Permissions',
      questions: [
        { id: 'uc-1', q: 'What are User Controls?', a: 'User Controls are permission levels for child and tutor accounts that define what each person can see and change. They are managed through Family Members and applied per account, not globally by tab.' },
        { id: 'uc-2', q: 'Where do I change a child or tutor permission level?', a: 'Go to Family Members, open Edit Child or Edit Tutor, then set Permission level in the Account section. You can update this anytime as learner independence or tutor responsibilities change.' },
        { id: 'uc-3', q: 'What does each child permission level do?', a: 'Child levels move from Guided to Standard to Independent, increasing learner self-management. Higher levels allow more planning/tool autonomy, while parent-only areas remain protected.' },
        { id: 'uc-4', q: 'What does each tutor permission level do?', a: 'Tutor levels move from Viewer to Teaching to Lead Tutor, controlling how much assigned learner planning/coursework they can manage. Family-wide account, billing, and admin settings remain parent-controlled.' },
        { id: 'uc-5', q: 'Can pending tutor invites have a name and permission level?', a: 'Yes. During tutor invite, you can choose which children to share, set permission level, and provide tutor name before sending. After acceptance, edit these settings in Edit Tutor as needed.' },
      ],
    },
    {
      id: 'subjects',
      title: 'Subjects & Materials',
      questions: [
        { id: 'sub-1', q: 'What is a subject?', a: 'A subject is the core container for curriculum and learner work (for example Math, Biology, Writing). It connects events, materials, and schedule/metrics so planning and progress stay aligned.' },
        { id: 'sub-2', q: 'Can materials be shared across subjects or children?', a: 'Yes. Materials can be reused across subjects and learners when appropriate. You can keep one source asset and attach it where needed instead of duplicating files.' },
        { id: 'sub-3', q: 'What types of materials can I upload?', a: 'You can upload practical learning assets such as lesson plans, readings, assignments, syllabi, assessments, and reference resources. Use Library as your source-of-truth, then attach materials into subject workflows.' },
      ]
    },
    {
      id: 'records',
      title: 'Records, Progress & Attendance',
      questions: [
        { id: 'rec-1', q: 'Do I need to keep attendance or records?', a: 'If your state, school, or program requires documentation, yes. Learnadoodle keeps learner-level attendance and event history so you can maintain consistent records without extra manual tracking.' },
        { id: 'rec-2', q: 'How do I track progress?', a: 'Use event completion + attendance in Planner, then review cadence/progress signals in Subjects > Schedule. Add materials and notes to preserve context so progress is meaningful, not just binary completion.' },
        { id: 'rec-3', q: 'Can I export reports?', a: 'Yes. Learnadoodle supports summary-style reporting for attendance, subject coverage, activities, and learner progress. This helps with family review, tutor alignment, and compliance-style documentation.' },
      ]
    },
    {
      id: 'account',
      title: 'Account & Data',
      questions: [
        { id: 'acc-1', q: 'Who owns my data?', a: 'You do. Your family\'s plans, materials, and records remain under your account ownership. You can manage, export, or remove account data from account management flows.' },
        { id: 'acc-2', q: 'Is my data private and secure?', a: 'Yes. Learnadoodle is built around private family workspaces with role-based access controls. Only authorized members in your family context can access shared learning data.' },
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

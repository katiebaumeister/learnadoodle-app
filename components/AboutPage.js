import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';

export default function AboutPage({ onNavigateToLogin, onNavigateToSignUp }) {
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
          <Text style={styles.pageTitle}>About Learnadoodle</Text>
          
          {/* Mission Section */}
          <View id="mission" style={styles.section}>
            <Text style={styles.sectionTitle}>Mission</Text>
            <Text style={styles.text}>
              Make learning accessible, connected, and meaningful for real families.
            </Text>
            <Text style={styles.text}>
              Learnadoodle exists to help families organize learning in a way that fits real life - across different ages, goals, schedules, and learning styles.
            </Text>
            <Text style={styles.text}>
              We believe education is most powerful when it's visible, flexible, and grounded in the real world. Our mission is to remove friction from planning and tracking learning, so parents can focus less on administration and more on connection, curiosity, and confidence.
            </Text>
            <Text style={styles.text}>
              Learnadoodle supports homeschoolers, afterschool learners, and enrichment-focused families by bringing structure to diverse learning experiences - without forcing them into a single mold.
            </Text>
          </View>

          {/* Approach Section */}
          <View id="approach" style={styles.section}>
            <Text style={styles.sectionTitle}>Approach</Text>
            <Text style={styles.text}>
              One place to plan, track, and connect learning - across tools you already use.
            </Text>
            <Text style={styles.text}>
              Learnadoodle brings together schedules, learning activities, and materials from across your family's ecosystem.
            </Text>
            <Text style={styles.text}>
              Instead of asking families to replace everything, we help them organize what already exists:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Family and individual calendars, including multi-member schedules</Text>
              <Text style={styles.listItem}>• Lessons and videos from platforms like YouTube and Khan Academy</Text>
              <Text style={styles.listItem}>• Files, documents, and resources stored in tools like Google Drive or Dropbox</Text>
            </View>
            <Text style={styles.text}>
              The experience is organized around four simple spaces:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• <Text style={styles.listItemBold}>Home</Text> – a clear snapshot of today, what's coming up, and where attention is needed</Text>
              <Text style={styles.listItem}>• <Text style={styles.listItemBold}>Planner</Text> – flexible scheduling that adapts as days change and priorities shift</Text>
              <Text style={styles.listItem}>• <Text style={styles.listItemBold}>Subjects</Text> – subject-level organization with goals, content, and progress over time</Text>
              <Text style={styles.listItem}>• <Text style={styles.listItemBold}>Library</Text> – a shared place to store, reuse, and revisit learning materials</Text>
            </View>
            <Text style={styles.text}>
              Learnadoodle helps families see learning as a connected system - rather than scattered tabs, apps, and reminders.
            </Text>
          </View>

          {/* Efficacy Section */}
          <View id="efficacy" style={styles.section}>
            <Text style={styles.sectionTitle}>Efficacy</Text>
            <Text style={styles.text}>
              Clarity that builds confidence - and room to grow.
            </Text>
            <Text style={styles.text}>
              Learnadoodle works because it respects how learning actually happens: across contexts, platforms, and moments - not just in isolated lessons.
            </Text>
            <Text style={styles.text}>
              Families use Learnadoodle to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Track learning across subjects, formats, and real-world experiences</Text>
              <Text style={styles.listItem}>• Understand progress without constant manual logging</Text>
              <Text style={styles.listItem}>• Balance traditional academics with hands-on, interest-driven learning</Text>
              <Text style={styles.listItem}>• Encourage accountability while preserving autonomy for children</Text>
            </View>
            <Text style={styles.text}>
              By organizing learning across services and time, Learnadoodle helps parents and children:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Stay aligned on goals</Text>
              <Text style={styles.listItem}>• Reflect on what's working</Text>
              <Text style={styles.listItem}>• Make informed adjustments - together</Text>
            </View>
            <Text style={styles.text}>
              The result is learning that feels accessible, intentional, and connected to life beyond the screen.
            </Text>
          </View>
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
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#ffffff',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    marginTop: 8,
    marginBottom: 16,
  },
  listItem: {
    fontSize: 16,
    lineHeight: 24,
    color: '#ffffff',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listItemBold: {
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

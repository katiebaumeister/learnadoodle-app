import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';

export default function PrivacyPage({ onNavigateToLogin, onNavigateToSignUp }) {
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
          <Text style={styles.pageTitle}>Privacy Policy</Text>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>General</Text>
            <Text style={styles.text}>
              Learnadoodle Inc ("Learnadoodle," "Company," "we," "us," or "our") cares about your privacy. This Privacy Policy explains how we collect, use, and share information when you use our website learnadoodle.com (the "Site") and our Learnadoodle mobile application (the "App"), together the "Services."
            </Text>
            <Text style={styles.text}>
              By using the Services, you agree to the collection and use of information as described in this Privacy Policy. If you do not agree, do not use the Services.
            </Text>
            <Text style={styles.text}>
              Learnadoodle is built for families. Parents (or legal guardians) are the account holders, and children may use limited features through parent-managed accounts.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Information We Collect</Text>
            <Text style={styles.text}>
              We collect information in the following ways:
            </Text>
            <Text style={styles.text}>
              a. Information you provide
            </Text>
            <Text style={styles.text}>
              When you create an account, set up your family, or use the Services, you may provide:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Parent/guardian information: name, email, and account credentials (email/password or other login method)</Text>
              <Text style={styles.listItem}>• Child information (optional/limited): child name or nickname, and age in years</Text>
              <Text style={styles.listItem}>• Educational content you choose to store: learning notes, progress records, and uploaded documents</Text>
              <Text style={styles.listItem}>• Support communications: messages you send to us (e.g., customer support requests)</Text>
            </View>
            <Text style={styles.text}>
              b. Information collected automatically
            </Text>
            <Text style={styles.text}>
              When you use the Services, we may automatically collect:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Device and log data: IP address, browser type, operating system, device identifiers, and timestamps</Text>
              <Text style={styles.listItem}>• Usage data: pages or screens viewed, features used, clicks/taps, and actions taken in the Services</Text>
            </View>
            <Text style={styles.text}>
              c. Cookies and similar technologies
            </Text>
            <Text style={styles.text}>
              On the Site, we use cookies and similar technologies for:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Essential functionality (e.g., login/session and security)</Text>
              <Text style={styles.listItem}>• Analytics (e.g., understanding usage patterns)</Text>
            </View>
            <Text style={styles.text}>
              See "Cookies and Tracking" below for details and choices.
            </Text>
            <Text style={styles.text}>
              d. Payment information (if applicable)
            </Text>
            <Text style={styles.text}>
              If we offer paid plans in the future, payments will be processed by third parties (for example, Stripe or app stores). We generally receive limited billing details (such as payment status and subscription tier), and do not store full card numbers directly.
            </Text>
            <Text style={styles.text}>
              e. Sensitive information
            </Text>
            <Text style={styles.text}>
              Some information you store in Learnadoodle may be sensitive depending on what you upload (e.g., educational history, progress notes, documents). You control what you upload.
            </Text>
            <Text style={styles.text}>
              We do not intentionally collect:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• biometric identifiers,</Text>
              <Text style={styles.listItem}>• precise geolocation,</Text>
              <Text style={styles.listItem}>• or browsing history outside our Services.</Text>
            </View>
            <Text style={styles.text}>
              f. AI interactions
            </Text>
            <Text style={styles.text}>
              Learnadoodle includes an AI-powered assistant for educational support. When you use AI features:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• We may collect the messages and content you submit to provide the feature, improve reliability, and help keep the Services safe.</Text>
              <Text style={styles.listItem}>• You are interacting with an AI system, not a human.</Text>
              <Text style={styles.listItem}>• Please avoid entering highly sensitive personal information into AI prompts.</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How We Use Your Information</Text>
            <Text style={styles.text}>
              We use information to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Provide and operate the Services (account creation, family setup, planning tools, uploads)</Text>
              <Text style={styles.listItem}>• Personalize features (e.g., planning suggestions based on your inputs)</Text>
              <Text style={styles.listItem}>• Improve and maintain the Services (debugging, performance, product development)</Text>
              <Text style={styles.listItem}>• Communicate with you (support responses, service-related notices)</Text>
              <Text style={styles.listItem}>• Protect safety and integrity (fraud prevention, abuse detection, security monitoring)</Text>
              <Text style={styles.listItem}>• Comply with legal obligations (including COPPA, GDPR, and CCPA/CPRA where applicable)</Text>
            </View>
            <Text style={styles.text}>
              No advertising or data sales. We do not sell personal information and do not use your information for targeted advertising.
            </Text>
            <Text style={styles.text}>
              Legal bases for processing (GDPR/EEA and similar laws)
            </Text>
            <Text style={styles.text}>
              Where required, we process personal information under one or more of these bases:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Contract (to provide the Services you request)</Text>
              <Text style={styles.listItem}>• Consent (for certain optional features, and for parental consent where required)</Text>
              <Text style={styles.listItem}>• Legitimate interests (security, fraud prevention, product improvement—balanced against your rights)</Text>
              <Text style={styles.listItem}>• Legal obligation (compliance with applicable law)</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How We Share Information</Text>
            <Text style={styles.text}>
              We share information only as needed to operate the Services, including with:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Infrastructure and hosting providers (e.g., Supabase for data storage; Render for hosting/logs where applicable)</Text>
              <Text style={styles.listItem}>• AI processing providers (e.g., OpenAI) when you use AI or curriculum features that send content for analysis—only to provide those features, not for advertising or unrelated model training</Text>
              <Text style={styles.listItem}>• Analytics providers (e.g., Google Analytics on the Site, if enabled by your cookie choices)</Text>
              <Text style={styles.listItem}>• Platform providers (e.g., Apple and Google for app distribution and platform services)</Text>
              <Text style={styles.listItem}>• Payment processors (e.g., Stripe or app stores, if paid plans are offered)</Text>
            </View>
            <Text style={styles.text}>
              We do not share personal information for cross-context behavioral advertising (as defined by CCPA/CPRA).
            </Text>
            <Text style={styles.text}>
              Service providers (processors)
            </Text>
            <Text style={styles.text}>
              When we use service providers, they are authorized to process information only for us and are required to protect it under contractual obligations consistent with applicable law.
            </Text>
            <Text style={styles.text}>
              Legal and safety disclosures
            </Text>
            <Text style={styles.text}>
              We may disclose information if we believe it is necessary to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• comply with a legal obligation or valid legal request,</Text>
              <Text style={styles.listItem}>• protect the rights, safety, and security of users, Learnadoodle, or the public,</Text>
              <Text style={styles.listItem}>• investigate fraud or security issues.</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connected Google account (Drive, Docs, and Calendar)</Text>
            <Text style={styles.text}>
              If you choose to connect a Google account (optional), Learnadoodle uses Google’s APIs only as described here and only to provide features you use in the app.
            </Text>
            <Text style={styles.text}>
              What we access
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Google Drive and Google Docs (read-only): content you explicitly choose to import—for example, files you select in our import flow. We export Google Docs as plain text and may extract text from supported files (such as PDFs) so you can store them in your family library and use them in planning.</Text>
              <Text style={styles.listItem}>• Google Calendar: calendar events for the Google account and calendar you authorize, so we can show or sync scheduling information in Learnadoodle and, when you choose to sync, create or update events on your Google Calendar (typically your primary calendar).</Text>
            </View>
            <Text style={styles.text}>
              How we use and store it
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• OAuth tokens needed to access your Google account on your behalf are stored securely with our infrastructure provider and used only to provide the connections and actions you request (imports, calendar sync, and related features).</Text>
              <Text style={styles.listItem}>• Imported Drive/Docs content is stored as part of your Learnadoodle materials and is tied to your family account. Calendar-related data (such as links between Learnadoodle events and Google Calendar events) is stored so sync can work until you disconnect or delete it.</Text>
              <Text style={styles.listItem}>• If you use AI or curriculum tools that process library materials (including content originally imported from Google), portions of that text may be sent to our AI provider (e.g., OpenAI) solely to generate or structure educational planning output you asked for in the product. We do not sell Google user data, use it for advertising, or transfer it to data brokers.</Text>
            </View>
            <Text style={styles.text}>
              You can disconnect Google Drive/Docs from Family → Connected accounts (or equivalent), and disconnect or stop Google Calendar from the integration or calendar settings in the app where that connection is offered. Disconnecting stops new API access; imported materials and any synced calendar links may remain until you delete them or remove the connection as the app allows.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Children's Privacy</Text>
            <Text style={styles.text}>
              Learnadoodle is intended to be used by parents/guardians. Children under 13 may access limited features only through parent-managed accounts.
            </Text>
            <Text style={styles.text}>
              To help comply with COPPA and similar child privacy laws:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• We collect minimal child information (typically name/nickname and age in years) as needed for family planning features.</Text>
              <Text style={styles.listItem}>• Parents may request to review, delete, or restrict their child's information by contacting contact@learnadoodle.com.</Text>
              <Text style={styles.listItem}>• Child data is not public and is not shared except with essential service providers to operate the Services.</Text>
              <Text style={styles.listItem}>• We take steps to promote safe use of AI features for families, including monitoring for abuse patterns and offering reporting at contact@learnadoodle.com.</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rights and Choices</Text>
            <Text style={styles.text}>
              a. Account controls
            </Text>
            <Text style={styles.text}>
              You can update certain account information through the Services (where available). You may also contact us to request changes or help.
            </Text>
            <Text style={styles.text}>
              b. GDPR/EEA rights (and similar rights where applicable)
            </Text>
            <Text style={styles.text}>
              Depending on your location, you may have rights to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• access your personal information,</Text>
              <Text style={styles.listItem}>• correct inaccuracies,</Text>
              <Text style={styles.listItem}>• request deletion,</Text>
              <Text style={styles.listItem}>• restrict or object to processing,</Text>
              <Text style={styles.listItem}>• request portability,</Text>
              <Text style={styles.listItem}>• withdraw consent (where processing is based on consent),</Text>
              <Text style={styles.listItem}>• lodge a complaint with your local data protection authority.</Text>
            </View>
            <Text style={styles.text}>
              c. California rights (CCPA/CPRA)
            </Text>
            <Text style={styles.text}>
              California residents may have the right to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• know what personal information we collect, use, and disclose,</Text>
              <Text style={styles.listItem}>• request deletion,</Text>
              <Text style={styles.listItem}>• request correction (where applicable),</Text>
              <Text style={styles.listItem}>• opt out of "sale" or "sharing" (not applicable because we do not sell/share for advertising),</Text>
              <Text style={styles.listItem}>• not be discriminated against for exercising privacy rights.</Text>
            </View>
            <Text style={styles.text}>
              To exercise privacy rights, contact contact@learnadoodle.com. We may verify your identity before fulfilling a request. We respond within timeframes required by law (typically 30 days for GDPR requests, 45 days for CCPA/CPRA requests, with extensions where permitted).
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Retention</Text>
            <Text style={styles.text}>
              We retain personal information as long as needed to provide the Services and for legitimate business purposes (such as security, dispute resolution, and enforcement), unless a longer or shorter retention period is required by law.
            </Text>
            <Text style={styles.text}>
              Account deletion: We retain account data for up to 30 days after deletion to allow recovery if deletion was accidental. After that, we delete or de-identify it, unless retention is required by law.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security</Text>
            <Text style={styles.text}>
              We use reasonable administrative, technical, and organizational safeguards, including encryption in transit and at rest (where supported), access controls, and secure infrastructure practices.
            </Text>
            <Text style={styles.text}>
              No method of transmission or storage is 100% secure. If a breach occurs, we will notify you as required by law (including where applicable GDPR's 72-hour notification framework).
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cookies and Tracking</Text>
            <Text style={styles.text}>
              We use cookies (and similar technologies) on the Site for:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Essential cookies (required for core functionality and security)</Text>
              <Text style={styles.listItem}>• Analytics cookies (to understand and improve usage, such as via Google Analytics)</Text>
            </View>
            <Text style={styles.text}>
              Where required, we present a cookie banner that lets you accept or reject analytics cookies.
            </Text>
            <Text style={styles.text}>
              You can also control cookies through your browser settings. For Google Analytics, you can opt out using Google's browser add-on at:
            </Text>
            <Text style={styles.text}>
              https://tools.google.com/dlpage/gaoptout
            </Text>
            <Text style={styles.text}>
              We do not use cookies for targeted advertising.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>International Data Transfers</Text>
            <Text style={styles.text}>
              Learnadoodle is based in the United States, and information may be processed and stored in the United States or other locations where our service providers operate.
            </Text>
            <Text style={styles.text}>
              If you are located in the EEA/UK/Switzerland, we use appropriate safeguards for transfers (such as Standard Contractual Clauses) where required.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Changes to This Policy</Text>
            <Text style={styles.text}>
              We may update this Privacy Policy from time to time. If changes are material, we will provide notice through the Services or by email as required by law. The "last revised" date at the top shows when it was most recently updated.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Us</Text>
            <Text style={styles.text}>
              Learnadoodle Inc{'\n'}
              Email: contact@learnadoodle.com{'\n'}
              Phone: (803) 728-1336 (not toll-free)
            </Text>
            <Text style={styles.text}>
              California residents: If a complaint is not satisfactorily resolved, you may contact the California Department of Consumer Affairs:
            </Text>
            <Text style={styles.text}>
              Consumer Information Division, 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834{'\n'}
              Phone: (800) 952-5210 or (916) 445-1254
            </Text>
            <Text style={styles.text}>
              EU/EEA residents: You may also contact your local data protection authority to lodge a complaint.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.text}>
              This Privacy Policy was last revised on February 5, 2026.
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
    marginBottom: 48,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
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
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

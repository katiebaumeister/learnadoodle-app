import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';

export default function TermsPage({ onNavigateToLogin, onNavigateToSignUp }) {
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
          <Text style={styles.pageTitle}>Terms and Conditions of Service</Text>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. General / Our Services</Text>
            <Text style={styles.text}>
              Learnadoodle Inc. ("Learnadoodle," "we," "us," or "our") operates the Learnadoodle website, mobile applications, and related services (collectively, the "Services").
            </Text>
            <Text style={styles.text}>
              By accessing or using any part of the Services, you agree to these Legal Terms ("Terms"). If you do not agree, do not use the Services.
            </Text>
            <Text style={styles.text}>
              Availability by location. The Services are not intended for distribution or use in any jurisdiction where doing so would violate local law or subject Learnadoodle to registration or regulatory requirements. If you access the Services from outside the United States, you do so on your own initiative and are responsible for complying with applicable local laws.
            </Text>
            <Text style={styles.text}>
              Education and compliance context. Learnadoodle is designed to help families organize learning. It does not provide legal, tax, medical, or professional compliance advice, and we do not guarantee that use of the Services will satisfy any particular educational requirement.
            </Text>
            <Text style={styles.text}>
              Privacy and child safety laws. Learnadoodle is built to support privacy-first family use and is designed to comply with applicable privacy laws, including, as relevant:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• COPPA (children under 13): requires verifiable parental consent for the collection of personal information from children under 13 and additional safeguards for child data.</Text>
              <Text style={styles.listItem}>• GDPR (EU/EEA): provides lawful processing requirements and user rights such as access, correction, and deletion, as described in our Privacy Policy.</Text>
              <Text style={styles.listItem}>• CCPA/CPRA (California): provides rights to know, delete, and opt out of certain data sharing, and to limit use of sensitive personal information, as described in our Privacy Policy.</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Changes to These Terms</Text>
            <Text style={styles.text}>
              We may update these Terms from time to time. When we do, we will update the "Last revised" date at the bottom of these Terms and may provide additional notice via the Services or email.
            </Text>
            <Text style={styles.text}>
              If you continue to use the Services after changes take effect, you agree to the updated Terms.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Intellectual Property</Text>
            <Text style={styles.text}>
              Our IP. We own or license all rights in the Services, including the software, source code, databases, functionality, website and app design, text, graphics, images, audio, video, and other content (collectively, "Content"), as well as our trademarks, service marks, and logos ("Marks"). These are protected by U.S. and international intellectual property laws.
            </Text>
            <Text style={styles.text}>
              Limited license. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Services for personal, non-commercial household and educational use.
            </Text>
            <Text style={styles.text}>
              Restrictions. You may not:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• copy, reproduce, distribute, publicly display, republish, upload, transmit, or exploit any part of the Services, Content, or Marks for commercial purposes;</Text>
              <Text style={styles.listItem}>• reverse engineer, decompile, or attempt to extract source code (except where permitted by law);</Text>
              <Text style={styles.listItem}>• use our Content or Marks in a way that infringes rights or violates applicable law.</Text>
            </View>
            <Text style={styles.text}>
              For permissions beyond this license, contact contact@learnadoodle.com. All rights not expressly granted are reserved.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. User Uploads and Submissions</Text>
            <Text style={styles.text}>
              Your content stays yours. You may upload personal educational materials (e.g., learning notes, progress records, documents). You retain ownership of content you upload.
            </Text>
            <Text style={styles.text}>
              Private by default. Learnadoodle does not provide public sharing, public profiles, or user forums. Your uploaded content is intended to be private and accessible only through your account, subject to these Terms and our Privacy Policy.
            </Text>
            <Text style={styles.text}>
              Feedback. If you submit feedback, suggestions, or ideas ("Submissions"), you grant Learnadoodle a non-exclusive, royalty-free, worldwide license to use those Submissions to improve or develop the Services. This does not transfer ownership of your personal educational records or other private content.
            </Text>
            <Text style={styles.text}>
              Your responsibility. You are responsible for the content you upload and represent that:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• you have the right to upload it;</Text>
              <Text style={styles.listItem}>• it is lawful and does not infringe third-party rights; and</Text>
              <Text style={styles.listItem}>• you understand you control what you choose to store.</Text>
            </View>
            <Text style={styles.text}>
              We may remove or restrict access to content if required by law, a valid legal request, or to protect the security and integrity of the Services.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. User Representations</Text>
            <Text style={styles.text}>
              By using the Services, you represent and warrant that:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• the information you provide is accurate, current, and complete, and you will keep it updated;</Text>
              <Text style={styles.listItem}>• you have the legal capacity to agree to these Terms;</Text>
              <Text style={styles.listItem}>• if you are under the age of digital consent (including where applicable under COPPA or GDPR), you have verifiable parental/guardian consent;</Text>
              <Text style={styles.listItem}>• you will not access the Services through automated or non-human means (e.g., bots, scripts) unless expressly permitted;</Text>
              <Text style={styles.listItem}>• you will not use the Services for illegal or unauthorized purposes; and</Text>
              <Text style={styles.listItem}>• your use will comply with applicable laws and regulations.</Text>
            </View>
            <Text style={styles.text}>
              If any information is untrue, inaccurate, or incomplete, we may suspend or terminate your account.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Registration and Account Security</Text>
            <Text style={styles.text}>
              Certain features may require an account. You agree to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• keep your login credentials confidential;</Text>
              <Text style={styles.listItem}>• be responsible for all activity under your account; and</Text>
              <Text style={styles.listItem}>• notify us promptly of unauthorized access.</Text>
            </View>
            <Text style={styles.text}>
              We may reclaim or modify usernames that are misleading, offensive, or inappropriate.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Beta Access (Free Testing Phase)</Text>
            <Text style={styles.text}>
              Learnadoodle may be offered in a free beta phase. During beta, features may change, and the Services may be interrupted or modified.
            </Text>
            <Text style={styles.text}>
              If we introduce paid plans in the future, we will provide notice in advance (for example, via email or in-app notice) and require you to accept updated pricing and terms before charges apply.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Acceptable Use / Prohibited Activities</Text>
            <Text style={styles.text}>
              You may use the Services only as permitted by these Terms. You agree not to:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• scrape, harvest, or systematically retrieve data or Content without written permission;</Text>
              <Text style={styles.listItem}>• interfere with or bypass security features or access controls;</Text>
              <Text style={styles.listItem}>• upload malware or disruptive code;</Text>
              <Text style={styles.listItem}>• impersonate others or misrepresent your identity;</Text>
              <Text style={styles.listItem}>• reverse engineer or attempt unauthorized access to the Services or systems;</Text>
              <Text style={styles.listItem}>• use the Services to resell, redistribute, or build a competing product;</Text>
              <Text style={styles.listItem}>• collect or store personal information about others without consent.</Text>
            </View>
            <Text style={styles.text}>
              AI use. You also agree not to use AI features to generate or request harmful, exploitative, or inappropriate content—especially content involving minors—or to use AI features in ways that violate law or others' rights.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Mobile Application License</Text>
            <Text style={styles.text}>
              If you access the Services via a mobile app, we grant you a limited, revocable, non-exclusive, non-transferable license to install and use the app on a device you own or control, solely for personal, non-commercial use consistent with these Terms.
            </Text>
            <Text style={styles.text}>
              You may not modify, reverse engineer, decompile, or use the app unlawfully.
            </Text>
            <Text style={styles.text}>
              App Stores. If you download the app from Apple's App Store or Google Play, your use is also subject to the applicable store terms. Apple and Google are third-party beneficiaries of this section to the extent required by their terms.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Third-Party Links and Content</Text>
            <Text style={styles.text}>
              The Services may contain links to third-party websites or resources ("Third-Party Content"). We do not control or endorse Third-Party Content and are not responsible for its accuracy, legality, or availability. Your use of Third-Party Content is at your own risk and subject to the third party's terms and policies.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. Services Management and Safety</Text>
            <Text style={styles.text}>
              We may (but are not required to) monitor the Services for violations of these Terms, investigate potential misuse, and take appropriate action, including restricting access or terminating accounts.
            </Text>
            <Text style={styles.text}>
              To help keep Learnadoodle safe for families, we may monitor AI interactions for abuse patterns and provide a way to report concerns at contact@learnadoodle.com.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. Privacy</Text>
            <Text style={styles.text}>
              Your use of the Services is governed by our Privacy Policy. By using the Services, you consent to our collection, use, and sharing practices as described there, including processing and storage in the United States.
            </Text>
            <Text style={styles.text}>
              Optional Google integrations. If you connect a Google account, you authorize Learnadoodle to use Google’s APIs only to provide the features you use, as further described in our Privacy Policy. That may include:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Read-only access to Google Drive and Google Docs for files and documents you explicitly choose to import into your library and planning tools.</Text>
              <Text style={styles.listItem}>• Access to Google Calendar events you authorize, including creating or updating events on your Google Calendar when you choose to sync scheduling from Learnadoodle.</Text>
              <Text style={styles.listItem}>• Secure storage of OAuth tokens with our infrastructure providers so those features can operate on your behalf until you disconnect.</Text>
              <Text style={styles.listItem}>• Where you use AI or curriculum features that process imported materials, sending portions of that content to our AI provider (e.g., OpenAI) solely to produce the in-app outputs you request—not for advertising, sale, or transfer to data brokers.</Text>
            </View>
            <Text style={styles.text}>
              You may disconnect Google integrations from Family or account settings (for example, Connected accounts for Drive/Docs and the calendar integration settings where offered). Your use of Google’s services remains subject to Google’s terms and policies. The Privacy Policy contains the full description of how we handle Google user data.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>13. DMCA Notice and Policy</Text>
            <Text style={styles.text}>
              If you believe content on the Services infringes your copyright, send a DMCA notice including the required information under 17 U.S.C. § 512(c)(3).
            </Text>
            <Text style={styles.text}>
              DMCA Agent{'\n'}
              Elisa Alvarez-Garrido{'\n'}
              Attn: Copyright Agent{'\n'}
              3011 Blossom St{'\n'}
              Columbia, SC 29205{'\n'}
              United States{'\n'}
              contact@learnadoodle.com
            </Text>
            <Text style={styles.text}>
              Counter-notifications must include the required statements and consent to jurisdiction as applicable.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>14. Termination</Text>
            <Text style={styles.text}>
              These Terms remain in effect while you use the Services. We may suspend or terminate your access at any time, with or without notice, if we believe you have violated these Terms or if necessary to protect the Services, users, or Learnadoodle.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>15. Modifications and Interruptions</Text>
            <Text style={styles.text}>
              We may modify, suspend, or discontinue any part of the Services at any time. We are not liable for downtime, interruptions, or loss of access, subject to applicable law.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>16. Disclaimers</Text>
            <Text style={styles.text}>
              THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </Text>
            <Text style={styles.text}>
              Learnadoodle does not warrant that the Services will be uninterrupted, error-free, or that use of the Services will satisfy any specific educational, legal, or compliance requirement.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>17. Limitation of Liability</Text>
            <Text style={styles.text}>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEARNADOODLE AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES.
            </Text>
            <Text style={styles.text}>
              OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICES WILL NOT EXCEED $100, OR THE MAXIMUM AMOUNT PERMITTED BY LAW IF A DIFFERENT LIMIT IS REQUIRED.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>18. Indemnification</Text>
            <Text style={styles.text}>
              You agree to indemnify, defend, and hold harmless Learnadoodle and its affiliates, officers, employees, and agents from claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising from your use of the Services, your content, or your violation of these Terms.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>19. Governing Law</Text>
            <Text style={styles.text}>
              These Terms are governed by the laws of the State of Delaware, without regard to conflict of laws principles.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>20. Dispute Resolution and Arbitration</Text>
            <Text style={styles.text}>
              PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.
            </Text>
            <Text style={styles.text}>
              You and Learnadoodle agree to try to resolve disputes informally for at least 30 days after written notice.
            </Text>
            <Text style={styles.text}>
              If unresolved, disputes will be resolved by binding arbitration on an individual basis administered by the American Arbitration Association ("AAA") under its applicable rules, in New Castle County, Delaware, unless otherwise agreed.
            </Text>
            <Text style={styles.text}>
              You waive the right to a jury trial and to participate in class actions or class arbitration.
            </Text>
            <Text style={styles.text}>
              This section does not prevent either party from seeking injunctive or equitable relief for intellectual property infringement or unauthorized access/misuse.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>21. Electronic Communications</Text>
            <Text style={styles.text}>
              You consent to receive notices and communications electronically. Electronic communications satisfy any legal requirement that such communications be in writing.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>22. California Residents</Text>
            <Text style={styles.text}>
              If you are a California resident and have a complaint not satisfactorily resolved, you may contact the California Department of Consumer Affairs, Consumer Information Division at 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834, by phone at (800) 952-5210 or (916) 445-1254.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>23. Miscellaneous</Text>
            <Text style={styles.text}>
              These Terms constitute the entire agreement between you and Learnadoodle regarding the Services. If any provision is unenforceable, the remainder will remain in effect. No waiver is valid unless in writing. No agency, partnership, or joint venture is created.
            </Text>
            <Text style={styles.text}>
              Claims must be filed within one (1) year of the event giving rise to the claim, unless a longer period is required by law.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>24. Contact</Text>
            <Text style={styles.text}>
              Learnadoodle Inc{'\n'}
              Email: contact@learnadoodle.com{'\n'}
              Phone: 803-728-1336
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.text}>
              Last revised: April 3, 2026
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

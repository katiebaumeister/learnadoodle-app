import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SUBSCRIPTION_PLANS } from '../constants/subscription';

const family = SUBSCRIPTION_PLANS.family;
const familyPlus = SUBSCRIPTION_PLANS.familyPlus;

function anchorProps(id) {
  return Platform.OS === 'web'
    ? { id, collapsable: false }
    : { nativeID: id, collapsable: false };
}

export default function SubscriptionPage({ onNavigateToLogin, onNavigateToSignUp }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const scrollToHash = () => {
      const raw = window.location.hash?.replace(/^#/, '') || '';
      if (raw !== 'learnadoodle-family' && raw !== 'learnadoodle-family-plus') return;
      const el = document.getElementById(raw);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    const t = requestAnimationFrame(() => {
      scrollToHash();
    });
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <View style={styles.container}>
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.pageContainer}>
          <Text style={styles.pageTitle}>Learnadoodle plans</Text>
          <Text style={styles.lead}>
            Start free in the app with one child, then upgrade to a paid plan when you want the full family
            experience. Below is how Learnadoodle Family and Learnadoodle Family + compare.
          </Text>

          <View {...anchorProps('learnadoodle-family')} style={styles.tierSection}>
            <Text style={styles.tierKicker}>Paid plan</Text>
            <Text style={styles.sectionTitle}>Learnadoodle Family</Text>
            <Text style={styles.tierTagline}>{family.tagline}</Text>
            <Text style={styles.textMuted}>{family.positioningLine}</Text>
            <View style={styles.pricingBlock}>
              <Text style={styles.priceLine}>
                <Text style={styles.priceEmphasis}>${family.monthlyPrice}/mo</Text>
                <Text style={styles.text}> or </Text>
                <Text style={styles.priceEmphasis}>${family.annualPrice}/yr</Text>
                <Text style={styles.text}> billed annually</Text>
              </Text>
            </View>
            <Text style={styles.whatsIncluded}>What&apos;s included</Text>
            <View style={styles.list}>
              {family.features.map((line) => (
                <Text key={line} style={styles.listItem}>
                  • {line}
                </Text>
              ))}
            </View>
          </View>

          <View {...anchorProps('learnadoodle-family-plus')} style={[styles.tierSection, styles.tierSectionLast]}>
            <Text style={styles.tierKicker}>Paid plan</Text>
            <Text style={styles.sectionTitle}>Learnadoodle Family +</Text>
            <Text style={styles.tierTagline}>{familyPlus.tagline}</Text>
            <Text style={styles.textMuted}>{familyPlus.positioningLine}</Text>
            <Text style={styles.compareBlurb}>
              Everything in Learnadoodle Family, plus records-focused tools and higher limits for families who need
              compliance, transcripts, and advanced planning.
            </Text>
            <View style={styles.pricingBlock}>
              <Text style={styles.priceLine}>
                <Text style={styles.priceEmphasis}>${familyPlus.monthlyPrice}/mo</Text>
                <Text style={styles.text}> or </Text>
                <Text style={styles.priceEmphasis}>${familyPlus.annualPrice}/yr</Text>
                <Text style={styles.text}> billed annually</Text>
              </Text>
            </View>
            <Text style={styles.whatsIncluded}>What&apos;s included</Text>
            <View style={styles.list}>
              {familyPlus.features.map((line) => (
                <Text key={line} style={styles.listItem}>
                  • {line}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={onNavigateToSignUp}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.ctaButtonText}>GET STARTED</Text>
            </TouchableOpacity>
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
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    color: '#e2e8f0',
    marginBottom: 40,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tierSection: {
    marginBottom: 48,
    paddingBottom: 40,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.25)',
  },
  tierSectionLast: {
    borderBottomWidth: 0,
    paddingBottom: 8,
    marginBottom: 24,
  },
  tierKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tierTagline: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  textMuted: {
    fontSize: 15,
    lineHeight: 22,
    color: '#cbd5e1',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  compareBlurb: {
    fontSize: 15,
    lineHeight: 22,
    color: '#e2e8f0',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pricingBlock: {
    marginBottom: 20,
  },
  priceLine: {
    fontSize: 16,
    lineHeight: 24,
    color: '#e2e8f0',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  priceEmphasis: {
    fontWeight: '700',
    color: '#ffffff',
  },
  text: {
    fontSize: 16,
    color: '#e2e8f0',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  whatsIncluded: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  section: {
    marginBottom: 32,
  },
  list: {
    marginTop: 4,
  },
  listItem: {
    fontSize: 16,
    lineHeight: 26,
    color: '#ffffff',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';

export default function LandingPage({ onGetStarted, onLogIn }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Nav */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/icon.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>learnadoodle</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerGetStartedButton}
              onPress={onGetStarted}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.headerGetStartedText}>Get started</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerLogInButton}
              onPress={onLogIn}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.headerLogInText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* HERO */}
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <View style={styles.heroLeft}>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>Build habits that stick</Text>
            </View>
            <Text style={styles.heroTitle}>A planner that adapts to real life.</Text>
            <Text style={styles.heroSubtitle}>
              Plan in minutes. Track progress automatically. Adjust instantly when life changes.
            </Text>
            <View style={styles.heroButtons}>
              <TouchableOpacity
                style={styles.heroPrimaryButton}
                onPress={onGetStarted}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.heroPrimaryButtonText}>Create free account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroSecondaryButton}
                onPress={() => {
                  // Scroll to why section
                  if (Platform.OS === 'web' && typeof document !== 'undefined') {
                    const element = document.getElementById('why');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth' });
                    }
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.heroSecondaryButtonText}>See how it works</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.heroImageContainer}>
              <Image 
                source={require('../assets/icon.png')} 
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroBadgeFloating}>
              <Text style={styles.heroBadgeFloatingTitle}>Today</Text>
              <Text style={styles.heroBadgeFloatingSubtitle}>3 tasks • 1 goal • 20 min</Text>
            </View>
          </View>
        </View>
      </View>

      {/* SNIPPETS */}
      <View id="why" style={styles.snippets}>
        <View style={styles.snippetsContent}>
          <View style={styles.snippetsHeader}>
            <Text style={styles.snippetsTitle}>Simple on the surface. Thoughtful underneath.</Text>
            <Text style={styles.snippetsSubtitle}>
              Learnadoodle helps you plan, track, and adjust learning without turning your home into a school office.
            </Text>
          </View>
          <View style={styles.snippetsGrid}>
            {[
              {
                emoji: '🗓️',
                title: 'Plan without pressure',
                body: 'Create a flexible learning plan that fits your family - not a rigid school template. When life changes, your schedule adjusts with it.',
                tagline: 'No overplanning. No guilt when plans shift.',
              },
              {
                emoji: '📚',
                title: 'See progress clearly',
                body: 'Track lessons, attendance, and learning activity in one place, so you always know what\'s happening - without spreadsheets or binders.',
                tagline: 'Enough structure to feel confident. Not so much that it feels heavy.',
              },
              {
                emoji: '🌱',
                title: 'Teach the child you have',
                body: 'Every child learns differently. Learnadoodle helps you notice patterns, pace learning realistically, and stay aligned with your child\'s needs.',
                tagline: 'Support curiosity, not comparison.',
              },
              {
                emoji: '🧘',
                title: 'Stay compliant, stay calm',
                body: 'Keep records, goals, and requirements organized quietly in the background - so compliance doesn\'t overshadow the joy of learning.',
                tagline: 'Prepared when you need it. Invisible when you don\'t.',
              },
            ].map((card, index) => (
              <View key={index} style={styles.snippetCard}>
                <Text style={styles.snippetEmoji}>{card.emoji}</Text>
                <Text style={styles.snippetCardTitle}>{card.title}</Text>
                <Text style={styles.snippetCardBody}>{card.body}</Text>
                <Text style={styles.snippetCardTagline}>{card.tagline}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.snippetsClosing}>
            Built for real homeschool days - not perfect ones.
          </Text>
        </View>
      </View>

      {/* CTA STRIP */}
      <View style={styles.ctaStrip}>
        <View style={styles.ctaContent}>
          <View style={styles.ctaLeft}>
            <Text style={styles.ctaTitle}>Ready to get organized?</Text>
            <Text style={styles.ctaSubtitle}>
              Create an account in under a minute. You can import or start fresh.
            </Text>
          </View>
          <View style={styles.ctaButtons}>
            <TouchableOpacity
              style={styles.ctaPrimaryButton}
              onPress={onGetStarted}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.ctaPrimaryButtonText}>Get started</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaSecondaryButton}
              onPress={onLogIn}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.ctaSecondaryButtonText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* FOOTER MEGA-BLOCK */}
      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <View style={styles.footerGrid}>
            <FooterCol
              title="About us"
              links={[
                ['Mission', '/about#mission'],
                ['Approach', '/about#approach'],
                ['Efficacy', '/about#efficacy'],
              ]}
            />
            <FooterCol
              title="Products"
              links={[
                ['Super Doodle', '/products/super-doodle'],
                ['Gift Super Doodle', '/products/gift-super-doodle'],
                ['Doodle Max', '/products/doodle-max'],
              ]}
            />
            <FooterCol
              title="Apps"
              links={[
                ['Learnadoodle for Android', '/apps/android'],
                ['Learnadoodle for iOS', '/apps/ios'],
              ]}
            />
            <FooterCol
              title="Help and support"
              links={[
                ['Learnadoodle FAQs', '/help/faqs'],
                ['Contact us', '/contact'],
              ]}
            />
            <FooterCol
              title="Privacy and terms"
              links={[
                ['Terms', '/terms'],
                ['Privacy', '/privacy'],
              ]}
            />
            <FooterCol
              title="Social"
              links={[
                ['Blog', '/blog'],
                ['Instagram', 'https://instagram.com/learnadoodle'],
                ['Twitter', 'https://twitter.com/learnadoodle'],
                ['YouTube', 'https://www.youtube.com/@Learnadoodle'],
              ]}
            />
          </View>
          <View style={styles.footerBottom}>
            <Text style={styles.footerCopyright}>
              © {new Date().getFullYear()} Learnadoodle, Inc. All rights reserved.
            </Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = '/privacy';
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.footerLink}>Privacy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = '/terms';
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.footerLink}>Terms</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = '/contact';
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.footerLink}>Contact</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function FooterCol({ title, links }) {
  return (
    <View style={styles.footerCol}>
      <Text style={styles.footerColTitle}>{title}</Text>
      <View style={styles.footerColLinks}>
        {links.map(([label, href, onPress], index) => (
          <TouchableOpacity
            key={index}
            onPress={() => {
              if (onPress) {
                onPress();
              } else if (href && Platform.OS === 'web' && typeof window !== 'undefined') {
                if (href.startsWith('#')) {
                  const element = document.getElementById(href.substring(1));
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                } else {
                  window.location.href = href;
                }
              }
            }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.footerColLink}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  header: {
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(8px)',
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
    }),
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 32,
    height: 32,
  },
  logoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerGetStartedButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerGetStartedText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerLogInButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerLogInText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  hero: {
    ...(Platform.OS === 'web' ? {
      minHeight: 'calc(100vh - 56px)',
    } : {
      minHeight: 600,
    }),
    paddingVertical: 56,
    paddingHorizontal: 16,
  },
  heroContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '40px',
      alignItems: 'center',
    } : {}),
    flexDirection: Platform.OS === 'web' ? undefined : 'column',
    gap: 40,
    alignItems: 'center',
  },
  heroLeft: {
    ...(Platform.OS === 'web' ? {} : {
      width: '100%',
    }),
    flex: 1,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  heroBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroTitle: {
    fontSize: Platform.OS === 'web' ? 48 : 32,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: Platform.OS === 'web' ? 56 : 40,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroSubtitle: {
    fontSize: 18,
    color: '#475569',
    lineHeight: 28,
    marginBottom: 28,
    maxWidth: 500,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  heroPrimaryButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  heroPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroSecondaryButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  heroSecondaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroRight: {
    ...(Platform.OS === 'web' ? {} : {
      width: '100%',
      marginTop: 24,
    }),
    flex: 1,
    position: 'relative',
  },
  heroImageContainer: {
    aspectRatio: 4 / 3,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroBadgeFloating: {
    position: 'absolute',
    bottom: -24,
    left: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    }),
  },
  heroBadgeFloatingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroBadgeFloatingSubtitle: {
    fontSize: 12,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snippets: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 56,
    paddingHorizontal: 16,
  },
  snippetsContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
  },
  snippetsHeader: {
    maxWidth: 600,
    marginBottom: 48,
  },
  snippetsTitle: {
    fontSize: Platform.OS === 'web' ? 32 : 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snippetsSubtitle: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snippetsGrid: {
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '24px',
    } : {
      flexDirection: 'column',
    }),
    gap: 24,
  },
  snippetCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 24,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    }),
  },
  snippetEmoji: {
    fontSize: 32,
    marginBottom: 16,
  },
  snippetCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snippetCardBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snippetCardTagline: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snippetsClosing: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 48,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaStrip: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    paddingVertical: 56,
    paddingHorizontal: 16,
  },
  ctaContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
    flexWrap: 'wrap',
  },
  ctaLeft: {
    maxWidth: 500,
    flex: 1,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaSubtitle: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  ctaPrimaryButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  ctaPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaSecondaryButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  ctaSecondaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 56,
    paddingHorizontal: 16,
  },
  footerContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
  },
  footerGrid: {
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '40px',
      justifyContent: 'center',
      alignItems: 'start',
    } : {
      flexDirection: 'column',
      alignItems: 'center',
    }),
    gap: 40,
    marginBottom: 48,
    alignItems: 'flex-start',
  },
  footerCol: {
    marginBottom: 24,
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' ? {} : {
      width: '100%',
      alignItems: 'center',
    }),
  },
  footerColTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
    ...(Platform.OS === 'web' ? {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textAlign: 'left',
    } : {
      textAlign: 'center',
    }),
  },
  footerColLinks: {
    gap: 8,
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' ? {} : {
      alignItems: 'center',
    }),
  },
  footerColLink: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 8,
    ...(Platform.OS === 'web' ? {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
      textAlign: 'left',
      ':hover': {
        color: '#0f172a',
      },
    } : {
      textAlign: 'center',
    }),
  },
  footerBottom: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  footerCopyright: {
    fontSize: 16,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 16,
  },
  footerLink: {
    fontSize: 16,
    color: '#475569',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
});

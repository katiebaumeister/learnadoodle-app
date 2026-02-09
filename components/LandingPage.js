import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  Animated,
} from 'react-native';

export default function LandingPage({ onGetStarted, onLogIn }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isScrolled ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isScrolled, fadeAnim]);

  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    setIsScrolled(scrollY > 10);
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {/* Top Nav */}
      <View style={[styles.header, isScrolled && styles.headerScrolled]}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/icon.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>learnadoodle</Text>
          </View>
          <Animated.View style={[styles.headerButtons, { opacity: fadeAnim, pointerEvents: isScrolled ? 'auto' : 'none' }]}>
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
          </Animated.View>
        </View>
      </View>

      {/* HERO */}
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>Homeschool planning that adapts to real life.</Text>
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
                source={require('../assets/landing.gif')} 
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>
      </View>

      {/* NEW FEATURES SECTION */}
      <View id="why" style={styles.featuresSection}>
        <View style={styles.featuresContent}>
          {/* Header */}
          <View style={styles.featuresHeader}>
            <Text style={styles.featuresMainHeading}>
              Homeschool planning, simplified.{'\n'}Built for real families and real schedules.
            </Text>
            <Text style={styles.featuresSubHeading}>
              Start with flexible plans built around your family. Adjust as life changes. Stay confident you're covering what matters without the stress.
            </Text>
          </View>

          {/* Feature 1: Image left, text right */}
          <View style={styles.featureRow}>
            <View style={styles.featureImageContainer}>
              <Image
                source={require('../assets/schedule.png')}
                style={styles.featureImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>
                Build a schedule that fits your days—not the other way around.
              </Text>
              <Text style={styles.featureBody}>
                Create learning plans that adapt automatically when:{'\n'}
                • Appointments come up{'\n'}
                • Travel changes your week{'\n'}
                • Your child needs more time—or wants to move faster
              </Text>
            </View>
          </View>

          {/* Feature 2: Image right, text left */}
          <View style={styles.featureRow}>
            <View style={[styles.featureTextContainer, styles.featureTextContainerReversed]}>
              <Text style={styles.featureTitle}>
                Use the curriculum you trust
              </Text>
              <Text style={styles.featureBody}>
                Bring your materials together in one place (online courses, textbooks, videos, projects, hands-on activities) then turn them into organized lessons, assignments, and goals without rewriting everything or starting from scratch.
              </Text>
            </View>
            <View style={[styles.featureImageContainer, styles.featureImageContainerReversed]}>
              <Image
                source={require('../assets/curriculum.png')}
                style={styles.featureImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Feature 3: Image left, text right */}
          <View style={styles.featureRow}>
            <View style={styles.featureImageContainer}>
              <Image
                source={require('../assets/progress.png')}
                style={styles.featureImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>
                See progress without constant tracking
              </Text>
              <Text style={styles.featureBody}>
                Learnadoodle helps you track attendance and learning time automatically. See progress by subject, week, or term. Spot gaps early and adapt learning accordingly.
              </Text>
            </View>
          </View>

          {/* Feature 4: Image right, text left */}
          <View style={styles.featureRow}>
            <View style={[styles.featureTextContainer, styles.featureTextContainerReversed]}>
              <Text style={styles.featureTitle}>
                Support every child—without comparison
              </Text>
              <Text style={styles.featureBody}>
                Learning doesn't look the same for everyone. Plan at your child's pace. Adjust goals when needed. Celebrate effort, curiosity, and growth—not just checkmarks. Learnadoodle is built for different learning styles, neurodiverse learners, mixed-age families, and flexible homeschooling paths.
              </Text>
            </View>
            <View style={[styles.featureImageContainer, styles.featureImageContainerReversed]}>
              <Image
                source={require('../assets/support.png')}
                style={styles.featureImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Feature 5: Image left, text right */}
          <View style={styles.featureRow}>
            <View style={styles.featureImageContainer}>
              <Image
                source={require('../assets/teach.png')}
                style={styles.featureImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>
                Teach with confidence
              </Text>
              <Text style={styles.featureBody}>
                You don't need to do everything perfectly—you just need the right support. Learnadoodle helps you stay aligned with state or personal requirements, keep records organized and ready, and feel confident you're setting your child up for success. Because peace of mind matters as much as progress.
              </Text>
            </View>
          </View>

          {/* Feature 6: Image right, text left */}
          <View style={styles.featureRow}>
            <View style={[styles.featureTextContainer, styles.featureTextContainerReversed]}>
              <Text style={styles.featureTitle}>
                Privacy isn't an afterthought—it's foundational.
              </Text>
              <Text style={styles.featureBody}>
                No ads. No selling data. No training models on your family's content. You stay in control of what you add, share, and export—always.
              </Text>
            </View>
            <View style={[styles.featureImageContainer, styles.featureImageContainerReversed]}>
              <Image
                source={require('../assets/privacy.png')}
                style={styles.featureImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>
      </View>

      {/* CTA STRIP */}
      <View style={styles.ctaStrip}>
        <View style={styles.ctaContent}>
          <Text style={styles.ctaTitle}>Ready to get organized?</Text>
          <TouchableOpacity
            style={styles.ctaPrimaryButton}
            onPress={onGetStarted}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.ctaPrimaryButtonText}>GET STARTED</Text>
          </TouchableOpacity>
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
    }),
    backgroundColor: '#ffffff',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerScrolled: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...(Platform.OS === 'web' && {
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
    }),
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
    width: 56,
    height: 56,
  },
  logoText: {
    fontSize: 26,
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
    paddingTop: 25,
    paddingBottom: 56,
    paddingHorizontal: 16,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }),
  },
  heroContent: {
    maxWidth: 1000,
    width: '100%',
    marginHorizontal: 'auto',
    position: 'relative',
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gridTemplateColumns: '1fr 1.3fr',
      gap: '40px',
      alignItems: 'center',
      alignContent: 'center',
    } : {}),
    flexDirection: Platform.OS === 'web' ? undefined : 'column',
    gap: 40,
    alignItems: 'center',
  },
  heroLeft: {
    position: 'relative',
    zIndex: 2,
    ...(Platform.OS === 'web' ? {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    } : {
      width: '100%',
    }),
    flex: 1,
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
    position: 'relative',
    zIndex: 1,
    ...(Platform.OS === 'web' ? {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    } : {
      width: '100%',
      marginTop: 24,
    }),
    flex: 1,
  },
  heroImageContainer: {
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      minHeight: 480,
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  ctaStrip: {
    backgroundColor: '#ffffff',
    paddingVertical: 56,
    paddingHorizontal: 16,
  },
  ctaContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  ctaLeft: {
    maxWidth: 500,
    flex: 1,
  },
  ctaTitle: {
    fontSize: 56,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 0,
    textAlign: 'center',
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
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 56,
    borderRadius: 24,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  ctaPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
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
    backgroundColor: '#f8fafc',
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
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCopyright: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuresSection: {
    paddingVertical: 80,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
  },
  featuresContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
  },
  featuresHeader: {
    marginBottom: 80,
    alignItems: 'center',
    textAlign: 'center',
  },
  featuresMainHeading: {
    fontSize: Platform.OS === 'web' ? 48 : 32,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: Platform.OS === 'web' ? 56 : 40,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featuresSubHeading: {
    fontSize: Platform.OS === 'web' ? 24 : 18,
    fontWeight: '400',
    color: '#475569',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 36 : 28,
    maxWidth: 800,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featureRow: {
    ...(Platform.OS === 'web' ? {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 64,
      marginBottom: 120,
    } : {
      flexDirection: 'column',
      marginBottom: 64,
    }),
  },
  featureRowReversed: {
    ...(Platform.OS === 'web' ? {
      flexDirection: 'row-reverse',
    } : {}),
  },
  featureImageContainer: {
    ...(Platform.OS === 'web' ? {
      flex: 1,
      minWidth: 0,
    } : {
      width: '100%',
      marginBottom: 24,
    }),
  },
  featureImageContainerReversed: {
    ...(Platform.OS === 'web' ? {
      order: 2,
    } : {}),
  },
  featureTextContainerReversed: {
    ...(Platform.OS === 'web' ? {
      order: 1,
    } : {}),
  },
  featureImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    ...(Platform.OS === 'web' && {
      minHeight: 300,
      maxHeight: 500,
    } : {
      height: 200,
    }),
  },
  featureTextContainer: {
    ...(Platform.OS === 'web' ? {
      flex: 1,
      minWidth: 0,
    } : {
      width: '100%',
    }),
  },
  featureTitle: {
    fontSize: Platform.OS === 'web' ? 32 : 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    lineHeight: Platform.OS === 'web' ? 40 : 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  featureBody: {
    fontSize: Platform.OS === 'web' ? 18 : 16,
    fontWeight: '400',
    color: '#475569',
    lineHeight: Platform.OS === 'web' ? 28 : 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

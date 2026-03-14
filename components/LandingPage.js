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
  Modal,
} from 'react-native';
import AppLoader from './AppLoader';
import { X, ChevronDown } from 'lucide-react';

const LANDING_IMAGE_COUNT = 17;

export default function LandingPage({ onGetStarted, onLogIn, skipLoader = false }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSuperDoodleVisible, setIsSuperDoodleVisible] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [pageReady, setPageReady] = useState(Platform.OS !== 'web' || skipLoader);
  const [isMobile, setIsMobile] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    // Treat non-web platforms as mobile by default
    return Platform.OS !== 'web';
  });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pageFadeAnim = useRef(new Animated.Value(1)).current;
  const headerFadeAnim = useRef(new Animated.Value(1)).current;
  const superDoodleRef = useRef(null);
  const loadedImageCount = useRef(0);

  const handleImageLoad = () => {
    if (Platform.OS !== 'web' || pageReady) return;
    loadedImageCount.current += 1;
    if (loadedImageCount.current >= LANDING_IMAGE_COUNT) {
      setPageReady(true);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      const t = setTimeout(() => setPageReady(true), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isScrolled ? 1 : 0,
      duration: 300,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isScrolled, fadeAnim]);

  useEffect(() => {
    Animated.timing(headerFadeAnim, {
      toValue: isSuperDoodleVisible ? 0 : 1,
      duration: 400,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isSuperDoodleVisible, headerFadeAnim]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth <= 768);
      };
      
      checkMobile();
      window.addEventListener('resize', checkMobile);
      
      return () => window.removeEventListener('resize', checkMobile);
    } else {
      setIsMobile(true);
    }
  }, []);

  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    setIsScrolled(scrollY > 10);
    
    // Check if superdoodle section is halfway down (50% visible)
    if (Platform.OS === 'web' && superDoodleRef.current) {
      const element = superDoodleRef.current;
      if (element && typeof element.getBoundingClientRect === 'function') {
        const rect = element.getBoundingClientRect();
        const sectionHeight = rect.height;
        const viewportHeight = window.innerHeight;
        // Hide header when section is at least 50% scrolled into view
        const isHalfwayVisible = rect.top < viewportHeight - (sectionHeight * 0.5) && rect.bottom > 0;
        setIsSuperDoodleVisible(isHalfwayVisible);
      }
    }
  };

  const handleLogIn = () => {
    Animated.timing(pageFadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      onLogIn();
    });
  };

  const mainContent = (
    <Animated.View style={[styles.landingContentWrapper, { opacity: pageFadeAnim }, Platform.OS === 'web' && !pageReady && styles.landingContentHidden]}>
      {/* Corner Text - Only visible when not scrolled and not mobile */}
      {!isScrolled && !isMobile && (
        <View style={styles.cornerText}>
          <Text style={styles.cornerTextContent}>PLAN, TEACH, CONNECT</Text>
        </View>
      )}
      
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
      {/* Top Nav */}
      {isMobile ? (
        <View style={styles.headerMobile}>
          <View style={styles.headerContentMobile}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
                onLoad={handleImageLoad}
              />
              <Text style={styles.logoText}>learnadoodle</Text>
            </View>
          </View>
        </View>
      ) : (
        <Animated.View style={[styles.header, isScrolled && styles.headerScrolled]}>
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
                onLoad={handleImageLoad}
              />
              <Text style={styles.logoText}>learnadoodle</Text>
            </View>
            <Animated.View style={[styles.headerButtons, { opacity: fadeAnim, pointerEvents: isScrolled ? 'auto' : 'none' }]}>
              <TouchableOpacity
                style={styles.headerGetStartedButton}
                onPress={onGetStarted}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.headerGetStartedText}>GET STARTED</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* HERO */}
      <View style={[styles.hero, isMobile && styles.heroMobile]}>
        <View style={[styles.heroContent, isMobile && styles.heroContentMobile]}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>Homeschool planning that adapts to real life</Text>
            <View style={styles.heroButtons}>
              <TouchableOpacity
                style={[styles.heroPrimaryButton, isMobile && styles.heroButtonMobile]}
                onPress={onGetStarted}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.heroPrimaryButtonText}>GET STARTED</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroSecondaryButton, isMobile && styles.heroButtonMobile]}
                onPress={handleLogIn}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.heroSecondaryButtonText}>I ALREADY HAVE AN ACCOUNT</Text>
              </TouchableOpacity>
            </View>
          </View>
          {!isMobile && (
            <View style={styles.heroRight}>
              <View style={styles.heroImageContainer}>
                <Image 
                  source={require('../assets/landing.gif')} 
                  style={styles.heroImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            </View>
          )}
        </View>
        
        {/* Scroll Indicator */}
        <TouchableOpacity
          style={[styles.scrollIndicator, isMobile && styles.scrollIndicatorMobile]}
          onPress={() => {
            if (Platform.OS === 'web' && typeof document !== 'undefined') {
              const featuresSection = document.getElementById('why');
              if (featuresSection) {
                featuresSection.scrollIntoView({ behavior: 'smooth' });
              }
            }
          }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.scrollIndicatorText}>See how it works</Text>
          <ChevronDown size={20} color="#64748b" />
        </TouchableOpacity>
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
            {!isMobile && (
              <View style={styles.featureImageContainer}>
                <Image
                  source={require('../assets/schedule.png')}
                  style={styles.featureImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            )}
            <View style={styles.featureTextContainer}>
              {isMobile && (
                <View style={styles.featureImageContainerMobile}>
                  <Image
                    source={require('../assets/schedule.png')}
                    style={styles.featureImageMobile}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
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
            <View style={[styles.featureTextContainer, !isMobile && styles.featureTextContainerReversed]}>
              {isMobile && (
                <View style={styles.featureImageContainerMobile}>
                  <Image
                    source={require('../assets/curriculum.png')}
                    style={styles.featureImageMobile}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
              <Text style={styles.featureTitle}>
                Use the curriculum you trust
              </Text>
              <Text style={styles.featureBody}>
                Bring your materials together in one place (online courses, textbooks, videos, projects, hands-on activities) then turn them into organized lessons, assignments, and goals without rewriting everything or starting from scratch.
              </Text>
            </View>
            {!isMobile && (
              <View style={[styles.featureImageContainer, styles.featureImageContainerReversed]}>
                <Image
                  source={require('../assets/curriculum.png')}
                  style={styles.featureImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            )}
          </View>

          {/* Feature 3: Image left, text right */}
          <View style={styles.featureRow}>
            {!isMobile && (
              <View style={styles.featureImageContainer}>
                <Image
                  source={require('../assets/progress.png')}
                  style={styles.featureImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            )}
            <View style={styles.featureTextContainer}>
              {isMobile && (
                <View style={styles.featureImageContainerMobile}>
                  <Image
                    source={require('../assets/progress.png')}
                    style={styles.featureImageMobile}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
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
            <View style={[styles.featureTextContainer, !isMobile && styles.featureTextContainerReversed]}>
              {isMobile && (
                <View style={styles.featureImageContainerMobile}>
                  <Image
                    source={require('../assets/support.png')}
                    style={styles.featureImageMobile}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
              <Text style={styles.featureTitle}>
                Support every child—without comparison
              </Text>
              <Text style={styles.featureBody}>
                Learning doesn't look the same for everyone. Plan at your child's pace. Adjust goals when needed. Celebrate effort, curiosity, and growth—not just checkmarks. Learnadoodle is built for different learning styles, neurodiverse learners, mixed-age families, and flexible homeschooling paths.
              </Text>
            </View>
            {!isMobile && (
              <View style={[styles.featureImageContainer, styles.featureImageContainerReversed]}>
                <Image
                  source={require('../assets/support.png')}
                  style={styles.featureImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            )}
          </View>

          {/* Feature 5: Image left, text right */}
          <View style={styles.featureRow}>
            {!isMobile && (
              <View style={styles.featureImageContainer}>
                <Image
                  source={require('../assets/teach.png')}
                  style={styles.featureImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            )}
            <View style={styles.featureTextContainer}>
              {isMobile && (
                <View style={styles.featureImageContainerMobile}>
                  <Image
                    source={require('../assets/teach.png')}
                    style={styles.featureImageMobile}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
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
            <View style={[styles.featureTextContainer, !isMobile && styles.featureTextContainerReversed]}>
              {isMobile && (
                <View style={styles.featureImageContainerMobile}>
                  <Image
                    source={require('../assets/privacy.png')}
                    style={styles.featureImageMobile}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
              <Text style={styles.featureTitle}>
                Privacy isn't an afterthought—it's foundational.
              </Text>
              <Text style={styles.featureBody}>
                No ads. No selling data. No training models on your family's content. You stay in control of what you add, share, and export—always.
              </Text>
            </View>
            {!isMobile && (
              <View style={[styles.featureImageContainer, styles.featureImageContainerReversed]}>
                <Image
                  source={require('../assets/privacy.png')}
                  style={styles.featureImage}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* GET SUPER DOODLE SECTION */}
      {!isMobile && (
        Platform.OS === 'web' ? (
          <View 
            ref={superDoodleRef}
            style={styles.superDoodleSectionWrapper}
          >
            <View style={styles.superDoodleSection}>
              <Image
                source={require('../assets/superdoodlesection.png')}
                style={styles.superDoodleSectionImage}
                resizeMode="contain"
                onLoad={handleImageLoad}
              />
              <View style={styles.superDoodleButtonContainer}>
                <TouchableOpacity
                  style={styles.superDoodleButton}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.location.href = '/products/super-doodle';
                    }
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.superDoodleButtonText}>UPGRADE NOW</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View 
            ref={superDoodleRef}
            style={styles.superDoodleSection}
          >
            <Image
              source={require('../assets/superdoodlesection.png')}
              style={styles.superDoodleSectionImage}
              resizeMode="contain"
              onLoad={handleImageLoad}
            />
            <View style={styles.superDoodleButtonContainer}>
              <TouchableOpacity
                style={styles.superDoodleButton}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = '/products/super-doodle';
                  }
                }}
              >
                <Text style={styles.superDoodleButtonText}>UPGRADE NOW</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      )}

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
                ['Learnadoodle', '/'],
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
              onShowComingSoon={() => setShowComingSoonModal(true)}
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
                ['Roblox', 'https://www.roblox.com/share?code=a65c902ebb096944a88af078229248c1&type=Server'],
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

    {/* Coming Soon Modal */}
    <Modal
      visible={showComingSoonModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowComingSoonModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setShowComingSoonModal(false)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={24} color="#64748b" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Coming Soon</Text>
          <Text style={styles.modalText}>
            Mobile apps for Learnadoodle are currently in development. Stay tuned for updates!
          </Text>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={() => setShowComingSoonModal(false)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.modalButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </Animated.View>
  );

  return (
    <>
      {Platform.OS === 'web' && !pageReady && !skipLoader && <AppLoader />}
      {mainContent}
    </>
  );
}

function FooterCol({ title, links, onShowComingSoon }) {
  return (
    <View style={styles.footerCol}>
      <Text style={styles.footerColTitle}>{title}</Text>
      <View style={styles.footerColLinks}>
        {links.map(([label, href, onPress], index) => {
          const isAppLink = href === '/apps/android' || href === '/apps/ios';
          return (
            <TouchableOpacity
              key={index}
              onPress={() => {
                if (onPress) {
                  onPress();
                } else if (isAppLink && onShowComingSoon) {
                  onShowComingSoon();
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
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  landingContentWrapper: {
    flex: 1,
  },
  landingContentHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  contentContainer: {
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  headerMobile: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 16,
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
  headerHidden: {
    ...(Platform.OS === 'web' && {
      display: 'none',
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
  headerContentMobile: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 18,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerGetStartedText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
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
  heroMobile: {
    ...(Platform.OS === 'web'
      ? {
          minHeight: '100vh',
          paddingTop: 12,
          paddingBottom: 32,
        }
      : {
          flex: 1,
          justifyContent: 'center',
          paddingTop: 16,
          paddingBottom: 24,
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
  heroContentMobile: {
    ...(Platform.OS === 'web'
      ? {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }
      : {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }),
  },
  heroLeft: {
    position: 'relative',
    zIndex: 2,
    ...(Platform.OS === 'web' ? {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    } : {
      width: '100%',
      alignItems: 'center',
    }),
    flex: 1,
  },
  heroTitle: {
    fontSize: Platform.OS === 'web' ? 34 : 26,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: Platform.OS === 'web' ? 44 : 36,
    marginBottom: 40,
    textAlign: 'center',
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
    flexDirection: 'column',
    gap: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  heroButtonMobile: {
    minWidth: '100%',
    maxWidth: 360,
    alignSelf: 'stretch',
  },
  heroPrimaryButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    minWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.03)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  heroPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroSecondaryButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    minWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.03)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  heroSecondaryButtonText: {
    color: '#81C1E1',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
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
  superDoodleSectionWrapper: {
    backgroundColor: '#1E293B',
    ...(Platform.OS === 'web' && {
      width: '100vw',
      height: '100vh',
      position: 'relative',
      left: '50%',
      marginLeft: '-50vw',
      marginRight: 0,
    }),
  },
  superDoodleSection: {
    width: '100%',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    marginLeft: 0,
    marginRight: 0,
    backgroundColor: '#1E293B',
    ...(Platform.OS === 'web' && {
      width: '100vw',
      height: '100vh',
    }),
  },
  superDoodleSectionImage: {
    width: '100%',
    marginHorizontal: 0,
    marginLeft: 0,
    marginRight: 0,
    ...Platform.select({
      web: {
        objectFit: 'contain',
        display: 'block',
        width: '100vw',
        height: 600,
        maxHeight: '80vh',
        minWidth: '100vw',
      },
      default: {
        height: 300,
      },
    }),
  },
  superDoodleButtonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      bottom: 'auto',
      top: '60%',
      left: '25%',
      right: 'auto',
      alignItems: 'flex-start',
    }),
  },
  superDoodleButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    }),
  },
  superDoodleButtonText: {
    color: '#1E293B',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    ...(Platform.OS === 'web' ? {
      minHeight: 300,
      maxHeight: 500,
    } : {
      height: 200,
    }),
  },
  featureImageContainerMobile: {
    width: '100%',
    marginBottom: 16,
  },
  featureImageMobile: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    height: 'auto',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }),
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    width: '90%',
    maxWidth: 400,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    }),
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalText: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalButton: {
    backgroundColor: '#60a5fa',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  scrollIndicatorMobile: {
    bottom: 20,
  },
  scrollIndicatorText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cornerText: {
    position: 'absolute',
    top: 28,
    right: 150,
    zIndex: 100,
    ...(Platform.OS === 'web' ? {
      pointerEvents: 'none',
      position: 'fixed',
    } : {}),
  },
  cornerTextContent: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

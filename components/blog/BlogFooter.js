import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
} from 'react-native';
import { X } from 'lucide-react';

export default function BlogFooter() {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);

  return (
    <>
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingVertical: 56,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' && {
      width: '100vw',
      marginLeft: 'calc(-50vw + 50%)',
      marginRight: 'calc(-50vw + 50%)',
    }),
  },
  footerContent: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 40,
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
});


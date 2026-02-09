import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';

export default function BlogFooter() {
  return (
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
});


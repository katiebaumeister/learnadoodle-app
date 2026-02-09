import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';

export default function BlogShell({ children, onNavigateToLogin, onNavigateToSignUp }) {
  return (
    <View style={styles.container}>
      {/* Sticky Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.logo}>learnadoodle</Text>
          </TouchableOpacity>
          <View style={styles.headerLinks}>
            <TouchableOpacity
              style={styles.headerLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.href = '/blog';
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.headerLinkText}>Blog</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.href = '/about';
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.headerLinkText}>About</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerLink}
              onPress={onNavigateToLogin}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.headerLinkText}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <View style={styles.footerGrid}>
            <FooterCol
              title="Product"
              links={[
                ['Overview', '/'],
                ['Features', '/'],
                ['Security', '/security'],
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                ['About', '/about'],
                ['Contact', '/contact'],
              ]}
            />
            <FooterCol
              title="Resources"
              links={[
                ['Help Center', '/help'],
                ['Guides', '/guides'],
              ]}
            />
            <FooterCol
              title="Legal"
              links={[
                ['Terms', '/terms'],
                ['Privacy', '/privacy'],
                ['Cookies', '/cookies'],
                ['Contact', '/contact'],
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
    </View>
  );
}

function FooterCol({ title, links }) {
  return (
    <View style={styles.footerCol}>
      <Text style={styles.footerColTitle}>{title}</Text>
      <View style={styles.footerColLinks}>
        {links.map(([label, href], index) => (
          <TouchableOpacity
            key={index}
            onPress={() => {
              if (href && Platform.OS === 'web' && typeof window !== 'undefined') {
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
    ...(Platform.OS === 'web' ? {
      width: '100%',
      maxWidth: '100%',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
    } : {
      flex: 1,
    }),
    backgroundColor: '#ffffff',
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  headerContent: {
    width: '100%',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  logo: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    textTransform: 'lowercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  headerLink: {
    paddingVertical: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  content: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      margin: 0,
      padding: 0,
    }),
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingVertical: 48,
    paddingHorizontal: 0,
    marginTop: 0,
    ...(Platform.OS === 'web' && {
      width: '100%',
    }),
  },
  footerContent: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 40,
  },
  footerGrid: {
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '40px',
    } : {
      flexDirection: 'column',
    }),
    gap: 40,
    marginBottom: 48,
  },
  footerCol: {
    marginBottom: 24,
  },
  footerColTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footerColLinks: {
    gap: 8,
  },
  footerColLink: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  footerBottom: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  footerCopyright: {
    fontSize: 14,
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
    fontSize: 14,
    color: '#475569',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
});

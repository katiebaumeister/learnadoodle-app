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
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingVertical: 48,
    paddingHorizontal: 0,
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


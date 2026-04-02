import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '../../constants/mobileAppLinks';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

type Props = {
  /** When set (e.g. from Family settings), store buttons open this instead of store URLs. */
  onComingSoon?: () => void;
};

export function SubscriptionAppDownloadBanner({ onComingSoon }: Props) {
  const handleStorePress = (url: string) => {
    if (onComingSoon) {
      onComingSoon();
      return;
    }
    openUrl(url);
  };

  return (
    <View style={styles.banner}>
      <View style={styles.copyCol}>
        <Text style={styles.headline}>Learnadoodle on the Go!</Text>
        <Text style={styles.subtext}>
          Make learning and planning easier with our iPhone and Android app
        </Text>
      </View>
      <View style={styles.buttonsRow}>
        <Pressable
          style={({ pressed }) => [styles.storeBtn, pressed && styles.storeBtnPressed]}
          onPress={() => handleStorePress(IOS_APP_STORE_URL)}
          {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
        >
          <Ionicons name="logo-apple" size={30} color="#1f2937" style={styles.storeIcon} />
          <View>
            <Text style={styles.storeSmall}>Download on the</Text>
            <Text style={styles.storeLarge}>App Store</Text>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.storeBtn, pressed && styles.storeBtnPressed]}
          onPress={() => handleStorePress(ANDROID_PLAY_STORE_URL)}
          {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
        >
          <Ionicons name="logo-google-playstore" size={26} color="#1f2937" style={styles.storeIcon} />
          <View>
            <Text style={styles.storeSmall}>Get it on</Text>
            <Text style={styles.storeLarge}>Google Play</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#EEF1F4',
  },
  copyCol: {
    flex: 1,
    minWidth: 220,
    gap: 8,
  },
  headline: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtext: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 168,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
    }),
  },
  storeBtnPressed: {
    opacity: 0.92,
  },
  storeIcon: {
    marginTop: 2,
  },
  storeSmall: {
    fontSize: 10,
    color: '#4b5563',
    fontWeight: '500',
  },
  storeLarge: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: -1,
  },
});

/**
 * Formatted bulletin post body (bullets + inline bold/italic/underline).
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

function parseBulletLine(line) {
  const trimmed = String(line || '').trim();
  let content = null;
  if (trimmed.startsWith('•')) {
    content = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('-')) {
    content = trimmed.slice(1).trim();
  } else {
    return null;
  }
  const dashIdx = content.indexOf(' — ');
  if (dashIdx === -1) return { label: null, text: content };
  return {
    label: content.slice(0, dashIdx).trim(),
    text: content.slice(dashIdx + 3).trim(),
  };
}

function renderInlineFormattedText(text, baseStyle, keyPrefix = 'inline') {
  const content = String(text || '');
  if (!content) return null;

  const children = [];
  let remaining = content;
  let tokenKey = 0;

  const pushPlain = (plain) => {
    if (plain) children.push(plain);
  };

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      children.push(
        <Text key={`${keyPrefix}-${tokenKey++}`} style={[baseStyle, styles.bold]}>
          {boldMatch[1]}
        </Text>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const underlineMatch = remaining.match(/^__(.+?)__/);
    if (underlineMatch) {
      children.push(
        <Text key={`${keyPrefix}-${tokenKey++}`} style={[baseStyle, styles.underline]}>
          {underlineMatch[1]}
        </Text>,
      );
      remaining = remaining.slice(underlineMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^_(.+?)_/);
    if (italicMatch) {
      children.push(
        <Text key={`${keyPrefix}-${tokenKey++}`} style={[baseStyle, styles.italic]}>
          {italicMatch[1]}
        </Text>,
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/\*\*|__|_/);
    if (nextSpecial === -1) {
      pushPlain(remaining);
      break;
    }
    if (nextSpecial === 0) {
      pushPlain(remaining[0]);
      remaining = remaining.slice(1);
      continue;
    }
    pushPlain(remaining.slice(0, nextSpecial));
    remaining = remaining.slice(nextSpecial);
  }

  return <Text style={baseStyle}>{children.length ? children : content}</Text>;
}

export default function BulletinLearnadoodleBody({ body, textStyle = null }) {
  const lines = String(body || '').split('\n');
  const elements = [];
  let bulletItems = [];
  const bodyTextStyle = textStyle || styles.bodyText;

  const flushBullets = () => {
    if (bulletItems.length === 0) return;
    elements.push(
      <View key={`bullets-${elements.length}`} style={styles.bulletList}>
        {bulletItems.map((item, index) => (
          <View key={`bullet-${index}`} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <View style={styles.bulletTextWrap}>
              {renderInlineFormattedText(
                item.label ? `${item.label} — ${item.text}` : item.text,
                [bodyTextStyle, styles.bodyTextInBullet],
                `bullet-${index}`,
              )}
            </View>
          </View>
        ))}
      </View>,
    );
    bulletItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      return;
    }

    const bullet = parseBulletLine(trimmed);
    if (bullet) {
      bulletItems.push(bullet);
      return;
    }

    flushBullets();
    elements.push(
      <View key={`line-${index}`}>
        {renderInlineFormattedText(trimmed, bodyTextStyle, `line-${index}`)}
      </View>,
    );
  });
  flushBullets();

  return <View style={styles.wrap}>{elements}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 4,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-wrap',
    }),
  },
  bodyTextInBullet: {
    flex: 1,
  },
  bulletTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  bulletList: {
    gap: 10,
    marginVertical: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#374151',
    marginTop: 10,
    flexShrink: 0,
  },
});

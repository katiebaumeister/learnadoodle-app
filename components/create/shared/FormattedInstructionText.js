/**
 * Read-only instruction body: bullets + inline **bold**, _italic_, __underline__.
 * Web uses the same HTML renderer as InstructionsEditor; native uses Text spans.
 */

import React, { createElement, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { cleanInstructionMarkdown, cleanOrphanMarkdownDelimitersInLine, markdownToHtml } from '../../../lib/instructionTextFormat';

const READONLY_STYLE_ID = 'formatted-instruction-readonly-style-v2';

function ensureReadonlyInstructionStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(READONLY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = READONLY_STYLE_ID;
  style.textContent = `
    .formatted-instruction-readonly {
      font-family: "League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: normal;
      word-break: break-word;
    }
    .formatted-instruction-readonly p {
      margin: 0 0 8px 0;
    }
    .formatted-instruction-readonly p:last-child {
      margin-bottom: 0;
    }
    .formatted-instruction-readonly strong,
    .formatted-instruction-readonly b { font-weight: 700; }
    .formatted-instruction-readonly em,
    .formatted-instruction-readonly i { font-style: italic; }
    .formatted-instruction-readonly u { text-decoration: underline; }
    .formatted-instruction-readonly ul {
      list-style: none;
      margin: 0 0 8px 0;
      padding: 0;
    }
    .formatted-instruction-readonly li {
      position: relative;
      padding-left: 14px;
      margin: 2px 0;
    }
    .formatted-instruction-readonly li::before {
      content: '•';
      position: absolute;
      left: 0;
      top: 0;
    }
  `;
  document.head.appendChild(style);
}

function parseBulletLine(line) {
  const trimmed = String(line || '').trim();
  let content = null;
  if (trimmed.startsWith('•')) {
    content = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
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

function renderInlineFormattedText(text, baseStyle, keyPrefix = 'inline', extraStyles = null) {
  const content = cleanOrphanMarkdownDelimitersInLine(text);
  if (!content) return null;

  const children = [];
  let remaining = content;
  let tokenKey = 0;
  const boldStyle = extraStyles?.bold || styles.bold;
  const italicStyle = extraStyles?.italic || styles.italic;
  const underlineStyle = extraStyles?.underline || styles.underline;

  const pushPlain = (plain) => {
    if (plain) children.push(plain);
  };

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      children.push(
        <Text key={`${keyPrefix}-${tokenKey++}`} style={[baseStyle, boldStyle]}>
          {renderInlineFormattedText(boldMatch[1], baseStyle, `${keyPrefix}-b-${tokenKey}`, extraStyles)}
        </Text>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const underlineMatch = remaining.match(/^__(.+?)__/);
    if (underlineMatch) {
      children.push(
        <Text key={`${keyPrefix}-${tokenKey++}`} style={[baseStyle, underlineStyle]}>
          {renderInlineFormattedText(underlineMatch[1], baseStyle, `${keyPrefix}-u-${tokenKey}`, extraStyles)}
        </Text>,
      );
      remaining = remaining.slice(underlineMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^_([^_\n]+?)_/);
    if (italicMatch) {
      children.push(
        <Text key={`${keyPrefix}-${tokenKey++}`} style={[baseStyle, italicStyle]}>
          {renderInlineFormattedText(italicMatch[1], baseStyle, `${keyPrefix}-i-${tokenKey}`, extraStyles)}
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
      remaining = remaining.slice(1);
      continue;
    }
    pushPlain(remaining.slice(0, nextSpecial));
    remaining = remaining.slice(nextSpecial);
  }

  if (!children.length) {
    return <Text style={baseStyle}>{content}</Text>;
  }
  if (children.length === 1 && typeof children[0] === 'string') {
    return <Text style={baseStyle}>{children[0]}</Text>;
  }
  return <Text style={baseStyle}>{children}</Text>;
}

function NativeFormattedInstructionText({ text, style, wrapStyle }) {
  const cleanedText = useMemo(() => cleanInstructionMarkdown(text), [text]);
  const lines = cleanedText.split('\n');
  const elements = [];
  let bulletItems = [];
  const bodyTextStyle = style || styles.bodyText;

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
      const nextNonEmpty = lines.slice(index + 1).find((candidate) => candidate.trim());
      if (nextNonEmpty && parseBulletLine(nextNonEmpty.trim())) {
        return;
      }
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

  return <View style={[styles.wrap, wrapStyle]}>{elements}</View>;
}

function WebFormattedInstructionText({ text, style, wrapStyle }) {
  useEffect(() => {
    ensureReadonlyInstructionStyles();
  }, []);

  const html = useMemo(() => markdownToHtml(text), [text]);
  const flatStyle = StyleSheet.flatten([styles.bodyText, style, wrapStyle]) || {};

  return createElement('div', {
    className: 'formatted-instruction-readonly',
    dangerouslySetInnerHTML: { __html: html },
    style: {
      fontSize: flatStyle.fontSize || 15,
      lineHeight: flatStyle.lineHeight ? `${flatStyle.lineHeight}px` : '24px',
      color: flatStyle.color || '#374151',
      marginTop: flatStyle.marginTop,
      marginBottom: flatStyle.marginBottom,
    },
  });
}

export default function FormattedInstructionText(props) {
  if (Platform.OS === 'web') {
    return <WebFormattedInstructionText {...props} />;
  }
  return <NativeFormattedInstructionText {...props} />;
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
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
    gap: 6,
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

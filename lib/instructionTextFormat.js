/**
 * Markdown-style instruction text: **bold**, _italic_, __underline__, • bullets.
 * Used by InstructionsEditor (web WYSIWYG) and BulletinLearnadoodleBody (display).
 */

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countToken(line, token) {
  return (String(line || '').match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

/** Remove dangling ** / __ left by partial toolbar toggles in the WYSIWYG editor. */
export function cleanOrphanMarkdownDelimitersInLine(line) {
  let s = String(line || '');
  if (!s) return s;

  while (countToken(s, '**') % 2 !== 0) {
    const last = s.lastIndexOf('**');
    if (last === -1) break;
    s = `${s.slice(0, last)}${s.slice(last + 2)}`;
  }
  while (countToken(s, '__') % 2 !== 0) {
    const last = s.lastIndexOf('__');
    if (last === -1) break;
    s = `${s.slice(0, last)}${s.slice(last + 2)}`;
  }

  // Lone _ used for italic (not part of __).
  const underlineRanges = [];
  const underlineRe = /__/g;
  let underlineMatch = underlineRe.exec(s);
  while (underlineMatch) {
    underlineRanges.push([underlineMatch.index, underlineMatch.index + 2]);
    underlineMatch = underlineRe.exec(s);
  }
  const isInsideUnderline = (idx) => underlineRanges.some(([start, end]) => idx >= start && idx < end);
  let italicCount = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '_' && !isInsideUnderline(i)) italicCount += 1;
  }
  if (italicCount % 2 !== 0) {
    for (let i = s.length - 1; i >= 0; i -= 1) {
      if (s[i] === '_' && !isInsideUnderline(i)) {
        s = `${s.slice(0, i)}${s.slice(i + 1)}`;
        break;
      }
    }
  }

  return s;
}

export function cleanInstructionMarkdown(text) {
  return String(text || '')
    .split('\n')
    .map(cleanOrphanMarkdownDelimitersInLine)
    .join('\n');
}

function applyInlineMarkdown(line) {
  let html = escapeHtml(cleanOrphanMarkdownDelimitersInLine(line));
  let changed = true;
  while (changed) {
    const next = html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/_([^_\n]+?)_/g, '<em>$1</em>');
    changed = next !== html;
    html = next;
  }
  return html.replace(/\*\*/g, '').replace(/__/g, '');
}

const LIST_LINE_RE = /^([•\*\-])\s+(.*)$/;

export function markdownToHtml(text) {
  const cleaned = cleanInstructionMarkdown(text);
  const lines = cleaned.split('\n');
  const blocks = [];
  let bulletBuffer = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    const items = bulletBuffer.map((line) => {
      const listMatch = line.match(LIST_LINE_RE);
      const itemHtml = applyInlineMarkdown(listMatch ? listMatch[2] : line);
      return `<li>${itemHtml || ''}</li>`;
    }).join('');
    blocks.push(`<ul>${items}</ul>`);
    bulletBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      const nextNonEmpty = lines.slice(index + 1).find((candidate) => candidate.trim());
      if (nextNonEmpty && LIST_LINE_RE.test(nextNonEmpty.trim())) {
        return;
      }
      flushBullets();
      return;
    }
    const listMatch = trimmed.match(LIST_LINE_RE);
    if (listMatch) {
      bulletBuffer.push(trimmed);
      return;
    }
    flushBullets();
    blocks.push(`<p>${applyInlineMarkdown(trimmed)}</p>`);
  });
  flushBullets();

  return blocks.join('');
}

function wrapMarkdown(wrapper, content) {
  const inner = Array.from(content || []).map(nodeToMarkdown).join('');
  if (!inner) return '';
  return `${wrapper}${inner}${wrapper}`;
}

function spanStyleMarkdown(node) {
  if (!node?.style) return null;
  const weight = node.style.fontWeight;
  if (weight === 'bold' || weight === '700' || Number(weight) >= 600) {
    return wrapMarkdown('**', node.childNodes);
  }
  const decoration = node.style.textDecoration || node.style.textDecorationLine || '';
  if (String(decoration).includes('underline')) {
    return wrapMarkdown('__', node.childNodes);
  }
  if (node.style.fontStyle === 'italic') {
    return wrapMarkdown('_', node.childNodes);
  }
  return null;
}

export function htmlToMarkdown(root) {
  if (!root) return '';
  return Array.from(root.childNodes).map(nodeToMarkdown).join('');
}

function nodeToMarkdown(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName?.toUpperCase?.() || '';

  if (tag === 'BR') return '\n';
  if (tag === 'STRONG' || tag === 'B') return wrapMarkdown('**', node.childNodes);
  if (tag === 'EM' || tag === 'I') return wrapMarkdown('_', node.childNodes);
  if (tag === 'U') return wrapMarkdown('__', node.childNodes);
  if (tag === 'SPAN') {
    const styled = spanStyleMarkdown(node);
    if (styled != null) return styled;
  }
  if (tag === 'LI') {
    const inner = Array.from(node.childNodes).map(nodeToMarkdown).join('').trim();
    return inner ? `• ${inner.replace(/^[•\-*]\s*/, '')}` : '• ';
  }
  if (tag === 'UL' || tag === 'OL') {
    return Array.from(node.childNodes).map(nodeToMarkdown).filter(Boolean).join('\n');
  }
  if (tag === 'DIV' || tag === 'P') {
    const inner = Array.from(node.childNodes).map(nodeToMarkdown).join('');
    return inner.endsWith('\n') ? inner : `${inner}\n`;
  }

  return Array.from(node.childNodes).map(nodeToMarkdown).join('');
}

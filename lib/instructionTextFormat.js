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

export function markdownToHtml(text) {
  const lines = String(text || '').split('\n');
  return lines.map((line) => {
    let html = escapeHtml(line);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    return html || '<br>';
  }).join('<br>');
}

function wrapMarkdown(wrapper, content) {
  const inner = Array.from(content || []).map(nodeToMarkdown).join('');
  if (!inner) return '';
  return `${wrapper}${inner}${wrapper}`;
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
  if (tag === 'LI') {
    const inner = Array.from(node.childNodes).map(nodeToMarkdown).join('').trim();
    return inner ? `• ${inner.replace(/^[•\-*]\s*/, '')}` : '• ';
  }
  if (tag === 'UL' || tag === 'OL') {
    return Array.from(node.childNodes).map(nodeToMarkdown).filter(Boolean).join('\n');
  }
  if (tag === 'DIV' || tag === 'P') {
    const inner = Array.from(node.childNodes).map(nodeToMarkdown).join('');
    return `${inner}\n`;
  }

  return Array.from(node.childNodes).map(nodeToMarkdown).join('');
}

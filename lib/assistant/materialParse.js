/**
 * Pure helpers for library material chat flows (safe for Node tests without DB).
 */

const STOP = new Set([
  'delete',
  'remove',
  'trash',
  'archive',
  'the',
  'a',
  'an',
  'material',
  'materials',
  'library',
  'book',
  'books',
  'from',
  'my',
  'our',
  'please',
  'this',
  'that',
  'item',
]);

function tokenize(msg) {
  return (msg || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function summarizeMaterialLine(m) {
  if (!m) return '';
  const title = (m.title || 'Untitled').trim();
  const type = (m.type || 'item').trim();
  return `• ${title} (${type})`;
}

/**
 * @returns {{ ok: boolean, material?: object, candidates?: object[], reason?: string }}
 */
export function resolveMaterialFromUserMessage(userMessage, materials) {
  const quoted = userMessage.match(/["']([^"']{2,120})["']/);
  const pool = materials || [];

  if (quoted) {
    const q = quoted[1].toLowerCase();
    const exact = pool.filter((m) => (m.title || '').toLowerCase().includes(q));
    if (exact.length === 1) return { ok: true, material: exact[0] };
    if (exact.length > 1) return { ok: false, candidates: exact.slice(0, 8), reason: 'ambiguous' };
  }

  const words = tokenize(userMessage);
  if (words.length === 0) {
    return { ok: false, reason: 'no_query', candidates: pool.slice(0, 8) };
  }

  const scored = pool.map((m) => {
    const t = `${(m.title || '').toLowerCase()} ${(m.provider_name || '').toLowerCase()}`;
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += w.length >= 4 ? 3 : 2;
    }
    return { m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 2) {
    return { ok: false, reason: 'no_match', candidates: pool.slice(0, 8) };
  }
  const second = scored[1];
  if (second && second.score === best.score && second.m.id !== best.m.id) {
    const tied = scored.filter((s) => s.score === best.score).map((s) => s.m);
    return { ok: false, candidates: tied.slice(0, 8), reason: 'ambiguous' };
  }
  return { ok: true, material: best.m };
}

export function stripMaterialForDisambiguation(m) {
  if (!m) return null;
  return {
    id: m.id,
    title: m.title,
    type: m.type,
  };
}

/**
 * Parse "rename X to Y" / quoted variants for library materials.
 * @returns {{ oldHint: string, newTitle: string } | null}
 */
export function parseRenameMaterialTitles(userMessage) {
  const msg = userMessage.trim();
  const quotedPair =
    msg.match(/\brename\s+["']([^"']{2,120})["']\s+to\s+["']([^"']{2,120})["']/i) ||
    msg.match(/\bretitle\s+["']([^"']{2,120})["']\s+(?:to|as)\s+["']([^"']{2,120})["']/i) ||
    msg.match(
      /\bchange\s+(?:the\s+)?(?:title|name)\s+(?:of|for)\s+["']([^"']{2,120})["']\s+to\s+["']([^"']{2,120})["']/i
    );
  if (quotedPair) {
    return { oldHint: quotedPair[1].trim(), newTitle: quotedPair[2].trim() };
  }

  let m = msg.match(/^\s*rename\s+(.+?)\s+to\s+(.+)$/is);
  if (!m) m = msg.match(/^\s*retitle\s+(.+?)\s+to\s+(.+)$/is);
  if (!m) m = msg.match(/^\s*change\s+(?:the\s+)?(?:title|name)\s+(?:of|for)\s+(.+?)\s+to\s+(.+)$/is);
  if (!m) return null;
  const oldHint = m[1].trim().replace(/^["']|["']$/g, '');
  const newTitle = m[2].trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/g, '');
  if (oldHint.length < 2 || newTitle.length < 1) return null;
  return { oldHint, newTitle };
}

export function extractHttpUrl(msg) {
  const m = (msg || '').match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!m) return null;
  return m[0].replace(/[.,;:!?)]+$/, '');
}

function titleFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const part = host.split('.')[0] || 'Link';
    return part.charAt(0).toUpperCase() + part.slice(1);
  } catch {
    return 'Link';
  }
}

function pickChildFromMessageLower(messageLower, children) {
  if (!Array.isArray(children) || children.length === 0) return null;
  const active = children.filter((c) => !c.archived);
  const pool = active.length ? active : children;
  let best = null;
  let bestLen = 0;
  for (const c of pool) {
    const fn = (c.first_name || '').toLowerCase().trim();
    const full = (c.name || '').toLowerCase().trim();
    const tokens = [fn, full, ...full.split(/\s+/).filter(Boolean)];
    for (const t of tokens) {
      if (t.length >= 2 && messageLower.includes(t) && t.length > bestLen) {
        best = c;
        bestLen = t.length;
      }
    }
  }
  return best;
}

function pickSubjectFromMessageLower(messageLower, subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) return { subjectId: null, subjectName: null };
  const sorted = [...subjects]
    .filter((s) => (s.name || '').trim())
    .sort((a, b) => (b.name || '').length - (a.name || '').length);
  for (const s of sorted) {
    const n = (s.name || '').toLowerCase();
    if (n && messageLower.includes(n)) {
      return { subjectId: s.id ?? null, subjectName: s.name };
    }
  }
  return { subjectId: null, subjectName: null };
}

/**
 * Parse add-link-to-library from chat.
 * @returns {null | { kind: 'need_url' } | { kind: 'ready', title: string, providerUrl: string, childId: string | null, childName: string | null, subjectId: string | null, subjectName: string | null }}
 */
export function parseAddMaterialLinkIntent(userMessage, children = [], subjects = []) {
  const msg = String(userMessage || '').trim();
  if (!msg) return null;

  const lower = msg.toLowerCase();
  const url = extractHttpUrl(msg);

  const wantsAddNoUrl =
    /\b(add|save|put|bookmark|store)\b/i.test(msg) &&
    /\b(material|materials|library|resource|link)\b/i.test(msg) &&
    !/\b(delete|remove|trash|list|show|what|see|view)\b/i.test(msg);

  if (!url) {
    if (wantsAddNoUrl) return { kind: 'need_url' };
    return null;
  }

  const noise =
    /\b(appointment|event|lesson|calendar|meeting|invite|ticket)\b/i.test(lower) &&
    !/\b(library|material|resource|bookmark)\b/i.test(lower);
  if (noise) return null;

  const verbOk = /\b(add|save|put|bookmark|store|include)\b/i.test(msg);
  const nounOk = /\b(material|materials|library|resource|bookmark)\b/i.test(msg);
  const withoutUrl = msg.replace(url, '').replace(/\s+/g, ' ').trim();
  if (!verbOk && !nounOk && withoutUrl.length > 4) return null;

  let title = null;
  const q = msg.match(/["']([^"']{2,120})["']/);
  if (q) title = q[1].trim();
  if (!title) {
    const before = msg.split(url)[0].trim();
    const cleaned = before
      .replace(/\b(add|save|put|material|materials|library|link|the|a|an|this|that|to|our|my|for|from)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 120) {
      title = cleaned.replace(/[.:,\-]+$/g, '').trim();
    }
  }
  if (!title) title = titleFromUrl(url);

  const child = pickChildFromMessageLower(lower, children);
  const childId = child?.id != null ? String(child.id) : null;
  const childName = child ? String(child.first_name || child.name || '').trim() || null : null;
  const { subjectId, subjectName } = pickSubjectFromMessageLower(lower, subjects);

  return {
    kind: 'ready',
    title,
    providerUrl: url,
    childId,
    childName,
    subjectId: subjectId != null ? String(subjectId) : null,
    subjectName,
  };
}

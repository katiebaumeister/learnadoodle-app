/**
 * Offline retrieval for Doodle: scores chunks from APP_GUIDE_MARKDOWN when Supabase
 * vector search (match_chatbot_knowledge) is unavailable or returns nothing.
 */

import { chunkMarkdown } from '../chatbotKnowledgeStore.js';
import { APP_GUIDE_MARKDOWN } from './appGuideMarkdown.js';

let cachedChunks = null;

function getChunks() {
  if (!cachedChunks) {
    cachedChunks = chunkMarkdown(APP_GUIDE_MARKDOWN, { maxChunkChars: 900 });
  }
  return cachedChunks;
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'to',
  'do',
  'does',
  'did',
  'how',
  'i',
  'we',
  'you',
  'it',
  'where',
  'what',
  'when',
  'which',
  'who',
  'why',
  'can',
  'could',
  'would',
  'should',
  'my',
  'me',
  'our',
  'in',
  'on',
  'at',
  'for',
  'and',
  'or',
  'of',
  'as',
  'if',
  'that',
  'this',
  'with',
  'from',
  'into',
  'about',
  'learnadoodle',
  'app',
  'please',
  'tell',
  'get',
  'use',
]);

function tokenizeQuery(q) {
  const lower = String(q || '')
    .toLowerCase()
    .replace(/['']/g, '');
  return lower
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * @param {string} queryText
 * @param {{ limit?: number }} options
 * @returns {Array<{ content: string, similarity: number, source?: string }>}
 */
export function searchLocalAppGuide(queryText, options = {}) {
  const limit = options.limit ?? 6;
  const chunks = getChunks();
  const words = tokenizeQuery(queryText);

  if (words.length === 0) {
    return chunks.slice(0, 3).map((c) => ({
      content: c.content,
      similarity: 0.4,
      source: c.source || 'app_guide',
    }));
  }

  const scored = chunks.map((chunk) => {
    const text = (chunk.content || '').toLowerCase();
    let score = 0;
    for (const w of words) {
      if (text.includes(w)) score += 1;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const positive = scored.filter((s) => s.score > 0).slice(0, limit);
  const picked = positive.length > 0 ? positive : scored.slice(0, limit);

  return picked.map(({ chunk, score }) => ({
    content: chunk.content,
    similarity: Math.min(0.98, 0.45 + Math.min(score, 12) * 0.04),
    source: chunk.source || 'app_guide',
  }));
}

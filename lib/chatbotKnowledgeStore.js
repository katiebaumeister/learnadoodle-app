/**
 * Chatbot vector store: embed text with OpenAI, store in Supabase pgvector, search by similarity.
 * Used for RAG over the app guide so Doodle can direct users ("Go to Records > Subjects to see progress").
 */

import { supabase as defaultSupabase } from './supabase.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MATCH_THRESHOLD = 0.5;

/**
 * Get embedding vector for a single text using OpenAI.
 * @param {string} text
 * @returns {Promise<number[] | null>} 1536-dim vector or null on failure
 */
export async function getEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text?.trim()) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.trim().slice(0, 8000),
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch {
    return null;
  }
}

/**
 * Search chatbot_knowledge by query text (embeds query then similarity search).
 * @param {string} queryText - User question or message
 * @param {{ matchCount?: number, matchThreshold?: number }} options
 * @returns {Promise<Array<{ content: string, source?: string, similarity: number }>>}
 */
export async function searchKnowledge(queryText, options = {}) {
  const matchCount = options.matchCount ?? DEFAULT_MATCH_COUNT;
  const matchThreshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  if (!queryText?.trim()) return [];
  const embedding = await getEmbedding(queryText);
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) return [];
  const supabase = defaultSupabase;
  try {
    const { data, error } = await supabase.rpc('match_chatbot_knowledge', {
      query_embedding: embedding,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Chunk markdown by headings (## or ###) and optional max length. Keeps sections coherent.
 * @param {string} markdown
 * @param {{ maxChunkChars?: number }} options
 * @returns {Array<{ content: string, source?: string }>}
 */
export function chunkMarkdown(markdown, options = {}) {
  const maxChunkChars = options.maxChunkChars ?? 800;
  const chunks = [];
  const sections = markdown.split(/\n(?=## )/).filter(Boolean);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChunkChars) {
      chunks.push({ content: trimmed, source: 'app_guide' });
      continue;
    }
    const subSections = trimmed.split(/\n(?=### )/).filter(Boolean);
    for (const sub of subSections) {
      const t = sub.trim();
      if (!t) continue;
      if (t.length <= maxChunkChars) {
        chunks.push({ content: t, source: 'app_guide' });
        continue;
      }
      for (let i = 0; i < t.length; i += maxChunkChars) {
        const slice = t.slice(i, i + maxChunkChars).trim();
        if (slice) chunks.push({ content: slice, source: 'app_guide' });
      }
    }
  }
  return chunks;
}

/**
 * Upsert chunks into chatbot_knowledge (delete existing from source then insert new).
 * @param {Array<{ content: string, source?: string }>} chunks
 * @param {string} source - e.g. 'app_guide'; only rows with this source are replaced
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient] - optional; use service_role for seeding
 */
export async function upsertChunks(chunks, source = 'app_guide', supabaseClient) {
  const supabase = supabaseClient ?? defaultSupabase;
  if (!chunks?.length) return { inserted: 0, error: null };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { inserted: 0, error: 'OPENAI_API_KEY not set' };
  try {
    const { error: deleteErr } = await supabase
      .from('chatbot_knowledge')
      .delete()
      .eq('source', source);
    if (deleteErr) return { inserted: 0, error: deleteErr.message };
    let inserted = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content);
      if (!embedding) continue;
      const { error: insertErr } = await supabase.from('chatbot_knowledge').insert({
        content: chunk.content,
        source: chunk.source ?? source,
        metadata: {},
        embedding,
      });
      if (!insertErr) inserted += 1;
    }
    return { inserted, error: null };
  } catch (err) {
    return { inserted: 0, error: err?.message ?? 'Unknown error' };
  }
}

/**
 * Seed the vector store from the app guide markdown (run once or when guide changes).
 * Canonical text: lib/appGuide/appGuideMarkdown.js (APP_GUIDE_MARKDOWN). Seed via npm run seed:chatbot-knowledge.
 * @param {string} guideMarkdown - Full content of the app guide
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient] - optional; use service_role for seeding
 * @returns {Promise<{ inserted: number, error: string | null }>}
 */
export async function seedFromGuideMarkdown(guideMarkdown, supabaseClient) {
  const chunks = chunkMarkdown(guideMarkdown, { maxChunkChars: 700 });
  return upsertChunks(chunks, 'app_guide', supabaseClient);
}

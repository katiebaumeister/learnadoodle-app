#!/usr/bin/env node
/**
 * Seed the chatbot vector store from docs/APP_GUIDE_FOR_CHATBOT_VECTOR_STORE.md.
 * Run once after migration and when the guide is updated.
 *
 * Requires: OPENAI_API_KEY, Supabase URL + key (service role for insert/delete).
 * Optional: .env with OPENAI_API_KEY, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: node scripts/seed-chatbot-knowledge.js
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { seedFromGuideMarkdown } from '../lib/chatbotKnowledgeStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const guidePath = join(__dirname, '..', 'docs', 'APP_GUIDE_FOR_CHATBOT_VECTOR_STORE.md');

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required.');
    process.exit(1);
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || (!serviceKey && !anonKey)) {
    console.error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon key; service role required for insert).');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey || anonKey);
  let markdown;
  try {
    markdown = readFileSync(guidePath, 'utf8');
  } catch (e) {
    console.error('Could not read app guide:', guidePath, e.message);
    process.exit(1);
  }
  console.log('Seeding chatbot knowledge from app guide...');
  const { inserted, error } = await seedFromGuideMarkdown(markdown, supabase);
  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
  console.log('Done. Inserted', inserted, 'chunks.');
}

main();

#!/usr/bin/env node
/**
 * Seed the chatbot vector store from lib/appGuide/appGuideMarkdown.js (canonical guide).
 * Run once after migration and when the guide is updated.
 *
 * Requires: OPENAI_API_KEY, Supabase URL + key (service role for insert/delete).
 * Optional: .env with OPENAI_API_KEY, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npm run seed:chatbot-knowledge
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { seedFromGuideMarkdown } from '../lib/chatbotKnowledgeStore.js';
import { APP_GUIDE_MARKDOWN } from '../lib/appGuide/appGuideMarkdown.js';

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
  console.log('Seeding chatbot knowledge from lib/appGuide/appGuideMarkdown.js...');
  const { inserted, error } = await seedFromGuideMarkdown(APP_GUIDE_MARKDOWN, supabase);
  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
  console.log('Done. Inserted', inserted, 'chunks.');
}

main();

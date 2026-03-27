# Doodle app guide (FAQ source)

The **full product guide** used by Ask AI (Doodle) lives in code as a single export:

- **`lib/appGuide/appGuideMarkdown.js`** — `APP_GUIDE_MARKDOWN`

Edit that file to change where Doodle says features live, how planner concepts work, or what to suggest when something is missing.

**Offline retrieval:** The app scores chunks from that markdown in the browser (`lib/appGuide/localGuideSearch.js`) so FAQ answers work even when Supabase vector search is not configured.

**Optional vector seed:** When `chatbot_knowledge` and `match_chatbot_knowledge` exist in your database, run:

```bash
npm run seed:chatbot-knowledge
```

That embeds the same markdown into Supabase; `lib/doodleAssistant.js` merges vector hits with local chunks.

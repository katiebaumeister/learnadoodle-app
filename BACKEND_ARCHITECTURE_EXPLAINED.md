# Why You Need a Server (FastAPI)

## The Difference

### SQL Migration (`001_ai_plans_llm.sql`)
- ✅ Creates database tables (`ai_plans`, `ai_plan_changes`, etc.)
- ✅ Creates database functions (`get_required_minutes`, etc.)
- ✅ Sets up database structure
- ❌ Does NOT create a running API server
- ❌ Does NOT handle HTTP requests
- ❌ Does NOT call OpenAI API

### FastAPI Server (`backend/main.py`)
- ✅ Receives HTTP requests from your frontend
- ✅ Calls OpenAI API (server-side only - keeps keys secret)
- ✅ Processes LLM requests (syllabus parsing, plan suggestions)
- ✅ Interacts with Supabase database
- ❌ Needs to be running to work

## Why You Need a Server

Your frontend calls these endpoints:
- `POST /llm/parse-syllabus` - Needs a server to handle this
- `POST /llm/suggest-plan` - Needs a server to handle this  
- `PATCH /llm/approve` - Needs a server to handle this

**Without a running server, these requests will fail with 404/connection errors.**

## Alternative: Supabase Edge Functions (No Separate Server!)

If you want to avoid running a separate server, you can use **Supabase Edge Functions** instead:

### Benefits:
- ✅ No separate server to manage
- ✅ Scales automatically
- ✅ Included in Supabase Pro plan
- ✅ Runs closer to database (faster)

### How It Works:
1. Create Edge Functions in Supabase
2. Deploy Python/TypeScript functions
3. Call them from frontend via Supabase client
4. No separate server needed!

## Options

### Option 1: Keep FastAPI Server (Current Setup)
- ✅ Full control
- ✅ Easy to test locally
- ✅ Can deploy to Railway/Render/Fly.io
- ❌ Need to manage server
- ❌ Additional hosting cost ($5-20/month)

### Option 2: Migrate to Supabase Edge Functions
- ✅ No separate server
- ✅ Included in Supabase plan
- ✅ Simpler architecture
- ❌ Need to rewrite in TypeScript/Deno
- ❌ Less control over environment

### Option 3: Use Both
- FastAPI for complex LLM processing
- Edge Functions for simple database operations
- Hybrid approach

## Recommendation

**For now:** Keep FastAPI server for LLM features (keeps OpenAI keys secure server-side)

**Later:** Consider migrating to Edge Functions if you want to simplify architecture

## Quick Answer

**SQL = Database structure** (tables, functions)  
**FastAPI = API server** (handles HTTP requests, calls OpenAI)

You need BOTH:
1. SQL migration (✅ you ran this)
2. Running FastAPI server (⏳ you need to start this)

The server handles the actual API requests from your frontend!


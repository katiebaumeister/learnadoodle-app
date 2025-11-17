# FastAPI Development Setup Guide

## Quick Start (5 minutes)

### Step 1: Install Python Dependencies

```bash
cd hi-world-app/backend
pip install -r requirements.txt
```

**If you don't have Python 3.11+, install it first:**
- macOS: `brew install python@3.11`
- Or download from python.org

### Step 2: Set Environment Variables

Create `.env` file in `backend/` directory:

```bash
cd hi-world-app/backend
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# OpenAI Configuration  
OPENAI_API_KEY=sk-your-openai-key-here

# Server Configuration
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000

# Optional JWT
APP_JWT_AUDIENCE=learnadoodle
APP_JWT_ISSUER=supabase
```

**Where to find these:**
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Settings → API
- `OPENAI_API_KEY`: OpenAI Dashboard → API Keys

### Step 3: Start FastAPI Server

```bash
cd hi-world-app/backend
python -m uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

**Keep this terminal open** - the server needs to keep running.

### Step 4: Update Frontend Environment

Create or update `.env` file in `hi-world-app/` directory (root of project):

```bash
cd hi-world-app
# Create .env if it doesn't exist
echo "REACT_APP_API_URL=http://localhost:8000" >> .env
```

Or manually create/edit `.env`:
```bash
REACT_APP_API_URL=http://localhost:8000
```

**Important:** Restart your Expo/React Native dev server after adding this:
```bash
# Stop current server (Ctrl+C), then:
npm start
```

### Step 5: Verify It's Working

**Test 1: Health Check**
```bash
curl http://localhost:8000/health
```

Should return:
```json
{"status":"healthy","service":"learnadoodle-llm-api","version":"1.0.0"}
```

**Test 2: Frontend Connection**
- Open your app in browser
- Open browser console (F12)
- Check that API calls go to `http://localhost:8000/llm/...`

## Troubleshooting

### "Module not found" errors
```bash
# Make sure you're in backend directory
cd hi-world-app/backend
pip install -r requirements.txt
```

### "Port 8000 already in use"
```bash
# Option 1: Use different port
python -m uvicorn main:app --reload --port 8001
# Then update REACT_APP_API_URL=http://localhost:8001

# Option 2: Kill process using port 8000
# macOS/Linux:
lsof -ti:8000 | xargs kill
```

### Frontend can't connect
1. Check FastAPI server is running (see terminal)
2. Check `REACT_APP_API_URL` in `.env` matches server port
3. Restart Expo dev server after changing `.env`
4. Check CORS: Make sure your frontend URL is in `ALLOWED_ORIGINS`

### OpenAI API errors
- Verify `OPENAI_API_KEY` is correct in `.env`
- Check you have credits in OpenAI account
- Check API key permissions

## Development Workflow

**Terminal 1: FastAPI Server**
```bash
cd hi-world-app/backend
python -m uvicorn main:app --reload --port 8000
```
- Leave this running
- Auto-reloads on code changes

**Terminal 2: Frontend (Expo)**
```bash
cd hi-world-app
npm start
```
- Normal Expo dev server

## Next Steps

Once development is working:
1. Test LLM features (syllabus parsing, plan suggestions)
2. When ready for production, see `FASTAPI_DEPLOYMENT.md` for Render setup

## Quick Reference

**Start server:**
```bash
cd backend && python -m uvicorn main:app --reload --port 8000
```

**Stop server:**
Press `Ctrl+C` in the terminal

**Check if running:**
```bash
curl http://localhost:8000/health
```

**View API docs:**
Open http://localhost:8000/docs in browser (FastAPI auto-generates Swagger UI)


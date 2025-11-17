# Quick Start: FastAPI LLM Backend

## 🚀 Development Setup (5 minutes)

### 1. Run SQL Migration
```sql
-- Execute backend/001_ai_plans_llm.sql in Supabase SQL Editor
```

### 2. Install Python Dependencies

**macOS requires a virtual environment:**

```bash
cd hi-world-app/backend

# Option A: Use setup script (recommended)
./setup_venv.sh

# Option B: Manual setup
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**Python version:** Requires Python 3.11+  
**Check version:** `python3 --version`

### 3. Set Environment Variables
```bash
cd hi-world-app/backend
cp .env.example .env
# Edit .env with your keys (see below)
```

**Required `.env` values:**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your-openai-key
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000
```

### 4. Start FastAPI Server

**Option A: Use start script (recommended)**
```bash
cd hi-world-app/backend
./start_dev.sh
```

**Option B: Manual start**
```bash
cd hi-world-app/backend
source venv/bin/activate  # Activate virtual environment
python -m uvicorn main:app --reload --port 8000
```

**Keep this terminal open!** Server needs to keep running.

### 5. Update Frontend Environment
Create/update `.env` in `hi-world-app/` (project root):
```bash
cd hi-world-app
echo "REACT_APP_API_URL=http://localhost:8000" > .env
```

**Restart Expo dev server** after adding this:
```bash
# Stop current server (Ctrl+C), then:
npm start
```

### 6. Test It Works
```bash
curl http://localhost:8000/health
```
Should return: `{"status":"healthy",...}`

## 📝 Environment Variables

Required in `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your-key
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006
```

## 🔗 Frontend Integration

Update your frontend `.env`:
```bash
REACT_APP_API_URL=http://localhost:8000
```

The frontend already has these methods in `apiClient.js`:
- `parseSyllabus()` → `/llm/parse-syllabus`
- `proposeReschedule()` → `/llm/suggest-plan`  
- `approvePlan()` → `/llm/approve`

## 🚢 Deploy

See `FASTAPI_DEPLOYMENT.md` for Railway, Render, Fly.io, or Google Cloud Run.

**Recommended:** Railway ($5/month) or Render (free tier)


# FastAPI Development Checklist

## ✅ Step-by-Step Setup

### 1. SQL Migration (Already Done ✓)
```sql
-- ✅ Execute backend/001_ai_plans_llm.sql in Supabase SQL Editor
```

### 2. Install Python Dependencies

**macOS requires a virtual environment:**

```bash
cd hi-world-app/backend

# Option A: Use setup script (easiest)
./setup_venv.sh

# Option B: Manual setup
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**If you get "externally-managed-environment" error:**
- ✅ Use virtual environment (see above)
- ✅ Never use `--break-system-packages` flag

### 3. Set Backend Environment Variables
```bash
cd hi-world-app/backend
cp .env.example .env
```

Edit `backend/.env` with your actual values:
- `SUPABASE_URL` - From Supabase Dashboard → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Dashboard → Settings → API (⚠️ service role, not anon key)
- `OPENAI_API_KEY` - From OpenAI Dashboard → API Keys

### 4. Start FastAPI Server

**Option A: Use start script (recommended)**
```bash
cd hi-world-app/backend
./start_dev.sh
```

**Option B: Manual start**
```bash
cd hi-world-app/backend
source venv/bin/activate  # Activate virtual environment first!
python -m uvicorn main:app --reload --port 8000
```

**Important:** Always activate venv before running Python commands!

**Keep this terminal open!** The server must keep running.

### 5. Update Frontend Environment
Create/update `.env` in `hi-world-app/` (project root, not backend):

```bash
cd hi-world-app
echo "REACT_APP_API_URL=http://localhost:8000" >> .env
```

**Or manually create/edit `.env`:**
```bash
REACT_APP_API_URL=http://localhost:8000
```

### 6. Restart Frontend Dev Server
```bash
# Stop current Expo server (Ctrl+C)
# Then restart:
cd hi-world-app
npm start
```

### 7. Verify Everything Works

**Test backend:**
```bash
curl http://localhost:8000/health
```

**Test frontend:**
- Open app in browser
- Open browser console (F12)
- Check network tab - API calls should go to `http://localhost:8000/llm/...`

## 🐛 Common Issues

### "python: command not found"
- Use `python3` instead
- Or install Python from python.org

### "Module not found"
- Make sure you're in `backend/` directory
- Try: `pip3 install -r requirements.txt`

### "Port 8000 already in use"
- Change port: `--port 8001`
- Update `REACT_APP_API_URL=http://localhost:8001`

### Frontend can't connect
- ✅ FastAPI server is running?
- ✅ `REACT_APP_API_URL` matches server port?
- ✅ Restarted Expo after changing `.env`?
- ✅ CORS configured? (Check `ALLOWED_ORIGINS` in backend `.env`)

## 📝 Quick Reference

**Start backend:**
```bash
cd backend
source venv/bin/activate  # Activate venv first!
python -m uvicorn main:app --reload --port 8000

# Or use helper script:
./start_dev.sh
```

**Stop backend:**
Press `Ctrl+C`

**View API docs:**
http://localhost:8000/docs (auto-generated Swagger UI)

**Check health:**
```bash
curl http://localhost:8000/health
```

## 🚀 Next: Deploy to Render

Once development is working, see `FASTAPI_DEPLOYMENT.md` for Render deployment.


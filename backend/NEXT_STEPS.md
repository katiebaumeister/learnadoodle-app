# Next Steps: FastAPI Development

## ✅ What's Done

1. ✅ SQL migration executed (`001_ai_plans_llm.sql`)
2. ✅ Virtual environment created (`venv/`)
3. ✅ Python dependencies installed
4. ✅ Frontend API client updated

## 🚀 What's Next

### Step 1: Create Backend `.env` File

```bash
cd hi-world-app/backend
cat > .env << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your-openai-key
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000
EOF
```

**Get your keys:**
- Supabase URL & Service Role Key: Supabase Dashboard → Settings → API
- OpenAI Key: OpenAI Dashboard → API Keys

### Step 2: Start FastAPI Server

**Option A: Use helper script**
```bash
cd hi-world-app/backend
./start_dev.sh
```

**Option B: Manual start**
```bash
cd hi-world-app/backend
source venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```

**Keep this terminal open!** Server auto-reloads on code changes.

### Step 3: Update Frontend Environment

Create/update `.env` in `hi-world-app/` (project root):

```bash
cd hi-world-app
echo "REACT_APP_API_URL=http://localhost:8000" > .env
```

### Step 4: Restart Frontend

```bash
# Stop current Expo server (Ctrl+C)
cd hi-world-app
npm start
```

### Step 5: Test

**Backend health check:**
```bash
curl http://localhost:8000/health
```

**View API docs:**
Open http://localhost:8000/docs in browser

## 📋 Quick Commands

**Start server:**
```bash
cd backend && ./start_dev.sh
```

**Stop server:**
Press `Ctrl+C` in the terminal running the server

**Test health:**
```bash
curl http://localhost:8000/health
```

## 🐛 Troubleshooting

**"Module not found"**
- Make sure venv is activated: `source venv/bin/activate`
- Check you're in `backend/` directory

**"Port 8000 already in use"**
- Change port in `.env`: `PORT=8001`
- Update frontend `.env`: `REACT_APP_API_URL=http://localhost:8001`

**Frontend can't connect**
- ✅ Server running? (check terminal)
- ✅ `REACT_APP_API_URL` matches server port?
- ✅ Restarted Expo after changing `.env`?

## 🎯 You're Ready!

Once the server is running and frontend is connected, you can:
- Parse syllabi: `parseSyllabus()` in frontend
- Suggest plans: `proposeReschedule()` in frontend  
- Approve changes: `approvePlan()` in frontend

All LLM calls happen server-side only (secure!) 🚀


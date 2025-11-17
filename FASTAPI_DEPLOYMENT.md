# FastAPI Deployment Guide

## Overview

The FastAPI backend provides LLM-powered features:
- `/llm/parse-syllabus` - Parse PDF/text syllabi using OpenAI
- `/llm/suggest-plan` - Generate schedule proposals using LLM
- `/llm/approve` - Apply approved changes atomically

## Prerequisites

1. **Run SQL migration:**
   Execute `backend/001_ai_plans_llm.sql` in Supabase SQL Editor

2. **Environment variables:**
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # NEVER expose to browser
   OPENAI_API_KEY=your_openai_key  # Server-side only
   PORT=8000
   ALLOWED_ORIGINS=http://localhost:19006,https://your-domain.com
   ```

## Local Development

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

## Deployment Options

### Option 1: Railway (Recommended)

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Deploy:**
   ```bash
   cd backend
   railway init
   railway up
   ```

3. **Set environment variables** in Railway dashboard

4. **Cost:** $5/month starter, scales with usage

### Option 2: Render

1. **Create Web Service** at render.com
2. **Connect GitHub repo**
3. **Settings:**
   - Build Command: `pip install -r backend/requirements.txt`
   - Start Command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Environment: Python 3.11

4. **Set environment variables**

5. **Cost:** Free tier (sleeps), $7/month always-on

### Option 3: Fly.io

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create app:**
   ```bash
   cd backend
   fly launch
   ```

3. **Set secrets:**
   ```bash
   fly secrets set SUPABASE_URL=...
   fly secrets set SUPABASE_SERVICE_ROLE_KEY=...
   fly secrets set OPENAI_API_KEY=...
   ```

4. **Deploy:**
   ```bash
   fly deploy
   ```

5. **Cost:** Pay-as-you-go (~$2-5/month for small apps)

### Option 4: Google Cloud Run

1. **Create Dockerfile:**
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY backend/requirements.txt .
   RUN pip install -r requirements.txt
   COPY backend/ .
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
   ```

2. **Deploy:**
   ```bash
   gcloud run deploy learnadoodle-llm \
     --source . \
     --platform managed \
     --region us-central1 \
     --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,OPENAI_API_KEY=...
   ```

3. **Cost:** Pay-per-request, very cheap

## Frontend Integration

Update `.env` or environment:
```bash
REACT_APP_API_URL=https://your-fastapi-domain.com
```

The frontend `apiClient.js` already has the methods:
- `parseSyllabus()` → `/llm/parse-syllabus`
- `proposeReschedule()` → `/llm/suggest-plan`
- `approvePlan()` → `/llm/approve`

## Security Notes

1. **Never expose service role key** - Only use in backend
2. **Rate limiting** - Consider adding rate limits per family
3. **API keys** - Keep OpenAI key server-side only
4. **CORS** - Configure `ALLOWED_ORIGINS` properly

## Monitoring

- Health check: `GET /health`
- Logs: Check hosting platform logs
- Errors: FastAPI automatically logs exceptions

## Cost Estimate

- **Hosting:** $5-20/month (Railway/Render)
- **OpenAI API:** ~$10-60/month for 100 active families
- **Total:** ~$15-80/month


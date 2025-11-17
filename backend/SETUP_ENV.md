# Setting Up Backend `.env` File

## Create the File

```bash
cd hi-world-app/backend
touch .env
```

## Required Values

### 1. Supabase URL
**Where to find:** Supabase Dashboard → Settings → API → Project URL

```bash
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
```

**Example:**
```bash
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
```

### 2. Supabase Service Role Key ⚠️ IMPORTANT
**Where to find:** Supabase Dashboard → Settings → API → `service_role` key (NOT `anon` key)

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important:** 
- ✅ Use `service_role` key (bypasses RLS)
- ❌ Do NOT use `anon` key
- ⚠️ Never expose this key to the browser/frontend

**Example:**
```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjE2MjM5MDIyfQ.xxxxxxxxxxxxx
```

### 3. OpenAI API Key
**Where to find:** OpenAI Dashboard → API Keys → Create new secret key

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

**Example:**
```bash
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

### 4. Server Port (Optional)
```bash
PORT=8000
```

### 5. Allowed Origins (CORS)
```bash
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000
```

**Add your production domain when ready:**
```bash
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000,https://your-domain.com
```

### 6. Google OAuth Configuration (for Google Calendar integration)
**Where to find:** Google Cloud Console → APIs & Services → Credentials

```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/calendar/oauth/callback
```

**For local development:**
```bash
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/calendar/oauth/callback
```

**Important:** 
- The `GOOGLE_REDIRECT_URI` must match EXACTLY what's configured in Google Cloud Console
- Add both development and production URIs in Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs
- See troubleshooting section below if you get `redirect_uri_mismatch` errors

## Complete `.env` Template

Copy this and fill in your actual values:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-actual-service-role-key-here

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-actual-openai-key-here

# Server Configuration
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000

# Google OAuth Configuration (optional, for Google Calendar integration)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/calendar/oauth/callback

# Optional JWT Configuration
APP_JWT_AUDIENCE=learnadoodle
APP_JWT_ISSUER=supabase
```

## Quick Setup Command

```bash
cd hi-world-app/backend
cat > .env << 'EOF'
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
OPENAI_API_KEY=sk-proj-your-openai-key-here
PORT=8000
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:3000
EOF
```

Then edit `.env` with your actual values.

## Security Notes

1. **Never commit `.env` to git** - It's already in `.gitignore`
2. **Service Role Key** - Only use in backend, never in frontend
3. **OpenAI Key** - Keep server-side only
4. **Check `.env` is ignored:**
   ```bash
   git check-ignore backend/.env
   ```
   Should return: `backend/.env`

## Verify Your `.env` is Correct

After creating `.env`, test it:

```bash
cd hi-world-app/backend
source venv/bin/activate
python -c "from dotenv import load_dotenv; import os; load_dotenv(); print('SUPABASE_URL:', os.getenv('SUPABASE_URL')[:30] + '...' if os.getenv('SUPABASE_URL') else 'NOT SET'); print('OPENAI_API_KEY:', 'SET' if os.getenv('OPENAI_API_KEY') else 'NOT SET')"
```

## Troubleshooting

### Google OAuth `redirect_uri_mismatch` Error

If you see `Error 400: redirect_uri_mismatch` when connecting Google Calendar:

1. **Check your current redirect URI:**
   - Look at your backend `.env` file for `GOOGLE_REDIRECT_URI`
   - If not set, it defaults to `http://localhost:8000/api/google/calendar/oauth/callback`

2. **Update Google Cloud Console:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to: APIs & Services → Credentials
   - Click on your OAuth 2.0 Client ID
   - Under "Authorized redirect URIs", add:
     - `http://localhost:8000/api/google/calendar/oauth/callback` (for development)
     - `https://your-production-domain.com/api/google/calendar/oauth/callback` (for production)
   - Click "Save"

3. **Verify your backend `.env`:**
   ```bash
   # For development
   GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/calendar/oauth/callback
   
   # For production (replace with your actual domain)
   GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/calendar/oauth/callback
   ```

4. **Restart your backend server** after updating `.env`

**Important:** The redirect URI in your `.env` file must match EXACTLY (including protocol, domain, port, and path) what's configured in Google Cloud Console.

## Next Steps

Once `.env` is created:
1. ✅ Start server: `./start_dev.sh`
2. ✅ Update frontend `.env`: `REACT_APP_API_URL=http://localhost:8000`
3. ✅ Restart frontend dev server


# Setting Up Express Server for AI Rescheduling

The Express server provides the `/api/ai/propose-reschedule` endpoint. Here's how to set it up:

## Step 1: Fix Module System Issue

The `server.js` uses CommonJS (`require`) but route files use ES modules (`export`). You need to convert `server.js` to ES modules.

**Option A: Convert server.js to ES modules (Recommended)**

1. Rename `server.js` to `server.mjs` OR add `"type": "module"` to `package-server.json`

2. Update `server.mjs` (or `server.js` with `"type": "module"`):

```javascript
// Express server setup for Schedule Rules & AI Planner API
import express from 'express';
import cors from 'cors';
import { setupAPIRoutes } from './lib/apiRoutes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
setupAPIRoutes(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'schedule-rules-api',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`🚀 Schedule Rules API server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📅 ICS Calendar feeds available at: http://localhost:${PORT}/api/ics/`);
    console.log(`🤖 AI Planner endpoints: http://localhost:${PORT}/api/planner/`);
    console.log(`🤖 AI Rescheduling endpoints: http://localhost:${PORT}/api/ai/`);
  });
}

export default app;
```

**Option B: Keep CommonJS and convert routes**

Keep `server.js` as CommonJS and convert route files to CommonJS (more work, not recommended).

## Step 2: Set Up Environment Variables

Create a `.env` file in the `hi-world-app` directory:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Express Server Port (optional, defaults to 3001)
PORT=3001

# API Base URL for frontend (optional)
REACT_APP_API_URL=http://localhost:3001
```

## Step 3: Install Dependencies

Make sure you have the server dependencies installed:

```bash
cd hi-world-app
npm install express cors @supabase/supabase-js dotenv
# OR if using package-server.json:
npm install --package-lock-only --package=package-server.json
```

## Step 4: Start the Server

**Development mode (with auto-reload):**

```bash
npm run dev
# OR if you added nodemon:
npx nodemon server.mjs
```

**Production mode:**

```bash
node server.mjs
# OR:
npm start
```

## Step 5: Verify It's Working

1. **Check health endpoint:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Test the propose-reschedule endpoint:**
   ```bash
   curl -X POST http://localhost:3001/api/ai/propose-reschedule \
     -H "Content-Type: application/json" \
     -d '{
       "familyId": "your-family-id",
       "weekStart": "2025-11-03",
       "childIds": ["child-id-1"],
       "horizonWeeks": 2,
       "reason": "blackout"
     }'
   ```

## Step 6: Update Frontend API URL

In your `.env` file or environment variables, set:

```bash
REACT_APP_API_URL=http://localhost:3001
```

Or if deploying, set it to your production API URL.

## Troubleshooting

### Issue: "Cannot find module" errors
- Make sure all route files use `.js` extension in imports
- Check that `package.json` has `"type": "module"` if using ES modules

### Issue: "Route not found" (404)
- Verify `setupAPIRoutes` is called before the 404 handler
- Check that `createAIReschedulingRoutes(app)` is called in `apiRoutes.js`

### Issue: CORS errors
- Make sure `cors()` middleware is applied
- Check that frontend is making requests to correct URL

### Issue: Supabase connection errors
- Verify `.env` file has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Check that Supabase client is initialized correctly in `lib/supabase.js`

## Quick Start Script

Create `start-server.sh`:

```bash
#!/bin/bash
cd hi-world-app
export NODE_ENV=development
export PORT=3001
node server.mjs
```

Make it executable:
```bash
chmod +x start-server.sh
./start-server.sh
```


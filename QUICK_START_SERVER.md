# Quick Start: Express Server for AI Rescheduling

## Setup Steps

1. **Install dependencies:**
   ```bash
   cd hi-world-app
   npm install express cors @supabase/supabase-js dotenv nodemon
   ```

2. **Create `.env` file** (if you don't have one):
   ```bash
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   PORT=3001
   ```

3. **Start the server:**
   ```bash
   node server.js
   ```
   
   Or for development with auto-reload:
   ```bash
   npx nodemon server.js
   ```

4. **Verify it's working:**
   ```bash
   curl http://localhost:3001/health
   ```
   
   Should return: `{"status":"healthy",...}`

5. **Set frontend API URL** (in your `.env` or environment):
   ```bash
   REACT_APP_API_URL=http://localhost:3001
   ```

That's it! The `/api/ai/propose-reschedule` endpoint will now be available.

## Troubleshooting

- **Port already in use?** Change `PORT` in `.env` or kill the process using port 3001
- **Module errors?** Make sure you installed all dependencies
- **Route not found?** Check that the server started successfully and check console logs


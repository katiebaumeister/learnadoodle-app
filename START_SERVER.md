# Starting the FastAPI Server

## Quick Start

1. **Make sure `.env` is configured** (you've done this ✅)

2. **Start the server:**
   ```bash
   cd hi-world-app/backend
   ./start_dev.sh
   ```

   Or manually:
   ```bash
   cd hi-world-app/backend
   source venv/bin/activate
   python -m uvicorn main:app --reload --port 8000
   ```

3. **You should see:**
   ```
   ✅ Starting server on http://localhost:8000
   📚 API docs available at http://localhost:8000/docs
   INFO:     Uvicorn running on http://0.0.0.0:8000
   INFO:     Application startup complete.
   ```

4. **Keep this terminal open!** The server needs to keep running.

## Test the Server

In a **new terminal**:
```bash
curl http://localhost:8000/health
```

Should return:
```json
{"status":"healthy","service":"learnadoodle-llm-api","version":"1.0.0"}
```

## Update Frontend

Frontend `.env` is already updated with:
```bash
REACT_APP_API_URL=http://localhost:8000
```

**Restart your Expo dev server** to pick up the change:
```bash
# Stop current server (Ctrl+C)
cd hi-world-app
npm start
```

## View API Documentation

Open in browser: http://localhost:8000/docs

This shows all available endpoints and lets you test them!

## Troubleshooting

**Server won't start:**
- Check `.env` file exists and has all required values
- Check no other process is using port 8000
- Look for error messages in terminal

**"Module not found":**
- Make sure venv is activated: `source venv/bin/activate`
- Check you're in `backend/` directory

**Frontend can't connect:**
- ✅ Server running? (check terminal)
- ✅ `REACT_APP_API_URL=http://localhost:8000` in frontend `.env`?
- ✅ Restarted Expo after changing `.env`?

## Next Steps

Once server is running:
1. ✅ Test health endpoint
2. ✅ View API docs at http://localhost:8000/docs
3. ✅ Restart frontend dev server
4. ✅ Test LLM features in your app!


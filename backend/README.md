# FastAPI Backend for LLM Features

## Setup

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Set environment variables:**
   Create `.env` file:
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_DB_URL=postgresql://service_role_key@db.<project>.supabase.co:5432/postgres
   OPENAI_API_KEY=your_openai_key
   PORT=8000
   ALLOWED_ORIGINS=http://localhost:19006,https://your-domain.com
   METRICS_ALLOWED_EMAILS=you@example.com
   REFRESH_SECRET=your_random_secret_for_cron_endpoint  # Optional, for /api/external/refresh endpoint
   ```

3. **Run migrations:**
   Execute `001_ai_plans_llm.sql` in Supabase SQL Editor

4. **Start server:**
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```

## External Course Ingestion (Slice 1)

Populate the `external_courses`, `external_units`, and `external_lessons` tables with link-only providers:

1. **Ensure indexes are applied**
   ```sql
   -- Run once in Supabase SQL editor
   \i add-external-content-indexes.sql
   \i update-schedule-external-course.sql
   \i add-external-progress.sql
   ```

2. **Run the ingestion script (sample data)**
   ```bash
   cd backend
   source venv/bin/activate  # if using virtualenv
   python tasks/ingest_external_courses.py
   ```
   - Uses `tasks/samples/khan_algebra.json`
   - Call with a custom spec: `python tasks/ingest_external_courses.py path/to/spec.json`
   - The script paraphrases titles via OpenAI if `OPENAI_API_KEY` is set, otherwise falls back to heuristic cleaning.

3. **Verify data**
   ```bash
   curl -H "Authorization: Bearer <supabase_access_token>" http://localhost:8000/api/external/courses
   curl -H "Authorization: Bearer <supabase_access_token>" http://localhost:8000/api/external/courses/<course_id>/outline
   curl -H "Authorization: Bearer <token>" "http://localhost:8000/api/external/progress?child_id=<child_id>"
   curl -H "Authorization: Bearer <token>" -X POST http://localhost:8000/api/external/progress \
     -H "Content-Type: application/json" \
     -d '{"child_id":"<child_id>","external_lesson_id":"<lesson_id>","status":"in_progress"}'
   curl -H "Authorization: Bearer <token>" http://localhost:8000/api/external/metrics
   ```
   (Authenticate with a Supabase session token; the routes now require auth and are rate-limited.)

4. **Set up nightly refresh cron job**
   
   The refresh job checks for changes in course metadata and updates courses that have been modified.
   
   **Option A: External Cron (Recommended)**
   ```bash
   # Add to crontab (runs daily at 2 AM UTC)
   0 2 * * * cd /path/to/app/hi-world-app && source backend/venv/bin/activate && python backend/tasks/refresh_external_courses.py
   
   # Or test manually:
   python backend/tasks/refresh_external_courses.py --dry-run  # Check for changes without updating
   python backend/tasks/refresh_external_courses.py --limit 5  # Refresh only 5 courses
   ```
   
   **Option B: pg_cron (if available in Supabase)**
   ```sql
   -- Run in Supabase SQL Editor
   \i add-external-refresh-cron.sql
   
   -- Check refresh status
   SELECT * FROM external_courses_refresh_status;
   
   -- Manually trigger refresh (for testing)
   SELECT trigger_external_course_refresh();
   ```
   
   **Option C: Cloud Scheduler (e.g., Vercel Cron, Railway Cron)**
   - Set up a scheduled job that calls: `python backend/tasks/refresh_external_courses.py`
   - Or use the FastAPI endpoint (requires REFRESH_SECRET env var):
     ```bash
     curl -X POST "http://localhost:8000/api/external/refresh?secret=your_refresh_secret&dry_run=false"
     ```

5. **Next steps** (future slices)
   - Add a real crawler and paraphrase pipeline per provider
   - Map `subject_key` / `stage_key`
   - Implement progress tracking and idempotent scheduling

## Testing

```bash
# Health check
curl http://localhost:8000/health

# Parse syllabus
curl -X POST http://localhost:8000/llm/parse-syllabus \
  -H 'Content-Type: application/json' \
  -d '{
    "syllabus_id": "abc123",
    "storage_bucket": "syllabi",
    "storage_path": "family123/math.pdf",
    "family_id": "86ba8b4b-e138-4af3-949d-ac2e1d3a00c9"
  }'

# Suggest plan
curl -X POST http://localhost:8000/llm/suggest-plan \
  -H 'Content-Type: application/json' \
  -d '{
    "family_id": "86ba8b4b-e138-4af3-949d-ac2e1d3a00c9",
    "week_start": "2025-11-03",
    "child_ids": ["child-id-1"],
    "horizon_weeks": 2,
    "reason": "trip"
  }'

# Approve changes
curl -X PATCH http://localhost:8000/llm/approve \
  -H 'Content-Type: application/json' \
  -d '{
    "plan_id": "plan-uuid",
    "approvals": [
      {"change_id": "change-1", "approved": true},
      {"change_id": "change-2", "approved": true, "edits": {"start": "2025-11-06T14:00:00Z"}}
    ]
  }'
```

## Deployment

### Railway
1. Connect GitHub repo
2. Set environment variables
3. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Render
1. Create new Web Service
2. Set build command: `pip install -r backend/requirements.txt`
3. Set start command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Set environment variables

### Fly.io
1. `fly launch`
2. Set environment variables
3. Deploy


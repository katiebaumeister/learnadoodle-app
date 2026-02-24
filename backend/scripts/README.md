# Backend scripts

## seed_state_requirements

Seeds the `state_requirements` table from `backend/data/state_requirements.json`.  
**DB is source of truth;** the JSON is the import artifact. Run after applying the migration that adds `requirement_key` and `obligation_type`.

**Prerequisites:** Backend deps and Supabase env (e.g. `backend/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). From repo root: `pip install -r backend/requirements.txt` (or use your backend venv).

**Run from repo root:**
```bash
python3 -m backend.scripts.seed_state_requirements
```

**Or from backend directory:**
```bash
cd backend && python3 scripts/seed_state_requirements.py
```

Upserts by `(state_code, requirement_key)`. Safe to run repeatedly (idempotent).

**Optional — JSON-only rows:** If you want only JSON-sourced requirements (e.g. after migrating off legacy data), delete legacy rows before or after seeding:
```sql
DELETE FROM state_requirements WHERE requirement_key IS NULL;
```
Run this only if you are sure no other process inserts rows without `requirement_key`.

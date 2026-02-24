# Compliance deployment checklist

After seeding `state_requirements` and applying the grants migration, use your normal deploy process for API and frontend.

---

## Deploy API + frontend (as you usually do)

- **Frontend:** Push to GitHub; Vercel auto-deploys. No extra steps for compliance.
- **Backend (if separate):** Deploy as usual (e.g. Render, Railway, Fly). The Records API reads state requirements from the DB first and falls back to JSON if the table is empty for a state.

See **DEPLOYMENT-GUIDE.md** and **FASTAPI_DEPLOYMENT.md** for full setup details.

---

## Optional later

- **JSON-only rows**  
  If you want only JSON-sourced requirements (no legacy rows):

  ```sql
  DELETE FROM state_requirements WHERE requirement_key IS NULL;
  ```

  Run only when you’re sure nothing else inserts rows without `requirement_key`.  
  See **backend/scripts/README.md** for the seed and this note.

---

## Implemented (no longer deferred)

- **ETag / Last-Modified** – `GET /api/records/state_requirements` returns `ETag` and `Last-Modified` when data is from DB; supports `If-None-Match` / `If-Modified-Since` for 304.
- **UI for source + verified** – Compliance checklist items show source link and “Last verified” when present; disclaimer text added.
- **Admin “Mark verified”** – `POST /api/records/state_requirements/{id}/verify` (optional body `{ "notes": "..." }`); “Mark verified” button in Compliance Dashboard.
- **Versioning/audit** – `state_requirement_audit` table and trigger on `state_requirements`; `verified_by`, `verified_at`, `verification_notes` on `state_requirements`.

---

## Summary

- DB is source of truth; JSON is seed and temporary fallback.
- Seed has been run; grants migration applied.
- Deploy API and frontend with your usual process; no extra steps required for compliance.

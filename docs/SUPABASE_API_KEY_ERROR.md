# "No API key found in request" (500)

If you see:

```json
{"message":"No API key found in request","hint":"No `apikey` request header or url param was found."}
```

with a **500** response, Supabase is rejecting a request because the `apikey` header (or param) is missing or empty.

## Causes

1. **Frontend (app)**  
   The Supabase JS client needs the **anon key** when it’s created. If `REACT_APP_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are not set (or are empty) in the environment where the app runs, the client can send requests without a key.

2. **Backend**  
   Any server-side call to Supabase (e.g. Auth Admin API, PostgREST) must send the **service role key** (or anon key, depending on use) in the `apikey` header. If the env var for that key is missing or wrong, you get this error.

## Fixes

### Frontend (Vercel / Netlify / etc.)

- Set in your hosting env:
  - `REACT_APP_SUPABASE_URL` = your project URL (e.g. `https://xxx.supabase.co`)
  - `REACT_APP_SUPABASE_ANON_KEY` = your project’s **anon** (public) key  
  (For Expo, use `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.)
- Redeploy after changing env vars so the build gets the new values.

The app code uses fallbacks for URL/key when env is missing, but in **production** you should always set these so the correct project and key are used.

### Backend

- Ensure the backend env has the Supabase keys your code uses, for example:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (for admin/auth APIs)
- Restart the backend after changing env vars.

### Check where the 500 comes from

- **Browser Network tab:** See whether the failing request goes to `*.supabase.co` (Supabase) or to your own API (e.g. `api.learnadoodle.com`). If it’s your API, the backend is the one calling Supabase without a key (or with a bad one).
- **Supabase Dashboard → Logs:** Check Auth / API logs to see which request is missing the key.

## Code change (already done)

`lib/supabase.js` now treats empty or whitespace-only URL/key from env as “missing” and falls back to the dev URL/key, so the client is never created with an empty key. Production should still set the env vars above.

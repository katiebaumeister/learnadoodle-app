# Testing locally (without pushing to Git)

Run the app on your machine so you can test UI and invite flow before deploying.

## 1. Run the web app locally

From the **hi-world-app** folder:

```bash
cd hi-world-app
npm run web
```

Expo will start the dev server (often at **http://localhost:8081**). Open that URL in your browser. Code changes will hot-reload.

- **Use production API:** If you have a `.env` with `EXPO_PUBLIC_API_URL=https://api.learnadoodle.com` (or `REACT_APP_API_URL`), the local frontend will talk to your live API and Supabase. Good for testing invite modal, Family panel, etc. with real data.
- **Use local API:** If you run the backend locally (see below), the app will use `http://localhost:8001` when you're on port 8081, so you can test full invite flow (including the URL the API returns).

## 2. (Optional) Run the backend locally

If you want to test the **new invite URL** (learnadoodle.com/invites/...) from the API without redeploying the backend:

```bash
cd hi-world-app/backend
# Create a venv if you don't have one
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
# Set env (e.g. copy from .env.example and add your keys)
export INVITE_LANDING_URL=https://learnadoodle.com   # optional, this is the default
uvicorn main:app --reload --port 8001
```

Then run the frontend with `npm run web` from `hi-world-app`. The app will call `http://localhost:8001` and get the new invite URL from the API.

## 3. Test the invite landing page locally

- **Landing URL:** Open `http://localhost:8081/invites/SOME_TOKEN` (use a real invite token from your DB or from a test invite). You should see the “You're invited” landing; “Continue to Learnadoodle” will send you to `http://localhost:8081/invite/TOKEN` (same origin when local).
- **Modal:** Send an invite from Family Members; the modal should show the normalized link (`https://learnadoodle.com/invites/...`) even if the API still returns the old URL.

## Quick reference

| Goal                         | Command / Setup |
|-----------------------------|------------------|
| Frontend only (prod API)    | `npm run web` + `.env` with `EXPO_PUBLIC_API_URL=https://api.learnadoodle.com` |
| Frontend + local API       | Terminal 1: `cd backend && uvicorn main:app --reload --port 8001`; Terminal 2: `npm run web` |
| Test invite modal / links  | Use “Invite parent/child/tutor” and check the “Invite Sent Successfully!” modal and copied link |

No need to push to Git until you're ready to deploy.

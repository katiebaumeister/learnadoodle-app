# Supabase Auth: Verification Email via Postmark (No Localhost Links)

## Problem

New user verification emails are sent by Supabase’s default mailer and the confirmation link points to **localhost** instead of your app (e.g. learnadoodle.com). Invites already go through Postmark; verification should use the same provider and the correct app URL.

## Solution

1. **Configure Supabase Auth to use Postmark SMTP** so confirmation (and password reset) emails are sent via Postmark, like invite emails.
2. **Set Site URL and Redirect URLs** in Supabase so the link in the email goes to your app, not localhost.
3. **App code** already passes `emailRedirectTo` on sign-up so the confirmation redirect uses the correct origin.

---

## 1. Postmark SMTP in Supabase

Use the **same** Postmark server (and token) you use for invite emails.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Project Settings** (gear) → **Authentication** → **SMTP Settings**.
3. Enable **Custom SMTP** and set:

| Setting        | Value |
|----------------|--------|
| **Sender email** | Same as invites, e.g. `contact@learnadoodle.com` (must be verified in Postmark) |
| **Sender name**  | `Learnadoodle` |
| **Host**         | `smtp.postmarkapp.com` |
| **Port**         | `587` |
| **Username**     | Your Postmark **Server API Token** (same as `POSTMARK_API_TOKEN` in backend) |
| **Password**     | Same Server API Token |

4. Save. Supabase will send all auth emails (confirm signup, password reset, etc.) through Postmark.

---

## 2. Site URL and Redirect URLs (Fix Localhost Link)

The confirmation link in the email is built using Supabase’s **Site URL**. If that is localhost or wrong, the link will point to localhost.

1. In the same project: **Project Settings** → **Authentication**.
2. **URL Configuration**:
   - **Site URL**: Your production app URL, e.g. `https://learnadoodle.com` or `https://www.learnadoodle.com` (no trailing slash).
   - **Redirect URLs**: Add every URL where users may land after confirmation or password reset, for example:
     - `https://learnadoodle.com/**`
     - `https://www.learnadoodle.com/**`
     - `http://localhost:3000/**` (only if you test email confirmation locally)
     - The app sends new users to `/set-password` after they click “Confirm Email”; the `/**` pattern allows that path.

3. Save.

After this, new signup confirmation emails will:
- Be sent via **Postmark** (same as invites).
- Contain a link that redirects to your **production URL** (or the origin you set), not localhost.

---

## 3. App Code (Already Done)

- **`lib/supabase.js`**: `auth.signUp` accepts `options.emailRedirectTo` and passes it to Supabase.
- **`contexts/AuthContext.js`**: On sign-up, passes the current site URL as `emailRedirectTo` using:
  - `REACT_APP_SITE_URL` or `EXPO_PUBLIC_SITE_URL` if set, otherwise
  - `window.location.origin` on web.

So the redirect after the user clicks “Confirm” in the email goes to your app. For production, you can set:

```bash
REACT_APP_SITE_URL=https://learnadoodle.com
EXPO_PUBLIC_SITE_URL=https://learnadoodle.com
```

so the redirect is always your canonical URL even when the app is opened from another host.

---

## 4. Optional: Customize Email Templates in Supabase

To match your brand (e.g. Learnadoodle):

1. **Project Settings** → **Authentication** → **Email Templates**.
2. Edit **Confirm signup** (and optionally **Reset password**).
3. You can change subject and body; the link **must** use `{{ .ConfirmationURL }}` so it includes the redirect. Do **not** replace it with `{{ .SiteURL }}` or a static URL, or the redirect to `/set-password` will not work.

A ready-to-paste **Confirm signup** template with black “Confirm Email” button and white text is in **[docs/SUPABASE_CONFIRM_SIGNUP_EMAIL_TEMPLATE.html](../docs/SUPABASE_CONFIRM_SIGNUP_EMAIL_TEMPLATE.html)**. Copy the full HTML (skip the comment block at the top) into the Confirm signup **Message body** in Supabase.

---

## Checklist

- [ ] Postmark SMTP configured in Supabase (Authentication → SMTP Settings).
- [ ] Site URL set to production app URL (e.g. `https://learnadoodle.com`).
- [ ] Redirect URLs include `https://learnadoodle.com/set-password` and `https://learnadoodle.com/**`.
- [ ] Confirm signup email template uses `{{ .ConfirmationURL }}` (not `{{ .SiteURL }}`) so the link includes `redirect_to`.
- [ ] Sender email used in SMTP is verified in Postmark (same as invites).
- [ ] (Optional) `REACT_APP_SITE_URL` / `EXPO_PUBLIC_SITE_URL` set in production env.

After this, new user verification emails route through Postmark and the confirmation link points to your app instead of localhost.

## Troubleshooting: Confirm link goes to landing page or invalid link

**Root cause:** Auth tokens and errors are in the URL hash. If Supabase redirects to `www.learnadoodle.com` and your server redirects www→non-www, the hash is dropped and the user sees the invalid link page with no context.

1. **Site URL must be non-www** – Supabase Dashboard → Authentication → URL Configuration. Set **Site URL** to `https://learnadoodle.com` (no `www`). If it’s `https://www.learnadoodle.com`, Supabase redirects to www, your server redirects www→non-www, and the hash is lost.
2. **Redirect URLs** – Add `https://learnadoodle.com/set-password` exactly. Supabase ignores `redirect_to` if it’s not in the list.
3. **Email template** – Confirm signup template must use `{{ .ConfirmationURL }}`, not `{{ .SiteURL }}`.
4. **otp_expired** – Some email providers (Outlook Safe Links, Gmail) prefetch links and consume the token before the user clicks. The user then sees “link expired.” Use a personal email or request a new link.
5. **Verify** – After saving, sign up with a new email and test the link. Use incognito and hard-refresh to avoid cache.

---

## Troubleshooting: 500 on signup (confirm email sent)

If the browser shows **500** when the user clicks "Send sign up link" (Supabase `auth/v1/signup`), the failure is inside Supabase Auth, not the app backend.

**Likely causes:**

1. **Custom SMTP (Postmark)** – Supabase sends the confirmation email via your SMTP. If Postmark rejects the send (wrong Server API Token, unverified sender, rate limit, or template error), Supabase can return 500.
   - **Check:** Supabase Dashboard → Project Settings → Authentication → SMTP Settings. Confirm the token matches your Postmark Server API Token and the sender email is verified in Postmark.
   - **Check:** Postmark dashboard for bounces or errors for the sender/domain.
2. **Auth hooks** – If you use Supabase Auth Hooks (e.g. "Send confirmation email" or "Create user" hook) that call an external URL or database and that fails, Supabase may return 500.
   - **Check:** Supabase Dashboard → Authentication → Hooks. Temporarily disable or fix the hook and retry.
3. **Supabase logs** – In the Supabase Dashboard, open **Logs** → **Auth** (or API) and retry signup. The log entry for the failed request usually shows the underlying error (e.g. SMTP or hook failure).

The app now shows a friendly message when signup returns 500: *"We couldn't send the confirmation email right now (server error). Please try again in a few minutes or contact contact@learnadoodle.com."*

---

## Troubleshooting: "Database error saving new user" (code: unexpected_failure)

This error means Supabase Auth created the user in `auth.users` but something failed in the database during signup—usually a **trigger** that runs on new user creation (e.g. to insert a row into `public.profiles`).

**Fix (recommended):** Apply the migration that creates a safe trigger to add a profile row on signup:

1. **Run the migration**  
   `supabase/migrations/20260315_handle_new_user_create_profile.sql`  
   - It defines `public.handle_new_user()` and trigger `on_auth_user_created` on `auth.users` (AFTER INSERT) to insert one row into `public.profiles` with `id`, `role` (default `'parent'`), and `email`.  
   - If your migration runner cannot create triggers on `auth.users`, run the trigger part manually in **Supabase Dashboard → SQL Editor** (as a user with permission to create triggers on `auth`):

   ```sql
   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW
     EXECUTE FUNCTION public.handle_new_user();
   ```

2. **If a trigger already exists and is broken**  
   The migration drops `on_auth_user_created` and `handle_new_user_trigger` (if present) before creating the new one. After applying it, sign up again.

3. **Check Postgres / Auth logs**  
   In **Supabase Dashboard → Logs → Postgres** (or **Auth**), reproduce the signup and inspect the failing statement or trigger for other causes (e.g. missing column, RLS, constraint).

The app shows a friendly message for this error: *"We couldn't create your account right now (server setup issue). Please try again in a few minutes or contact contact@learnadoodle.com."*

---

## 5. New user flow (email → confirm → set password)

The app uses a three-step flow so the account is not fully usable until the user has confirmed their email and set a password:

1. **Send sign up link** – User enters only their email; the app sends a confirmation email (via Postmark).
2. **Confirm email** – User clicks “Confirm Email” in the email and is sent to `/set-password`.
3. **Set password** – User sees a sign-in style page with email pre-filled and creates their password. After submitting, they are redirected to **their home page** (`/home`).

Supabase still creates the auth user at step 1 (required by Supabase). The user cannot sign in until their email is confirmed (Supabase setting), and they set a real password on `/set-password` (the app uses a temporary password until then). After step 3, they are logged in and taken to `/home`.

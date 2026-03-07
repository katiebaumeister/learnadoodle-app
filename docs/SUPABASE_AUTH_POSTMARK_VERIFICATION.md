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
3. You can change subject and body; the `{{ .ConfirmationURL }}` (or reset URL) must stay so the link still works.

---

## Checklist

- [ ] Postmark SMTP configured in Supabase (Authentication → SMTP Settings).
- [ ] Site URL set to production app URL (e.g. `https://learnadoodle.com`).
- [ ] Redirect URLs include production (and localhost only if needed).
- [ ] Sender email used in SMTP is verified in Postmark (same as invites).
- [ ] (Optional) `REACT_APP_SITE_URL` / `EXPO_PUBLIC_SITE_URL` set in production env.

After this, new user verification emails route through Postmark and the confirmation link points to your app instead of localhost.

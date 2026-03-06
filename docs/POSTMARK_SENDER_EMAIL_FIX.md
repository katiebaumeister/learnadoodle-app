# Postmark Sender Email: kate@ vs contact@

## How to change from kate@learnadoodle.com to contact@learnadoodle.com

### Step 1: Verify contact@learnadoodle.com in Postmark

Postmark only allows sending from **verified** sender addresses. Add and verify `contact@learnadoodle.com`:

1. Go to [Postmark Dashboard](https://account.postmarkapp.com) → **Servers** → your Learnadoodle server.
2. Open **Signatures** → **Sender Signatures**.
3. Click **Add Sender Signature**.
4. Enter **From email**: `contact@learnadoodle.com`.
5. Complete verification:
   - **Email verification**: Postmark sends a link to `contact@learnadoodle.com`; click it to verify. Easiest if you can receive mail at that address.
   - **Domain verification**: If `learnadoodle.com` is already verified (DKIM + Return-Path), some setups allow any address at that domain; if not, add the sender and use the method Postmark shows (often email verification for one address).

Wait until the signature shows as **Verified**.

### Step 2: Set the sender in your environment

The app uses `POSTMARK_SENDER_EMAIL`; the code default is `contact@learnadoodle.com` when unset.

- **Local**  
  In `backend/.env` set:
  ```bash
  POSTMARK_SENDER_EMAIL=contact@learnadoodle.com
  ```
  (Remove the line or change it if it currently says `kate@learnadoodle.com`.)

- **Production**  
  In your hosting dashboard (e.g. Render), set the same variable:
  ```bash
  POSTMARK_SENDER_EMAIL=contact@learnadoodle.com
  ```
  Redeploy the backend so the new value is used.

### Step 3: Restart / redeploy

- Local: restart the backend server.
- Production: redeploy after changing the env var.

After this, invite (and other) emails will send **From:** contact@learnadoodle.com. Replies already go to `contact@learnadoodle.com` via the existing `ReplyTo` in code.

---

## Why it was sending from kate@

Postmark requires the `From` address to match a **verified sender signature**. If `contact@learnadoodle.com` wasn’t verified, Postmark would reject or substitute a verified sender (e.g. `kate@learnadoodle.com`). Once `contact@learnadoodle.com` is verified and set in `POSTMARK_SENDER_EMAIL`, it will be used.

## Quick check

- **Postmark** → Signatures → Sender Signatures: `contact@learnadoodle.com` should be listed and **Verified**.
- **Env**: `POSTMARK_SENDER_EMAIL=contact@learnadoodle.com` in both local and production.

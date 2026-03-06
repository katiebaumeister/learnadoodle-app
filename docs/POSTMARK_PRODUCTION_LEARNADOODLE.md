# Postmark: Enable Email From learnadoodle.com (Production)

Emails send when you run the backend **locally** but not when the same action is triggered from **learnadoodle.com** (production) because production needs its own Postmark configuration.

## 1. Set environment variables in production

Your production backend (e.g. Render, Railway, Fly.io, or wherever `api.learnadoodle.com` runs) must have the same Postmark env vars as local.

In your **hosting dashboard** (e.g. Render → Service → Environment):

| Variable | Value | Required |
|----------|--------|----------|
| `POSTMARK_API_TOKEN` | Same Server API Token you use locally | Yes |
| `POSTMARK_SENDER_EMAIL` | `kate@learnadoodle.com` or `contact@learnadoodle.com` (must be verified in Postmark) | Yes |
| `POSTMARK_SENDER_NAME` | `Learnadoodle` | Optional (defaults to this) |

- Use the **same** Postmark Server API Token as in `backend/.env` (the token is not “local only”).
- Redeploy the backend after adding or changing these so the new env is picked up.

## 2. Postmark dashboard: allow sending from production

Postmark does **not** restrict by “local vs learnadoodle.com” — it only checks the API token and sender. To make sure production can send:

1. **Postmark Dashboard** → [account.postmarkapp.com](https://account.postmarkapp.com)
2. **Servers** → select the server you use for Learnadoodle.
3. **Sender Signatures**  
   - Ensure the address in `POSTMARK_SENDER_EMAIL` (e.g. `kate@learnadoodle.com` or `contact@learnadoodle.com`) is **Verified**.
4. **Domain** (or **Sender Signatures** → domain for that sender)  
   - Ensure **learnadoodle.com** is verified (DKIM + Return-Path).  
   - See [POSTMARK_DNS_VERIFICATION.md](./POSTMARK_DNS_VERIFICATION.md) if needed.
5. **Account approval**  
   - If the account is still “pending approval”, Postmark may only allow sending to the same domain (`@learnadoodle.com`).  
   - To send to any address (e.g. Yahoo, Gmail), request approval: [POSTMARK_ACCOUNT_APPROVAL.md](./POSTMARK_ACCOUNT_APPROVAL.md).

There is no “allow only local” setting; if production has the token and a verified sender/domain, it can send.

## 3. Verify production is actually using the token

- In the **production** backend logs when an invite is created, you should see something like:
  - `email_service.send_invite_email.success` or
  - `email_service.send_invite_email.skipped` / `email_service.send_invite_email.error`
- If you see `POSTMARK_API_TOKEN not set` or `postmark_not_configured`, the production env does not have the token (or the app wasn’t redeployed after adding it).

## Quick checklist

- [ ] `POSTMARK_API_TOKEN` set in **production** backend environment
- [ ] `POSTMARK_SENDER_EMAIL` set in production (and that address is verified in Postmark)
- [ ] learnadoodle.com domain verified in Postmark (DKIM + Return-Path)
- [ ] Backend redeployed after changing env vars
- [ ] (If needed) Postmark account approved for sending to external domains

After this, invites triggered from learnadoodle.com will send email the same way they do when triggered locally.

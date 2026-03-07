# Postmark Email Setup for Invites

## Overview

Invite emails are now automatically sent via Postmark when a parent, tutor, or child invite is created. The invite link is also automatically copied to the clipboard for manual sharing.

**Email works locally but not from learnadoodle.com?** Set Postmark env vars in your **production** backend and ensure the domain is verified. See **[POSTMARK_PRODUCTION_LEARNADOODLE.md](./POSTMARK_PRODUCTION_LEARNADOODLE.md)**.

**New user verification email still from Supabase or linking to localhost?** Route auth emails through Postmark and fix the link by configuring Supabase SMTP + Site URL. See **[SUPABASE_AUTH_POSTMARK_VERIFICATION.md](./SUPABASE_AUTH_POSTMARK_VERIFICATION.md)**.

## Backend Setup

### 1. Install Dependencies

The Postmark Python library has been added to `requirements.txt`:
```
postmarker>=1.0.0
```

Install it:
```bash
cd backend
pip install -r requirements.txt
```

### 2. Environment Variables

Add these environment variables to your backend `.env` file:

```bash
# Postmark Configuration
POSTMARK_API_TOKEN=your_postmark_server_token_here
POSTMARK_SENDER_EMAIL=contact@learnadoodle.com
POSTMARK_SENDER_NAME=Learnadoodle
```

### 3. Get Postmark API Token

1. Go to [postmarkapp.com](https://postmarkapp.com)
2. Sign in to your account
3. Go to **Servers** → Select your server (or create one)
4. Copy the **Server API Token** (starts with your server ID)
5. Add it to your `.env` file as `POSTMARK_API_TOKEN`

### 4. Verify Sender Email

1. In Postmark dashboard, go to **Signatures** → **Sender Signatures**
2. Add and verify `contact@learnadoodle.com` (or your chosen sender email)
3. Make sure the sender email matches `POSTMARK_SENDER_EMAIL` in your `.env`

## How It Works

### Email Sending Flow

1. **User creates invite** (parent/tutor/child)
2. **Backend creates invite record** in database
3. **Backend generates invite URL**
4. **Backend sends email via Postmark** with:
   - Personalized subject line
   - HTML and plain text versions
   - Invite link button
   - Fallback text link
5. **Frontend copies invite URL to clipboard** automatically
6. **User sees success message** confirming email sent and link copied

### Email Content

The email includes:
- **Subject**: Role-specific (e.g., "You're invited to join Enzo's learning journey on Learnadoodle")
- **Greeting**: Personalized if child invite
- **Body**: Explains what the invite is for based on role
- **Call-to-action**: Button to accept invitation
- **Fallback**: Plain text link if button doesn't work
- **Expiration notice**: 30 days

### Copy-to-Clipboard

The frontend automatically:
- Copies the invite URL to clipboard when invite is created
- Shows a success toast confirming the copy
- Works on web browsers (uses `navigator.clipboard` API)

## Testing

### Test Email Sending

1. Create a test invite (parent/tutor/child)
2. Check Postmark dashboard → **Activity** → **Sent** to see if email was sent
3. Check recipient's inbox (and spam folder)
4. Verify the invite link works

### Test Copy-to-Clipboard

1. Create an invite
2. Check that success message shows "Email sent and link copied to clipboard"
3. Paste somewhere to verify the URL was copied

## Troubleshooting

### Email Not Sending

1. **Check Postmark API Token**:
   - Verify `POSTMARK_API_TOKEN` is set correctly
   - Token should start with your server ID

2. **Check Sender Email**:
   - Verify sender email is verified in Postmark
   - Must match `POSTMARK_SENDER_EMAIL` in `.env`

3. **Check Logs**:
   - Backend logs will show `email_service.send_invite_email.success` or `.error`
   - Check Postmark dashboard → **Activity** → **Bounces** for delivery issues

4. **Check Rate Limits**:
   - Postmark has rate limits based on your plan
   - Check Postmark dashboard for current usage

### Copy-to-Clipboard Not Working

1. **Browser Support**:
   - Requires modern browser with `navigator.clipboard` API
   - Falls back to `document.execCommand('copy')` for older browsers

2. **HTTPS Required**:
   - Clipboard API requires HTTPS (or localhost)
   - Check that your app is served over HTTPS

## Environment Variables Summary

```bash
# Required
POSTMARK_API_TOKEN=your_server_token_here

# Optional (defaults shown)
POSTMARK_SENDER_EMAIL=contact@learnadoodle.com
POSTMARK_SENDER_NAME=Learnadoodle
FRONTEND_URL=https://app.learnadoodle.com  # App where users sign in and accept invites
INVITE_LANDING_URL=https://learnadoodle.com  # Base URL for invite links in email (link goes to /invites/{token})
```

## Files Modified

### Backend
- `backend/requirements.txt` - Added `postmarker>=1.0.0`
- `backend/email_service.py` - New email service module
- `backend/routers/family_routes.py` - Added email sending to invite endpoint
- `backend/routers/child_auth_routes.py` - Added email service import (for future use)

### Frontend
- `components/settings/FamilyPanel.js` - Added copy-to-clipboard functionality

## Next Steps

1. ✅ Add Postmark API token to backend `.env`
2. ✅ Verify sender email in Postmark dashboard
3. ✅ Test invite creation and email delivery
4. ✅ Verify copy-to-clipboard works in browser

## Support

- **Postmark Docs**: [postmarkapp.com/docs](https://postmarkapp.com/docs)
- **Postmark Dashboard**: [account.postmarkapp.com](https://account.postmarkapp.com)
- **Check Email Delivery**: Postmark dashboard → Activity → Sent/Bounces

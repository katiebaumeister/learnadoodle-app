# Debugging: Email Not Sending

## Quick Checklist

1. ✅ **Check POSTMARK_API_TOKEN is set**
   ```bash
   cd backend
   grep POSTMARK_API_TOKEN .env
   ```
   Should show: `POSTMARK_API_TOKEN=your_token_here`

2. ✅ **Check backend logs**
   - Look for `email_service.send_invite_email.success` or `.error`
   - Check for `postmark_not_configured` messages
   - Look for any exception traces

3. ✅ **Check Postmark Dashboard**
   - Go to [Postmark Dashboard](https://account.postmarkapp.com) → **Activity** → **Sent**
   - See if emails are being sent but not delivered
   - Check **Bounces** tab for delivery issues

4. ✅ **Check spam folder**
   - Emails might be in spam/junk folder
   - Check email filters

5. ✅ **Verify sender email is verified**
   - Postmark Dashboard → **Signatures** → **Sender Signatures**
   - `kate@learnadoodle.com` should show as verified

## Common Issues

### Issue 1: POSTMARK_API_TOKEN Not Set

**Symptoms:**
- Backend logs show: `postmark_not_configured`
- No email sent

**Fix:**
1. Get your Postmark Server API Token:
   - Go to Postmark Dashboard → **Servers** → Your server
   - Copy the **Server API Token**
2. Add to `backend/.env`:
   ```bash
   POSTMARK_API_TOKEN=your_server_token_here
   ```
3. Restart backend server

### Issue 2: Postmark Client Not Initialized

**Symptoms:**
- Backend logs show: `email_service.init.error`
- Error during PostmarkClient initialization

**Fix:**
1. Check token is valid (starts with your server ID)
2. Check token has proper permissions
3. Verify token in Postmark dashboard

### Issue 3: Email Sending Error

**Symptoms:**
- Backend logs show: `email_service.send_invite_email.error`
- Exception trace in logs

**Common errors:**
- **"Invalid 'From' email"**: Sender email not verified in Postmark
- **"Rate limit exceeded"**: Too many emails sent (check Postmark plan limits)
- **"Invalid API token"**: Token expired or incorrect

**Fix:**
1. Check error message in backend logs
2. Verify sender email in Postmark → Signatures
3. Check Postmark dashboard for rate limits

### Issue 4: Email Sent But Not Received

**Symptoms:**
- Postmark shows email as "Sent" in dashboard
- But recipient didn't receive it

**Possible causes:**
1. **Spam folder**: Check recipient's spam/junk folder
2. **Email filters**: Recipient's email provider blocking
3. **Wrong email address**: Typo in recipient email
4. **Bounced**: Check Postmark → Activity → Bounces

**Fix:**
1. Check Postmark dashboard → Activity → Sent (confirm it was sent)
2. Check Postmark dashboard → Activity → Bounces (see if it bounced)
3. Ask recipient to check spam folder
4. Try sending to a different email address

## Testing Email Sending

### Test 1: Check Environment Variables

```bash
cd backend
source venv/bin/activate
python3 -c "import os; from dotenv import load_dotenv; load_dotenv(); print('POSTMARK_API_TOKEN:', 'SET' if os.getenv('POSTMARK_API_TOKEN') else 'NOT SET'); print('POSTMARK_SENDER_EMAIL:', os.getenv('POSTMARK_SENDER_EMAIL', 'NOT SET'))"
```

### Test 2: Test Email Service Directly

Create a test script `backend/test_email.py`:

```python
import os
from dotenv import load_dotenv
load_dotenv()

from email_service import send_invite_email

result = send_invite_email(
    to_email="your-test-email@example.com",
    invite_url="https://learnadoodle.com/invites/test123",
    role="parent",
    inviter_name="Test User",
)

print(f"Email sent: {result}")
```

Run it:
```bash
cd backend
source venv/bin/activate
python3 test_email.py
```

### Test 3: Check Postmark Dashboard

1. Go to Postmark Dashboard → **Activity** → **Sent**
2. Look for recent emails
3. Click on an email to see delivery status
4. Check **Bounces** tab for any delivery failures

## Backend Logs to Check

Look for these log messages:

**Success:**
```
email_service.send_invite_email.success
family.invite_tutor.success email_sent=true
```

**Errors:**
```
email_service.send_invite_email.skipped reason=postmark_not_configured
email_service.send_invite_email.error error=...
email_service.init.error error=...
```

## Next Steps

1. **Check backend logs** for email-related messages
2. **Verify POSTMARK_API_TOKEN** is set in `.env`
3. **Check Postmark dashboard** to see if emails are being sent
4. **Test with a known good email** (like your own)
5. **Check spam folder** of recipient

If still not working, share:
- Backend log output (especially email_service messages)
- Postmark dashboard → Activity → Sent (screenshot or status)
- Any error messages from backend

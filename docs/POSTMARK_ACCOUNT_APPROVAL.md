# Postmark Account Approval - Sending Restrictions

## Current Issue

Your Postmark account is **pending approval**. During this period, Postmark restricts sending to only recipients with the same domain as your sender email.

**Error Message:**
```
[412] While your account is pending approval, all recipient addresses must share 
the same domain as the 'From' address. The domain of the 'From' address is 
'learnadoodle.com', but you are attempting to send email to the following 
domain(s): 'yahoo.com'.
```

## What This Means

- ✅ **Can send to**: `@learnadoodle.com` addresses (e.g., `kate@learnadoodle.com`, `contact@learnadoodle.com`)
- ❌ **Cannot send to**: Any other domain (e.g., `@yahoo.com`, `@gmail.com`, `@example.com`)

## How to Get Approved

### Step 1: Check Approval Status

1. Go to [Postmark Dashboard](https://account.postmarkapp.com)
2. Look for any approval notifications or status messages
3. Check **Settings** → **Account** for approval status

### Step 2: Request Approval

1. Go to Postmark Dashboard → **Support** or **Help**
2. Contact Postmark support to request account approval
3. They may ask for:
   - Business information
   - Use case details
   - Domain verification confirmation
   - Sample email content

### Step 3: Complete Verification

Make sure you've completed:
- ✅ Domain verification (DKIM and Return-Path DNS records)
- ✅ Sender signature verification
- ✅ Account information

### Step 4: Wait for Approval

- Approval typically takes **24-48 hours**
- Postmark will email you when approved
- Once approved, you can send to any email address

## Temporary Workarounds

### Option 1: Test with Same Domain

For testing, use `@learnadoodle.com` email addresses:
- `test@learnadoodle.com`
- `kate@learnadoodle.com`
- `contact@learnadoodle.com`

### Option 2: Use Copy-to-Clipboard

Since emails can't be sent to external domains yet:
1. Create the invite (it will still be created in database)
2. Copy the invite URL from clipboard
3. Manually share the link via another method (text, other email, etc.)

The invite will still work - it just won't be delivered via email until Postmark approves your account.

### Option 3: Contact Postmark Support

Reach out to Postmark support to expedite approval:
- **Email**: support@postmarkapp.com
- **Dashboard**: Postmark Dashboard → **Support**
- **Status Page**: Check if there are any known delays

## What Happens After Approval

Once your account is approved:
- ✅ Can send to any email address
- ✅ No domain restrictions
- ✅ Full transactional email capabilities
- ✅ Higher sending limits

## Current Status

**Account Status**: Pending Approval  
**Can Send To**: `@learnadoodle.com` only  
**Cannot Send To**: All other domains  

**Action Required**: Request approval from Postmark support

## Next Steps

1. **Request approval** from Postmark (if not already done)
2. **Test with same-domain emails** for now (e.g., `kate@learnadoodle.com`)
3. **Use manual sharing** for external invites (copy invite URL)
4. **Wait for approval** (usually 24-48 hours)

Once approved, all invite emails will work automatically!

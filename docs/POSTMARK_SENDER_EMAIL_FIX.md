# Fixing Postmark Sender Email

## Issue

Emails are being sent from `kate@learnadoodle.com` instead of `contact@learnadoodle.com`, even though `contact@learnadoodle.com` is set in the code.

## Root Cause

Postmark requires that the `From` email address matches a **verified sender signature** in your Postmark account. If `contact@learnadoodle.com` is not verified, Postmark will automatically use a verified sender (like `kate@learnadoodle.com`) instead.

## Solutions

### Option 1: Verify contact@learnadoodle.com (Recommended)

1. Go to [Postmark Dashboard](https://account.postmarkapp.com)
2. Navigate to **Signatures** → **Sender Signatures**
3. Click **Add Signature** or **Verify Domain**
4. Add `contact@learnadoodle.com` as a sender signature
5. Verify it (via email verification or DNS records)
6. Once verified, emails will send from `contact@learnadoodle.com`

### Option 2: Use kate@learnadoodle.com as Sender

If you want to use `kate@learnadoodle.com` as the sender:

1. Update your `.env` file:
   ```bash
   POSTMARK_SENDER_EMAIL=kate@learnadoodle.com
   ```

2. Restart your backend server

### Option 3: Use ReplyTo (Current Implementation)

The code now sets `ReplyTo=contact@learnadoodle.com` so that:
- Emails send from the verified sender (e.g., `kate@learnadoodle.com`)
- Replies go to `contact@learnadoodle.com`

This is a good temporary solution while you verify `contact@learnadoodle.com`.

## How to Check Verified Senders

1. Go to Postmark Dashboard → **Signatures** → **Sender Signatures**
2. You'll see all verified sender emails
3. Only these emails can be used in the `From` field

## Verification Methods

### Email Verification (Easiest)
1. Postmark sends a verification email to `contact@learnadoodle.com`
2. Click the verification link
3. Done!

### Domain Verification (Best for Multiple Emails)
1. Add DNS records to your domain
2. Verify the domain once
3. Use any email from that domain (e.g., `contact@`, `noreply@`, etc.)

## Current Behavior

With the current code:
- **From**: Uses verified sender (likely `kate@learnadoodle.com`)
- **ReplyTo**: `contact@learnadoodle.com` (replies go here)
- **Display Name**: "Learnadoodle"

This means recipients will see the email from `kate@learnadoodle.com`, but when they reply, it goes to `contact@learnadoodle.com`.

## Recommended Action

**Verify `contact@learnadoodle.com` in Postmark** so emails send from the correct address. This is the cleanest solution.

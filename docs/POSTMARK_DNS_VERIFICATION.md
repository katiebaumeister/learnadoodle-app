# Postmark DNS Verification Guide

## Overview

To send emails from `kate@learnadoodle.com` (or any email from `learnadoodle.com`), you need to verify your domain by adding DNS records to your domain's DNS provider.

## Step-by-Step Instructions

### Step 1: Access Your DNS Provider

Go to wherever you manage DNS for `learnadoodle.com`. Common providers:
- **Cloudflare** (cloudflare.com)
- **GoDaddy** (godaddy.com)
- **Namecheap** (namecheap.com)
- **Google Domains** (domains.google.com)
- **AWS Route 53** (console.aws.amazon.com/route53)
- **Your domain registrar's DNS panel**

### Step 2: Add DKIM Record

1. **In your DNS provider**, add a new **TXT record**:
   - **Hostname/Name**: `20260211195053pm._domainkey`
   - **Type**: `TXT`
   - **Value**: Copy the entire long string from Postmark (starts with `k=rsa;p=MIGfMAOGCSqGSIb3DQEBAQUAA4GNAD...`)
   - **TTL**: Leave as default (usually 3600 or Auto)

2. **Important**: Make sure the hostname is exactly `20260211195053pm._domainkey` (no trailing dot, no `learnadoodle.com` appended - just the hostname part)

### Step 3: Add Return-Path Record

1. **In your DNS provider**, add a new **CNAME record**:
   - **Hostname/Name**: `pm-bounces`
   - **Type**: `CNAME`
   - **Value**: `pm.mtasv.net`
   - **TTL**: Leave as default

2. **Important**: The hostname should be just `pm-bounces` (not `pm-bounces.learnadoodle.com`)

### Step 4: Wait for DNS Propagation

- DNS changes can take **5 minutes to 48 hours** to propagate
- Usually takes **15-30 minutes** for most providers
- Postmark will automatically check every few minutes

### Step 5: Verify in Postmark

1. Go back to Postmark Dashboard → **Signatures** → **DNS Settings**
2. Click the **"Verify"** button next to each record
3. Postmark will check if the DNS records are found
4. Once verified, you'll see green checkmarks instead of red X's

## DNS Provider Examples

### Cloudflare

1. Go to Cloudflare Dashboard → Select `learnadoodle.com` → **DNS** → **Records**
2. Click **Add record**
3. For DKIM:
   - **Type**: `TXT`
   - **Name**: `20260211195053pm._domainkey`
   - **Content**: (paste the full DKIM value)
   - **TTL**: Auto
   - Click **Save**
4. For Return-Path:
   - **Type**: `CNAME`
   - **Name**: `pm-bounces`
   - **Target**: `pm.mtasv.net`
   - **TTL**: Auto
   - Click **Save**

### GoDaddy

1. Go to GoDaddy → **My Products** → **DNS** (next to your domain)
2. Scroll to **Records** section
3. Click **Add** button
4. For DKIM:
   - **Type**: `TXT`
   - **Name**: `20260211195053pm._domainkey`
   - **Value**: (paste the full DKIM value)
   - **TTL**: 600 seconds
   - Click **Save**
5. For Return-Path:
   - **Type**: `CNAME`
   - **Name**: `pm-bounces`
   - **Value**: `pm.mtasv.net`
   - **TTL**: 600 seconds
   - Click **Save**

### Namecheap

1. Go to Namecheap → **Domain List** → Click **Manage** next to your domain
2. Go to **Advanced DNS** tab
3. Click **Add New Record**
4. For DKIM:
   - **Type**: `TXT Record`
   - **Host**: `20260211195053pm._domainkey`
   - **Value**: (paste the full DKIM value)
   - **TTL**: Automatic
   - Click **Save**
5. For Return-Path:
   - **Type**: `CNAME Record`
   - **Host**: `pm-bounces`
   - **Value**: `pm.mtasv.net`
   - **TTL**: Automatic
   - Click **Save**

## Verification Checklist

- [ ] Added DKIM TXT record with hostname `20260211195053pm._domainkey`
- [ ] Added Return-Path CNAME record with hostname `pm-bounces`
- [ ] Waited at least 5-15 minutes for DNS propagation
- [ ] Clicked "Verify" button in Postmark for DKIM
- [ ] Clicked "Verify" button in Postmark for Return-Path
- [ ] Both show green checkmarks (verified)

## Troubleshooting

### "We couldn't find your DKIM record"

**Possible causes:**
1. **Wrong hostname**: Make sure it's exactly `20260211195053pm._domainkey` (no `.learnadoodle.com` appended)
2. **DNS not propagated**: Wait 15-30 minutes and try again
3. **Wrong DNS provider**: Make sure you're adding records to the DNS provider that's actually serving your domain
4. **Typo in value**: Copy the entire DKIM value exactly, including all the `=` signs

### "Return-Path Inactive"

**Possible causes:**
1. **Wrong hostname**: Should be just `pm-bounces` (not `pm-bounces.learnadoodle.com`)
2. **Wrong type**: Must be `CNAME`, not `TXT` or `A`
3. **Wrong value**: Should be exactly `pm.mtasv.net`
4. **DNS not propagated**: Wait and try again

### Check DNS Records

You can verify your DNS records are live using command line:

```bash
# Check DKIM record
dig TXT 20260211195053pm._domainkey.learnadoodle.com

# Check Return-Path record
dig CNAME pm-bounces.learnadoodle.com
```

Or use online tools:
- [MXToolbox](https://mxtoolbox.com/TXTLookup.aspx)
- [DNS Checker](https://dnschecker.org)

## After Verification

Once both records are verified:
1. ✅ You can send emails from any address at `learnadoodle.com` (e.g., `kate@learnadoodle.com`, `contact@learnadoodle.com`, `noreply@learnadoodle.com`)
2. ✅ Emails will have proper authentication (DKIM, SPF)
3. ✅ Better deliverability (less likely to go to spam)
4. ✅ Bounce handling will work correctly

## Current Setup

Your `.env` is already configured:
```bash
POSTMARK_SENDER_EMAIL=kate@learnadoodle.com
```

Once DNS is verified, emails will send from `kate@learnadoodle.com` successfully!

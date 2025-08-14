# 🔧 Fix SMTP Configuration for Password Recovery

## 🚨 **Current Issue**
Password recovery emails are failing with error: "Failed to make POST request to /auth/v1/recover"

## 🎯 **Root Cause**
The SMTP configuration in your Supabase project is either missing, incorrect, or the Resend API key has expired.

## 🛠️ **Step-by-Step Fix**

### **Step 1: Access Supabase Dashboard**
1. Go to [supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your project: `mtftwebrtazhyzmmvmdl`

### **Step 2: Check SMTP Settings**
1. In your project dashboard, go to **Settings** → **API**
2. Scroll down to **SMTP Settings**
3. Check if SMTP is enabled and configured

### **Step 3: Configure SMTP with Resend**
If SMTP is not configured or incorrect, set it up with these values:

```
SMTP Host: smtp.resend.com
SMTP Port: 587
SMTP User: resend
SMTP Pass: [Your Resend API Key]
Sender Name: Learnadoodle
Sender Email: [Your verified email address]
```

### **Step 4: Get/Refresh Resend API Key**
1. Go to [resend.com](https://resend.com)
2. Sign in to your account
3. Go to **API Keys** section
4. Create a new API key or copy existing one
5. Make sure the key has proper permissions

### **Step 5: Verify Domain in Resend**
1. In Resend dashboard, go to **Domains**
2. Add and verify your domain (e.g., `yourdomain.com`)
3. Ensure the sender email matches your verified domain

### **Step 6: Test Configuration**
1. Go back to Supabase dashboard
2. Go to **Authentication** → **Users**
3. Try to send a password reset to a test user
4. Check the logs for any errors

## 🔍 **Troubleshooting Commands**

Run these SQL queries in your Supabase SQL editor to diagnose issues:

```sql
-- Check current SMTP config
SELECT key, value FROM auth.config WHERE key LIKE '%smtp%';

-- Check recent auth logs
SELECT created_at, event_type, error_message 
FROM auth.audit_log_entries 
WHERE event_type = 'recovery_requested'
ORDER BY created_at DESC
LIMIT 5;
```

## 🚫 **Common Issues & Solutions**

| Issue | Solution |
|-------|----------|
| **SMTP not configured** | Enable SMTP in Supabase Settings → API → SMTP Settings |
| **Invalid API key** | Generate new Resend API key and update SMTP settings |
| **Domain not verified** | Verify your domain in Resend dashboard |
| **Rate limiting** | Wait before trying again or check rate limit settings |
| **Invalid sender email** | Use email that matches your verified domain |

## 📧 **Alternative Solutions**

### **Option 1: Use Supabase Auth UI**
If SMTP continues to fail, you can use Supabase's built-in auth UI which handles email sending automatically.

### **Option 2: Custom Email Service**
Implement a custom email service using AWS SES, SendGrid, or similar.

### **Option 3: Disable Email Confirmation**
For development, you can temporarily disable email confirmation in Supabase settings.

## ✅ **Verification Steps**

After fixing SMTP:
1. ✅ Password reset emails send successfully
2. ✅ No more "Failed to make POST request" errors
3. ✅ Users receive recovery emails in their inbox
4. ✅ Email templates are properly formatted

## 🆘 **Still Having Issues?**

If the problem persists:
1. Check Supabase status page for any service issues
2. Verify your Resend account is active and not suspended
3. Check if your domain has proper DNS records
4. Contact Supabase support with your project ID and error logs

## 📞 **Support Resources**

- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Resend Docs**: [resend.com/docs](https://resend.com/docs)
- **Supabase Discord**: [discord.gg/supabase](https://discord.gg/supabase)

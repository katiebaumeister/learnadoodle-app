-- Fix SMTP Configuration for Password Recovery
-- This script helps resolve email sending issues in Supabase

-- 1. Check current SMTP configuration
SELECT 
  'Current SMTP Settings' as info,
  key,
  value
FROM auth.config 
WHERE key LIKE '%smtp%' OR key LIKE '%email%';

-- 2. Check if email templates are configured
SELECT 
  'Email Templates' as info,
  template_id,
  subject,
  content_html IS NOT NULL as has_html_content,
  content_text IS NOT NULL as has_text_content
FROM auth.email_templates;

-- 3. Check recent auth logs for email errors
SELECT 
  'Recent Auth Logs' as info,
  created_at,
  event_type,
  ip_address,
  user_agent,
  error_message
FROM auth.audit_log_entries 
WHERE event_type IN ('recovery_requested', 'email_confirmed', 'signup')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check for any blocked emails or rate limiting
SELECT 
  'Rate Limiting Info' as info,
  key,
  value
FROM auth.config 
WHERE key LIKE '%rate_limit%' OR key LIKE '%blocked%';

-- 5. Verify SMTP provider configuration
-- Note: You'll need to run this in Supabase Dashboard > Settings > API > SMTP Settings
-- 
-- Required SMTP Settings for Resend:
-- SMTP Host: smtp.resend.com
-- SMTP Port: 587
-- SMTP User: resend
-- SMTP Pass: Your Resend API Key
-- Sender Name: Your App Name (e.g., "Learnadoodle")
-- Sender Email: verified@yourdomain.com
-- 
-- Important: The sender email must be verified in your Resend dashboard
-- and match the domain you're sending from.

-- 6. Test email configuration (run this after fixing SMTP settings)
-- This will attempt to send a test email
SELECT 
  'Test Email Configuration' as info,
  'After fixing SMTP settings, try requesting a password reset' as instruction,
  'Check Supabase Dashboard > Auth > Users for any error logs' as next_step;

-- 7. Common issues and solutions:
-- 
-- Issue: "Failed to make POST request to /auth/v1/recover"
-- Solution: Check SMTP configuration in Supabase Dashboard
-- 
-- Issue: "Error sending recovery email"
-- Solution: Verify Resend API key and domain verification
-- 
-- Issue: "Rate limit exceeded"
-- Solution: Wait before trying again or check rate limiting settings
-- 
-- Issue: "Invalid sender email"
-- Solution: Ensure sender email is verified in Resend dashboard

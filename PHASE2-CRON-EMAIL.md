# Phase 2: Weekly Summary Email (Future Implementation)

## Overview

This document outlines the planned implementation for automated weekly progress summary emails.

## Architecture

### Supabase Edge Function (Cron)

Create a Supabase Edge Function that runs weekly (e.g., every Monday at 8 AM):

```typescript
// supabase/functions/weekly-summary/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get all active families
  const { data: families } = await supabase
    .from('family')
    .select('id')
    .eq('archived', false)

  for (const family of families || []) {
    // Calculate last week's date range
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - endDate.getDay()) // Last Sunday
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 7) // Previous Monday

    // Call summarize_progress RPC
    const { data: summary } = await supabase.rpc('get_progress_snapshot', {
      p_family_id: family.id,
      p_start: startDate.toISOString().split('T')[0],
      p_end: endDate.toISOString().split('T')[0]
    })

    // Get parent email from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('family_id', family.id)
      .limit(1)
      .single()

    if (profile?.email && summary) {
      // Send email via SendGrid or Resend
      await sendWeeklySummaryEmail(profile.email, summary)
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

### Email Service Integration

#### Option 1: SendGrid

```typescript
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(Deno.env.get('SENDGRID_API_KEY') ?? '')

async function sendWeeklySummaryEmail(email: string, summary: any) {
  const msg = {
    to: email,
    from: 'noreply@learnadoodle.com',
    subject: 'Your Weekly Learning Summary',
    html: formatSummaryAsHTML(summary),
  }
  
  await sgMail.send(msg)
}
```

#### Option 2: Resend

```typescript
import { Resend } from 'resend'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

async function sendWeeklySummaryEmail(email: string, summary: any) {
  await resend.emails.send({
    from: 'Learnadoodle <noreply@learnadoodle.com>',
    to: email,
    subject: 'Your Weekly Learning Summary',
    html: formatSummaryAsHTML(summary),
  })
}
```

### Cron Schedule

Configure in Supabase Dashboard:
- **Function**: `weekly-summary`
- **Schedule**: `0 8 * * 1` (Every Monday at 8 AM UTC)
- **Timezone**: Adjust based on target audience

## Rate Limiting & Caching

- Prevent duplicate runs: Check `ai_task_runs` table for existing `summarize_progress` task in the same week
- Cache results: Store summary in `ai_task_runs.result` for reuse
- Rate limit: Max 1 email per family per week

## Email Template

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .summary { margin: 20px 0; }
    .child-section { margin: 15px 0; }
    .subject-row { padding: 8px 0; }
  </style>
</head>
<body>
  <h1>Weekly Learning Summary</h1>
  <p>Here's how your children did this week:</p>
  
  {{#each children}}
  <div class="child-section">
    <h2>{{child_name}}</h2>
    {{#each subjects}}
    <div class="subject-row">
      <strong>{{subject_name}}:</strong>
      {{done_events}}/{{total_events}} completed
      {{#if missed_events}}
        <span style="color: red;">({{missed_events}} missed)</span>
      {{/if}}
    </div>
    {{/each}}
  </div>
  {{/each}}
  
  <p><a href="https://learnadoodle.com/planner">View Full Calendar</a></p>
</body>
</html>
```

## Implementation Checklist

- [ ] Create Supabase Edge Function
- [ ] Set up SendGrid or Resend account
- [ ] Configure cron schedule in Supabase
- [ ] Design email template
- [ ] Add unsubscribe link
- [ ] Test with sample family
- [ ] Monitor error rates
- [ ] Add retry logic for failed sends

## Notes

- This is a **future enhancement** - not required for Phase 2 MVP
- Can be implemented incrementally after Phase 2 core features are stable
- Consider user preferences: allow families to opt-in/opt-out of emails


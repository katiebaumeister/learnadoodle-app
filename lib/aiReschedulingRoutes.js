// AI Rescheduling API Routes
// Implements blackout periods, plan proposals, and adaptive velocity

import { supabase } from './supabase';
import { supabaseAdmin } from './supabaseAdmin';

// Use service-role client on the server to bypass RLS for AI routes.
// Fallback to regular client if service key isn't available (e.g. test env).
const serverSupabase = supabaseAdmin || supabase;

/**
 * Free gaps calculator - finds available time slots
 */
async function computeFreeGaps(childId, fromDate, toDate, existingEvents = []) {
  try {
    // Get calendar days cache for the period
    const { data: cacheDays, error: cacheError } = await serverSupabase
      .from('calendar_days_cache')
      .select('*')
      .eq('child_id', childId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .in('day_status', ['teach', 'partial']);

    if (cacheError) throw cacheError;

    // Get blackout periods
    const { data: blackouts, error: blackoutError } = await serverSupabase
      .from('blackout_periods')
      .select('*')
      .or(`child_id.eq.${childId},child_id.is.null`)
      .lte('starts_on', toDate)
      .gte('ends_on', fromDate);

    if (blackoutError) throw blackoutError;

    const gaps = [];

    // Process each teach day
    for (const day of cacheDays || []) {
      const dateStr = day.date;
      
      // Check if day is blacked out
      const isBlackedOut = blackouts?.some(bo => 
        dateStr >= bo.starts_on && dateStr <= bo.ends_on
      );

      if (isBlackedOut) continue;

      // Get day's available window
      const dayStart = day.first_block_start || '09:00:00';
      const dayEnd = day.last_block_end || '17:00:00';

      // Convert to timestamps
      const dayStartTs = new Date(`${dateStr}T${dayStart}`);
      const dayEndTs = new Date(`${dateStr}T${dayEnd}`);

      // Get existing events for this day
      const dayEvents = existingEvents.filter(e => {
        const eventDate = new Date(e.start_ts).toISOString().split('T')[0];
        return eventDate === dateStr;
      }).sort((a, b) => new Date(a.start_ts) - new Date(b.start_ts));

      // Calculate gaps
      let currentTime = dayStartTs;

      for (const event of dayEvents) {
        const eventStart = new Date(event.start_ts);
        const eventEnd = new Date(event.end_ts);

        // If there's a gap before this event, add it
        if (eventStart > currentTime) {
          const gapMinutes = (eventStart - currentTime) / (1000 * 60);
          if (gapMinutes >= 15) { // Minimum 15-minute gap
            gaps.push({
              start_ts: currentTime.toISOString(),
              end_ts: eventStart.toISOString(),
              date: dateStr,
              available_minutes: Math.floor(gapMinutes),
            });
          }
        }

        currentTime = new Date(Math.max(currentTime.getTime(), eventEnd.getTime()));
      }

      // Add final gap if there's time left
      if (currentTime < dayEndTs) {
        const gapMinutes = (dayEndTs - currentTime) / (1000 * 60);
        if (gapMinutes >= 15) {
          gaps.push({
            start_ts: currentTime.toISOString(),
            end_ts: dayEndTs.toISOString(),
            date: dateStr,
            available_minutes: Math.floor(gapMinutes),
          });
        }
      }
    }

    return gaps.sort((a, b) => new Date(a.start_ts) - new Date(b.start_ts));
  } catch (error) {
    console.error('Error computing free gaps:', error);
    throw error;
  }
}

/**
 * Greedy packer - schedules events into available gaps
 */
function packEventsIntoGaps(needs, gaps, constraints = {}) {
  const scheduled = [];
  const maxMinutesPerDay = constraints.maxMinutesPerDay || 240;
  const maxMinutesPerBlock = constraints.maxMinutesPerBlock || 90;
  const minMinutesPerBlock = constraints.minMinutesPerBlock || 30;

  // Sort needs by priority: (1) hard-due, (2) largest deficit, (3) standard weekly
  const sortedNeeds = needs.sort((a, b) => {
    if (a.hardDue && !b.hardDue) return -1;
    if (!a.hardDue && b.hardDue) return 1;
    if (a.deficit !== b.deficit) return b.deficit - a.deficit;
    return b.requiredMinutes - a.requiredMinutes;
  });

  // Track per-day scheduled minutes
  const dayMinutes = {};

  for (const need of sortedNeeds) {
    let remainingMinutes = need.requiredMinutes - need.scheduledMinutes;
    if (remainingMinutes <= 0) continue;

    // Try to place in existing flexible events first (same subject)
    if (need.existingFlexibleEvents?.length > 0) {
      for (const flexEvent of need.existingFlexibleEvents) {
        if (remainingMinutes <= 0) break;
        // Move flexible event to better slot if needed
        // For now, skip and add new events
      }
    }

    // Find gaps and pack
    for (const gap of gaps) {
      if (remainingMinutes <= 0) break;

      const date = gap.date;
      const dayTotal = dayMinutes[date] || 0;

      // Check day capacity
      if (dayTotal >= maxMinutesPerDay) continue;

      // Calculate how much we can fit in this gap
      const gapAvailable = Math.min(
        gap.available_minutes,
        maxMinutesPerBlock,
        maxMinutesPerDay - dayTotal,
        remainingMinutes
      );

      if (gapAvailable < minMinutesPerBlock) continue;

      // Create event
      const startTs = new Date(gap.start_ts);
      const endTs = new Date(startTs.getTime() + gapAvailable * 60000);

      scheduled.push({
        change_type: 'add',
        child_id: need.childId,
        subject_id: need.subjectId,
        title: `${need.subjectName || 'Study'} Session`,
        start_ts: startTs.toISOString(),
        end_ts: endTs.toISOString(),
        estimated_minutes: gapAvailable,
        is_flexible: need.isFlexible || false,
        source_syllabus_id: need.syllabusId || null,
        deficit_minutes: remainingMinutes,
      });

      remainingMinutes -= gapAvailable;
      dayMinutes[date] = (dayMinutes[date] || 0) + gapAvailable;

      // Mark gap as partially used (for simplicity, we'll regenerate gaps)
    }
  }

  return scheduled;
}

export const createAIReschedulingRoutes = (app) => {
  /**
   * POST /api/ai/blackout
   * Create a blackout period (trip, absence, etc.)
   */
  app.post('/api/ai/blackout', async (req, res) => {
    try {
      const { familyId, childId, startsOn, endsOn, reason } = req.body;

      if (!familyId || !startsOn || !endsOn) {
        return res.status(400).json({ error: 'Missing required fields: familyId, startsOn, endsOn' });
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startsOn) || !dateRegex.test(endsOn)) {
        return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
      }

      // Validate date range
      const startDate = new Date(startsOn);
      const endDate = new Date(endsOn);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date values' });
      }
      if (startDate > endDate) {
        return res.status(400).json({ error: 'Start date must be before or equal to end date' });
      }

      // Insert blackout period
      const { data: blackout, error: blackoutError } = await serverSupabase
        .from('blackout_periods')
        .insert({
          family_id: familyId,
          child_id: childId || null,
          starts_on: startsOn,
          ends_on: endsOn,
          reason: reason || 'blackout',
        })
        .select()
        .single();

      if (blackoutError) {
        console.error('Blackout insert error:', blackoutError);
        return res.status(400).json({ 
          error: blackoutError.message || 'Failed to create blackout period',
          details: blackoutError.details || null
        });
      }

      // Create schedule_overrides for each day in range
      const overrides = [];
      const start = new Date(startsOn);
      const end = new Date(endsOn);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        
        const { error: overrideError } = await serverSupabase
          .from('schedule_overrides')
          .upsert({
            scope_type: childId ? 'child' : 'family',
            scope_id: childId || familyId,
            date: dateStr,
            override_kind: 'day_off',
            is_active: true,
            source: 'ai',
          }, { onConflict: 'scope_type,scope_id,date,override_kind' });

        if (overrideError) {
          console.warn(`Failed to create override for ${dateStr}:`, overrideError);
        } else {
          overrides.push(dateStr);
        }
      }

      // Refresh calendar cache
      const { error: refreshError } = await serverSupabase.rpc('refresh_calendar_days_cache', {
        p_family_id: familyId,
        p_from_date: startsOn,
        p_to_date: endsOn,
      });

      if (refreshError) {
        console.warn('Failed to refresh cache:', refreshError);
      }

      res.json({
        blackoutId: blackout.id,
        overridesCreated: overrides.length,
        dates: overrides,
      });
    } catch (error) {
      console.error('Error creating blackout:', error);
      res.status(500).json({ error: error.message || 'Failed to create blackout' });
    }
  });

  /**
   * POST /api/ai/propose-reschedule
   * Generate AI plan proposal (does not apply changes)
   */
  app.post('/api/ai/propose-reschedule', async (req, res) => {
    try {
      const { familyId, weekStart, childIds, horizonWeeks = 2, reason } = req.body;

      if (!familyId || !weekStart || !childIds || childIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields: familyId, weekStart, childIds' });
      }

      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + (horizonWeeks * 7) - 1);

      // 1. Load data
      const [rules, overrides, events, syllabi, velocities, blackouts, backlog] = await Promise.all([
        // Schedule rules
        serverSupabase.from('schedule_rules').select('*').eq('family_id', familyId).eq('is_active', true),
        // Schedule overrides
        serverSupabase.from('schedule_overrides').select('*').eq('family_id', familyId).gte('date', weekStart).lte('date', weekEndDate.toISOString().split('T')[0]),
        // Existing events
        serverSupabase.from('events').select('*').eq('family_id', familyId).in('child_id', childIds).gte('start_ts', weekStartDate.toISOString()).lte('start_ts', weekEndDate.toISOString()).in('status', ['scheduled', 'in_progress', 'done']),
        // Syllabi
        serverSupabase.from('syllabi').select('*').eq('family_id', familyId).in('child_id', childIds),
        // Learning velocities
        serverSupabase.from('learning_velocity').select('*').eq('family_id', familyId).in('child_id', childIds),
        // Blackout periods
        serverSupabase.from('blackout_periods').select('*').eq('family_id', familyId).lte('starts_on', weekEndDate.toISOString().split('T')[0]).gte('ends_on', weekStart),
        // Flexible backlog (used by pack/week + what-if)
        serverSupabase.rpc('get_flexible_backlog', { p_family_id: familyId }),
      ]);

      if (rules.error) throw rules.error;
      if (overrides.error) throw overrides.error;
      if (events.error) throw events.error;
      if (syllabi.error) throw syllabi.error;
      if (velocities.error) throw velocities.error;
      if (blackouts.error) throw blackouts.error;
      if (backlog.error) console.warn('Flexible backlog fetch error:', backlog.error);

      // 2. Calculate deficits per subject/child
      const needs = [];
      const velocityMap = {};

      velocities.data?.forEach(v => {
        velocityMap[`${v.child_id}_${v.subject_id}`] = v.velocity;
      });

      for (const childId of childIds) {
        // Get required minutes (velocity-adjusted)
        const { data: required, error: reqError } = await serverSupabase.rpc('get_required_minutes', {
          p_family_id: familyId,
          p_child_id: childId,
          p_week_start: weekStart,
          p_weeks_ahead: horizonWeeks,
        });

        if (reqError) {
          console.warn(`Error getting required minutes for child ${childId}:`, reqError);
          continue;
        }

        for (const req of required || []) {
          const { data: done } = await serverSupabase.rpc('done_minutes_for_week', {
            p_family_id: familyId,
            p_child_id: childId,
            p_subject_id: req.subject_id,
            p_week_start: req.week,
          });

          const { data: scheduled } = await serverSupabase.rpc('scheduled_minutes_for_week', {
            p_family_id: familyId,
            p_child_id: childId,
            p_subject_id: req.subject_id,
            p_week_start: req.week,
          });

          const doneMinutes = done || 0;
          const scheduledMinutes = scheduled || 0;
          const deficit = req.required_minutes - doneMinutes;

          if (deficit > 0) {
            needs.push({
              childId,
              subjectId: req.subject_id,
              subjectName: null,
              week: req.week,
              requiredMinutes: req.required_minutes,
              doneMinutes,
              scheduledMinutes,
              deficit,
              velocity: velocityMap[`${childId}_${req.subject_id}`] || 1.0,
              isFlexible: false,
              hardDue: false,
            });
          }
        }
      }

      if (reason === 'pack_week' || reason === 'what_if') {
        const backlogItems = backlog.data || [];
        backlogItems
          .filter(item => item)
          .forEach((item, idx) => {
            const childId = item.child_id || childIds[0];
            if (!childId) return;
            needs.push({
              childId,
              subjectId: item.subject_id || null,
              subjectName: item.subject_name || item.title || 'Backlog Task',
              week: weekStart,
              requiredMinutes: item.estimated_minutes || 30,
              doneMinutes: 0,
              scheduledMinutes: 0,
              deficit: item.estimated_minutes || 30,
              velocity: 1.0,
              isFlexible: true,
              hardDue: !!item.due_ts,
              backlogId: item.id,
              orderIndex: idx,
            });
          });
      }

      // 3. Compute free gaps for each child
      const allGaps = [];
      for (const childId of childIds) {
        const childEvents = events.data?.filter(e => e.child_id === childId) || [];
        const gaps = await computeFreeGaps(
          childId,
          weekStart,
          weekEndDate.toISOString().split('T')[0],
          childEvents
        );
        allGaps.push(...gaps.map(g => ({ ...g, child_id: childId })));
      }

      // 4. Pack events using greedy algorithm
      const proposedEvents = packEventsIntoGaps(needs, allGaps, {
        maxMinutesPerDay: 240,
        maxMinutesPerBlock: 90,
        minMinutesPerBlock: 30,
      });

      // 5. Create plan record
      const { data: plan, error: planError } = await serverSupabase
        .from('ai_plans')
        .insert({
          family_id: familyId,
          week_start: weekStart,
          scope: {
            childIds,
            reason: reason || 'rebalance',
            horizonWeeks,
          },
          status: 'draft',
        })
        .select()
        .single();

      if (planError) throw planError;

      // 6. Create plan changes (adds)
      const changes = proposedEvents.map((event, index) => ({
        plan_id: plan.id,
        change_type: 'add',
        event_id: null,
        payload: {
          child: event.child_id,
          subject: event.subject_id,
          title: event.title,
          start: event.start_ts,
          end: event.end_ts,
          is_flexible: event.is_flexible,
          minutes: event.estimated_minutes,
          source_syllabus_id: event.source_syllabus_id,
        },
        suggested_by: 'ai',
        approved: false,
        applied: false,
      }));

      if (changes.length > 0) {
        const { error: changesError } = await serverSupabase
          .from('ai_plan_changes')
          .insert(changes);

        if (changesError) throw changesError;
      }

      // 7. Get subject names for display
      const subjectIds = [...new Set(proposedEvents.map(e => e.subject_id))];
      const { data: subjects } = await serverSupabase
        .from('subject')
        .select('id, name')
        .in('id', subjectIds);

      const subjectMap = {};
      subjects?.forEach(s => {
        subjectMap[s.id] = s.name;
      });

      // Format changes with subject names
      const { data: planChanges } = await serverSupabase
        .from('ai_plan_changes')
        .select('*')
        .eq('plan_id', plan.id)
        .order('created_at');

      const formattedChanges = planChanges?.map(change => ({
        ...change,
        payload: {
          ...change.payload,
          subjectName: subjectMap[change.payload.subject] || change.payload.subject,
        },
      })) || [];

      res.json({
        planId: plan.id,
        summary: {
          adds: formattedChanges.filter(c => c.change_type === 'add').length,
          moves: formattedChanges.filter(c => c.change_type === 'move').length,
          deletes: formattedChanges.filter(c => c.change_type === 'delete').length,
          minutesShifted: formattedChanges
            .filter(c => c.change_type === 'add')
            .reduce((sum, c) => sum + (c.payload.minutes || 0), 0),
        },
        changes: formattedChanges,
      });
    } catch (error) {
      console.error('Error proposing reschedule:', error);
      res.status(500).json({ error: error.message || 'Failed to propose reschedule' });
    }
  });

  /**
   * PATCH /api/ai/approve
   * Approve and apply plan changes atomically
   */
  app.patch('/api/ai/approve', async (req, res) => {
    try {
      const { planId, approvals } = req.body;

      if (!planId || !approvals || !Array.isArray(approvals)) {
        return res.status(400).json({ error: 'Missing required fields: planId, approvals' });
      }

      // Get plan
      const { data: plan, error: planError } = await serverSupabase
        .from('ai_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (planError || !plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      if (plan.status !== 'draft') {
        return res.status(400).json({ error: 'Plan is not in draft status' });
      }

      // Get all changes for this plan
      const { data: allChanges, error: changesError } = await serverSupabase
        .from('ai_plan_changes')
        .select('*')
        .eq('plan_id', planId);

      if (changesError) throw changesError;

      const results = [];
      let appliedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Apply approved changes in a transaction
      for (const approval of approvals) {
        const change = allChanges?.find(c => c.id === approval.changeId);
        if (!change) {
          results.push({ changeId: approval.changeId, status: 'error', error: 'Change not found' });
          errorCount++;
          continue;
        }

        // Update approval status
        await serverSupabase
          .from('ai_plan_changes')
          .update({ approved: approval.approved })
          .eq('id', change.id);

        if (!approval.approved) {
          results.push({ changeId: change.id, status: 'skipped' });
          skippedCount++;
          continue;
        }

        try {
          // Apply the change
          if (change.change_type === 'add') {
            const payload = change.payload;
            const edits = approval.edits || {};

            const { data: newEvent, error: insertError } = await serverSupabase
              .from('events')
              .insert({
                family_id: plan.family_id,
                child_id: payload.child,
                subject_id: payload.subject,
                title: payload.title,
                start_ts: edits.startTs || payload.start,
                end_ts: edits.endTs || payload.end,
                status: 'scheduled',
                is_flexible: payload.is_flexible || false,
                estimated_minutes: edits.minutes || payload.minutes,
                source_syllabus_id: payload.source_syllabus_id || null,
                source: 'ai_plan',
              })
              .select()
              .single();

            if (insertError) throw insertError;

            // Update change record
            await serverSupabase
              .from('ai_plan_changes')
              .update({
                applied: true,
                applied_at: new Date().toISOString(),
                event_id: newEvent.id,
              })
              .eq('id', change.id);

            results.push({ changeId: change.id, status: 'applied', eventId: newEvent.id });
            appliedCount++;

          } else if (change.change_type === 'move') {
            const payload = change.payload;
            const edits = approval.edits || {};

            const { error: updateError } = await serverSupabase
              .from('events')
              .update({
                start_ts: edits.startTs || payload.to_start,
                end_ts: edits.endTs || payload.to_end,
                updated_at: new Date().toISOString(),
              })
              .eq('id', change.event_id);

            if (updateError) throw updateError;

            await serverSupabase
              .from('ai_plan_changes')
              .update({
                applied: true,
                applied_at: new Date().toISOString(),
              })
              .eq('id', change.id);

            results.push({ changeId: change.id, status: 'applied' });
            appliedCount++;

          } else if (change.change_type === 'delete') {
            const { error: deleteError } = await serverSupabase
              .from('events')
              .update({
                status: 'canceled',
                updated_at: new Date().toISOString(),
              })
              .eq('id', change.event_id);

            if (deleteError) throw deleteError;

            await serverSupabase
              .from('ai_plan_changes')
              .update({
                applied: true,
                applied_at: new Date().toISOString(),
              })
              .eq('id', change.id);

            results.push({ changeId: change.id, status: 'applied' });
            appliedCount++;
          }
        } catch (err) {
          console.error(`Error applying change ${change.id}:`, err);
          results.push({ changeId: change.id, status: 'error', error: err.message });
          errorCount++;
        }
      }

      // Update plan status
      const planStatus = errorCount === 0 && skippedCount === 0 ? 'applied' : 'partial';
      await serverSupabase
        .from('ai_plans')
        .update({
          status: planStatus,
          applied_at: new Date().toISOString(),
        })
        .eq('id', planId);

      res.json({
        applied: true,
        counts: {
          adds: results.filter(r => r.status === 'applied' && allChanges?.find(c => c.id === r.changeId)?.change_type === 'add').length,
          moves: results.filter(r => r.status === 'applied' && allChanges?.find(c => c.id === r.changeId)?.change_type === 'move').length,
          deletes: results.filter(r => r.status === 'applied' && allChanges?.find(c => c.id === r.changeId)?.change_type === 'delete').length,
        },
        results,
      });
    } catch (error) {
      console.error('Error approving plan:', error);
      res.status(500).json({ error: error.message || 'Failed to approve plan' });
    }
  });

  /**
   * POST /api/ai/recompute-velocity
   * Recompute learning velocity based on done/expected ratios
   */
  app.post('/api/ai/recompute-velocity', async (req, res) => {
    try {
      const { familyId, sinceWeeks = 6 } = req.body;

      if (!familyId) {
        return res.status(400).json({ error: 'Missing required field: familyId' });
      }

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - (sinceWeeks * 7));

      // Get all children in family
      const { data: children } = await serverSupabase
        .from('children')
        .select('id')
        .eq('family_id', familyId);

      if (!children || children.length === 0) {
        return res.json({ updated: [] });
      }

      const updated = [];

      for (const child of children) {
        // Get all syllabi for this child
        const { data: syllabi } = await serverSupabase
          .from('syllabi')
          .select('subject_id, expected_weekly_minutes')
          .eq('family_id', familyId)
          .eq('child_id', child.id)
          .gte('start_date', sinceDate.toISOString().split('T')[0]);

        if (!syllabi || syllabi.length === 0) continue;

        for (const syllabus of syllabi) {
          // Calculate done vs expected over the period
          const weekStarts = [];
          for (let i = 0; i < sinceWeeks; i++) {
            const weekStart = new Date(sinceDate);
            weekStart.setDate(weekStart.getDate() + (i * 7));
            weekStarts.push(weekStart.toISOString().split('T')[0]);
          }

          let totalDone = 0;
          let totalExpected = 0;

          for (const weekStart of weekStarts) {
            const { data: done } = await serverSupabase.rpc('done_minutes_for_week', {
              p_family_id: familyId,
              p_child_id: child.id,
              p_subject_id: syllabus.subject_id,
              p_week_start: weekStart,
            });

            totalDone += done || 0;
            totalExpected += syllabus.expected_weekly_minutes || 0;
          }

          if (totalExpected === 0) continue;

          // Calculate ratio
          const ratio = totalDone / totalExpected;

          // Get existing velocity
          const { data: existing } = await serverSupabase
            .from('learning_velocity')
            .select('velocity')
            .eq('family_id', familyId)
            .eq('child_id', child.id)
            .eq('subject_id', syllabus.subject_id)
            .single();

          const oldVelocity = existing?.velocity || 1.0;

          // EMA update: new_v = 0.7*old + 0.3*ratio
          let newVelocity = 0.7 * oldVelocity + 0.3 * ratio;

          // Clamp to [0.6, 1.5]
          newVelocity = Math.max(0.6, Math.min(1.5, newVelocity));

          // Upsert
          const { error: upsertError } = await serverSupabase
            .from('learning_velocity')
            .upsert({
              family_id: familyId,
              child_id: child.id,
              subject_id: syllabus.subject_id,
              velocity: newVelocity,
              last_updated: new Date().toISOString(),
            }, {
              onConflict: 'family_id,child_id,subject_id',
            });

          if (!upsertError) {
            updated.push({
              childId: child.id,
              subjectId: syllabus.subject_id,
              velocity: newVelocity,
              oldVelocity,
              ratio,
            });
          }
        }
      }

      res.json({ updated });
    } catch (error) {
      console.error('Error recomputing velocity:', error);
      res.status(500).json({ error: error.message || 'Failed to recompute velocity' });
    }
  });
};


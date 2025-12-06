"""
AI Micro-Rescheduler Service
Intelligently reschedules tasks from backlog (source='auto_reschedule') into available time slots.
This is a micro-level rebalance that fills holes after schedule adjustments.
"""
import os
import json
import asyncio
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional
import backoff
from openai import AsyncOpenAI
from pathlib import Path
import sys

# Add parent directory to path
backend_dir = Path(__file__).parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from supabase_client import get_admin_client
from logger import log_event

# Initialize OpenAI client
_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not _OPENAI_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is required")

client = AsyncOpenAI(api_key=_OPENAI_KEY)


# Cache the table name to avoid repeated checks
_backlog_table_name_cache: Optional[str] = None

def _get_backlog_table_name() -> str:
    """
    Determine which backlog table name to use.
    Tries 'backlog_items' first (most common), then falls back to 'backlog'.
    Uses caching to avoid repeated table existence checks.
    """
    global _backlog_table_name_cache
    
    if _backlog_table_name_cache:
        return _backlog_table_name_cache
    
    supabase = get_admin_client()
    
    # Try backlog_items first (most common in this codebase)
    try:
        supabase.table("backlog_items").select("id").limit(1).execute()
        _backlog_table_name_cache = "backlog_items"
        return _backlog_table_name_cache
    except:
        pass
    
    # Fall back to backlog
    try:
        supabase.table("backlog").select("id").limit(1).execute()
        _backlog_table_name_cache = "backlog"
        return _backlog_table_name_cache
    except:
        pass
    
    # Default to backlog_items (most common)
    _backlog_table_name_cache = "backlog_items"
    return _backlog_table_name_cache


async def fetch_unscheduled_tasks(child_id: str, family_id: str):
    """
    Pull backlog items marked specifically for auto-reschedule.
    
    Also fetches the original events that were unscheduled (if we have event_id tracking).
    Returns (tasks, old_events_lookup) tuple where old_events_lookup maps backlog_id -> old event data.
    
    Returns tasks that need to be rescheduled after a schedule adjustment.
    """
    supabase = get_admin_client()
    table_name = _get_backlog_table_name()
    
    try:
        result = (
            supabase.table(table_name)
            .select("*")
            .eq("child_id", child_id)
            .eq("family_id", family_id)
            .eq("source", "auto_reschedule")
            .order("created_at", desc=False)
            .execute()
        )
        
        tasks = result.data or []
        
        # Build lookup of old events if backlog has event_id or we can infer from metadata
        old_events_lookup: Dict[str, Dict[str, Any]] = {}
        
        # Try to fetch old event data from backlog metadata or event_id if available
        for task in tasks:
            backlog_id = task.get("id")
            event_id = task.get("event_id")  # If backlog tracks original event_id
            
            if event_id:
                try:
                    event_result = supabase.table("events").select(
                        "id, start_ts, end_ts, title, subject_id, year_plan_id"
                    ).eq("id", event_id).maybe_single().execute()
                    
                    if event_result.data:
                        old_events_lookup[backlog_id] = event_result.data
                except:
                    pass  # Event might already be deleted, that's okay
        
        log_event("micro_rescheduler.fetch_tasks", child_id=child_id, table=table_name, count=len(tasks))
        return tasks, old_events_lookup
    except Exception as e:
        log_event("micro_rescheduler.fetch_tasks_error", child_id=child_id, table=table_name, error=str(e))
        return [], {}


async def fetch_availability(child_id: str, family_id: str, horizon_days: int = 21) -> List[Dict[str, Any]]:
    """
    Fetch availability for the next N days from calendar_days_cache.
    
    Returns availability windows, blackout status, and partial day info.
    """
    supabase = get_admin_client()
    today = date.today()
    end_date = today + timedelta(days=horizon_days)
    
    try:
        result = (
            supabase.table("calendar_days_cache")
            .select("*")
            .eq("child_id", child_id)
            .eq("family_id", family_id)
            .gte("date", today.isoformat())
            .lte("date", end_date.isoformat())
            .order("date", desc=False)
            .execute()
        )
        
        availability = result.data or []
        log_event("micro_rescheduler.fetch_availability", child_id=child_id, count=len(availability))
        return availability
    except Exception as e:
        log_event("micro_rescheduler.fetch_availability_error", child_id=child_id, error=str(e))
        return []


async def fetch_existing_events(child_id: str, family_id: str, horizon_days: int = 21) -> List[Dict[str, Any]]:
    """
    Fetch scheduled events so we don't overlap.
    
    Returns events in the scheduling window.
    """
    supabase = get_admin_client()
    today = datetime.now().date()
    end_date = today + timedelta(days=horizon_days)
    start_ts = datetime.combine(today, datetime.min.time()).isoformat()
    end_ts = datetime.combine(end_date, datetime.max.time()).isoformat()
    
    try:
        result = (
            supabase.table("events")
            .select("id, child_id, start_ts, end_ts, subject_id, status")
            .eq("child_id", child_id)
            .eq("family_id", family_id)
            .gte("start_ts", start_ts)
            .lte("start_ts", end_ts)
            .neq("status", "done")
            .neq("status", "canceled")
            .order("start_ts", desc=False)
            .execute()
        )
        
        events = result.data or []
        log_event("micro_rescheduler.fetch_events", child_id=child_id, count=len(events))
        return events
    except Exception as e:
        log_event("micro_rescheduler.fetch_events_error", child_id=child_id, error=str(e))
        return []


def build_availability_intervals(availability: List[Dict[str, Any]], existing_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert calendar_days_cache entries into available time intervals.
    
    Respects:
    - Blackout days (day_status='off') - no availability
    - Partial days (day_status='partial') - limited windows
    - Existing events - removes occupied blocks
    - first_block_start / last_block_end from cache
    """
    intervals = []
    
    # Group existing events by date
    events_by_date = {}
    for ev in existing_events:
        ev_date = datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00")).date()
        if ev_date not in events_by_date:
            events_by_date[ev_date] = []
        events_by_date[ev_date].append({
            "start": datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00")),
            "end": datetime.fromisoformat(ev["end_ts"].replace("Z", "+00:00"))
        })
    
    for day in availability:
        # Handle date parsing - could be string or date object
        if isinstance(day["date"], str):
            day_date = datetime.fromisoformat(day["date"]).date()
        elif hasattr(day["date"], 'date'):
            day_date = day["date"].date() if hasattr(day["date"], 'date') else day["date"]
        else:
            day_date = day["date"]
        day_status = day.get("day_status", "teach")
        
        # Skip blackout days
        if day_status == "off":
            continue
        
        # Get available window
        first_start = day.get("first_block_start")
        last_end = day.get("last_block_end")
        
        if not first_start or not last_end:
            # Default to 9 AM - 5 PM if not specified
            start_time = datetime.combine(day_date, datetime.min.time().replace(hour=9, minute=0))
            end_time = datetime.combine(day_date, datetime.min.time().replace(hour=17, minute=0))
        else:
            # Parse time strings (HH:MM:SS or HH:MM)
            start_parts = str(first_start).split(":")
            end_parts = str(last_end).split(":")
            start_time = datetime.combine(day_date, datetime.min.time().replace(
                hour=int(start_parts[0]),
                minute=int(start_parts[1]) if len(start_parts) > 1 else 0
            ))
            end_time = datetime.combine(day_date, datetime.min.time().replace(
                hour=int(end_parts[0]),
                minute=int(end_parts[1]) if len(end_parts) > 1 else 0
            ))
        
        # Remove occupied blocks
        occupied = events_by_date.get(day_date, [])
        available_blocks = []
        current_start = start_time
        
        # Sort occupied blocks by start time
        occupied_sorted = sorted(occupied, key=lambda x: x["start"])
        
        for occ in occupied_sorted:
            if current_start < occ["start"]:
                # There's a gap before this occupied block
                available_blocks.append({
                    "date": day_date.isoformat(),
                    "start": current_start.isoformat(),
                    "end": min(occ["start"], end_time).isoformat()
                })
            current_start = max(current_start, occ["end"])
        
        # Add remaining time after last occupied block
        if current_start < end_time:
            available_blocks.append({
                "date": day_date.isoformat(),
                "start": current_start.isoformat(),
                "end": end_time.isoformat()
            })
        
        # If no occupied blocks, entire window is available
        if not occupied:
            available_blocks.append({
                "date": day_date.isoformat(),
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            })
        
        intervals.extend(available_blocks)
    
    return intervals


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def propose_schedule_with_ai(
    tasks: List[Dict[str, Any]],
    availability_intervals: List[Dict[str, Any]],
    existing_events: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Ask OpenAI to propose optimal event placements.
    
    Returns assignments in format:
    {
        "assignments": [
            {
                "backlog_id": "uuid",
                "start_ts": "2025-02-01T09:00:00Z",
                "end_ts": "2025-02-01T10:00:00Z",
                "subject_id": "uuid" (optional)
            }
        ],
        "rationale": ["Explanation of decisions"]
    }
    """
    if not tasks:
        return {"assignments": [], "rationale": ["No tasks to schedule"]}
    
    if not availability_intervals:
        return {"assignments": [], "rationale": ["No available time slots in the next 21 days"]}
    
    # Prepare task summaries for AI
    task_summaries = []
    for task in tasks:
        task_summaries.append({
            "backlog_id": task.get("id"),
            "title": task.get("title", "Untitled Task"),
            "estimated_minutes": task.get("estimated_minutes", 60),
            "subject_id": task.get("subject_id"),
            "year_plan_id": task.get("year_plan_id"),
            "due_ts": task.get("due_ts"),
            "priority": task.get("priority", 0)
        })
    
    # Prepare availability summary
    interval_summaries = []
    for interval in availability_intervals:
        start_dt = datetime.fromisoformat(interval["start"].replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(interval["end"].replace("Z", "+00:00"))
        duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
        
        interval_summaries.append({
            "date": interval["date"],
            "start": interval["start"],
            "end": interval["end"],
            "duration_minutes": duration_minutes
        })
    
    prompt = f"""You are a scheduling optimizer. Your task is to fit unscheduled learning tasks into available time slots.

TASKS TO SCHEDULE:
{json.dumps(task_summaries, indent=2)}

AVAILABLE TIME INTERVALS:
{json.dumps(interval_summaries, indent=2)}

EXISTING EVENTS (to avoid overlaps):
{json.dumps([{"start": e["start_ts"], "end": e["end_ts"]} for e in existing_events], indent=2)}

RULES:
1. Fit tasks into open time intervals
2. Respect blackout days (no intervals on blackout days)
3. Avoid overlaps with existing events
4. Prefer earlier days when possible
5. Keep sessions contiguous (don't split unless necessary)
6. If a task doesn't fit exactly, use the largest available block
7. If no single block fits, split into two smaller blocks (e.g., 30min + 30min for 60min task)
8. Respect due dates - prioritize tasks with earlier due dates
9. Group by subject when possible for efficiency

RETURN FORMAT (JSON only):
{{
  "assignments": [
    {{
      "backlog_id": "uuid",
      "start_ts": "2025-02-01T09:00:00Z",
      "end_ts": "2025-02-01T10:00:00Z",
      "subject_id": "uuid" (if available from task)
    }}
  ],
  "rationale": [
    "Placed Math task on Monday morning to meet due date",
    "Split Reading task into two 30-minute blocks"
  ]
}}

Return ONLY valid JSON, no commentary."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a scheduling optimizer. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,  # Deterministic
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        parsed = json.loads(content)
        
        log_event("micro_rescheduler.ai_proposal", assignments_count=len(parsed.get("assignments", [])))
        return parsed
    except json.JSONDecodeError as e:
        # Try to extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        log_event("micro_rescheduler.ai_parse_error", error=str(e))
        raise ValueError(f"Failed to parse AI response as JSON: {e}")
    except Exception as e:
        log_event("micro_rescheduler.ai_error", error=str(e))
        raise


def validate_event_assignment(
    assignment: Dict[str, Any],
    availability_intervals: List[Dict[str, Any]],
    existing_events: List[Dict[str, Any]]
):
    """
    Validate an AI-proposed event assignment.
    
    Returns tuple of (is_valid: bool, error_message: Optional[str])
    """
    try:
        start_ts = datetime.fromisoformat(assignment["start_ts"].replace("Z", "+00:00"))
        end_ts_str = assignment.get("end_ts")
        
        if not end_ts_str:
            return False, "Missing end_ts"
        
        end_ts = datetime.fromisoformat(end_ts_str.replace("Z", "+00:00"))
        
        # Check 1: start < end
        if start_ts >= end_ts:
            return False, f"Invalid time range: start ({start_ts}) >= end ({end_ts})"
        
        # Check 2: Within available intervals
        assignment_date = start_ts.date()
        found_interval = False
        
        for interval in availability_intervals:
            interval_start = datetime.fromisoformat(interval["start"].replace("Z", "+00:00"))
            interval_end = datetime.fromisoformat(interval["end"].replace("Z", "+00:00"))
            
            if interval_start.date() == assignment_date:
                if start_ts >= interval_start and end_ts <= interval_end:
                    found_interval = True
                    break
        
        if not found_interval:
            return False, f"Assignment outside available intervals for {assignment_date}"
        
        # Check 3: No overlap with existing events
        for ev in existing_events:
            ev_start = datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00"))
            ev_end = datetime.fromisoformat(ev["end_ts"].replace("Z", "+00:00"))
            
            # Check for overlap
            if not (end_ts <= ev_start or start_ts >= ev_end):
                return False, f"Overlaps with existing event: {ev_start} - {ev_end}"
        
        return True, None
        
    except Exception as e:
        return False, f"Validation error: {str(e)}"


async def insert_events(
    assignments: List[Dict[str, Any]],
    child_id: str,
    family_id: str,
    tasks_lookup: Dict[str, Dict[str, Any]],
    availability_intervals: List[Dict[str, Any]],
    existing_events: List[Dict[str, Any]],
    old_events_lookup: Optional[Dict[str, Dict[str, Any]]] = None
):
    """
    Insert AI-proposed event assignments into events table.
    
    Validates each assignment before insertion.
    Marks backlog items as resolved (instead of deleting) for audit trail.
    
    Returns (inserted_count, diff_items) tuple where diff_items is a list of diff objects
    for the frontend diff viewer.
    """
    if old_events_lookup is None:
        old_events_lookup = {}
    
    supabase = get_admin_client()
    inserted_count = 0
    validation_failures = []
    diff_items: List[Dict[str, Any]] = []
    
    for assignment in assignments:
        backlog_id = assignment.get("backlog_id")
        if not backlog_id:
            continue
        
        task = tasks_lookup.get(backlog_id)
        if not task:
            log_event("micro_rescheduler.task_not_found", backlog_id=backlog_id)
            continue
        
        # Validate assignment
        is_valid, error_msg = validate_event_assignment(assignment, availability_intervals, existing_events)
        
        if not is_valid:
            log_event("micro_rescheduler.validation_failed", backlog_id=backlog_id, error=error_msg)
            validation_failures.append({"backlog_id": backlog_id, "error": error_msg})
            continue
        
        try:
            # Calculate end_ts from start_ts and duration
            start_ts = datetime.fromisoformat(assignment["start_ts"].replace("Z", "+00:00"))
            end_ts_str = assignment.get("end_ts")
            
            if not end_ts_str:
                # Calculate from estimated_minutes
                estimated_minutes = task.get("estimated_minutes", 60)
                end_ts = start_ts + timedelta(minutes=estimated_minutes)
            else:
                end_ts = datetime.fromisoformat(end_ts_str.replace("Z", "+00:00"))
            
            # Build event payload
            event_payload = {
                "child_id": child_id,
                "family_id": family_id,
                "subject_id": assignment.get("subject_id") or task.get("subject_id"),
                "title": task.get("title", "Scheduled Task"),
                "start_ts": start_ts.isoformat(),
                "end_ts": end_ts.isoformat(),
                "status": "scheduled",
                "source": "ai"
            }
            
            # Add year_plan_id if available (for task references)
            if task.get("year_plan_id"):
                event_payload["year_plan_id"] = task["year_plan_id"]
            
            # Insert event
            result = supabase.table("events").insert(event_payload).execute()
            
            if result.data:
                inserted_count += 1
                new_event_data = result.data[0]
                
                # Build diff item if we have old event data
                old_event_data = old_events_lookup.get(backlog_id)
                if old_event_data:
                    diff_item = {
                        "task_id": task.get("task_id"),
                        "year_plan_id": task.get("year_plan_id"),
                        "title": task.get("title", "Scheduled Task"),
                        "subject_id": task.get("subject_id"),
                        "child_id": child_id,
                        "old_event": {
                            "start_ts": old_event_data.get("start_ts"),
                            "end_ts": old_event_data.get("end_ts"),
                        },
                        "new_event": {
                            "start_ts": new_event_data.get("start_ts"),
                            "end_ts": new_event_data.get("end_ts"),
                        },
                        "reason": "catch_up",  # Default reason for micro-rescheduler
                    }
                    diff_items.append(diff_item)
                
                # Mark backlog as resolved (instead of deleting) for audit trail
                table_name = _get_backlog_table_name()
                now = datetime.utcnow().isoformat()
                try:
                    supabase.table(table_name).update({
                        "resolved_at": now
                    }).eq("id", backlog_id).execute()
                except Exception as resolve_error:
                    # If resolved_at column doesn't exist yet, fall back to delete
                    log_event("micro_rescheduler.resolve_fallback", backlog_id=backlog_id, error=str(resolve_error))
                    supabase.table(table_name).delete().eq("id", backlog_id).execute()
                
                log_event("micro_rescheduler.event_inserted", backlog_id=backlog_id, event_id=new_event_data.get("id"))
            else:
                log_event("micro_rescheduler.event_insert_failed", backlog_id=backlog_id)
                
        except Exception as e:
            log_event("micro_rescheduler.insert_error", backlog_id=backlog_id, error=str(e))
            continue
    
    if validation_failures:
        log_event("micro_rescheduler.validation_summary", failures=len(validation_failures), details=validation_failures)
    
    return inserted_count, diff_items


async def refresh_calendar_cache(child_id: str, family_id: str, horizon_days: int = 21) -> None:
    """
    Refresh calendar_days_cache for the scheduling window.
    """
    supabase = get_admin_client()
    today = date.today()
    end_date = today + timedelta(days=horizon_days)
    
    try:
        supabase.rpc(
            "refresh_calendar_days_cache",
            {
                "p_family_id": family_id,
                "p_from_date": today.isoformat(),
                "p_to_date": end_date.isoformat()
            }
        ).execute()
        log_event("micro_rescheduler.cache_refreshed", child_id=child_id)
    except Exception as e:
        # Log but don't fail - cache refresh is best effort
        log_event("micro_rescheduler.cache_refresh_error", child_id=child_id, error=str(e))


async def run_micro_rescheduler(
    child_id: str,
    family_id: str,
    horizon_days: int = 21
) -> Dict[str, Any]:
    """
    Primary entry point for micro-rescheduler.
    
    Fetches unscheduled tasks, finds available slots, uses AI to optimize,
    and inserts new events.
    
    Args:
        child_id: Child ID to reschedule for
        family_id: Family ID for context
        horizon_days: How many days ahead to look for availability (default 21)
    
    Returns:
        {
            "status": "ok" | "no_tasks" | "no_availability" | "error",
            "scheduled": <count>,
            "tasks_processed": <count>,
            "rationale": [<explanations>]
        }
    """
    run_id = None
    try:
        # Log run start
        try:
            from planner_logging.planner_instrumentation import log_run_start, log_run_end, log_error, log_warning
            run_id = log_run_start(
                family_id=family_id,
                child_id=child_id,
                mode="auto_reschedule",
                metadata={"horizon_days": horizon_days}
            )
        except Exception as inst_err:
            # Don't fail if instrumentation is not available
            log_event("micro_rescheduler.instrumentation_error", error=str(inst_err))
        # Step 1: Fetch unscheduled tasks (and old events if available)
        tasks, old_events_lookup = await fetch_unscheduled_tasks(child_id, family_id)
        
        if not tasks:
            result = {
                "status": "no_tasks",
                "scheduled": 0,
                "tasks_processed": 0,
                "rationale": ["No tasks marked for auto-reschedule"],
                "diff": []
            }
            # Log run end
            if run_id:
                try:
                    from planner_logging.planner_instrumentation import log_run_end
                    log_run_end(run_id, status="completed", event_count=0, task_count=0)
                except:
                    pass
            return result
        
        # Step 2: Fetch availability
        availability = await fetch_availability(child_id, family_id, horizon_days)
        
        if not availability:
            log_event("micro_rescheduler.no_availability", child_id=child_id)
            result = {
                "status": "no_availability",
                "scheduled": 0,
                "tasks_processed": len(tasks),
                "rationale": ["No availability data found in calendar cache"],
                "diff": []
            }
            # Log run end
            if run_id:
                try:
                    from planner_logging.planner_instrumentation import log_run_end
                    log_run_end(run_id, status="completed", event_count=0, task_count=len(tasks))
                except:
                    pass
            return result
        
        # Step 3: Fetch existing events
        existing_events = await fetch_existing_events(child_id, family_id, horizon_days)
        
        # Step 3.5: Fetch schedule overrides
        overrides = await fetch_schedule_overrides(child_id, family_id, horizon_days)
        
        # Step 4: Build availability intervals (with overrides)
        availability_intervals = build_availability_intervals(availability, existing_events, overrides)
        
        if not availability_intervals:
            result = {
                "status": "no_availability",
                "scheduled": 0,
                "tasks_processed": len(tasks),
                "rationale": ["No available time slots after accounting for existing events and blackouts"],
                "diff": []
            }
            # Log run end
            if run_id:
                try:
                    from planner_logging.planner_instrumentation import log_run_end
                    log_run_end(run_id, status="completed", event_count=0, task_count=len(tasks))
                except:
                    pass
            return result
        
        # Step 5: Ask AI to propose schedule
        ai_response = await propose_schedule_with_ai(tasks, availability_intervals, existing_events)
        
        assignments = ai_response.get("assignments", [])
        rationale = ai_response.get("rationale", [])
        
        if not assignments:
            result = {
                "status": "no_assignments",
                "scheduled": 0,
                "tasks_processed": len(tasks),
                "rationale": rationale or ["AI could not find suitable time slots"],
                "diff": []
            }
            # Log run end
            if run_id:
                try:
                    from planner_logging.planner_instrumentation import log_run_end
                    log_run_end(run_id, status="completed", event_count=0, task_count=len(tasks))
                except:
                    pass
            return result
        
        # Step 6: Build tasks lookup for event creation
        tasks_lookup = {task["id"]: task for task in tasks}
        
        # Step 7: Insert events (with validation) and get diff items
        inserted_count, diff_items = await insert_events(
            assignments, 
            child_id, 
            family_id, 
            tasks_lookup, 
            availability_intervals, 
            existing_events,
            old_events_lookup
        )
        
        # Step 8: Refresh calendar cache
        await refresh_calendar_cache(child_id, family_id, horizon_days)
        
        result = {
            "status": "ok",
            "scheduled": inserted_count,
            "tasks_processed": len(tasks),
            "rationale": rationale,
            "diff": diff_items  # Return diff items for frontend
        }
        
        # Log run end (success)
        if run_id:
            try:
                from planner_logging.planner_instrumentation import log_run_end
                log_run_end(run_id, status="completed", event_count=inserted_count, task_count=len(tasks))
            except:
                pass
        
        return result
        
    except Exception as e:
        log_event("micro_rescheduler.error", child_id=child_id, error=str(e))
        
        # Log error
        try:
                from planner_logging.planner_instrumentation import log_error, log_run_end
            log_error(
                family_id=family_id,
                child_id=child_id,
                error_type="rescheduler_error",
                message=str(e),
                run_id=run_id,
                exception=e
            )
            if run_id:
                log_run_end(run_id, status="failed", event_count=0, task_count=0)
        except:
            pass
        
        return {
            "status": "error",
            "scheduled": 0,
            "tasks_processed": 0,
            "rationale": [f"Error during rescheduling: {str(e)}"],
            "diff": []
        }


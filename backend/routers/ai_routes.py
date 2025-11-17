"""
FastAPI routes for AI assistant features
Part of Phase 2 - AI Parent Assistant + Daily Automation
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import sys
from pathlib import Path
import time
import json
import uuid

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from metrics import increment_counter

try:
    from llm import llm_pack_week, llm_catch_up, llm_event_tags, llm_summarize_progress, llm_generate_syllabus, llm_inspire_learning
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("llm", backend_dir / "llm.py")
    llm_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(llm_module)
    llm_pack_week = llm_module.llm_pack_week
    llm_catch_up = llm_module.llm_catch_up
    llm_event_tags = llm_module.llm_event_tags
    llm_summarize_progress = getattr(llm_module, 'llm_summarize_progress', None)
    llm_generate_syllabus = getattr(llm_module, 'llm_generate_syllabus', None)
    llm_inspire_learning = getattr(llm_module, 'llm_inspire_learning', None)

try:
    from routers.util import load_planning_context
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("util", backend_dir / "routers" / "util.py")
    util_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(util_module)
    load_planning_context = util_module.load_planning_context

try:
    from supabase_client import get_admin_client
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ============================================================
# Request/Response Models
# ============================================================

class SummarizeProgressInput(BaseModel):
    rangeStart: str  # YYYY-MM-DD
    rangeEnd: str    # YYYY-MM-DD


class SummarizeProgressOut(BaseModel):
    ok: bool
    summary: str
    taskRunId: Optional[str] = None


class PackWeekInput(BaseModel):
    weekStart: str  # YYYY-MM-DD (Monday)
    childIds: Optional[List[str]] = None  # If None, pack for all children


class PackWeekOut(BaseModel):
    ok: bool
    events: List[Dict[str, Any]]
    notes: str
    taskRunId: Optional[str] = None


class CatchUpInput(BaseModel):
    missedEventIds: List[str]


class CatchUpOut(BaseModel):
    ok: bool
    rescheduled: List[Dict[str, Any]]
    notes: str
    taskRunId: Optional[str] = None


class GenerateSyllabusInput(BaseModel):
    url: str = Field(..., description="Source URL (e.g., YouTube playlist URL)")
    course_id: Optional[str] = Field(None, description="Optional course ID to upsert units/lessons")


class GenerateSyllabusOut(BaseModel):
    ok: bool
    units: List[Dict[str, Any]]
    upserted: Optional[Dict[str, Any]] = None  # { units_count, lessons_count } if course_id provided


# ============================================================
# Helper Functions
# ============================================================

def _insert_ai_task(
    supabase,
    family_id: str,
    kind: str,
    params: Dict[str, Any],
    user_id: str
) -> str:
    """Insert a new AI task run record and return its ID."""
    task_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    
    try:
        result = supabase.table("ai_task_runs").insert({
            "id": task_id,
            "family_id": family_id,
            "kind": kind,
            "params": params,
            "status": "pending",
            "created_at": now
        }).execute()
        
        if result.data:
            return task_id
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create AI task record: No data returned"
        )
    except Exception as e:
        error_msg = str(e)
        print(f"[AI_ROUTES] Error inserting ai_task_runs: {error_msg}")
        print(f"[AI_ROUTES] family_id={family_id}, kind={kind}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create AI task record: {error_msg}"
        )


def _update_ai_task(
    supabase,
    task_id: str,
    status: str,
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None
):
    """Update an AI task run record."""
    now = datetime.utcnow().isoformat() + "Z"
    update_data = {
        "status": status
    }
    
    if status == "running":
        update_data["started_at"] = now
    elif status in ("succeeded", "failed"):
        update_data["completed_at"] = now
    
    if result is not None:
        update_data["result"] = result
    if error is not None:
        update_data["error"] = error
    
    supabase.table("ai_task_runs").update(update_data).eq("id", task_id).execute()


# ============================================================
# Routes
# ============================================================

@router.post("/summarize_progress", response_model=SummarizeProgressOut)
async def summarize_progress(
    body: SummarizeProgressInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate a progress summary for a date range.
    Uses get_progress_snapshot RPC to fetch data, then formats it.
    """
    supabase = get_admin_client()
    family_id = get_family_id_for_user(user["id"])
    
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    # Parse dates
    try:
        start_date = datetime.strptime(body.rangeStart, "%Y-%m-%d").date()
        end_date = datetime.strptime(body.rangeEnd, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be <= end_date"
        )
    
    # Create task record (optional - don't block if it fails)
    task_id = None
    try:
        task_id = _insert_ai_task(
            supabase,
            family_id,
            "summarize_progress",
            {
                "range_start": body.rangeStart,
                "range_end": body.rangeEnd
            },
            user["id"]
        )
        if task_id:
            _update_ai_task(supabase, task_id, "running")
    except Exception as e:
        print(f"[AI_ROUTES] Warning: Failed to create task record (non-blocking): {e}")
        # Continue without task logging
    
    try:
        
        # Call RPC to get progress snapshot
        try:
            print(f"[AI_ROUTES] Calling get_progress_snapshot with family_id={family_id}, start={body.rangeStart}, end={body.rangeEnd}")
            rpc_result = supabase.rpc(
                "get_progress_snapshot",
                {
                    "p_family_id": str(family_id),  # Ensure it's a string
                    "p_start": body.rangeStart,
                    "p_end": body.rangeEnd
                }
            ).execute()
            
            print(f"[AI_ROUTES] RPC result: data type={type(rpc_result.data)}, data={rpc_result.data}, error={getattr(rpc_result, 'error', None)}")
            
            # Handle different response formats
            if rpc_result.data is None:
                error_msg = getattr(rpc_result, 'error', None) or getattr(rpc_result, 'message', None) or "Unknown error"
                print(f"[AI_ROUTES] RPC get_progress_snapshot returned None. Error: {error_msg}")
                rows = []
            elif isinstance(rpc_result.data, bool):
                # RPC returned boolean (unexpected) - treat as empty
                print(f"[AI_ROUTES] RPC returned boolean instead of array: {rpc_result.data}")
                rows = []
            elif isinstance(rpc_result.data, list):
                rows = rpc_result.data
            else:
                # Try to convert to list
                print(f"[AI_ROUTES] RPC returned unexpected type: {type(rpc_result.data)}, converting to list")
                rows = list(rpc_result.data) if rpc_result.data else []
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"[AI_ROUTES] Exception calling get_progress_snapshot RPC: {error_type}: {error_msg}")
            print(f"[AI_ROUTES] Exception details: {repr(e)}")
            # Don't fail - return empty summary instead
            rows = []
        
        # Records data (latest_grade, credits, portfolio_count) is now included in get_progress_snapshot RPC
        # No need to fetch separately - it's already in rows
        
        # Format summary using LLM if available, otherwise fallback to simple text
        try:
            if not rows:
                summary = f"No events found for {body.rangeStart} to {body.rangeEnd}."
            else:
                print(f"[AI_ROUTES] Formatting summary for {len(rows)} rows")
                
                # Try LLM summarization if available
                if llm_summarize_progress:
                    try:
                        print(f"[AI_ROUTES] Using LLM to generate summary")
                        llm_context = {
                            "snapshot_rows": rows,
                            "range_start": body.rangeStart,
                            "range_end": body.rangeEnd,
                            "records": {}  # Records data is now in snapshot_rows (latest_grade, credits, portfolio_count)
                        }
                        summary = await llm_summarize_progress(llm_context)
                        print(f"[AI_ROUTES] LLM summary generated, length={len(summary)}")
                    except Exception as llm_error:
                        print(f"[AI_ROUTES] LLM summarization failed, falling back to simple format: {llm_error}")
                        # Fall through to simple formatting
                        summary = None
                else:
                    summary = None
                
                # Fallback to simple text formatting
                if not summary:
                    summary_parts = [f"Progress Summary ({body.rangeStart} to {body.rangeEnd}):\n"]
                    
                    current_child = None
                    for row in rows:
                        if not isinstance(row, dict):
                            print(f"[AI_ROUTES] Warning: row is not a dict: {type(row)} = {row}")
                            continue
                        
                        if row.get("child_name") != current_child:
                            if current_child is not None:
                                summary_parts.append("")
                            current_child = row.get("child_name")
                            summary_parts.append(f"{current_child}:")
                        
                        subject = row.get("subject_name", "—")
                        total = row.get("total_events", 0)
                        done = row.get("done_events", 0)
                        missed = row.get("missed_events", 0)
                        upcoming = row.get("upcoming_events", 0)
                        avg_rating = row.get("avg_rating")
                        strengths = row.get("recent_strengths", [])
                        struggles = row.get("recent_struggles", [])
                        
                        line = f"  {subject}: {done}/{total} done, {missed} missed, {upcoming} upcoming"
                        if avg_rating:
                            line += f", avg rating {float(avg_rating):.1f}/5"
                        if strengths:
                            line += f". Strengths: {', '.join(strengths[:3])}"
                        if struggles:
                            line += f". Struggles: {', '.join(struggles[:3])}"
                        summary_parts.append(line)
                    
                    summary = "\n".join(summary_parts)
        except Exception as e:
            error_msg = str(e)
            print(f"[AI_ROUTES] Error formatting summary: {error_msg}")
            print(f"[AI_ROUTES] Rows type: {type(rows)}, Rows: {rows}")
            summary = f"Error formatting summary: {error_msg}"
        
        print(f"[AI_ROUTES] Summary formatted successfully, length={len(summary)}")
        
        if task_id:
            try:
                print(f"[AI_ROUTES] Updating task record: {task_id}")
                _update_ai_task(
                    supabase,
                    task_id,
                    "succeeded",
                    result={"summary": summary}
                )
                print(f"[AI_ROUTES] Task record updated successfully")
            except Exception as e:
                print(f"[AI_ROUTES] Warning: Failed to update task record (non-blocking): {e}")
        
        try:
            print(f"[AI_ROUTES] Incrementing counter")
            increment_counter("ai_summarize_progress", {"family_id": family_id})
            print(f"[AI_ROUTES] Counter incremented")
        except Exception as e:
            print(f"[AI_ROUTES] Warning: Failed to increment counter (non-blocking): {e}")
        
        try:
            print(f"[AI_ROUTES] Logging event")
            log_event("ai_summarize_progress", {"family_id": family_id, "task_id": task_id})
            print(f"[AI_ROUTES] Event logged")
        except Exception as e:
            print(f"[AI_ROUTES] Warning: Failed to log event (non-blocking): {e}")
        
        try:
            print(f"[AI_ROUTES] Creating response object")
            response = SummarizeProgressOut(
                ok=True,
                summary=summary,
                taskRunId=task_id
            )
            print(f"[AI_ROUTES] Response object created successfully")
            return response
        except Exception as e:
            error_msg = str(e)
            print(f"[AI_ROUTES] Error creating response object: {error_msg}")
            print(f"[AI_ROUTES] Exception details: {repr(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create response: {error_msg}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if task_id:
            try:
                _update_ai_task(supabase, task_id, "failed", error=error_msg)
            except Exception as e2:
                print(f"[AI_ROUTES] Warning: Failed to update task record on error (non-blocking): {e2}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate summary: {error_msg}"
        )


@router.post("/pack_week", response_model=PackWeekOut)
async def pack_week(
    body: PackWeekInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    AI-powered week packing: suggest optimal event placement for a week.
    Uses LLM to analyze year plans, availability windows, and existing events
    to create optimal schedule. Creates events and refreshes calendar cache.
    """
    supabase = get_admin_client()
    family_id = get_family_id_for_user(user["id"])
    
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    # Parse week start (should be Monday)
    try:
        week_start = datetime.strptime(body.weekStart, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    # Create task record
    task_id = _insert_ai_task(
        supabase,
        family_id,
        "pack_week",
        {
            "week_start": body.weekStart,
            "child_ids": body.childIds or []
        },
        user["id"]
    )
    
    try:
        _update_ai_task(supabase, task_id, "running")
        
        # Determine child IDs to pack for
        child_ids = body.childIds or []
        if not child_ids:
            # Get all children for the family
            children_res = supabase.table("children").select("id").eq("family_id", family_id).eq("archived", False).execute()
            child_ids = [c["id"] for c in (children_res.data or [])]
        
        if not child_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No children found for this family"
            )
        
        # Load planning context (availability, events, blackouts, required minutes)
        week_end = week_start + timedelta(days=6)  # Sunday
        try:
            context = await load_planning_context(
                family_id=family_id,
                week_start=body.weekStart,
                child_ids=child_ids,
                horizon_weeks=1  # Just this week
            )
        except Exception as ctx_error:
            # If load_planning_context fails (e.g., blackout_periods table doesn't exist),
            # fall back to basic context
            log_event("ai_pack_week.context_load_error", {"task_id": task_id, "error": str(ctx_error)})
            # Get basic availability and events using get_week_view RPC
            week_view_res = supabase.rpc(
                "get_week_view",
                {
                    "_family_id": family_id,
                    "_from": str(week_start),
                    "_to": str(week_end),
                    "_child_ids": child_ids if child_ids else None
                }
            ).execute()
            week_view_data = week_view_res.data or {}
            context = {
                "availability": week_view_data.get("avail", []),
                "events": week_view_data.get("events", []),
                "blackouts": [],  # Empty if blackout_periods doesn't exist
                "required_minutes": []
            }
        
        # Get active year plans with targets (plans that overlap with this week)
        # Plan overlaps if: start_date <= week_end AND end_date >= week_start
        year_plans_res = supabase.table("year_plans").select(
            "id, start_date, end_date, year_plan_children(*, child_id, subjects)"
        ).eq("family_id", family_id).lte("start_date", str(week_end)).gte("end_date", str(week_start)).execute()
        
        year_plans = []
        for plan in (year_plans_res.data or []):
            if plan.get("year_plan_children"):
                year_plans.append({
                    "id": plan["id"],
                    "start_date": plan["start_date"],
                    "end_date": plan["end_date"],
                    "children": plan["year_plan_children"]
                })
        
        # Build LLM context
        llm_context = {
            "week_start": body.weekStart,
            "week_end": str(week_end),
            "children": child_ids,
            "year_plans": year_plans,
            "availability": context.get("availability", []),
            "existing_events": context.get("events", []),
            "blackouts": context.get("blackouts", []),
            "required_minutes": context.get("required_minutes", []),
            "recent_struggles": context.get("recent_struggles", {}),  # Include struggles for adaptive scheduling
            "max_minutes_per_day": context.get("max_minutes_per_day", 240),  # Constraint: max minutes per day per child
            "current_minutes_by_day": context.get("current_minutes_by_day", {})  # Current minutes already scheduled per day per child
        }
        
        # Call LLM
        try:
            print(f"[AI_ROUTES] Calling LLM pack_week with context: week_start={llm_context['week_start']}, children={len(llm_context['children'])}, year_plans={len(llm_context['year_plans'])}")
            llm_result = await llm_pack_week(llm_context)
            print(f"[AI_ROUTES] LLM returned: events={len(llm_result.get('events', []))}, rationale={len(llm_result.get('rationale', []))}")
        except Exception as llm_error:
            error_msg = str(llm_error)
            error_type = type(llm_error).__name__
            print(f"[AI_ROUTES] LLM error: {error_type}: {error_msg}")
            print(f"[AI_ROUTES] Exception details: {repr(llm_error)}")
            log_event("ai_pack_week.llm_error", {"task_id": task_id, "error": error_msg})
            # Fallback: return empty result with error message
            try:
                _update_ai_task(supabase, task_id, "failed", error=f"LLM call failed: {error_msg}")
            except Exception as e2:
                print(f"[AI_ROUTES] Warning: Failed to update task record on LLM error: {e2}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI service unavailable: {error_msg}"
            )
        
        events_to_create = llm_result.get("events", [])
        rationale = llm_result.get("rationale", [])
        
        # Validate events don't exceed max_minutes_per_day constraint
        max_minutes_per_day = context.get("max_minutes_per_day", 240)
        current_minutes_by_day = context.get("current_minutes_by_day", {})
        
        # Filter out events that would exceed the daily cap
        # Track running total as we process events
        running_minutes_by_day = {}
        for date_str, child_dict in current_minutes_by_day.items():
            running_minutes_by_day[date_str] = child_dict.copy()
        
        validated_events = []
        filtered_count = 0
        for event_data in events_to_create:
            start_ts = event_data.get("start")
            child_id = event_data.get("child_id")
            minutes = event_data.get("minutes", 60)
            
            if start_ts and child_id:
                try:
                    start_dt = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                    date_local = start_dt.date().isoformat()
                    
                    # Initialize running total for this date if needed
                    if date_local not in running_minutes_by_day:
                        running_minutes_by_day[date_local] = {}
                    if child_id not in running_minutes_by_day[date_local]:
                        running_minutes_by_day[date_local][child_id] = current_minutes_by_day.get(date_local, {}).get(child_id, 0)
                    
                    # Check if adding this event would exceed the cap
                    total_minutes = running_minutes_by_day[date_local][child_id] + minutes
                    if total_minutes > max_minutes_per_day:
                        print(f"[AI_ROUTES] Filtering event: {event_data.get('title', 'Untitled')} - would exceed daily cap ({total_minutes} > {max_minutes_per_day} minutes)")
                        filtered_count += 1
                        continue
                    
                    # Event is valid - add to running total
                    running_minutes_by_day[date_local][child_id] = total_minutes
                except Exception as e:
                    print(f"[AI_ROUTES] Warning: Failed to validate event date: {e}")
            
            validated_events.append(event_data)
        
        if filtered_count > 0:
            print(f"[AI_ROUTES] Filtered out {filtered_count} events that would exceed daily cap")
            rationale.append(f"Note: {filtered_count} event(s) were filtered out to respect daily cap of {max_minutes_per_day} minutes per day per child")
        
        print(f"[AI_ROUTES] Creating {len(validated_events)} events (after validation)")
        
        # Create events
        created_events = []
        for idx, event_data in enumerate(validated_events):
            try:
                print(f"[AI_ROUTES] Creating event {idx+1}/{len(events_to_create)}: {event_data.get('title', 'Untitled')}")
                # Calculate end_ts from start + minutes
                start_ts = datetime.fromisoformat(event_data["start"].replace("Z", "+00:00"))
                minutes = event_data.get("minutes", 60)
                end_ts = start_ts + timedelta(minutes=minutes)
                
                event_res = supabase.table("events").insert({
                    "family_id": family_id,
                    "child_id": event_data["child_id"],
                    "subject_id": event_data.get("subject_id"),
                    "title": event_data.get("title", "AI Packed Session"),
                    "start_ts": start_ts.isoformat(),
                    "end_ts": end_ts.isoformat(),
                    "status": "scheduled",
                    "source": "ai"  # Use 'ai' as source (constraint allows: 'ai', 'manual', 'year_plan_seed')
                }).execute()
                
                if event_res.data:
                    created_events.append(event_res.data[0])
                    print(f"[AI_ROUTES] Event created successfully: {event_res.data[0].get('id')}")
                else:
                    print(f"[AI_ROUTES] Warning: Event insert returned no data")
            except Exception as e:
                error_msg = str(e)
                print(f"[AI_ROUTES] Error creating event {idx+1}: {error_msg}")
                print(f"[AI_ROUTES] Event data: {event_data}")
                log_event("ai_pack_week.event_create_error", {"task_id": task_id, "error": error_msg, "event_data": event_data})
                # Continue with other events
        
        # Refresh calendar cache
        try:
            print(f"[AI_ROUTES] Refreshing calendar cache for week {week_start} to {week_end}")
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(week_start),
                    "p_to_date": str(week_end)
                }
            ).execute()
            print(f"[AI_ROUTES] Calendar cache refreshed successfully")
        except Exception as e:
            error_msg = str(e)
            print(f"[AI_ROUTES] Warning: Failed to refresh cache (non-blocking): {error_msg}")
            log_event("ai_pack_week.cache_refresh_error", {"task_id": task_id, "error": error_msg})
        
        notes = "\n".join(rationale) if rationale else f"Created {len(created_events)} events for the week."
        
        print(f"[AI_ROUTES] Updating task record: {task_id}")
        try:
            _update_ai_task(
                supabase,
                task_id,
                "succeeded",
                result={"events": created_events, "notes": notes, "rationale": rationale}
            )
            print(f"[AI_ROUTES] Task record updated successfully")
        except Exception as e:
            print(f"[AI_ROUTES] Warning: Failed to update task record (non-blocking): {e}")
        
        try:
            print(f"[AI_ROUTES] Incrementing counter")
            increment_counter("ai_pack_week", {"family_id": family_id})
            print(f"[AI_ROUTES] Counter incremented")
        except Exception as e:
            print(f"[AI_ROUTES] Warning: Failed to increment counter (non-blocking): {e}")
        
        try:
            print(f"[AI_ROUTES] Logging event")
            log_event("ai_pack_week", {"family_id": family_id, "task_id": task_id, "events_created": len(created_events)})
            print(f"[AI_ROUTES] Event logged")
        except Exception as e:
            print(f"[AI_ROUTES] Warning: Failed to log event (non-blocking): {e}")
        
        try:
            print(f"[AI_ROUTES] Creating response object with {len(created_events)} events")
            events_list = []
            for e in created_events:
                events_list.append({
                    "id": e.get("id"),
                    "title": e.get("title", "Untitled"),
                    "start": e.get("start_ts"),
                    "end": e.get("end_ts"),
                    "child_id": e.get("child_id"),
                    "subject_id": e.get("subject_id")
                })
            
            response = PackWeekOut(
                ok=True,
                events=events_list,
                notes=notes,
                taskRunId=task_id
            )
            print(f"[AI_ROUTES] Response object created successfully")
            return response
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"[AI_ROUTES] Error creating response object: {error_type}: {error_msg}")
            print(f"[AI_ROUTES] Exception details: {repr(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create response: {error_msg}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        _update_ai_task(supabase, task_id, "failed", error=error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to pack week: {error_msg}"
        )


@router.post("/catch_up", response_model=CatchUpOut)
async def catch_up(
    body: CatchUpInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    AI-powered catch-up: reschedule missed events intelligently.
    Uses LLM to find optimal future time slots for missed events,
    avoiding conflicts and blackouts. Updates events and refreshes cache.
    """
    supabase = get_admin_client()
    family_id = get_family_id_for_user(user["id"])
    
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    if not body.missedEventIds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="missedEventIds cannot be empty"
        )
    
    # Create task record
    task_id = _insert_ai_task(
        supabase,
        family_id,
        "catch_up",
        {
            "missed_event_ids": body.missedEventIds
        },
        user["id"]
    )
    
    try:
        _update_ai_task(supabase, task_id, "running")
        
        # Load missed events
        events_res = supabase.table("events").select(
            "id, child_id, subject_id, title, start_ts, end_ts, status"
        ).in_("id", body.missedEventIds).eq("family_id", family_id).execute()
        
        missed_events = events_res.data or []
        if not missed_events:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No missed events found with the provided IDs"
            )
        
        # Get child IDs from missed events
        child_ids = list(set([e["child_id"] for e in missed_events if e.get("child_id")]))
        
        # Calculate future window (next 4 weeks from today)
        today = date.today()
        future_start = today
        future_end = today + timedelta(days=28)  # 4 weeks
        
        # Load planning context for future window
        try:
            context = await load_planning_context(
                family_id=family_id,
                week_start=str(future_start),
                child_ids=child_ids,
                horizon_weeks=4
            )
        except Exception as ctx_error:
            # If load_planning_context fails, fall back to basic context
            log_event("ai_catch_up.context_load_error", {"task_id": task_id, "error": str(ctx_error)})
            # Get basic availability using get_week_view RPC
            week_view_res = supabase.rpc(
                "get_week_view",
                {
                    "_family_id": family_id,
                    "_from": str(future_start),
                    "_to": str(future_end),
                    "_child_ids": child_ids if child_ids else None
                }
            ).execute()
            week_view_data = week_view_res.data or {}
            context = {
                "availability": week_view_data.get("avail", []),
                "events": [],
                "blackouts": [],  # Empty if blackout_periods doesn't exist
                "required_minutes": [],
                "recent_struggles": {}  # Empty if load_planning_context failed
            }
        
        # Get existing scheduled events in future window
        existing_events_res = supabase.table("events").select(
            "id, child_id, start_ts, end_ts"
        ).eq("family_id", family_id).in_("child_id", child_ids).eq("status", "scheduled").gte("start_ts", future_start.isoformat()).lte("start_ts", future_end.isoformat()).execute()
        
        existing_events = existing_events_res.data or []
        
        # Build LLM context
        llm_context = {
            "missed_events": [
                {
                    "event_id": e["id"],
                    "child_id": e["child_id"],
                    "subject_id": e.get("subject_id"),
                    "title": e.get("title", "Event"),
                    "original_start": e["start_ts"],
                    "original_end": e["end_ts"],
                    "duration_minutes": int((datetime.fromisoformat(e["end_ts"].replace("Z", "+00:00")) - datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00"))).total_seconds() / 60)
                }
                for e in missed_events
            ],
            "future_windows": context.get("availability", []),
            "existing_events": existing_events,
            "blackouts": context.get("blackouts", []),
            "recent_struggles": context.get("recent_struggles", {}),  # Include struggles for adaptive scheduling
            "max_minutes_per_day": context.get("max_minutes_per_day", 240),  # Constraint: max minutes per day per child
            "current_minutes_by_day": context.get("current_minutes_by_day", {})  # Current minutes already scheduled per day per child
        }
        
        # Call LLM
        try:
            llm_result = await llm_catch_up(llm_context)
        except Exception as llm_error:
            log_event("ai_catch_up.llm_error", {"task_id": task_id, "error": str(llm_error)})
            # Fallback: return empty result with error message
            _update_ai_task(supabase, task_id, "failed", error=f"LLM call failed: {str(llm_error)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI service unavailable: {str(llm_error)}"
            )
        
        rescheduled_moves = llm_result.get("rescheduled", [])
        rationale = llm_result.get("rationale", [])
        
        # Validate rescheduling doesn't exceed max_minutes_per_day constraint
        max_minutes_per_day = context.get("max_minutes_per_day", 240)
        current_minutes_by_day = context.get("current_minutes_by_day", {})
        
        # Calculate minutes for existing events in future window (for validation)
        future_minutes_by_day = {}
        for event in existing_events:
            start_ts = event.get("start_ts")
            child_id = event.get("child_id")
            end_ts = event.get("end_ts")
            
            if start_ts and child_id and end_ts:
                try:
                    start_dt = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                    end_dt = datetime.fromisoformat(end_ts.replace("Z", "+00:00"))
                    date_local = start_dt.date().isoformat()
                    duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
                    
                    if date_local not in future_minutes_by_day:
                        future_minutes_by_day[date_local] = {}
                    if child_id not in future_minutes_by_day[date_local]:
                        future_minutes_by_day[date_local][child_id] = 0
                    future_minutes_by_day[date_local][child_id] += duration_minutes
                except Exception as e:
                    print(f"[AI_ROUTES] Warning: Failed to parse event date for validation: {e}")
        
        # Merge current_minutes_by_day with future_minutes_by_day
        combined_minutes_by_day = {}
        for date_str, child_dict in current_minutes_by_day.items():
            combined_minutes_by_day[date_str] = child_dict.copy()
        for date_str, child_dict in future_minutes_by_day.items():
            if date_str not in combined_minutes_by_day:
                combined_minutes_by_day[date_str] = {}
            for child_id, minutes in child_dict.items():
                if child_id not in combined_minutes_by_day[date_str]:
                    combined_minutes_by_day[date_str][child_id] = 0
                combined_minutes_by_day[date_str][child_id] += minutes
        
        # Validate and filter rescheduled moves
        validated_moves = []
        filtered_count = 0
        for move in rescheduled_moves:
            event_id = move.get("event_id")
            new_start = move.get("new_start")
            new_end = move.get("new_end")
            child_id = None
            
            # Find child_id from missed_events
            for missed_event in missed_events:
                if missed_event["id"] == event_id:
                    child_id = missed_event.get("child_id")
                    break
            
            if new_start and child_id:
                try:
                    start_dt = datetime.fromisoformat(new_start.replace("Z", "+00:00"))
                    end_dt = datetime.fromisoformat(new_end.replace("Z", "+00:00"))
                    date_local = start_dt.date().isoformat()
                    duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
                    
                    # Get current minutes for this day/child
                    current_minutes = combined_minutes_by_day.get(date_local, {}).get(child_id, 0)
                    
                    # Check if rescheduling would exceed the cap
                    total_minutes = current_minutes + duration_minutes
                    if total_minutes > max_minutes_per_day:
                        print(f"[AI_ROUTES] Filtering reschedule: event {event_id} - would exceed daily cap ({total_minutes} > {max_minutes_per_day} minutes)")
                        filtered_count += 1
                        continue
                except Exception as e:
                    print(f"[AI_ROUTES] Warning: Failed to validate reschedule date: {e}")
            
            validated_moves.append(move)
        
        if filtered_count > 0:
            print(f"[AI_ROUTES] Filtered out {filtered_count} reschedules that would exceed daily cap")
            rationale.append(f"Note: {filtered_count} reschedule(s) were filtered out to respect daily cap of {max_minutes_per_day} minutes per day per child")
        
        # Apply rescheduling
        rescheduled_events = []
        for move in validated_moves:
            try:
                event_id = move["event_id"]
                new_start = datetime.fromisoformat(move["new_start"].replace("Z", "+00:00"))
                new_end = datetime.fromisoformat(move["new_end"].replace("Z", "+00:00"))
                
                # Update event
                update_res = supabase.table("events").update({
                    "start_ts": new_start.isoformat(),
                    "end_ts": new_end.isoformat(),
                    "status": "scheduled"  # Reset from missed/overdue
                }).eq("id", event_id).execute()
                
                if update_res.data:
                    rescheduled_events.append({
                        "event_id": event_id,
                        "new_start": move["new_start"],
                        "new_end": move["new_end"],
                        "reason": move.get("reason", "Rescheduled")
                    })
            except Exception as e:
                log_event("ai_catch_up.event_update_error", {"task_id": task_id, "error": str(e), "move": move})
                # Continue with other moves
        
        # Refresh calendar cache
        try:
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(future_start),
                    "p_to_date": str(future_end)
                }
            ).execute()
        except Exception as e:
            log_event("ai_catch_up.cache_refresh_error", {"task_id": task_id, "error": str(e)})
        
        notes = "\n".join(rationale) if rationale else f"Rescheduled {len(rescheduled_events)} events."
        
        _update_ai_task(
            supabase,
            task_id,
            "succeeded",
            result={"rescheduled": rescheduled_events, "notes": notes, "rationale": rationale}
        )
        
        increment_counter("ai_catch_up", {"family_id": family_id})
        log_event("ai_catch_up", {"family_id": family_id, "task_id": task_id, "events_rescheduled": len(rescheduled_events)})
        
        return CatchUpOut(
            ok=True,
            rescheduled=rescheduled_events,
            notes=notes,
            taskRunId=task_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        _update_ai_task(supabase, task_id, "failed", error=error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to catch up: {error_msg}"
        )


class EventTagsInput(BaseModel):
    event_id: str = Field(..., description="Event ID to generate tags for")


class EventTagsOut(BaseModel):
    suggested_strengths: List[str]
    suggested_struggles: List[str]


@router.post("/event_tags", response_model=EventTagsOut)
async def get_event_tags(
    body: EventTagsInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate AI suggestions for strengths/struggles tags based on event metadata.
    
    Loads event details (title, subject, description) and calls LLM to suggest
    appropriate tags for outcome reporting.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        # Load event and verify family access
        event_res = supabase.table("events").select("*").eq("id", body.event_id).single().execute()
        if not event_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        event = event_res.data
        if event.get("family_id") != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Event does not belong to your family"
            )
        
        # Get subject name if subject_id exists
        subject_name = "General"
        if event.get("subject_id"):
            try:
                subject_res = supabase.table("subject").select("name").eq("id", event["subject_id"]).single().execute()
                if subject_res.data:
                    subject_name = subject_res.data.get("name", "General")
            except Exception:
                # Subject lookup failed, use default
                pass
        
        # Build context for LLM
        context = {
            "title": event.get("title", "Lesson"),
            "subject": subject_name,
            "description": event.get("description", "") or event.get("notes", "")
        }
        
        # Call LLM
        try:
            llm_result = await llm_event_tags(context)
        except Exception as llm_error:
            error_msg = str(llm_error)
            log_event("ai_event_tags.llm_error", {"event_id": body.event_id, "error": error_msg})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI service unavailable: {error_msg}"
            )
        
        suggested_strengths = llm_result.get("suggested_strengths", [])
        suggested_struggles = llm_result.get("suggested_struggles", [])
        
        log_event("ai_event_tags.success", {
            "event_id": body.event_id,
            "family_id": family_id,
            "strengths_count": len(suggested_strengths),
            "struggles_count": len(suggested_struggles)
        })
        
        return EventTagsOut(
            suggested_strengths=suggested_strengths,
            suggested_struggles=suggested_struggles
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        log_event("ai_event_tags.error", {"event_id": body.event_id, "error": error_msg})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate tags: {error_msg}"
        )


@router.post("/generate_syllabus", response_model=GenerateSyllabusOut)
async def generate_syllabus(
    body: GenerateSyllabusInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate a structured syllabus (units + lessons) from course/playlist metadata using AI.
    
    If course_id is provided, optionally upserts external_units and external_lessons.
    """
    log_event("ai_generate_syllabus.start", user_id=user["id"], url=body.url[:50], course_id=body.course_id)
    
    supabase = get_admin_client()
    
    try:
        # Load course metadata if course_id is provided
        metadata = {}
        if body.course_id:
            course_res = supabase.table("external_courses").select(
                "id, subject, grade_band, public_url, source_url, duration_sec, external_providers(name)"
            ).eq("id", body.course_id).single().execute()
            
            if not course_res.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Course not found"
                )
            
            course = course_res.data
            metadata = {
                "title": course.get("subject") or "Course",
                "description": "",  # Could be extended if we add description field
                "duration_sec": course.get("duration_sec"),
                "provider": course.get("external_providers", {}).get("name", "") if course.get("external_providers") else "",
            }
            # Use source_url if available, otherwise public_url
            url_to_use = course.get("source_url") or course.get("public_url") or body.url
        else:
            # No course_id provided, use URL and minimal metadata
            url_to_use = body.url
            metadata = {
                "title": "Course",
                "description": "",
            }
        
        # Call LLM to generate syllabus
        try:
            llm_result = await llm_generate_syllabus(url_to_use, metadata)
        except Exception as llm_error:
            error_msg = str(llm_error)
            log_event("ai_generate_syllabus.llm_error", {"url": body.url[:50], "error": error_msg})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI service unavailable: {error_msg}"
            )
        
        units = llm_result.get("units", [])
        upserted_info = None
        
        # Optionally upsert units and lessons if course_id is provided
        if body.course_id and units:
            try:
                units_count = 0
                lessons_count = 0
                
                for unit_idx, unit_data in enumerate(units, start=1):
                    unit_title = unit_data.get("title", f"Unit {unit_idx}")
                    lessons = unit_data.get("lessons", [])
                    
                    # Upsert unit
                    unit_res = supabase.table("external_units").upsert(
                        {
                            "course_id": body.course_id,
                            "ordinal": unit_idx,
                            "title_safe": unit_title,
                            "source_url": url_to_use,  # Use course URL as source
                            "public_url": url_to_use,
                        },
                        on_conflict="course_id,ordinal"
                    ).execute()
                    
                    if unit_res.data:
                        unit_id = unit_res.data[0]["id"]
                        units_count += 1
                        
                        # Upsert lessons for this unit
                        for lesson_idx, lesson_data in enumerate(lessons, start=1):
                            lesson_title = lesson_data.get("title", f"Lesson {lesson_idx}")
                            duration_min = lesson_data.get("duration_min", 15)
                            
                            supabase.table("external_lessons").upsert(
                                {
                                    "unit_id": unit_id,
                                    "ordinal": lesson_idx,
                                    "title_safe": lesson_title,
                                    "resource_type": "video",  # Default to video for YouTube content
                                    "public_url": url_to_use,  # Could be enhanced to use actual lesson URLs if available
                                    "source_url": url_to_use,
                                    "duration_minutes_est": duration_min,
                                },
                                on_conflict="unit_id,ordinal"
                            ).execute()
                            lessons_count += 1
                
                upserted_info = {
                    "units_count": units_count,
                    "lessons_count": lessons_count
                }
                
                log_event("ai_generate_syllabus.upserted", {
                    "course_id": body.course_id,
                    "units_count": units_count,
                    "lessons_count": lessons_count
                })
            except Exception as upsert_error:
                # Log but don't fail - syllabus generation succeeded even if upsert failed
                log_event("ai_generate_syllabus.upsert_error", {
                    "course_id": body.course_id,
                    "error": str(upsert_error)
                })
        
        log_event("ai_generate_syllabus.success", {
            "url": body.url[:50],
            "course_id": body.course_id,
            "units_count": len(units)
        })
        
        return GenerateSyllabusOut(
            ok=True,
            units=units,
            upserted=upserted_info
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        log_event("ai_generate_syllabus.error", {"url": body.url[:50], "error": error_msg})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate syllabus: {error_msg}"
        )


class InspireLearningInput(BaseModel):
    child_id: str = Field(..., description="Child ID to generate recommendations for")


class SuggestionOut(BaseModel):
    id: Optional[str] = None
    title: str
    source: str
    type: str
    duration_min: Optional[int] = None
    link: str
    description: Optional[str] = None
    approved_by_parent: bool = False


class InspireLearningOut(BaseModel):
    ok: bool
    suggestions: List[SuggestionOut]
    generation_id: Optional[str] = None


@router.post("/inspire_learning", response_model=InspireLearningOut)
async def inspire_learning(
    body: InspireLearningInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate personalized learning recommendations for a child based on their progress, interests, and struggles.
    Returns suggestions that can be approved by parents for the child to see.
    """
    log_event("ai_inspire_learning.start", user_id=user["id"], child_id=body.child_id)
    
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        # Verify child belongs to family
        if not child_belongs_to_family(body.child_id, family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child not in family"
            )
        
        supabase = get_admin_client()
        
        # Get child info
        child_res = supabase.table("children").select("id, first_name, interests").eq("id", body.child_id).single().execute()
        if not child_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Child not found"
            )
        
        child = child_res.data
        child_name = child.get("first_name") or "the student"
        interests = child.get("interests", [])
        if not isinstance(interests, list):
            interests = interests.split(",") if interests else []
        
        # Get subjects the child is studying
        # Query subject_id directly, then fetch subject names separately
        events_res = supabase.table("events").select("subject_id").eq("child_id", body.child_id).not_.is_("subject_id", "null").limit(50).execute()
        subject_ids = list(set([e.get("subject_id") for e in (events_res.data or []) if e.get("subject_id")]))
        
        subjects = []
        if subject_ids:
            subjects_res = supabase.table("subject").select("name").in_("id", subject_ids).execute()
            subjects = [s.get("name") for s in (subjects_res.data or []) if s.get("name")]
        
        # Get recent event outcomes (last 30 days) with strengths/struggles
        thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()
        outcomes_res = supabase.table("event_outcomes").select("strengths, struggles, rating").eq("child_id", body.child_id).gte("created_at", thirty_days_ago).limit(50).execute()
        recent_outcomes = [
            {
                "strengths": o.get("strengths", []),
                "struggles": o.get("struggles", []),
                "rating": o.get("rating")
            }
            for o in (outcomes_res.data or [])
        ]
        
        # Get viewing history from external_courses/external_lessons (via events)
        viewing_res = supabase.table("events").select("external_lesson:external_lesson_id(external_units(external_courses(public_url, external_providers(name))))").eq("child_id", body.child_id).not_.is_("external_lesson_id", "null").limit(20).execute()
        viewing_history = []
        for event in (viewing_res.data or []):
            lesson = event.get("external_lesson")
            if lesson:
                unit = lesson.get("external_units")
                if unit:
                    course = unit.get("external_courses")
                    if course:
                        provider = course.get("external_providers", {}).get("name", "External")
                        viewing_history.append({
                            "source": provider,
                            "url": course.get("public_url")
                        })
        
        # Build context for LLM
        context = {
            "family_id": family_id,
            "child_id": body.child_id,
            "child_name": child_name,
            "subjects": subjects,
            "recent_outcomes": recent_outcomes,
            "viewing_history": viewing_history,
            "interests": interests
        }
        
        # Call LLM to generate suggestions
        if not llm_inspire_learning:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI service not available"
            )
        
        try:
            llm_result = await llm_inspire_learning(context)
        except Exception as llm_error:
            error_msg = str(llm_error)
            log_event("ai_inspire_learning.llm_error", child_id=body.child_id, error=error_msg)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI service unavailable: {error_msg}"
            )
        
        suggestions = llm_result.get("suggestions", [])
        generation_id = str(uuid.uuid4())
        
        # Validate and fix URLs - convert invalid URLs to search URLs
        def fix_url(suggestion):
            """Convert invalid URLs to search URLs"""
            import urllib.parse
            
            link = suggestion.get("link", "")
            source = suggestion.get("source", "").lower()
            title = suggestion.get("title", "")
            
            # Check if URL is invalid (example.com, placeholder, etc.)
            invalid_patterns = [
                "example.com", "placeholder", "test.com", 
                "youtube.com/watch?v=...", "youtube.com/watch?v=",
                "khanacademy.org/...", "http://", "https://example"
            ]
            
            is_invalid = (
                not link or 
                not link.startswith("http") or
                any(pattern in link.lower() for pattern in invalid_patterns) or
                link.count("/") < 3  # Real URLs have more path segments
            )
            
            if is_invalid:
                # Convert to search URL based on source
                search_query = urllib.parse.quote_plus(title)
                
                if "youtube" in source or suggestion.get("type") == "video":
                    # Use YouTube search
                    link = f"https://www.youtube.com/results?search_query={search_query}"
                elif "khan" in source.lower():
                    # Use Khan Academy search
                    link = f"https://www.khanacademy.org/search?page_search_query={search_query}"
                else:
                    # Generic search fallback
                    combined_query = urllib.parse.quote_plus(f"{title} {source}")
                    link = f"https://www.google.com/search?q={combined_query}"
            
            suggestion["link"] = link
            return suggestion
        
        # Fix all URLs
        suggestions = [fix_url(s) for s in suggestions]
        
        # Store suggestions in database (unapproved by default)
        stored_suggestions = []
        for suggestion in suggestions:
            try:
                insert_res = supabase.table("learning_suggestions").insert({
                    "family_id": family_id,
                    "child_id": body.child_id,
                    "title": suggestion.get("title"),
                    "source": suggestion.get("source"),
                    "type": suggestion.get("type"),
                    "duration_min": suggestion.get("duration_min"),
                    "link": suggestion.get("link"),
                    "description": suggestion.get("description", ""),
                    "approved_by_parent": False,
                    "generation_id": generation_id
                }).execute()
                
                if insert_res.data:
                    stored_suggestions.append(SuggestionOut(
                        id=insert_res.data[0]["id"],
                        title=suggestion.get("title"),
                        source=suggestion.get("source"),
                        type=suggestion.get("type"),
                        duration_min=suggestion.get("duration_min"),
                        link=suggestion.get("link"),
                        description=suggestion.get("description"),
                        approved_by_parent=False
                    ))
            except Exception as insert_error:
                # Log but continue - don't fail the whole request if one insert fails
                log_event("ai_inspire_learning.insert_error", 
                    child_id=body.child_id,
                    suggestion_title=suggestion.get("title", "")[:50],
                    error=str(insert_error)
                )
                # Still include in response even if not stored
                stored_suggestions.append(SuggestionOut(
                    title=suggestion.get("title"),
                    source=suggestion.get("source"),
                    type=suggestion.get("type"),
                    duration_min=suggestion.get("duration_min"),
                    link=suggestion.get("link"),
                    description=suggestion.get("description"),
                    approved_by_parent=False
                ))
        
        log_event("ai_inspire_learning.success", 
            child_id=body.child_id,
            suggestions_count=len(stored_suggestions),
            generation_id=generation_id
        )
        
        return InspireLearningOut(
            ok=True,
            suggestions=stored_suggestions,
            generation_id=generation_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        log_event("ai_inspire_learning.error", child_id=body.child_id, error=error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate learning suggestions: {error_msg}"
        )


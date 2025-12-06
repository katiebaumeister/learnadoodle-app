"""
FastAPI routes for unified Schedule Adjustments
Replaces Time Off + One-Time Changes with single unified endpoint
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Optional, Tuple
from datetime import date, datetime, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


# --- Pydantic Models ---

class AdjustPayload(BaseModel):
    person_id: str = Field(..., description="Child ID or family ID (based on scope_type)")
    family_id: str = Field(..., description="Family ID")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    adjustment_type: str = Field(..., description="Adjustment type: no_school, vacation, shorter_day, etc.")
    event_handling: str = Field(default="reschedule", description="reschedule | backlog | cancel")
    notes: Optional[str] = Field(None, description="Optional notes")
    scope_type: str = Field(default="family", description="family | child")


# Helper: classify adjustment types
FULLY_OFF_TYPES = {
    "no_school",
    "vacation",
    "holiday_week",
    "travel_week",
    "testing_week",
    "extended_break",
}

PARTIAL_TYPES = {
    "shorter_day",
    "partial_day",
    "late_start",
    "early_end",
    "custom_hours",
}


@router.post("/adjust")
async def adjust_schedule(
    payload: AdjustPayload,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Unified scheduling adjustment endpoint.
    
    Creates blackouts or overrides and handles existing events intelligently:
    - Reschedule: Moves tasks to backlog with source 'auto_reschedule' and triggers AI
    - Backlog: Moves tasks to backlog with source 'schedule_adjust'
    - Cancel: Only cancels non-task events (task-backed events cannot be canceled)
    """
    run_id = None
    try:
        # Log run start
        try:
            from planner_logging.planner_instrumentation import log_run_start, log_run_end, log_error, log_warning
            child_id = payload.person_id if payload.scope_type == "child" else None
            run_id = log_run_start(
                family_id=payload.family_id,
                child_id=child_id,
                mode="manual_adjustment",
                metadata={
                    "adjustment_type": payload.adjustment_type,
                    "event_handling": payload.event_handling,
                    "start_date": payload.start_date,
                    "end_date": payload.end_date,
                    "scope_type": payload.scope_type
                }
            )
        except Exception as inst_err:
            # Don't fail if instrumentation is not available
            log_event("schedule.adjust.instrumentation_error", error=str(inst_err))
        
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        # Validate family_id matches
        if payload.family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family ID mismatch"
            )
        
        # Validate child belongs to family if scope is child
        if payload.scope_type == "child":
            if not child_belongs_to_family(payload.person_id, family_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Child does not belong to family"
                )
        
        # Parse dates
        try:
            start_date_obj = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
            end_date_obj = datetime.strptime(payload.end_date, "%Y-%m-%d").date()
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date format: {str(e)}"
            )
        
        # Validate adjustment type
        if payload.adjustment_type not in FULLY_OFF_TYPES and payload.adjustment_type not in PARTIAL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown adjustment type: {payload.adjustment_type}"
            )
        
        # Validate event handling
        if payload.event_handling not in ["reschedule", "backlog", "cancel"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid event_handling: {payload.event_handling}"
            )
        
        # --------------------------------------------
        # 1. CREATE BLACKOUT OR OVERRIDE
        # --------------------------------------------
        if payload.adjustment_type in FULLY_OFF_TYPES:
            # Create blackout for whole range
            child_id = payload.person_id if payload.scope_type == "child" else None
            
            # Check if a blackout already exists for this date range and scope
            existing_query = supabase.table("blackout_periods").select("id").eq("family_id", family_id)
            if child_id:
                existing_query = existing_query.eq("child_id", child_id)
            else:
                existing_query = existing_query.is_("child_id", "null")
            
            existing_query = existing_query.eq("starts_on", start_date_obj.isoformat()).eq("ends_on", end_date_obj.isoformat())
            existing_resp = existing_query.execute()
            
            if existing_resp.data and len(existing_resp.data) > 0:
                # Blackout already exists, skip creation
                print(f"[schedule.adjust] Blackout already exists for date range {payload.start_date} to {payload.end_date}, skipping duplicate creation")
                blackout_resp = existing_resp
            else:
                # Create new blackout
                blackout_resp = supabase.table("blackout_periods").insert({
                    "family_id": family_id,
                    "child_id": child_id,
                    "starts_on": start_date_obj.isoformat(),
                    "ends_on": end_date_obj.isoformat(),
                    "reason": payload.adjustment_type,
                }).execute()
                
                if not blackout_resp.data:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create blackout"
                    )
            
            log_event(
                "schedule.adjust.blackout_created",
                user_id=user["id"],
                family_id=family_id,
                child_id=child_id,
                start_date=payload.start_date,
                end_date=payload.end_date,
                adjustment_type=payload.adjustment_type
            )
        
        elif payload.adjustment_type in PARTIAL_TYPES:
            # For partial days, create overrides for each day in range
            scope_id = payload.person_id if payload.scope_type == "child" else family_id
            current_date = start_date_obj
            overrides_created = []
            
            while current_date <= end_date_obj:
                override_resp = supabase.table("schedule_overrides").upsert({
                    "scope_type": payload.scope_type,
                    "scope_id": scope_id,
                    "date": current_date.isoformat(),
                    "override_kind": payload.adjustment_type,
                    "notes": payload.notes,
                    "is_active": True,
                }, {
                    "on_conflict": "scope_type,scope_id,date,override_kind"
                }).execute()
                
                if override_resp.data:
                    overrides_created.append(current_date.isoformat())
                
                # Move to next day
                current_date += timedelta(days=1)
            
            log_event(
                "schedule.adjust.overrides_created",
                user_id=user["id"],
                family_id=family_id,
                scope_type=payload.scope_type,
                scope_id=scope_id,
                dates=overrides_created,
                adjustment_type=payload.adjustment_type
            )
        
        # --------------------------------------------
        # 2. FETCH EVENTS IN RANGE
        # --------------------------------------------
        # Query events directly (RPC might not exist yet)
        # Note: events table uses year_plan_id for task references (no task_id or ai_plan_change_id columns)
        # Use proper timestamp boundaries: start of start_date to start of (end_date + 1 day)
        start_ts_min = datetime.combine(start_date_obj, datetime.min.time()).isoformat()
        end_date_next = end_date_obj + timedelta(days=1)
        end_ts_max = datetime.combine(end_date_next, datetime.min.time()).isoformat()
        
        events_query = supabase.table("events").select(
            "id, child_id, year_plan_id, start_ts, end_ts, status, title, subject_id"
        ).eq("family_id", family_id).gte("start_ts", start_ts_min).lt("start_ts", end_ts_max).neq("status", "done")
        
        # Filter by child if scope is child
        if payload.scope_type == "child":
            events_query = events_query.eq("child_id", payload.person_id)
        
        events_resp = events_query.execute()
        events = events_resp.data or []
        
        # Log events found for debugging (also print to console for immediate visibility)
        print(f"[schedule.adjust] Found {len(events)} events in range {payload.start_date} to {payload.end_date}")
        if events:
            print(f"[schedule.adjust] Event IDs: {[e['id'] for e in events[:10]]}")
            print(f"[schedule.adjust] Event details (before adjustment):")
            for i, ev in enumerate(events[:10], 1):
                print(f"  {i}. ID: {ev.get('id')[:8]}..., Title: {ev.get('title', 'N/A')}, "
                      f"Start: {ev.get('start_ts')}, Subject: {ev.get('subject_id')}, "
                      f"Task-backed: {bool(ev.get('year_plan_id'))}")
        else:
            print(f"[schedule.adjust] No events found in range {payload.start_date} to {payload.end_date}")
        
        log_event(
            "schedule.adjust.events_found",
            family_id=family_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
            event_count=len(events),
            event_ids=[e["id"] for e in events[:5]],  # Log first 5 IDs
            event_details=[{
                "id": e.get("id"),
                "title": e.get("title"),
                "start_ts": str(e.get("start_ts")),
                "subject_id": e.get("subject_id"),
                "is_task_backed": bool(e.get("year_plan_id"))
            } for e in events[:10]]  # Include details for first 10 events
        )
        
        # --------------------------------------------
        # 3. APPLY EVENT HANDLING BEHAVIOR
        # --------------------------------------------
        backlogged_count = 0
        canceled_count = 0
        rescheduled_count = 0
        old_events_for_reschedule = []  # Track old events before deletion for diff generation
        
        for ev in events:
            event_id = ev["id"]
            year_plan_id = ev.get("year_plan_id")
            
            # Determine if event is task-backed (events table uses year_plan_id for task references)
            is_task_backed = bool(year_plan_id)
            
            print(f"[schedule.adjust] Processing event {event_id[:8]}... | Task-backed: {is_task_backed} | Handling: {payload.event_handling}")
            
            # A. Cancel (only non-task events)
            if payload.event_handling == "cancel":
                if not is_task_backed:
                    # Cancel and delete non-task event
                    supabase.table("events").update({
                        "status": "canceled"
                    }).eq("id", event_id).execute()
                    
                    supabase.table("events").delete().eq("id", event_id).execute()
                    canceled_count += 1
                # Task-backed events cannot be canceled - skip them
                continue
            
            # B. Move to backlog (task-backed)
            if payload.event_handling == "backlog" and is_task_backed:
                # Insert into backlog with source
                backlog_entry = {
                    "child_id": ev["child_id"],
                    "source": "schedule_adjust",
                }
                
                # Add task reference if available (events use year_plan_id for task references)
                if year_plan_id:
                    backlog_entry["year_plan_id"] = year_plan_id
                
                try:
                    backlog_resp = supabase.table("backlog").insert(backlog_entry).execute()
                    if backlog_resp.data:
                        backlogged_count += 1
                        print(f"[schedule.adjust] Successfully added event {event_id[:8]}... to backlog")
                        # Remove event from calendar only after successful backlog insert
                        supabase.table("events").delete().eq("id", event_id).execute()
                    else:
                        print(f"[schedule.adjust] ERROR: Backlog insert returned no data for event {event_id[:8]}...")
                        log_event("schedule.adjust.backlog_insert_no_data", event_id=event_id)
                except Exception as e:
                    # Log error and DO NOT delete event - keep it on calendar to prevent data loss
                    error_msg = str(e)
                    print(f"[schedule.adjust] ERROR: Failed to insert event {event_id[:8]}... into backlog: {error_msg}")
                    log_event("schedule.adjust.backlog_insert_error", event_id=event_id, error=error_msg, backlog_entry=backlog_entry)
                    # DO NOT delete the event if backlog insert failed!
                    continue
            
            # C. Reschedule automatically (task-backed)
            if payload.event_handling == "reschedule" and is_task_backed:
                print(f"[schedule.adjust] ENTERING reschedule path for event {event_id[:8]}... (task-backed)")
                # Track old event data before deletion (for diff generation)
                old_events_for_reschedule.append({
                    "event_id": event_id,
                    "child_id": ev["child_id"],
                    "title": ev.get("title", "Scheduled Task"),
                    "subject_id": ev.get("subject_id"),
                    "year_plan_id": year_plan_id,
                    "start_ts": ev.get("start_ts"),
                    "end_ts": ev.get("end_ts"),
                })
                
                # Insert into backlog with auto_reschedule source
                backlog_entry = {
                    "child_id": ev["child_id"],
                    "source": "auto_reschedule",
                }
                
                # Add task reference if available (events use year_plan_id for task references)
                if year_plan_id:
                    backlog_entry["year_plan_id"] = year_plan_id
                
                # Also store event_id in backlog metadata if possible (for diff tracking)
                # Check if backlog table has metadata/jsonb column
                try:
                    backlog_entry["title"] = ev.get("title", "Scheduled Task")
                    backlog_entry["subject_id"] = ev.get("subject_id")
                except:
                    pass  # If columns don't exist, that's okay
                
                print(f"[schedule.adjust] Attempting backlog insert for event {event_id[:8]}... with entry: {backlog_entry}")
                try:
                    backlog_resp = supabase.table("backlog").insert(backlog_entry).execute()
                    print(f"[schedule.adjust] Backlog insert response: {backlog_resp}")
                    if backlog_resp.data and len(backlog_resp.data) > 0:
                        rescheduled_count += 1
                        print(f"[schedule.adjust] ✓ Successfully added event {event_id[:8]}... to backlog for rescheduling. Deleting event.")
                        # Remove event from calendar only after successful backlog insert
                        delete_resp = supabase.table("events").delete().eq("id", event_id).execute()
                        print(f"[schedule.adjust] Event {event_id[:8]}... deleted: {delete_resp}")
                    else:
                        print(f"[schedule.adjust] ✗ ERROR: Backlog insert returned no data for event {event_id[:8]}... Response: {backlog_resp}")
                        log_event("schedule.adjust.backlog_insert_no_data", event_id=event_id, response=str(backlog_resp))
                        # DO NOT delete event if insert failed
                except Exception as e:
                    # Log error and DO NOT delete event - keep it on calendar to prevent data loss
                    error_msg = str(e)
                    error_type = type(e).__name__
                    print(f"[schedule.adjust] ✗ EXCEPTION: Failed to insert event {event_id[:8]}... into backlog: [{error_type}] {error_msg}")
                    import traceback
                    print(f"[schedule.adjust] Full traceback:\n{traceback.format_exc()}")
                    log_event("schedule.adjust.backlog_insert_error", event_id=event_id, error=error_msg, error_type=error_type, backlog_entry=backlog_entry)
                    # DO NOT delete the event if backlog insert failed!
                continue
            
            # Fallback: if event is not task-backed and handling is reschedule/backlog, cancel it
            # (non-task events cannot be rescheduled or backlogged because there's no task to reschedule)
            if not is_task_backed and payload.event_handling in ["reschedule", "backlog"]:
                print(f"[schedule.adjust] Non-task event {event_id[:8]}... cannot be rescheduled/backlogged. Canceling instead.")
                supabase.table("events").update({
                    "status": "canceled"
                }).eq("id", event_id).execute()
                supabase.table("events").delete().eq("id", event_id).execute()
                canceled_count += 1
                continue
            
            # Final fallback: if we get here and event is not task-backed, something went wrong
            if not is_task_backed:
                print(f"[schedule.adjust] WARNING: Non-task event {event_id[:8]}... fell through to final fallback. Skipping.")
                continue
        
        # --------------------------------------------
        # 4. REFRESH DAY-AVAILABILITY CACHE
        # --------------------------------------------
        try:
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": payload.start_date,
                    "p_to_date": payload.end_date
                }
            ).execute()
        except Exception as cache_error:
            # Log but don't fail - cache refresh is best effort
            log_event("schedule.adjust.cache_refresh_error", error=str(cache_error))
        
        # --------------------------------------------
        # 5. TRIGGER AI MICRO-RESCHEDULER AND COLLECT DIFFS
        # --------------------------------------------
        all_diffs = []
        if payload.event_handling == "reschedule" and rescheduled_count > 0:
            try:
                # Import and run micro-rescheduler
                try:
                    from ai.micro_rescheduler import run_micro_rescheduler
                    import asyncio
                    
                    # Create lookup map of old events by child_id and year_plan_id
                    # This will help match old events to new rescheduled events
                    old_events_by_child = {}
                    for old_ev in old_events_for_reschedule:
                        child_id = old_ev["child_id"]
                        if child_id not in old_events_by_child:
                            old_events_by_child[child_id] = []
                        old_events_by_child[child_id].append(old_ev)
                    
                    # Determine child_id (if scope_type is 'child', use person_id; otherwise need to get children)
                    if payload.scope_type == "child":
                        child_id = payload.person_id
                        # Run async micro-rescheduler
                        result = asyncio.run(run_micro_rescheduler(child_id, family_id))
                        log_event("schedule.adjust.micro_rescheduler", child_id=child_id, result=result)
                        
                        # Collect diffs from result
                        if result.get("diff"):
                            all_diffs.extend(result["diff"])
                    else:
                        # For family scope, reschedule for all children
                        children_result = supabase.table("children").select("id").eq("family_id", family_id).execute()
                        children = children_result.data or []
                        
                        for child in children:
                            child_id = child["id"]
                            result = asyncio.run(run_micro_rescheduler(child_id, family_id))
                            
                            # Collect diffs from result
                            if result.get("diff"):
                                all_diffs.extend(result["diff"])
                            
                            log_event("schedule.adjust.micro_rescheduler", child_id=child_id, result=result)
                except ImportError as import_err:
                    # Micro-rescheduler not available yet, log and continue
                    log_event("schedule.adjust.micro_rescheduler_import_error", error=str(import_err))
                except Exception as micro_err:
                    # Log but don't fail - micro-rescheduler errors shouldn't break the adjustment
                    log_event("schedule.adjust.micro_rescheduler_error", error=str(micro_err))
                
                # Also call RPC for audit trail (if it exists)
                try:
                    supabase.rpc(
                        "planner_auto_reschedule_after_adjustment",
                        {
                            "p_family_id": family_id,
                            "p_start_date": payload.start_date,
                            "p_end_date": payload.end_date,
                            "p_child_id": payload.person_id if payload.scope_type == "child" else None
                        }
                    ).execute()
                except Exception as rpc_error:
                    # Log but don't fail - RPC might not exist yet
                    log_event("schedule.adjust.rpc_error", error=str(rpc_error))
            except Exception as ai_error:
                # Log but don't fail - AI rescheduler might not be implemented yet
                log_event("schedule.adjust.ai_reschedule_error", error=str(ai_error))
        
        # Print summary to console for immediate visibility
        print(f"[schedule.adjust] ============================================")
        print(f"[schedule.adjust] ADJUSTMENT SUMMARY")
        print(f"[schedule.adjust] ============================================")
        print(f"[schedule.adjust] Date range: {payload.start_date} to {payload.end_date}")
        print(f"[schedule.adjust] Adjustment type: {payload.adjustment_type}")
        print(f"[schedule.adjust] Event handling: {payload.event_handling}")
        print(f"[schedule.adjust] Events found: {len(events)}")
        print(f"[schedule.adjust] Events processed:")
        print(f"[schedule.adjust]   - Backlogged: {backlogged_count}")
        print(f"[schedule.adjust]   - Canceled: {canceled_count}")
        print(f"[schedule.adjust]   - Rescheduled: {rescheduled_count}")
        print(f"[schedule.adjust] Total events handled: {backlogged_count + canceled_count + rescheduled_count}")
        if len(all_diffs) > 0:
            print(f"[schedule.adjust] Diffs generated: {len(all_diffs)}")
        print(f"[schedule.adjust] ============================================")
        print(f"[schedule.adjust] Returning response: events_handled={{backlogged: {backlogged_count}, canceled: {canceled_count}, rescheduled: {rescheduled_count}}}")
        
        log_event(
            "schedule.adjust.completed",
            user_id=user["id"],
            family_id=family_id,
            adjustment_type=payload.adjustment_type,
            event_handling=payload.event_handling,
            backlogged_count=backlogged_count,
            canceled_count=canceled_count,
            rescheduled_count=rescheduled_count,
            diff_count=len(all_diffs)
        )
        
        # Log run end
        if run_id:
            try:
                from planner_logging.planner_instrumentation import log_run_end
                total_events = backlogged_count + canceled_count + rescheduled_count
                log_run_end(
                    run_id,
                    status="completed",
                    event_count=total_events,
                    metadata={
                        "backlogged": backlogged_count,
                        "canceled": canceled_count,
                        "rescheduled": rescheduled_count,
                        "diff_count": len(all_diffs)
                    }
                )
            except:
                pass
        
        return {
            "status": "ok",
            "adjustment_type": payload.adjustment_type,
            "events_handled": {
                "backlogged": backlogged_count,
                "canceled": canceled_count,
                "rescheduled": rescheduled_count
            },
            "diff": all_diffs  # Return diff array for frontend diff viewer
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("schedule.adjust.error", user_id=user.get("id"), error=str(e))
        
        # Log error
        if run_id:
            try:
                from planner_logging.planner_instrumentation import log_error, log_run_end
                log_error(
                    family_id=payload.family_id if 'payload' in locals() else None,
                    child_id=payload.person_id if 'payload' in locals() and payload.scope_type == "child" else None,
                    error_type="adjustment_error",
                    message=str(e),
                    run_id=run_id,
                    exception=e
                )
                log_run_end(run_id, status="failed", event_count=0)
            except:
                pass
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to adjust schedule: {str(e)}"
        )


@router.post("/undo_last_reschedule")
async def undo_last_reschedule(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Undo the last reschedule operation by restoring events from backlog.
    
    This reverses the most recent schedule adjustment/reschedule operation by:
    1. Finding backlog items with source='auto_reschedule' that were recently resolved
    2. Restoring events to their previous positions (if we have old event data)
    3. Removing newly scheduled events
    4. Refreshing calendar cache
    
    Note: This is a simplified implementation. For production, you may want to
    track reschedule operations in an audit table to enable proper undo.
    """
    try:
        supabase = get_admin_client()
        
        # Get user's family_id
        family_id = await get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not associated with a family"
            )
        
        # Get recently resolved backlog items (last 5 minutes) with auto_reschedule source
        # These are the items that were just rescheduled
        table_name = "backlog_items"  # Try backlog_items first, fall back to backlog if needed
        try:
            supabase.table("backlog_items").select("id").limit(1).execute()
        except:
            table_name = "backlog"
        
        # Get recently resolved items (within last 5 minutes)
        from datetime import datetime, timedelta
        five_minutes_ago = (datetime.utcnow() - timedelta(minutes=5)).isoformat()
        
        try:
            # Query for recently resolved backlog items
            resolved_result = (
                supabase.table(table_name)
                .select("*")
                .eq("family_id", family_id)
                .eq("source", "auto_reschedule")
                .gte("resolved_at", five_minutes_ago)
                .order("resolved_at", desc=True)
                .limit(50)  # Limit to last 50 items
                .execute()
            )
            
            resolved_items = resolved_result.data or []
            
            if not resolved_items:
                # Try querying by created_at if resolved_at doesn't exist
                resolved_result = (
                    supabase.table(table_name)
                    .select("*")
                    .eq("family_id", family_id)
                    .eq("source", "auto_reschedule")
                    .gte("created_at", five_minutes_ago)
                    .order("created_at", desc=True)
                    .limit(50)
                    .execute()
                )
                resolved_items = resolved_result.data or []
            
            if not resolved_items:
                return {
                    "status": "no_recent_reschedule",
                    "message": "No recent reschedule operations found to undo"
                }
            
            # Get recently created events (last 5 minutes) with source='ai'
            # These are likely the rescheduled events
            recent_events_result = (
                supabase.table("events")
                .select("*")
                .eq("family_id", family_id)
                .eq("source", "ai")
                .gte("created_at", five_minutes_ago)
                .order("created_at", desc=True)
                .limit(50)
                .execute()
            )
            
            recent_events = recent_events_result.data or []
            
            # Delete recent rescheduled events
            deleted_count = 0
            for ev in recent_events:
                # Check if event matches any resolved backlog item
                # Match by child_id and year_plan_id if available
                for item in resolved_items:
                    if ev.get("child_id") == item.get("child_id"):
                        if not item.get("year_plan_id") or ev.get("year_plan_id") == item.get("year_plan_id"):
                            # Delete the event
                            supabase.table("events").delete().eq("id", ev["id"]).execute()
                            deleted_count += 1
                            break
            
            # Re-open backlog items by removing resolved_at (or re-inserting if deleted)
            reopened_count = 0
            for item in resolved_items:
                try:
                    # Try to remove resolved_at timestamp
                    supabase.table(table_name).update({
                        "resolved_at": None
                    }).eq("id", item["id"]).execute()
                    reopened_count += 1
                except:
                    # If that fails, item might have been deleted - try to reinsert
                    try:
                        item_copy = {k: v for k, v in item.items() if k != "id" and k != "resolved_at"}
                        item_copy["source"] = "auto_reschedule"
                        supabase.table(table_name).insert(item_copy).execute()
                        reopened_count += 1
                    except:
                        pass  # Item might already exist, skip
            
            # Refresh calendar cache for affected date range
            try:
                # Get date range from events
                if recent_events:
                    dates = [datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00")).date() for ev in recent_events]
                    min_date = min(dates)
                    max_date = max(dates)
                    
                    supabase.rpc(
                        "refresh_calendar_days_cache",
                        {
                            "p_family_id": family_id,
                            "p_from_date": min_date.isoformat(),
                            "p_to_date": max_date.isoformat()
                        }
                    ).execute()
            except Exception as cache_error:
                log_event("schedule.undo.cache_refresh_error", error=str(cache_error))
            
            log_event(
                "schedule.undo.completed",
                user_id=user["id"],
                family_id=family_id,
                deleted_events=deleted_count,
                reopened_backlog=reopened_count
            )
            
            return {
                "status": "ok",
                "deleted_events": deleted_count,
                "reopened_backlog_items": reopened_count,
                "message": f"Undid reschedule: removed {deleted_count} events, reopened {reopened_count} backlog items"
            }
            
        except Exception as undo_error:
            log_event("schedule.undo.error", error=str(undo_error))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to undo reschedule: {str(undo_error)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("schedule.undo.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to undo reschedule: {str(e)}"
        )


@router.get("/health")
async def get_planner_health(
    child: Optional[str] = None,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get planner health metrics for a child or family.
    
    Query params:
        child: Optional child ID for child-specific health
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not associated with a family"
            )
        
        # Import health service
        from services.planner_health import compute_health
        
        # Compute health
        health_result = compute_health(
            child_id=child,
            family_id=family_id,
            horizon_days=14
        )
        
        log_event("planner.health.computed", user_id=user["id"], child_id=child, score=health_result.get("score"))
        
        return health_result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        log_event("planner.health.error", user_id=user.get("id"), error=str(e), traceback=error_trace)
        print(f"[planner_health] Error: {str(e)}")
        print(f"[planner_health] Traceback: {error_trace}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute planner health: {str(e)}"
        )


"""
FastAPI routes for Scheduling Assistant (Outlook-style free/busy + interval solver)
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
try:
    from dateutil import parser as date_parser
except ImportError:
    # Fallback to datetime parsing if dateutil not available
    def date_parser_parse(s: str) -> datetime:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    # Important: ensure `parse(...)` is not bound as an instance method (which would add `self`)
    date_parser = type('obj', (object,), {'parse': staticmethod(date_parser_parse)})()
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family, get_placeholder_conversion_fields, require_onboarding_complete
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/schedule", tags=["scheduling-assistant"])


# --- Pydantic Models ---

class BusyInterval(BaseModel):
    start_at: str
    end_at: str
    source: str  # 'event', 'override', 'hold'
    event_id: Optional[str] = None
    is_tentative: bool = False

class AvailableInterval(BaseModel):
    start_at: str
    end_at: str
    duration_minutes: int

class SuggestedSlot(BaseModel):
    start_at: str
    end_at: str
    score: float
    reasons: List[str]

class AvailabilityResponse(BaseModel):
    busy_intervals: List[BusyInterval]
    available_intervals: Optional[List[AvailableInterval]] = None
    suggested_slots: Optional[List[SuggestedSlot]] = None

class CreateHoldInput(BaseModel):
    event_id: str  # Backlog event ID (is_backlog=true)
    start_at: str
    end_at: str

class ConfirmHoldInput(BaseModel):
    hold_id: Optional[str] = None
    event_id: str  # Backlog event ID (is_backlog=true)
    start_at: str
    end_at: str
    title: Optional[str] = None
    subject_id: Optional[str] = None


# --- Helper Functions ---

def merge_intervals(intervals: List[Dict]) -> List[Dict]:
    """Merge overlapping intervals (union)"""
    if not intervals:
        return []
    
    # Sort by start time
    sorted_intervals = sorted(intervals, key=lambda x: x['start_at'])
    merged = [sorted_intervals[0]]
    
    for current in sorted_intervals[1:]:
        last = merged[-1]
        # If current overlaps with last, merge them
        if current['start_at'] <= last['end_at']:
            merged[-1] = {
                'start_at': last['start_at'],
                'end_at': max(last['end_at'], current['end_at']),
                'sources': last.get('sources', [last.get('source', 'unknown')]) + [current.get('source', 'unknown')],
                'is_tentative': last.get('is_tentative', False) or current.get('is_tentative', False)
            }
        else:
            merged.append(current)
    
    return merged

def snap_to_resolution(timestamp: datetime, resolution_minutes: int = 15) -> datetime:
    """Snap timestamp to nearest resolution (e.g., 15 minutes)"""
    minutes = timestamp.minute
    snapped_minutes = (minutes // resolution_minutes) * resolution_minutes
    return timestamp.replace(minute=snapped_minutes, second=0, microsecond=0)

def subtract_intervals(base_start: datetime, base_end: datetime, busy_intervals: List[Dict]) -> List[Dict]:
    """Subtract busy intervals from base window to get available intervals"""
    available = []
    current_start = base_start
    
    for busy in busy_intervals:
        busy_start = busy['start_at']
        busy_end = busy['end_at']
        
        # If there's a gap before this busy interval, it's available
        if current_start < busy_start:
            available.append({
                'start_at': current_start,
                'end_at': min(busy_start, base_end)
            })
        
        # Move current_start past this busy interval
        current_start = max(current_start, busy_end)
    
    # Add remaining time after last busy interval
    if current_start < base_end:
        available.append({
            'start_at': current_start,
            'end_at': base_end
        })
    
    return available

def score_slot(slot: Dict, backlog_item: Dict, existing_events: List[Dict]) -> tuple:
    """Score a candidate slot based on heuristics"""
    score = 100.0
    reasons = []
    
    slot_start = slot['start_at']
    slot_end = slot['end_at']
    slot_duration = (slot_end - slot_start).total_seconds() / 60
    
    # 1. Energy preference match
    energy_pref = backlog_item.get('energy_pref', 'any')
    if energy_pref and energy_pref != 'any':
        hour = slot_start.hour
        if energy_pref == 'AM' and hour >= 12:
            score -= 20
            reasons.append("Prefers AM")
        elif energy_pref == 'PM' and hour < 12:
            score -= 20
            reasons.append("Prefers PM")
        else:
            score += 10
            reasons.append(f"Matches {energy_pref} preference")
    
    # 2. Deadline urgency
    due_ts = backlog_item.get('due_ts')
    if due_ts:
        try:
            due_date = due_ts if isinstance(due_ts, datetime) else date_parser.parse(due_ts)
            days_until_due = (due_date - slot_start).days
            if days_until_due < 3:
                score += 30
                reasons.append("Due soon")
            elif days_until_due < 7:
                score += 15
                reasons.append("Due this week")
        except:
            pass  # Skip if date parsing fails
    
    # 3. Avoid fragmentation (prefer slots that don't create tiny gaps)
    # This is simplified - in full version, check adjacent events
    score += 5
    reasons.append("Good spacing")
    
    # 4. Consistency (prefer similar times week-to-week)
    # This would require historical data - simplified for now
    score += 5
    
    # 5. Avoid stacking heavy subjects
    # Simplified - would need subject metadata
    score += 5
    
    return score, reasons


# --- API Endpoints ---

@router.get("/availability")  # Removed response_model temporarily to include debug info
async def get_availability(
    child_id: str = Query(..., description="Child ID"),
    time_min: str = Query(..., description="Start time (ISO 8601)"),
    time_max: str = Query(..., description="End time (ISO 8601)"),
    duration_min: Optional[int] = Query(None, description="Duration in minutes (for suggestions)"),
    event_id: Optional[str] = Query(None, description="Backlog event ID (for better scoring)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get busy intervals and optionally suggested slots for scheduling.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Validate child_id format (should be a UUID)
        import re
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
        if not child_id or not uuid_pattern.match(child_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Invalid child_id format: {child_id}"
            )
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Child {child_id} does not belong to family {family_id}"
            )
        
        supabase = get_admin_client()
        
        # Parse time range
        start_dt = date_parser.parse(time_min)
        end_dt = date_parser.parse(time_max)
        
        # Get busy intervals using the database function
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[get_availability] Calling get_busy_intervals with family_id={family_id}, child_id={child_id}, start={start_dt.isoformat()}, end={end_dt.isoformat()}")
        
        # Debug: Check what events exist for this child/family that might overlap the time range
        # Query events that overlap: start_ts < end_dt AND end_ts > start_dt
        # IMPORTANT: Filter by time range FIRST to only get events in the relevant week
        all_events = supabase.table("events").select("id, title, child_id, start_ts, end_ts, is_backlog, status, deleted_at, family_id").eq("family_id", family_id).lt("start_ts", end_dt.isoformat()).gt("end_ts", start_dt.isoformat()).limit(50).execute()
        logger.info(f"[get_availability] Total events for family: {len(all_events.data or [])}")
        
        # Debug: Show sample events and their times
        sample_events_info = []
        for event in (all_events.data or [])[:5]:  # First 5 events
            sample_events_info.append({
                "id": str(event.get('id')),
                "title": event.get('title'),
                "start_ts": event.get('start_ts'),
                "end_ts": event.get('end_ts'),
                "child_id": str(event.get('child_id')) if event.get('child_id') else None,
                "is_backlog": event.get('is_backlog'),
                "status": event.get('status'),
            })
        
        # Filter for events that overlap the time range and match child_id
        overlapping_events = []
        for event in (all_events.data or []):
            event_start = date_parser.parse(event['start_ts'])
            event_end = date_parser.parse(event['end_ts'])
            # Check overlap: event overlaps if start < range_end AND end > range_start
            overlaps = event_start < end_dt and event_end > start_dt
            matches_child = event.get('child_id') == child_id or event.get('child_id') is None
            is_valid = (event.get('is_backlog') is None or event.get('is_backlog') == False) and event.get('status') != 'canceled' and event.get('deleted_at') is None
            
            if overlaps:
                logger.info(f"[get_availability] Event {event.get('id')} '{event.get('title')}': overlaps={overlaps}, matches_child={matches_child}, is_valid={is_valid}, child_id={event.get('child_id')}, is_backlog={event.get('is_backlog')}, status={event.get('status')}, deleted_at={event.get('deleted_at')}")
                if matches_child and is_valid:
                    overlapping_events.append(event)
        
        logger.info(f"[get_availability] Found {len(overlapping_events)} valid overlapping events for child {child_id}")
        
        # Debug info to return in response
        debug_info = {
            "total_events_for_family": len(all_events.data or []),
            "overlapping_events_count": len(overlapping_events),
            "sample_events_from_db": sample_events_info,  # First 5 events from DB to see their times
            "sample_overlapping_events": [
                {
                    "id": str(e.get("id")),
                    "title": e.get("title"),
                    "child_id": str(e.get("child_id")) if e.get("child_id") else None,
                    "start_ts": e.get("start_ts"),
                    "end_ts": e.get("end_ts"),
                    "is_backlog": e.get("is_backlog"),
                    "status": e.get("status"),
                    "deleted_at": e.get("deleted_at")
                }
                for e in overlapping_events[:3]  # First 3 for debugging
            ],
            "time_range": {
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat()
            },
            "child_id": child_id,
            "family_id": str(family_id)
        }
        
        # Also check what events the SQL function should find directly
        # Query ALL family events (all children) to match the SQL function behavior
        direct_events_check = supabase.table("events").select("id, title, child_id, start_ts, end_ts, is_backlog, status, deleted_at").eq("family_id", family_id).lt("start_ts", end_dt.isoformat()).gt("end_ts", start_dt.isoformat()).neq("status", "canceled").is_("deleted_at", "null").or_(f"is_backlog.is.null,is_backlog.eq.false").limit(10).execute()
        debug_info["direct_sql_query_count"] = len(direct_events_check.data or [])
        debug_info["direct_sql_query_events"] = [
            {
                "id": str(e.get("id")),
                "title": e.get("title"),
                "start_ts": e.get("start_ts"),
                "end_ts": e.get("end_ts"),
                "is_backlog": e.get("is_backlog"),
                "status": e.get("status"),
            }
            for e in (direct_events_check.data or [])[:5]
        ]
        
        result = supabase.rpc('get_busy_intervals', {
            'p_family_id': family_id,
            'p_child_id': child_id,
            'p_start_at': start_dt.isoformat(),
            'p_end_at': end_dt.isoformat()
        }).execute()

        # Surface RPC errors clearly (common: function not found until migration is applied)
        if getattr(result, "error", None):
            error_msg = f"get_busy_intervals RPC failed: {result.error}"
            logger.error(f"[get_availability] {error_msg}")
            debug_info["rpc_error"] = str(result.error)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error_msg,
            )
        
        if result.data is None:
            result.data = []
        
        logger.info(f"[get_availability] RPC returned {len(result.data)} raw intervals: {result.data}")
        debug_info["rpc_returned_count"] = len(result.data)
        debug_info["rpc_raw_data"] = result.data[:5] if result.data else []  # First 5 for debugging
        
        # Normalize and merge intervals
        intervals = []
        for row in result.data:
            intervals.append({
                'start_at': date_parser.parse(row['start_at']),
                'end_at': date_parser.parse(row['end_at']),
                'source': row['source'],
                'event_id': row.get('event_id'),
                'is_tentative': row.get('is_tentative', False)
            })
        
        # Snap to 15-minute resolution
        for interval in intervals:
            interval['start_at'] = snap_to_resolution(interval['start_at'], 15)
            interval['end_at'] = snap_to_resolution(interval['end_at'], 15)
        
        # Merge overlapping intervals
        merged_busy = merge_intervals(intervals)
        
        # Convert back to ISO strings for response
        busy_intervals = [
            BusyInterval(
                start_at=interval['start_at'].isoformat(),
                end_at=interval['end_at'].isoformat(),
                source=interval.get('source', 'unknown'),
                event_id=interval.get('event_id'),
                is_tentative=interval.get('is_tentative', False)
            )
            for interval in merged_busy
        ]
        
        # If duration_min provided, generate suggestions
        suggested_slots = None
        available_intervals = None
        
        if duration_min:
            # Define working hours (9 AM - 5 PM, can be made configurable)
            working_start = start_dt.replace(hour=9, minute=0, second=0, microsecond=0)
            working_end = start_dt.replace(hour=17, minute=0, second=0, microsecond=0)
            
            # Get available intervals
            available = subtract_intervals(working_start, working_end, merged_busy)
            
            # Filter to intervals >= duration_min
            available = [a for a in available if (a['end_at'] - a['start_at']).total_seconds() / 60 >= duration_min]
            
            available_intervals = [
                AvailableInterval(
                    start_at=a['start_at'].isoformat(),
                    end_at=a['end_at'].isoformat(),
                    duration_minutes=int((a['end_at'] - a['start_at']).total_seconds() / 60)
                )
                for a in available
            ]
            
            # Generate candidate slots (every 15 minutes within available intervals)
            candidates = []
            for avail in available:
                current = avail['start_at']
                while current + timedelta(minutes=duration_min) <= avail['end_at']:
                    candidates.append({
                        'start_at': current,
                        'end_at': current + timedelta(minutes=duration_min)
                    })
                    current += timedelta(minutes=15)  # Step by 15 minutes
            
            # Get backlog event metadata for better scoring if event_id provided
            backlog_event = {}
            if event_id:
                try:
                    event_res = supabase.table("events").select("energy_pref, due_ts, priority").eq("id", event_id).single().execute()
                    if event_res.data:
                        backlog_event = event_res.data
                except:
                    pass  # Continue without event metadata if fetch fails
            
            # Score and rank candidates
            scored = []
            for candidate in candidates:
                score, reasons = score_slot(candidate, backlog_event, [])
                scored.append({
                    'start_at': candidate['start_at'],
                    'end_at': candidate['end_at'],
                    'score': score,
                    'reasons': reasons
                })
            
            # Sort by score (highest first) and take top 10
            scored.sort(key=lambda x: x['score'], reverse=True)
            top_slots = scored[:10]
            
            suggested_slots = [
                SuggestedSlot(
                    start_at=s['start_at'].isoformat(),
                    end_at=s['end_at'].isoformat(),
                    score=s['score'],
                    reasons=s['reasons']
                )
                for s in top_slots
            ]
        
        # Include debug info in response (remove in production)
        # Note: Using dict instead of Pydantic model to include debug info
        response_dict = {
            "busy_intervals": [interval.dict() for interval in busy_intervals],
            "available_intervals": [interval.dict() for interval in available_intervals] if available_intervals else None,
            "suggested_slots": [slot.dict() for slot in suggested_slots] if suggested_slots else None,
            "_debug": debug_info  # Temporary debug info
        }
        
        return response_dict
    
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/hold")
async def create_hold(
    body: CreateHoldInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create a temporary scheduling hold (expires in 10 minutes).
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Verify backlog event belongs to family and is a backlog item
        event_res = supabase.table("events").select("child_id, family_id, is_backlog").eq("id", body.event_id).single().execute()
        if not event_res.data or event_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Event not found")
        if not event_res.data.get("is_backlog", False):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not a backlog item")
        
        child_id = event_res.data["child_id"]
        
        # Parse times
        start_dt = date_parser.parse(body.start_at)
        end_dt = date_parser.parse(body.end_at)
        expires_at = datetime.now() + timedelta(minutes=10)
        
        # Create hold
        hold_res = supabase.table("scheduling_holds").insert({
            "family_id": family_id,
            "event_id": body.event_id,
            "child_id": child_id,
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
            "expires_at": expires_at.isoformat(),
            "created_by": user["id"]
        }).execute()
        
        if not hold_res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create hold")
        
        return {"hold_id": hold_res.data[0]["id"], "expires_at": expires_at.isoformat()}
    
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/confirm")
async def confirm_hold(
    body: ConfirmHoldInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Confirm a hold and create the actual event.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        
        # Get backlog event
        event_res = supabase.table("events").select("*").eq("id", body.event_id).single().execute()
        if not event_res.data or event_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Event not found")
        if not event_res.data.get("is_backlog", False):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not a backlog item")
        
        backlog_event = event_res.data
        child_id = backlog_event["child_id"]
        
        # Parse times
        start_dt = date_parser.parse(body.start_at)
        end_dt = date_parser.parse(body.end_at)
        
        # Update the backlog event to be scheduled (remove is_backlog flag, set real times)
        update_data = {
            "start_ts": start_dt.isoformat(),
            "end_ts": end_dt.isoformat(),
            "status": "scheduled",
            "is_backlog": False,
            "source": backlog_event.get("source", "scheduling_assistant"),
        }
        
        if body.title:
            update_data["title"] = body.title
        
        if body.subject_id:
            update_data["subject_id"] = body.subject_id
        elif backlog_event.get("subject_id"):
            update_data["subject_id"] = backlog_event["subject_id"]
        
        conv_fields, did_convert = get_placeholder_conversion_fields(backlog_event)
        update_data.update(conv_fields)
        if did_convert:
            log_event("placeholder_converted", action="scheduling_assistant_confirm", event_id=body.event_id, academic_year_id=backlog_event.get("academic_year_id"), user_id=user["id"], old_batch_id=backlog_event.get("generation_batch_id"))
        
        updated_res = supabase.table("events").update(update_data).eq("id", body.event_id).execute()
        
        if not updated_res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to schedule event")
        
        # Delete hold if provided
        if body.hold_id:
            supabase.table("scheduling_holds").delete().eq("id", body.hold_id).execute()
        
        return {
            "event_id": event_res.data[0]["id"],
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat()
        }
    
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/hold/{hold_id}")
async def delete_hold(
    hold_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Delete a scheduling hold.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Verify hold belongs to family
        hold_res = supabase.table("scheduling_holds").select("family_id").eq("id", hold_id).single().execute()
        if not hold_res.data or hold_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hold not found")
        
        # Delete hold
        supabase.table("scheduling_holds").delete().eq("id", hold_id).execute()
        
        return {"success": True}
    
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

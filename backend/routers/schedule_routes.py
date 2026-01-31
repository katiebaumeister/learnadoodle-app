"""
FastAPI routes for Blockit-style Week Scheduling
Provides reschedule preview and apply endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple, Set
from datetime import datetime, timedelta, timezone
import math

from auth import get_current_user
from helpers import get_family_id_for_user
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def is_user_in_family(user_id: str, family_id: str, supabase) -> bool:
    """Check if user is a member of the specified family (not just primary family)"""
    try:
        # Check family_members table first
        member_check = supabase.table("family_members").select("id").eq("family_id", family_id).eq("user_id", user_id).limit(1).execute()
        if member_check.data:
            return True
    except Exception:
        pass
    
    # Fallback: check profiles.family_id (backward compatibility)
    try:
        profile_check = supabase.table("profiles").select("family_id").eq("id", user_id).maybe_single().execute()
        if profile_check.data and profile_check.data.get("family_id") == family_id:
            return True
    except Exception:
        pass
    
    # Final fallback: if user has children in this family, assume membership
    try:
        children_check = supabase.table("children").select("id").eq("family_id", family_id).limit(1).execute()
        if children_check.data:
            return True
    except Exception:
        pass
    
    return False


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Check if two time ranges overlap"""
    return a_start < b_end and a_end > b_start


def normalize_child_ids(e: Dict[str, Any]) -> List[str]:
    """Normalize child_ids from events: child_ids[] OR child_id legacy (NULL-safe)"""
    if e.get("child_ids"):
        return e["child_ids"]
    if e.get("child_id"):
        return [e["child_id"]]
    return []


def parse_datetime_utc(dt_str_or_dt: Any) -> datetime:
    """Parse datetime string to UTC datetime, or ensure existing datetime is UTC-aware"""
    if isinstance(dt_str_or_dt, datetime):
        if dt_str_or_dt.tzinfo is None:
            # Assume UTC if naive
            return dt_str_or_dt.replace(tzinfo=timezone.utc)
        return dt_str_or_dt.astimezone(timezone.utc)
    
    if isinstance(dt_str_or_dt, str):
        # Parse ISO string and normalize to UTC
        dt = datetime.fromisoformat(dt_str_or_dt.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)
    
    raise ValueError(f"Cannot parse datetime from {type(dt_str_or_dt)}")


def snap_dt(dt: datetime, minutes: int) -> datetime:
    """Snap datetime down to nearest increment (UTC-aware)"""
    # Ensure UTC
    dt_utc = dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    epoch = int(dt_utc.timestamp())
    inc = minutes * 60
    snapped = (epoch // inc) * inc
    return datetime.fromtimestamp(snapped, tz=timezone.utc)


class ReschedulePreviewRequest(BaseModel):
    family_id: str
    from_ts: datetime
    to_ts: datetime
    child_ids: Optional[List[str]] = None
    max_moves: int = 10
    increment_minutes: int = 15
    keep_same_day: bool = False
    minimize_disruption: bool = True


class MoveSuggestion(BaseModel):
    event_id: str
    from_start: datetime
    from_end: datetime
    to_start: datetime
    to_end: datetime
    score: float
    explanation: str = ""


class ReschedulePreviewResponse(BaseModel):
    ok: bool
    moves: List[MoveSuggestion]
    skipped: List[Dict[str, Any]]
    rationale: str = ""


class RescheduleApplyRequest(BaseModel):
    family_id: str
    moves: List[MoveSuggestion]
    action_type: str = "bulk_reschedule"


class RescheduleApplyResponse(BaseModel):
    ok: bool
    applied: int
    results: List[Dict[str, Any]]


@router.post("/reschedule_preview", response_model=ReschedulePreviewResponse)
def reschedule_preview(payload: ReschedulePreviewRequest, user: dict = Depends(get_current_user)):
    """Preview rescheduling moves for events in a time window"""
    supabase = get_admin_client()
    
    # Auth check: ensure user is a member of family_id (not just primary family)
    if not is_user_in_family(user["id"], payload.family_id, supabase):
        raise HTTPException(status_code=403, detail="Not authorized for family")

    # Normalize timestamps to UTC
    from_ts_utc = parse_datetime_utc(payload.from_ts)
    to_ts_utc = parse_datetime_utc(payload.to_ts)

    # Fetch candidate events in scope
    # Events where family_id, scheduled, not locked, overlaps scope, not done/canceled/deleted
    events_query = supabase.table("events").select("*") \
        .eq("family_id", payload.family_id) \
        .is_("deleted_at", None) \
        .is_("canceled_at", None) \
        .eq("is_backlog", False) \
        .neq("status", "done") \
        .neq("status", "canceled") \
        .lt("start_ts", to_ts_utc.isoformat()) \
        .gt("end_ts", from_ts_utc.isoformat())

    events_resp = events_query.execute()
    events = events_resp.data if events_resp.data else []

    # Filter movable + child intersection
    movable = []
    for e in events:
        if e.get("is_locked"):
            continue
        e_child_ids = set(normalize_child_ids(e))
        if payload.child_ids:
            if not e_child_ids.intersection(set(payload.child_ids)):
                continue
        movable.append(e)

    # Sort candidates (priority desc, then earliest start) - parse datetime for proper sorting
    def sort_key(x: Dict[str, Any]) -> Tuple[int, datetime]:
        priority = -int(x.get("priority") or 0)
        start_dt = parse_datetime_utc(x["start_ts"])
        return (priority, start_dt)
    
    movable.sort(key=sort_key)

    # Get busy blocks for scope (exclude candidates themselves later)
    fb_resp = supabase.rpc("get_freebusy_week", {
        "_family_id": payload.family_id,
        "_from": from_ts_utc.isoformat(),
        "_to": to_ts_utc.isoformat(),
        "_child_ids": payload.child_ids
    }).execute()

    busy = (fb_resp.data or {}).get("busy", [])

    # Track proposed moves to avoid scheduling conflicts between them
    # Format: List[Tuple[child_ids_set, start_dt, end_dt, event_id]]
    proposed_busy: List[Tuple[Set[str], datetime, datetime, str]] = []

    def conflicts_with_proposals(candidate_child_ids: Set[str], start: datetime, end: datetime) -> bool:
        """Check if a time range conflicts with proposed moves"""
        for p_children, p_start, p_end, _ in proposed_busy:
            # Check child overlap
            if candidate_child_ids and p_children and not candidate_child_ids.intersection(p_children):
                continue
            # Check time overlap
            if overlaps(start, end, p_start, p_end):
                return True
        return False

    # Convert busy blocks to datetime, and index by child overlap
    def busy_conflicts(candidate_child_ids: Set[str], start: datetime, end: datetime, ignore_event_id: str) -> bool:
        """Check if a time range conflicts with busy blocks"""
        for b in busy:
            if b.get("event_id") == ignore_event_id:
                continue
            b_child_ids = set(b.get("child_ids") or [])
            if candidate_child_ids and b_child_ids and not candidate_child_ids.intersection(b_child_ids):
                continue
            # Parse ISO timestamps to UTC
            b_start = parse_datetime_utc(b["start_ts"])
            b_end = parse_datetime_utc(b["end_ts"])
            if overlaps(start, end, b_start, b_end):
                return True
        return False

    # Slot finding
    increment = payload.increment_minutes
    moves: List[MoveSuggestion] = []
    skipped: List[Dict[str, Any]] = []

    for e in movable[:payload.max_moves]:
        e_id = e["id"]
        
        # Parse timestamps to UTC
        from_start = parse_datetime_utc(e["start_ts"])
        from_end = parse_datetime_utc(e["end_ts"])
            
        dur = from_end - from_start
        child_set = set(normalize_child_ids(e))

        # Determine allowed range for move (normalize to UTC)
        window_start = from_ts_utc
        window_end = to_ts_utc

        if e.get("move_window_start"):
            window_start = max(window_start, parse_datetime_utc(e["move_window_start"]))
        if e.get("move_window_end"):
            window_end = min(window_end, parse_datetime_utc(e["move_window_end"]))

        if window_end <= window_start:
            skipped.append({"event_id": e_id, "reason": "No valid move window"})
            continue

        # If keep_same_day, clamp to same day as original (in UTC)
        if payload.keep_same_day:
            day_start = from_start.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            window_start = max(window_start, day_start)
            window_end = min(window_end, day_end)

        # Search forward from snapped window_start
        cursor = snap_dt(window_start, increment)
        best: Optional[Tuple[datetime, datetime, float, str]] = None

        while cursor + dur <= window_end:
            candidate_start = cursor
            candidate_end = cursor + dur

            # Score disruption: prefer minimal delta from original
            delta_minutes = abs((candidate_start - from_start).total_seconds()) / 60.0
            score = delta_minutes

            # Check conflicts: both existing busy blocks AND proposed moves
            if (not busy_conflicts(child_set, candidate_start, candidate_end, ignore_event_id=e_id) and
                not conflicts_with_proposals(child_set, candidate_start, candidate_end)):
                expl = f"Moved {int(delta_minutes)}m from original time"
                best = (candidate_start, candidate_end, score, expl)
                if payload.minimize_disruption:
                    break  # first feasible is best enough
            cursor += timedelta(minutes=increment)

        if not best:
            skipped.append({"event_id": e_id, "reason": "No slot found"})
            continue

        to_start, to_end, score, expl = best
        moves.append(MoveSuggestion(
            event_id=e_id,
            from_start=from_start,
            from_end=from_end,
            to_start=to_start,
            to_end=to_end,
            score=score,
            explanation=expl
        ))
        
        # Add to proposed_busy to prevent subsequent events from conflicting
        proposed_busy.append((child_set, to_start, to_end, e_id))

    rationale = "Proposed moves prioritize the earliest available open slots with minimal disruption."
    return ReschedulePreviewResponse(ok=True, moves=moves, skipped=skipped, rationale=rationale)


@router.post("/reschedule_apply", response_model=RescheduleApplyResponse)
def reschedule_apply(payload: RescheduleApplyRequest, user: dict = Depends(get_current_user)):
    """Apply rescheduling moves atomically"""
    supabase = get_admin_client()
    
    # Auth check: ensure user is a member of family_id
    if not is_user_in_family(user["id"], payload.family_id, supabase):
        raise HTTPException(status_code=403, detail="Not authorized for family")

    # Normalize all timestamps to UTC and build moves JSONB
    moves_jsonb = []
    for m in payload.moves:
        to_start_utc = parse_datetime_utc(m.to_start)
        to_end_utc = parse_datetime_utc(m.to_end)
        moves_jsonb.append({
            "event_id": m.event_id,
            "start_ts": to_start_utc.isoformat(),
            "end_ts": to_end_utc.isoformat()
        })

    # Use bulk apply RPC for atomic operation
    import json
    res = supabase.rpc("apply_bulk_event_time_updates", {
        "_family_id": payload.family_id,
        "_moves": json.dumps(moves_jsonb),
        "_reason": payload.action_type
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Bulk apply failed")

    bulk_result = res.data
    if not bulk_result.get("ok"):
        # Return validation errors
        results = bulk_result.get("results", [])
        return RescheduleApplyResponse(
            ok=False,
            applied=0,
            results=results
        )

    # All moves applied successfully
    results = bulk_result.get("results", [])
    applied = sum(1 for r in results if r.get("ok", False))

    return RescheduleApplyResponse(ok=True, applied=applied, results=results)

"""
Utility functions for LLM routes
Handles storage, context loading, persistence, and applying changes
"""
import io
import asyncio
import json
import datetime as dt
from typing import Dict, Any, List, Tuple, Optional
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from supabase_client import get_admin_client
except ImportError:
    # Fallback for different import styles
    import importlib.util
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client

def _log(msg: str, **kwargs):
    context = " ".join([f"{k}={v!r}" for k, v in kwargs.items()])
    print(f"[LLM-UTIL] {msg}{(' ' + context) if context else ''}")


async def get_file_text_from_storage(bucket: str, path: str) -> str:
    """Fetch file from Supabase Storage and extract text (handles PDFs)"""
    supa = get_admin_client()
    
    try:
        _log("storage.download.start", bucket=bucket, path=path)
        # Download file
        res = supa.storage.from_(bucket).download(path)
        data: bytes = res
        _log("storage.download.success", byte_length=len(data))
        
        # Try UTF-8 first (for text files)
        try:
            return data.decode("utf-8", errors="ignore")
        except Exception:
            # Handle PDFs
            try:
                from pypdf import PdfReader
                text = []
                reader = PdfReader(io.BytesIO(data))
                for page in reader.pages:
                    text.append(page.extract_text() or "")
                return "\n".join(text)
            except ImportError:
                _log("storage.download.error", error="pypdf missing")
                raise ImportError("pypdf required for PDF extraction. Install with: pip install pypdf")
    except Exception as e:
        _log("storage.download.exception", error=str(e))
        raise ValueError(f"Failed to fetch file from storage: {e}")

def _date_range(start_date: dt.date, end_date: dt.date):
    """Inclusive date range generator."""
    current = start_date
    while current <= end_date:
        yield current
        current += dt.timedelta(days=1)


def _build_week_view_fallback(
    supa,
    family_id: str,
    start_date: dt.date,
    end_date: dt.date,
    child_ids: List[str],
    blackouts: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Fallback week view builder that avoids schedule_overrides access."""
    _log("fallback.week_view.start", start_date=str(start_date), end_date=str(end_date), child_count=len(child_ids or []))
    child_filter = set(child_ids) if child_ids else None

    # Fetch children
    try:
        _log("fallback.children.query")
        children_res = supa.table("children").select(
            "id, first_name, grade_level, grade, avatar, family_id"
        ).eq("family_id", family_id).execute()
    except Exception as e:
        _log("fallback.children.error", error=str(e))
        raise
    children_rows = children_res.data or []
    if child_filter:
        children_rows = [c for c in children_rows if c["id"] in child_filter]

    child_lookup = {c["id"]: c for c in children_rows}
    _log("fallback.children.success", count=len(children_rows))

    # Fetch calendar cache
    cache_rows = []
    try:
        _log("fallback.cache.query")
        cache_res = supa.table("calendar_days_cache").select(
            "child_id, date, day_status, first_block_start, last_block_end"
        ).eq("family_id", family_id).gte("date", str(start_date)).lte("date", str(end_date)).execute()
        cache_rows = cache_res.data or []
        _log("fallback.cache.success", count=len(cache_rows))
    except Exception as e:
        _log("fallback.cache.error", error=str(e))
        _log("fallback.cache.fallback", message="proceeding with empty availability due to RLS")
    cache_map = {
        (row["child_id"], row["date"]): row
        for row in cache_rows
    }

    # Build blackout lookup
    blackout_ranges = []
    for bo in blackouts:
        try:
            starts = dt.date.fromisoformat(bo["starts_on"])
            ends = dt.date.fromisoformat(bo["ends_on"])
        except Exception:
            continue
        blackout_ranges.append({
            "child_id": bo.get("child_id"),
            "starts_on": starts,
            "ends_on": ends,
        })

    def is_day_blacked(child_id: str, date_obj: dt.date) -> bool:
        for bo in blackout_ranges:
            if bo["starts_on"] <= date_obj <= bo["ends_on"]:
                if bo["child_id"] is None or bo["child_id"] == child_id:
                    return True
        return False

    # Build availability entries
    availability_entries: List[Dict[str, Any]] = []
    for child_id, child in child_lookup.items():
        for day in _date_range(start_date, end_date):
            date_str = str(day)
            cache_row = cache_map.get((child_id, date_str), {})
            day_status = cache_row.get("day_status")

            if is_day_blacked(child_id, day):
                day_status = "off"

            first_block = cache_row.get("first_block_start")
            last_block = cache_row.get("last_block_end")

            if day_status == "off":
                windows = []
            elif first_block and last_block:
                windows = [{
                    "start": first_block,
                    "end": last_block,
                    "status": day_status or "teach",
                }]
            else:
                windows = []

            availability_entries.append({
                "child_id": child_id,
                "child_name": child.get("first_name") or "Child",
                "date": date_str,
                "day_status": day_status or ("teach" if windows else None),
                "windows": windows,
            })

    # Fetch events with subject info
    try:
        _log("fallback.events.query")
        events_query = supa.table("events").select(
            "id, child_id, title, description, subject_id, status, start_ts, end_ts"
        ).eq("family_id", family_id) \
         .gte("start_ts", start_date.isoformat()) \
         .lt("start_ts", (end_date + dt.timedelta(days=1)).isoformat())

        if child_filter:
            events_query = events_query.in_("child_id", list(child_filter))

        events_rows = events_query.execute().data or []
    except Exception as e:
        _log("fallback.events.error", error=str(e))
        raise
    _log("fallback.events.success", count=len(events_rows))
    events_payload = []
    for row in events_rows:
        start_ts = row.get("start_ts")
        end_ts = row.get("end_ts")
        try:
            start_dt = dt.datetime.fromisoformat(start_ts.replace("Z", "+00:00")) if start_ts else None
            end_dt = dt.datetime.fromisoformat(end_ts.replace("Z", "+00:00")) if end_ts else None
        except Exception:
            start_dt = end_dt = None

        duration_minutes = None
        if start_dt and end_dt:
            duration_minutes = int((end_dt - start_dt).total_seconds() // 60)

        events_payload.append({
            "id": row.get("id"),
            "child_id": row.get("child_id"),
            "title": row.get("title"),
            "description": row.get("description"),
            "subject_id": row.get("subject_id"),
            "status": row.get("status"),
            "start_ts": start_ts,
            "end_ts": end_ts,
            "duration_minutes": duration_minutes,
            "start_local": start_ts,
            "end_local": end_ts,
            "date_local": start_ts.split("T")[0] if start_ts else None,
        })

    children_payload = []
    for child in children_rows:
        children_payload.append({
            "id": child["id"],
            "name": child.get("first_name") or "Child",
            "grade": child.get("grade_level") or child.get("grade"),
            "avatar": child.get("avatar"),
        })

    result = {
        "children": children_payload,
        "avail": availability_entries,
        "events": events_payload,
    }
    _log("fallback.week_view.complete", avail=len(availability_entries), events=len(events_payload))
    return result


async def load_planning_context(
    family_id: str,
    week_start: str,
    child_ids: List[str],
    horizon_weeks: int
) -> Dict[str, Any]:
    """Load all context needed for planning (availability, events, blackouts, required minutes)"""
    supa = get_admin_client()
    _log("planning.load.start", family_id=family_id, week_start=week_start, horizon_weeks=horizon_weeks, child_ids=child_ids)
    
    ws = dt.date.fromisoformat(week_start)
    we = ws + dt.timedelta(days=7 * horizon_weeks)
    
    # Get blackout periods early (also used in fallback)
    try:
        _log("planning.blackouts.query")
        blackouts_res = supa.table("blackout_periods").select("*").eq(
            "family_id", family_id
        ).gte("starts_on", str(ws)).lte("ends_on", str(we)).execute()
        blackouts = blackouts_res.data or []
        _log("planning.blackouts.success", count=len(blackouts))
    except Exception as e:
        _log("planning.blackouts.error", error=str(e))
        raise ValueError(f"Failed to query blackout_periods: {e}") from e

    # Get availability and events from get_week_view RPC (with fallback)
    _log("planning.week_view.skip", reason="bypass schedule_overrides RLS")
    week_view_data = _build_week_view_fallback(
        supa=supa,
        family_id=family_id,
        start_date=ws,
        end_date=we,
        child_ids=child_ids,
        blackouts=blackouts
    )

    avail = week_view_data.get("avail", [])
    events = week_view_data.get("events", [])
    
    # Filter out frozen days from availability
    # Get frozen days for this family in the date range
    try:
        frozen_res = supa.table("calendar_days_cache").select("date, child_id").eq(
            "family_id", family_id
        ).eq("is_frozen", True).gte("date", str(ws)).lte("date", str(we)).execute()
        
        frozen_days = set()
        frozen_by_child = {}
        for row in (frozen_res.data or []):
            date_str = row.get("date")
            child_id = row.get("child_id")
            frozen_days.add(date_str)
            if child_id:
                if child_id not in frozen_by_child:
                    frozen_by_child[child_id] = set()
                frozen_by_child[child_id].add(date_str)
        
        # Filter availability: remove windows for frozen days
        # A day is frozen if it's in frozen_days OR if it's frozen for this specific child
        avail = [
            a for a in avail
            if a.get("date") not in frozen_days
            and not (a.get("child_id") and a.get("child_id") in frozen_by_child and a.get("date") in frozen_by_child.get(a.get("child_id"), set()))
        ]
        
        # Filter events: remove events on frozen days
        events = [
            e for e in events
            if e.get("date_local") not in frozen_days
        ]
        
        _log("planning.frozen.filtered", frozen_count=len(frozen_days), avail_after=len(avail), events_after=len(events))
    except Exception as e:
        _log("planning.frozen.error", error=str(e))
        # Continue without filtering if query fails

    # Get required minutes per child/subject
    required_minutes = []
    for child_id in child_ids:
        try:
            _log("planning.required_minutes.rpc", child=child_id)
            req_res = supa.rpc(
                "get_required_minutes",
                {
                    "p_family_id": family_id,
                    "p_child_id": child_id,
                    "p_week_start": str(ws),
                    "p_weeks_ahead": horizon_weeks
                }
            ).execute()
            rows = req_res.data or []
            required_minutes.extend([{"child_id": child_id, **r} for r in rows])
            _log("planning.required_minutes.success", child=child_id, rows=len(rows))
        except Exception as e:
            _log("planning.required_minutes.error", child=child_id, error=str(e))
    
    # Get learning velocities
    _log("planning.velocity.query")
    velocities_res = supa.table("learning_velocity").select("*").eq(
        "family_id", family_id
    ).in_("child_id", child_ids).execute()
    velocities = velocities_res.data or []
    _log("planning.velocity.success", count=len(velocities))
    
    # Get recent struggles from outcomes (last 30 days) to inform scheduling
    _log("planning.struggles.query")
    struggles_by_child_subject = {}
    try:
        thirty_days_ago = (ws - dt.timedelta(days=30)).isoformat()
        outcomes_res = supa.table("event_outcomes").select(
            "child_id, subject_id, struggles"
        ).eq("family_id", family_id).in_("child_id", child_ids).gte(
            "created_at", thirty_days_ago
        ).execute()
        
        for outcome in (outcomes_res.data or []):
            child_id = outcome.get("child_id")
            subject_id = outcome.get("subject_id")
            struggles = outcome.get("struggles", [])
            if struggles and child_id:
                key = f"{child_id}:{subject_id or 'none'}"
                if key not in struggles_by_child_subject:
                    struggles_by_child_subject[key] = []
                struggles_by_child_subject[key].extend(struggles)
        
        # Deduplicate struggles per child/subject
        for key in struggles_by_child_subject:
            struggles_by_child_subject[key] = list(set(struggles_by_child_subject[key]))
        
        _log("planning.struggles.success", count=len(struggles_by_child_subject))
    except Exception as e:
        _log("planning.struggles.error", error=str(e))
        # Non-critical, continue without struggles data
    
    # Calculate current minutes by day per child (for constraint checking)
    # Format: { "YYYY-MM-DD": { "child_id": total_minutes } }
    current_minutes_by_day = {}
    for event in events:
        date_local = event.get("date_local")
        child_id = event.get("child_id")
        duration_minutes = event.get("duration_minutes", 0)
        
        if date_local and child_id and duration_minutes:
            if date_local not in current_minutes_by_day:
                current_minutes_by_day[date_local] = {}
            if child_id not in current_minutes_by_day[date_local]:
                current_minutes_by_day[date_local][child_id] = 0
            current_minutes_by_day[date_local][child_id] += duration_minutes
    
    # Default max minutes per day per child (4 hours = 240 minutes)
    # Could be made configurable per family in the future
    max_minutes_per_day = 240
    
    # Get standards gaps for each child (if they have active preferences)
    _log("planning.standards_gaps.query")
    standards_gaps_by_child = {}
    try:
        for child_id in child_ids:
            # Get active standards preferences for this child
            prefs_res = supa.table("user_standards_preferences").select(
                "state_code, grade_level, subject_id"
            ).eq("child_id", child_id).eq("is_active", True).execute()
            
            prefs = prefs_res.data or []
            if prefs:
                # Get gaps for each preference
                gaps_for_child = []
                for pref in prefs:
                    try:
                        gaps_res = supa.rpc(
                            "get_standards_gaps",
                            {
                                "p_child_id": child_id,
                                "p_state_code": pref["state_code"],
                                "p_grade_level": pref["grade_level"],
                                "p_subject": None,  # Get all subjects
                                "p_limit": 10,  # Top 10 gaps
                            }
                        ).execute()
                        
                        gaps = gaps_res.data or []
                        gaps_for_child.extend(gaps)
                    except Exception as e:
                        _log("planning.standards_gaps.rpc.error", child=child_id, error=str(e))
                        # Continue with other preferences
                
                if gaps_for_child:
                    standards_gaps_by_child[child_id] = gaps_for_child[:10]  # Limit to top 10
        
        _log("planning.standards_gaps.success", children_with_gaps=len(standards_gaps_by_child))
    except Exception as e:
        _log("planning.standards_gaps.error", error=str(e))
        # Non-critical, continue without standards gaps
    
    result = {
        "family_id": family_id,
        "window": {"start": str(ws), "end": str(we)},
        "children": child_ids,
        "availability": avail,
        "events": events,
        "blackouts": blackouts,
        "required_minutes": required_minutes,
        "velocities": velocities,
        "recent_struggles": struggles_by_child_subject,
        "standards_gaps": standards_gaps_by_child,  # New: standards gaps per child
        "max_minutes_per_day": max_minutes_per_day,
        "current_minutes_by_day": current_minutes_by_day
    }
    _log("planning.load.complete", avail=len(avail), events=len(events), required=len(required_minutes), velocities=len(velocities), struggles=len(struggles_by_child_subject), standards_gaps=len(standards_gaps_by_child), max_minutes=max_minutes_per_day)
    return result

async def persist_ai_plan(
    family_id: str,
    week_start: str,
    scope: Dict[str, Any],
    proposal: Dict[str, Any]
) -> Tuple[str, Dict[str, int], List[Dict[str, Any]]]:
    """Persist AI plan and changes to database"""
    supa = get_admin_client()
    
    # Create plan
    plan_res = supa.table("ai_plans").insert({
        "family_id": family_id,
        "week_start": week_start,
        "scope": scope,
        "status": "draft"
    }).execute()
    
    plan_id = plan_res.data[0]["id"]
    
    # Create plan changes
    adds = proposal.get("adds", [])
    moves = proposal.get("moves", [])
    deletes = proposal.get("deletes", [])
    
    changes = []
    
    for add in adds:
        changes.append({
            "plan_id": plan_id,
            "change_type": "add",
            "event_id": None,
            "payload": add,
            "suggested_by": "llm",
            "approved": False,
            "applied": False
        })
    
    for move in moves:
        changes.append({
            "plan_id": plan_id,
            "change_type": "move",
            "event_id": move.get("event_id"),
            "payload": move,
            "suggested_by": "llm",
            "approved": False,
            "applied": False
        })
    
    for delete in deletes:
        changes.append({
            "plan_id": plan_id,
            "change_type": "delete",
            "event_id": delete.get("event_id"),
            "payload": delete,
            "suggested_by": "llm",
            "approved": False,
            "applied": False
        })
    
    if changes:
        inserted = supa.table("ai_plan_changes").insert(changes).execute()
        # Return changes with their database IDs
        persisted_changes = inserted.data
    else:
        persisted_changes = []
    
    return plan_id, {
        "adds": len(adds),
        "moves": len(moves),
        "deletes": len(deletes)
    }, persisted_changes

async def apply_ai_plan_changes(
    plan_id: str,
    approvals: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Apply approved changes atomically"""
    supa = get_admin_client()
    
    # Fetch plan and changes
    plan_res = supa.table("ai_plans").select("*").eq("id", plan_id).single().execute()
    plan = plan_res.data
    
    changes_res = supa.table("ai_plan_changes").select("*").eq("plan_id", plan_id).execute()
    changes = changes_res.data
    
    # Build approval map
    approved_ids = {a["change_id"] for a in approvals if a.get("approved", False)}
    edits_map = {
        a["change_id"]: a.get("edits")
        for a in approvals
        if a.get("approved", False) and a.get("edits")
    }
    
    adds = moves = deletes = 0
    
    # Apply changes (best effort - Supabase handles transactions)
    for ch in changes:
        if ch["id"] not in approved_ids:
            continue
        
        change_type = ch["change_type"]
        payload = ch["payload"] or {}
        
        # Apply edits if provided
        edits = edits_map.get(ch["id"])
        if edits:
            payload.update(edits)
        
        try:
            if change_type == "add":
                supa.table("events").insert({
                    "family_id": plan["family_id"],
                    "child_id": payload["child_id"],
                    "subject_id": payload.get("subject_id"),
                    "title": payload.get("title", "Lesson"),
                    "start_ts": payload["start"],
                    "end_ts": payload["end"],
                    "status": "scheduled",
                    "metadata": payload
                }).execute()
                adds += 1
                
            elif change_type == "move":
                supa.table("events").update({
                    "start_ts": payload["to_start"],
                    "end_ts": payload["to_end"]
                }).eq("id", payload["event_id"]).execute()
                moves += 1
                
            elif change_type == "delete":
                supa.table("events").delete().eq("id", payload["event_id"]).execute()
                deletes += 1
            
            # Mark change as applied
            supa.table("ai_plan_changes").update({
                "applied": True,
                "approved": True
            }).eq("id", ch["id"]).execute()
            
        except Exception as e:
            print(f"Error applying change {ch['id']}: {e}")
            # Continue with other changes
    
    # Update plan status
    total_approved = len([c for c in changes if c["id"] in approved_ids])
    applied_total = adds + moves + deletes
    status = "applied" if applied_total == total_approved else "partial"
    
    supa.table("ai_plans").update({
        "status": status,
        "applied_at": dt.datetime.now(dt.timezone.utc).isoformat()
    }).eq("id", plan_id).execute()
    
    # Refresh calendar cache for affected window
    ws = plan["week_start"]
    we = str(dt.date.fromisoformat(ws) + dt.timedelta(days=14))
    
    try:
        supa.rpc(
            "refresh_calendar_days_cache",
            {
                "p_family_id": plan["family_id"],
                "p_from_date": ws,
                "p_to_date": we
            }
        ).execute()
    except Exception as e:
        print(f"Warning: Failed to refresh cache: {e}")
    
    return {
        "applied": True,
        "counts": {"adds": adds, "moves": moves, "deletes": deletes},
        "status": status
    }

async def util_save_outline(syllabus_id: str, outline: Dict[str, Any]) -> Dict[str, Any]:
    """Save parsed outline to syllabi_sections table (if exists)"""
    supa = get_admin_client()
    
    # If you have a syllabi_sections table, save there
    # Otherwise, update the syllabi table metadata
    try:
        # Example: save to metadata JSONB column
        supa.table("syllabi").update({
            "metadata": outline
        }).eq("id", syllabus_id).execute()
        
        sections_count = len(outline.get("units", [])) + len(outline.get("assignments", []))
        return {"sections_count": sections_count, "saved": True}
    except Exception as e:
        print(f"Warning: Failed to save outline: {e}")
        return {"sections_count": 0, "saved": False}


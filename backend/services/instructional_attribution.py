"""
Instructional attribution — explicit per-child expansion of events.

Expands events into per-child rows so plan health and constraints are
mathematically pure and avoid ambiguity when editing assignees.

Conceptually: event_instructional_attribution (virtual)
  event_id, child_id, academic_year_id, instructional_minutes,
  instructional_day_credit, is_placeholder, subject_id, start_ts

get_instructional_attributions(events) returns list of such rows.
"""

from typing import Dict, Any, List, Optional
from datetime import date, datetime


# Default cap for all-day events when instructional_minutes is null (avoid 24h = 1440 min)
DEFAULT_PLANNED_MINUTES_PER_DAY = 6 * 60  # 6 hours
ALL_DAY_THRESHOLD_MINUTES = 8 * 60  # treat as all-day if derived >= 8h


def _event_minutes(ev: Dict[str, Any]) -> int:
    """Authoritative instructional minutes for an event. All-day events (no explicit minutes) are capped."""
    explicit = ev.get("instructional_minutes")
    if explicit is not None and isinstance(explicit, (int, float)):
        return max(0, int(explicit))
    start_ts = ev.get("start_ts")
    end_ts = ev.get("end_ts")
    if not start_ts:
        return 0
    try:
        start_dt = datetime.fromisoformat(str(start_ts).replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(str(end_ts).replace("Z", "+00:00")) if end_ts else start_dt
        delta = (end_dt - start_dt).total_seconds() / 60
        minutes = max(0, int(delta))
        if minutes >= ALL_DAY_THRESHOLD_MINUTES:
            return DEFAULT_PLANNED_MINUTES_PER_DAY
        return minutes
    except (ValueError, TypeError):
        return 60


def _counts_toward_plan(ev: Dict[str, Any]) -> bool:
    """True if event counts toward plan (authoritative: instructional_status or counts_toward_plan)."""
    status = (ev.get("instructional_status") or "").strip().upper()
    if status in ("MANUAL_COUNTS", "PLAN_PLACEHOLDER", "PLAN_LOCKED"):
        return True
    if status == "EXCLUDED" or status == "NONE":
        return False
    return ev.get("counts_toward_plan") is True


def get_instructional_attributions(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Expand events into per-child attribution rows.

    Each event with counts_toward_plan=True (or instructional_status in MANUAL_COUNTS, PLAN_PLACEHOLDER)
    and academic_year_id set is expanded to one row per child (child_id or each entry in child_ids).

    Returns list of:
      event_id, child_id, academic_year_id, instructional_minutes, instructional_day_credit,
      is_placeholder, subject_id, start_ts (for date filtering)
    """
    out: List[Dict[str, Any]] = []
    for ev in events:
        if ev.get("deleted_at"):
            continue
        if (ev.get("status") or "").strip().lower() == "canceled":
            continue
        if not _counts_toward_plan(ev):
            continue
        academic_year_id = ev.get("academic_year_id")
        if not academic_year_id:
            continue
        event_id = ev.get("id")
        child_id = ev.get("child_id")
        child_ids = ev.get("child_ids") or []
        if child_id:
            child_ids = [child_id]
        if not child_ids:
            child_ids = []
        minutes = _event_minutes(ev)
        day_credit = ev.get("instructional_day_credit")
        is_placeholder = ev.get("is_placeholder") is True
        subject_id = ev.get("subject_id")
        start_ts = ev.get("start_ts")
        for cid in child_ids:
            if not cid:
                continue
            out.append({
                "event_id": event_id,
                "child_id": str(cid),
                "academic_year_id": str(academic_year_id),
                "instructional_minutes": minutes,
                "instructional_day_credit": day_credit,
                "is_placeholder": is_placeholder,
                "subject_id": str(subject_id) if subject_id else None,
                "start_ts": start_ts,
            })
    return out

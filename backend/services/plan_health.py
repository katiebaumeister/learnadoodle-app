"""
Plan Health — actual compliance from events in DB (drift detection).

Computes planned days/hours from qualifying events, compares to target.
Per DESIGN_PLAN_YEAR.md Phase 5.
"""

from typing import Dict, Any, List, Optional
from datetime import date, datetime
from collections import defaultdict


def _is_qualifying_event_type(etype: str) -> bool:
    return (etype or "").strip().lower() == "lesson"


def _parse_ts_to_date(ts_str: str) -> Optional[date]:
    """Parse ISO timestamp to date (UTC)."""
    if not ts_str:
        return None
    try:
        s = str(ts_str)[:10]
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _parse_ts_to_minutes(ts_str: str) -> Optional[int]:
    """Parse ISO timestamp to minutes since midnight (UTC)."""
    if not ts_str:
        return None
    try:
        dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
        return dt.hour * 60 + dt.minute
    except (ValueError, TypeError):
        return None


def _merge_intervals(intervals: List[tuple]) -> List[tuple]:
    """Merge overlapping (start_min, end_min) intervals."""
    if not intervals:
        return []
    sorted_i = sorted(intervals, key=lambda x: x[0])
    merged: List[tuple] = []
    for s, e in sorted_i:
        if not merged or s > merged[-1][1]:
            merged.append((s, e))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
    return merged


def compute_plan_health_from_events(
    events: List[Dict[str, Any]],
    start_date: date,
    end_date: date,
    constraint_mode: str,
    target_days: Optional[int],
    target_hours: Optional[float],
) -> Dict[str, Any]:
    """
    Compute plan health from qualifying events.
    Qualifying: event_type in qualifying set, status != 'canceled', deleted_at is null,
    counts_toward_plan = True (explicit True only; NULL/False excluded).
    """
    all_dates = set()
    intervals_by_date: Dict[date, List[tuple]] = defaultdict(list)

    for ev in events:
        status = (ev.get("status") or "").strip().lower()
        if status == "canceled":
            continue
        if ev.get("deleted_at"):
            continue
        if not _is_qualifying_event_type(ev.get("event_type") or ""):
            continue
        if ev.get("counts_toward_plan") is not True:
            continue

        start_ts = ev.get("start_ts")
        end_ts = ev.get("end_ts")
        d = _parse_ts_to_date(start_ts)
        if d is None or d < start_date or d > end_date:
            continue

        all_dates.add(d)
        start_min = _parse_ts_to_minutes(start_ts) or 0
        end_min = _parse_ts_to_minutes(end_ts) or start_min + 60
        if end_min <= start_min:
            end_min = start_min + 60
        intervals_by_date[d].append((start_min, end_min))

    total_minutes = 0
    for d in all_dates:
        merged = _merge_intervals(intervals_by_date.get(d, []))
        for s, e in merged:
            total_minutes += e - s

    planned_days = len(all_dates)
    planned_hours = round(total_minutes / 60.0, 2)

    delta_days = None
    delta_hours = None
    percent_complete = None

    if constraint_mode == "days" and target_days is not None and target_days > 0:
        delta_days = planned_days - target_days
        percent_complete = round(100.0 * planned_days / target_days, 1)
    elif constraint_mode == "hours" and target_hours is not None and target_hours > 0:
        delta_hours = round(planned_hours - float(target_hours), 2)
        percent_complete = round(100.0 * planned_hours / float(target_hours), 1)

    return {
        "planned_days": planned_days,
        "planned_hours": planned_hours,
        "delta_days": delta_days,
        "delta_hours": delta_hours,
        "percent_complete": percent_complete,
        "constraint_mode": constraint_mode,
        "target_days": target_days,
        "target_hours": float(target_hours) if target_hours is not None else None,
    }

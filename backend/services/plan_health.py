"""
Plan Health — actual compliance from events in DB (drift detection).

Computes planned days/hours from qualifying events, compares to target.
Per DESIGN_PLAN_YEAR.md Phase 5 and instructional accounting spec.

Qualifying: counts_toward_plan = True, academic_year_id matches plan (caller filters),
status != 'canceled', deleted_at is null. Event type is not restricted (opt-in is the switch).
Minutes: use instructional_minutes when set, else derive from start_ts/end_ts.
Collision/credit: computed per child (child_id or each entry in child_ids).
"""

from typing import Dict, Any, List, Optional
from datetime import date, datetime
from collections import defaultdict

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


# Cap for all-day events when instructional_minutes is null (avoid 24h)
_DEFAULT_PLANNED_MINUTES_PER_DAY = 6 * 60
_ALL_DAY_THRESHOLD_MINUTES = 8 * 60


def _event_minutes(ev: Dict[str, Any]) -> int:
    """Authoritative instructional minutes: use instructional_minutes when set, else derive from start/end. All-day (long) events capped."""
    explicit = ev.get("instructional_minutes")
    if explicit is not None and isinstance(explicit, (int, float)):
        return max(0, int(explicit))
    start_ts = ev.get("start_ts")
    end_ts = ev.get("end_ts")
    start_min = _parse_ts_to_minutes(start_ts) or 0
    end_min = _parse_ts_to_minutes(end_ts) or start_min + 60
    if end_min <= start_min:
        end_min = start_min + 60
    minutes = max(0, end_min - start_min)
    if minutes >= _ALL_DAY_THRESHOLD_MINUTES:
        return _DEFAULT_PLANNED_MINUTES_PER_DAY
    return minutes


def _child_ids_from_event(ev: Dict[str, Any]) -> List[str]:
    """Return list of child ids this event contributes to (for per-child credit)."""
    child_id = ev.get("child_id")
    child_ids = ev.get("child_ids") or []
    if child_id:
        return [str(child_id)]
    if isinstance(child_ids, list) and child_ids:
        return [str(c) for c in child_ids if c]
    return []


def compute_plan_health_from_attributions(
    attributions: List[Dict[str, Any]],
    start_date: date,
    end_date: date,
    constraint_mode: str,
    target_days: Optional[int],
    target_hours: Optional[float],
    subject_targets: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Compute plan health from per-child attribution rows (from get_instructional_attributions).
    Caller must filter attributions by start_ts in [start_date, end_date].
    subject_targets: optional { subject_id: { "target_days": int, "target_hours": float } } from academic_year_plan.
    """
    subject_targets = subject_targets or {}
    all_dates: set = set()
    per_child_dates: Dict[str, set] = defaultdict(set)
    per_child_minutes: Dict[str, int] = defaultdict(int)
    per_child_subject_dates: Dict[tuple, set] = defaultdict(set)
    per_child_subject_minutes: Dict[tuple, int] = defaultdict(int)
    manual_days: set = set()
    manual_minutes = 0

    for row in attributions:
        start_ts = row.get("start_ts")
        d = _parse_ts_to_date(start_ts) if start_ts else None
        if d is None or d < start_date or d > end_date:
            continue
        minutes = row.get("instructional_minutes") or 0
        if minutes <= 0:
            continue
        child_id = row.get("child_id")
        if not child_id:
            continue
        child_id = str(child_id)
        # Attribution row's is_placeholder is set from event generated_by=='plan_year' (see instructional_attribution)
        is_plan_event = row.get("is_placeholder") is True

        all_dates.add(d)
        per_child_dates[child_id].add(d)
        per_child_minutes[child_id] += minutes
        if not is_plan_event:
            manual_days.add(d)
            manual_minutes += minutes
        subject_id = row.get("subject_id")
        if subject_id:
            sid = str(subject_id)
            key = (child_id, sid)
            per_child_subject_dates[key].add(d)
            per_child_subject_minutes[key] += minutes

    total_minutes = sum(per_child_minutes.values())
    planned_days = len(all_dates)
    planned_hours = round(total_minutes / 60.0, 2)
    manual_events_days = len(manual_days)
    manual_events_hours = round(manual_minutes / 60.0, 2)

    delta_days = None
    delta_hours = None
    percent_complete = None
    if constraint_mode == "days" and target_days is not None and target_days > 0:
        delta_days = planned_days - target_days
        percent_complete = round(100.0 * planned_days / target_days, 1)
    elif constraint_mode == "hours" and target_hours is not None and target_hours > 0:
        delta_hours = round(planned_hours - float(target_hours), 2)
        percent_complete = round(100.0 * planned_hours / float(target_hours), 1)

    per_child: Dict[str, Dict[str, Any]] = {}
    for cid, dates_set in per_child_dates.items():
        ch_days = len(dates_set)
        ch_minutes = per_child_minutes.get(cid, 0)
        ch_hours = round(ch_minutes / 60.0, 2)
        ch_delta_days = (ch_days - target_days) if (constraint_mode == "days" and target_days is not None) else None
        ch_delta_hours = round(ch_hours - float(target_hours or 0), 2) if (constraint_mode == "hours" and target_hours is not None) else None
        per_child[cid] = {
            "planned_days": ch_days,
            "planned_hours": ch_hours,
            "delta_days": ch_delta_days,
            "delta_hours": ch_delta_hours,
        }

    per_child_subject: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for (cid, sid), dates_set in per_child_subject_dates.items():
        planned_d = len(dates_set)
        planned_m = per_child_subject_minutes.get((cid, sid), 0)
        planned_h = round(planned_m / 60.0, 2)
        st = subject_targets.get(sid) or {}
        st_days = st.get("target_days") if st.get("target_days") is not None else None
        st_hours = float(st["target_hours"]) if st.get("target_hours") is not None else None
        subject_delta_days = (planned_d - st_days) if st_days is not None else None
        subject_delta_hours = round(planned_h - (st_hours or 0), 2) if st_hours is not None else None
        per_child_subject[cid][sid] = {
            "planned_days": planned_d,
            "planned_hours": planned_h,
            "subject_target_days": st_days,
            "subject_target_hours": st_hours,
            "subject_delta_days": subject_delta_days,
            "subject_delta_hours": subject_delta_hours,
        }

    return {
        "planned_days": planned_days,
        "planned_hours": planned_hours,
        "delta_days": delta_days,
        "delta_hours": delta_hours,
        "percent_complete": percent_complete,
        "constraint_mode": constraint_mode,
        "target_days": target_days,
        "target_hours": float(target_hours) if target_hours is not None else None,
        "manual_events_days": manual_events_days,
        "manual_events_hours": manual_events_hours,
        "per_child": per_child,
        "per_child_subject": dict(per_child_subject),
    }


def compute_plan_health_from_events(
    events: List[Dict[str, Any]],
    start_date: date,
    end_date: date,
    constraint_mode: str,
    target_days: Optional[int],
    target_hours: Optional[float],
    academic_year_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compute plan health from qualifying events.
    Caller must pass events already filtered by academic_year_id if desired
    (so only events that count toward this plan are included).

    Qualifying: counts_toward_plan = True, status != 'canceled', deleted_at is null.
    Event type is not used (opt-in via counts_toward_plan).
    Minutes: instructional_minutes when set, else derived from start_ts/end_ts.
    Per-child: aggregate by child_id (or each child in child_ids).
    """
    # Aggregate across all events (legacy totals)
    all_dates = set()
    intervals_by_date: Dict[date, List[tuple]] = defaultdict(list)
    # Per-child: child_id -> { dates set, total minutes }
    per_child_dates: Dict[str, set] = defaultdict(set)
    per_child_minutes: Dict[str, int] = defaultdict(int)
    # Per-child-per-subject: (child_id, subject_id) -> set of dates (for descriptive overage)
    per_child_subject_dates: Dict[tuple, set] = defaultdict(set)
    # Manual (non-placeholder) counted events for "Manual instructional events counted" UX
    manual_days = set()
    manual_minutes = 0

    for ev in events:
        status = (ev.get("status") or "").strip().lower()
        if status == "canceled":
            continue
        if ev.get("deleted_at"):
            continue
        if ev.get("counts_toward_plan") is not True:
            continue
        # Optional: only count events for this plan
        if academic_year_id is not None and ev.get("academic_year_id") != academic_year_id:
            continue

        start_ts = ev.get("start_ts")
        d = _parse_ts_to_date(start_ts)
        if d is None or d < start_date or d > end_date:
            continue

        minutes = _event_minutes(ev)
        if minutes <= 0:
            continue

        # Intervals for merged total (use start/end for overlap merge)
        start_min = _parse_ts_to_minutes(start_ts) or 0
        end_min = start_min + minutes
        all_dates.add(d)
        intervals_by_date[d].append((start_min, end_min))

        is_plan_event = ev.get("generated_by") == "plan_year"
        if not is_plan_event:
            manual_days.add(d)
            manual_minutes += minutes

        # Per-child credit (each child gets full minutes for this event)
        child_ids = _child_ids_from_event(ev)
        subject_id = ev.get("subject_id")
        if subject_id:
            subject_id = str(subject_id)
        for cid in child_ids:
            per_child_dates[cid].add(d)
            per_child_minutes[cid] += minutes
            # Per-child-per-subject for descriptive overage ("Max is 4 over in Cats")
            if subject_id:
                key = (cid, subject_id)
                if key not in per_child_subject_dates:
                    per_child_subject_dates[key] = set()
                per_child_subject_dates[key].add(d)

    # Build per_child_subject: child_id -> subject_id -> { planned_days }
    per_child_subject: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for (cid, sid), dates_set in per_child_subject_dates.items():
        per_child_subject[cid][sid] = {"planned_days": len(dates_set)}

    total_minutes = 0
    for d in all_dates:
        merged = _merge_intervals(intervals_by_date.get(d, []))
        for s, e in merged:
            total_minutes += e - s

    planned_days = len(all_dates)
    planned_hours = round(total_minutes / 60.0, 2)
    manual_events_days = len(manual_days)
    manual_events_hours = round(manual_minutes / 60.0, 2)

    delta_days = None
    delta_hours = None
    percent_complete = None

    if constraint_mode == "days" and target_days is not None and target_days > 0:
        delta_days = planned_days - target_days
        percent_complete = round(100.0 * planned_days / target_days, 1)
    elif constraint_mode == "hours" and target_hours is not None and target_hours > 0:
        delta_hours = round(planned_hours - float(target_hours), 2)
        percent_complete = round(100.0 * planned_hours / float(target_hours), 1)

    per_child: Dict[str, Dict[str, Any]] = {}
    for cid, dates_set in per_child_dates.items():
        ch_days = len(dates_set)
        ch_minutes = per_child_minutes.get(cid, 0)
        ch_hours = round(ch_minutes / 60.0, 2)
        ch_delta_days = (ch_days - target_days) if (constraint_mode == "days" and target_days is not None) else None
        ch_delta_hours = round(ch_hours - float(target_hours or 0), 2) if (constraint_mode == "hours" and target_hours is not None) else None
        per_child[cid] = {
            "planned_days": ch_days,
            "planned_hours": ch_hours,
            "delta_days": ch_delta_days,
            "delta_hours": ch_delta_hours,
        }

    return {
        "planned_days": planned_days,
        "planned_hours": planned_hours,
        "delta_days": delta_days,
        "delta_hours": delta_hours,
        "percent_complete": percent_complete,
        "constraint_mode": constraint_mode,
        "target_days": target_days,
        "target_hours": float(target_hours) if target_hours is not None else None,
        "manual_events_days": manual_events_days,
        "manual_events_hours": manual_events_hours,
        "per_child": per_child,
        "per_child_subject": dict(per_child_subject),
    }

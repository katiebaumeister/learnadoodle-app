"""
Blocks-based Schedule Potential Calculator

Computes projected days and hours from blocks + exclusions.
Never queries events — schedule potential uses only blocks, start/end, exclusions.
Per DESIGN_PLAN_YEAR.md.
"""

from typing import List, Set, Tuple, Dict, Any, Optional
from datetime import date, time, timedelta


def _python_weekday_to_ours(d: date) -> int:
    """Convert Python weekday (Mon=0, Sun=6) to our convention (Sun=0, Sat=6)."""
    return (d.weekday() + 1) % 7


def _is_excluded(check_date: date, exclusion_ranges: List[Tuple[date, date]]) -> bool:
    """True if date falls within any exclusion range (start <= date <= end)."""
    for start_d, end_d in exclusion_ranges:
        if start_d <= check_date <= end_d:
            return True
    return False


def get_block_occurrence_dates(
    block: Dict[str, Any],
    start_date: date,
    end_date: date,
    exclusion_ranges: List[Tuple[date, date]],
) -> List[date]:
    """
    Return dates this block produces in [start_date, end_date], excluding exclusions.

    Block schema: { weekdays: [1,3,5], start_time, end_time, all_day }
    Weekdays: 0=Sun, 1=Mon, ..., 6=Sat
    """
    weekdays = block.get("weekdays") or []
    if not weekdays:
        return []

    result: List[date] = []
    current = start_date
    while current <= end_date:
        our_day = _python_weekday_to_ours(current)
        if our_day in weekdays and not _is_excluded(current, exclusion_ranges):
            result.append(current)
        current += timedelta(days=1)
    return result


def _parse_time(s: str) -> time:
    """Parse '09:00' or '9:00' to time. Returns (0,0) for invalid."""
    if not s or not isinstance(s, str):
        return time(0, 0)
    parts = s.strip().split(":")
    if len(parts) >= 2:
        try:
            h = int(parts[0])
            m = int(parts[1].split()[0]) if parts[1] else 0
            return time(max(0, min(23, h)), max(0, min(59, m)))
        except (ValueError, IndexError):
            pass
    return time(0, 0)


def _block_minutes_per_day(block: Dict[str, Any]) -> float:
    """Minutes per occurrence for a block. Uses start_time/end_time or all_day default."""
    if block.get("all_day"):
        return 6 * 60  # 6 hours default for "all day"
    start_t = _parse_time(block.get("start_time") or "09:00")
    end_t = _parse_time(block.get("end_time") or "10:00")
    start_min = start_t.hour * 60 + start_t.minute
    end_min = end_t.hour * 60 + end_t.minute
    if end_min <= start_min:
        end_min += 24 * 60
    return max(0, end_min - start_min)


def _merge_intervals(intervals: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """
    Merge overlapping intervals. Each interval is (start_min, end_min).
    Returns non-overlapping merged intervals.
    """
    if not intervals:
        return []
    sorted_i = sorted(intervals, key=lambda x: x[0])
    merged: List[Tuple[int, int]] = []
    for s, e in sorted_i:
        if not merged or s > merged[-1][1]:
            merged.append((s, e))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
    return merged


def _block_child_ids(block: Dict[str, Any], plan_children_ids: Optional[List[str]] = None) -> List[str]:
    """Children this block applies to: block.child_ids if non-empty, else plan_children_ids (whole-family)."""
    child_ids = block.get("child_ids") or []
    if isinstance(child_ids, list) and child_ids:
        return [str(c) for c in child_ids if c]
    if plan_children_ids:
        return [str(c) for c in plan_children_ids if c]
    return []


def compute_schedule_potential(
    blocks: List[Dict[str, Any]],
    start_date: date,
    end_date: date,
    exclusion_ranges: List[Tuple[date, date]],
    target_days: Optional[int] = None,
    plan_children_ids: Optional[List[str]] = None,
    subject_targets: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Compute projected days and hours from blocks (schedule potential).
    Never queries events. When blocks have child_ids, per-child and per_child_subject are child-aware.

    plan_children_ids: when a block has no child_ids (whole-family), attribute to these children.
    subject_targets: optional { subject_id: { "target_days": int, "target_hours": float } } for per-subject suggested end date.

    Returns:
        {
            projected_days: int,
            projected_hours: float,
            occurrence_dates: Set[date],
            per_subject: Dict[subject_id, { projected_days, occurrence_dates_sorted, suggested_end_date }],
            per_child: Dict[child_id, { projected_days, suggested_end_date }],
            per_child_subject: Dict[child_id, Dict[subject_id, { projected_days, occurrence_dates_sorted, suggested_end_date_for_subject_target? }]]
        }
    """
    subject_targets = subject_targets or {}
    all_dates: Set[date] = set()
    # Per-date intervals: date -> [(start_min, end_min), ...]
    intervals_by_date: Dict[date, List[Tuple[int, int]]] = {}
    # Per-subject: subject_id -> sorted list of occurrence dates (for suggested end date)
    per_subject_dates: Dict[str, List[date]] = {}
    # Per-child: child_id -> set of dates (only blocks that include this child)
    per_child_all_dates: Dict[str, Set[date]] = {}
    # Per-child-per-subject: (child_id, subject_id) -> list of dates
    per_child_subject_dates: Dict[Tuple[str, str], List[date]] = {}

    for block in blocks:
        subject_id = block.get("subject_id")
        subj_key = str(subject_id) if subject_id else "__none__"
        block_child_ids = _block_child_ids(block, plan_children_ids)
        for d in get_block_occurrence_dates(block, start_date, end_date, exclusion_ranges):
            all_dates.add(d)
            if subj_key not in per_subject_dates:
                per_subject_dates[subj_key] = []
            per_subject_dates[subj_key].append(d)
            for cid in block_child_ids:
                if cid not in per_child_all_dates:
                    per_child_all_dates[cid] = set()
                per_child_all_dates[cid].add(d)
                key = (cid, subj_key)
                if key not in per_child_subject_dates:
                    per_child_subject_dates[key] = []
                per_child_subject_dates[key].append(d)
            start_t = _parse_time(block.get("start_time") or "09:00")
            end_t = _parse_time(block.get("end_time") or "10:00")
            if block.get("all_day"):
                start_min = 9 * 60
                end_min = 15 * 60
            else:
                start_min = start_t.hour * 60 + start_t.minute
                end_min = end_t.hour * 60 + end_t.minute
                if end_min <= start_min:
                    end_min += 24 * 60
            if d not in intervals_by_date:
                intervals_by_date[d] = []
            intervals_by_date[d].append((start_min, end_min))

    total_minutes = 0
    for d in all_dates:
        merged = _merge_intervals(intervals_by_date.get(d, []))
        for s, e in merged:
            total_minutes += e - s

    projected_days = len(all_dates)
    projected_hours = round(total_minutes / 60.0, 2)

    # Per-subject: projected_days, sorted occurrence_dates, suggested_end_date (target_days-th occurrence)
    per_subject: Dict[str, Dict[str, Any]] = {}
    for sid, dates_list in per_subject_dates.items():
        sorted_dates = sorted(set(dates_list))
        subj_projected = len(sorted_dates)
        suggested_end_date = None
        if target_days is not None and target_days > 0 and len(sorted_dates) >= target_days:
            suggested_end_date = sorted_dates[target_days - 1].isoformat()
        per_subject[sid] = {
            "projected_days": subj_projected,
            "occurrence_dates_sorted": [d.isoformat() for d in sorted_dates],
            "suggested_end_date": suggested_end_date,
        }

    # Per-child: projected_days, suggested_end_date = date of target_days-th occurrence for that child (child-aware)
    per_child: Dict[str, Dict[str, Any]] = {}
    for cid, dates_set in per_child_all_dates.items():
        sorted_dates = sorted(dates_set)
        ch_projected = len(sorted_dates)
        suggested_end_date = None
        if target_days is not None and target_days > 0 and len(sorted_dates) >= target_days:
            suggested_end_date = sorted_dates[target_days - 1].isoformat()
        per_child[cid] = {
            "projected_days": ch_projected,
            "suggested_end_date": suggested_end_date,
        }

    # Per-child-subject: projected_days, occurrence_dates_sorted, suggested_end_date_for_subject_target when subject target exists
    per_child_subject: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for (cid, sid), dates_list in per_child_subject_dates.items():
        if cid not in per_child_subject:
            per_child_subject[cid] = {}
        sorted_dates = sorted(set(dates_list))
        st = subject_targets.get(sid) or {}
        subject_target_days = st.get("target_days") if st.get("target_days") is not None else None
        suggested_end_date_for_subject_target = None
        if subject_target_days is not None and subject_target_days > 0 and len(sorted_dates) >= subject_target_days:
            suggested_end_date_for_subject_target = sorted_dates[subject_target_days - 1].isoformat()
        per_child_subject[cid][sid] = {
            "projected_days": len(sorted_dates),
            "occurrence_dates_sorted": [d.isoformat() for d in sorted_dates],
            "suggested_end_date_for_subject_target": suggested_end_date_for_subject_target,
        }

    return {
        "projected_days": projected_days,
        "projected_hours": projected_hours,
        "occurrence_dates": all_dates,
        "per_subject": per_subject,
        "per_child": per_child,
        "per_child_subject": per_child_subject,
    }


def exclusion_ranges_from_breaks_and_holidays(
    custom_breaks: List[Dict[str, str]],
    holiday_dates: List[str],
) -> List[Tuple[date, date]]:
    """
    Build exclusion ranges from custom_breaks (start/end) and holiday_dates (single-day).
    """
    ranges: List[Tuple[date, date]] = []
    for b in custom_breaks or []:
        try:
            start_d = date.fromisoformat(b.get("start", "")[:10])
            end_d = date.fromisoformat(b.get("end", "")[:10])
            ranges.append((start_d, end_d))
        except (ValueError, TypeError):
            pass
    for h in holiday_dates or []:
        try:
            d = date.fromisoformat(str(h)[:10])
            ranges.append((d, d))
        except (ValueError, TypeError):
            pass
    return ranges

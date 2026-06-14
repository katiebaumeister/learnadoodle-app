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


def _block_effective_date_range(
    block: Dict[str, Any],
    plan_start: date,
    plan_end: date,
) -> Tuple[date, date]:
    """Clip plan window to optional per-block schedule_start_date / schedule_end_date.

    When a subject block defines its own window that does not overlap the plan year
    (e.g. Spring term subject scheduled in June while the plan ends in May), use the
    block window alone so occurrences are still generated.
    """
    raw_start = block.get("schedule_start_date")
    raw_end = block.get("schedule_end_date")
    block_start: Optional[date] = None
    block_end: Optional[date] = None
    if raw_start:
        try:
            block_start = date.fromisoformat(str(raw_start)[:10])
        except ValueError:
            pass
    if raw_end:
        try:
            block_end = date.fromisoformat(str(raw_end)[:10])
        except ValueError:
            pass

    if block_start and block_end:
        if plan_end < block_start or plan_start > block_end:
            return block_start, block_end
        return max(plan_start, block_start), min(plan_end, block_end)

    effective_start = plan_start
    effective_end = plan_end
    if block_start:
        effective_start = max(effective_start, block_start)
    if block_end:
        effective_end = min(effective_end, block_end)
    return effective_start, effective_end


def block_regen_window(
    plan_start: date,
    plan_end: date,
    block: Dict[str, Any],
) -> Tuple[date, date]:
    """Widen per-block regeneration bounds to include optional schedule_start/end dates."""
    regen_start = plan_start
    regen_end = plan_end
    raw_start = block.get("schedule_start_date")
    raw_end = block.get("schedule_end_date")
    if raw_start:
        try:
            block_start = date.fromisoformat(str(raw_start)[:10])
            if block_start < regen_start:
                regen_start = block_start
        except ValueError:
            pass
    if raw_end:
        try:
            block_end = date.fromisoformat(str(raw_end)[:10])
            if block_end > regen_end:
                regen_end = block_end
        except ValueError:
            pass
    return regen_start, regen_end


def get_block_occurrence_dates(
    block: Dict[str, Any],
    start_date: date,
    end_date: date,
    exclusion_ranges: List[Tuple[date, date]],
) -> List[date]:
    """
    Return dates this block produces in [start_date, end_date], excluding exclusions.

    Block schema: { weekdays: [1,3,5], start_time, end_time, all_day, schedule_start_date?, schedule_end_date? }
    Weekdays: 0=Sun, 1=Mon, ..., 6=Sat
    """
    effective_start, effective_end = _block_effective_date_range(block, start_date, end_date)
    if effective_start > effective_end:
        return []

    raw = block.get("weekdays") or []
    weekdays = []
    for w in raw:
        if w is None:
            continue
        try:
            weekdays.append(int(w))
        except (TypeError, ValueError):
            continue
    if not weekdays:
        return []

    result: List[date] = []
    current = effective_start
    while current <= effective_end:
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
    target_hours: Optional[float] = None,
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

    # Top-level suggested_end_date: exact date that yields target_days or target_hours (for 0 over/under)
    suggested_end_date: Optional[str] = None
    if target_days is not None and target_days > 0:
        if len(all_dates) >= target_days:
            sorted_all = sorted(all_dates)
            suggested_end_date = sorted_all[target_days - 1].isoformat()
        else:
            # Under target: extend range and find when we hit target_days
            extend_days = min(365, max(14, (target_days - len(all_dates)) * 4))
            extended_end = end_date + timedelta(days=extend_days)
            extended_dates: Set[date] = set()
            for block in blocks:
                block_child_ids = _block_child_ids(block, plan_children_ids)
                for d in get_block_occurrence_dates(block, start_date, extended_end, exclusion_ranges):
                    extended_dates.add(d)
            if len(extended_dates) >= target_days:
                sorted_extended = sorted(extended_dates)
                suggested_end_date = sorted_extended[target_days - 1].isoformat()
    elif target_hours is not None and target_hours > 0 and projected_hours < target_hours:
        # Under target hours: extend range week by week until projected hours >= target_hours (same avg teaching)
        target_minutes = target_hours * 60.0
        extended_end = end_date
        for _ in range(52):  # max 52 weeks
            extended_end = extended_end + timedelta(days=7)
            ext_dates: Set[date] = set()
            ext_intervals: Dict[date, List[Tuple[int, int]]] = {}
            for block in blocks:
                for d in get_block_occurrence_dates(block, start_date, extended_end, exclusion_ranges):
                    ext_dates.add(d)
                    start_t = _parse_time(block.get("start_time") or "09:00")
                    end_t = _parse_time(block.get("end_time") or "10:00")
                    if block.get("all_day"):
                        start_min, end_min = 9 * 60, 15 * 60
                    else:
                        start_min = start_t.hour * 60 + start_t.minute
                        end_min = end_t.hour * 60 + end_t.minute
                        if end_min <= start_min:
                            end_min += 24 * 60
                    if d not in ext_intervals:
                        ext_intervals[d] = []
                    ext_intervals[d].append((start_min, end_min))
            ext_minutes = 0
            for d in ext_dates:
                merged = _merge_intervals(ext_intervals.get(d, []))
                for s, e in merged:
                    ext_minutes += e - s
            if ext_minutes >= target_minutes:
                suggested_end_date = extended_end.isoformat()
                break

    # Per-subject: projected_days, sorted occurrence_dates, suggested_end_date (target_days-th occurrence)
    per_subject: Dict[str, Dict[str, Any]] = {}
    for sid, dates_list in per_subject_dates.items():
        sorted_dates = sorted(set(dates_list))
        subj_projected = len(sorted_dates)
        subj_suggested = None
        if target_days is not None and target_days > 0 and len(sorted_dates) >= target_days:
            subj_suggested = sorted_dates[target_days - 1].isoformat()
        per_subject[sid] = {
            "projected_days": subj_projected,
            "occurrence_dates_sorted": [d.isoformat() for d in sorted_dates],
            "suggested_end_date": subj_suggested,
        }

    # Per-child: projected_days, suggested_end_date = date of target_days-th occurrence for that child (child-aware)
    per_child: Dict[str, Dict[str, Any]] = {}
    for cid, dates_set in per_child_all_dates.items():
        sorted_dates = sorted(dates_set)
        ch_projected = len(sorted_dates)
        ch_suggested = None
        if target_days is not None and target_days > 0 and len(sorted_dates) >= target_days:
            ch_suggested = sorted_dates[target_days - 1].isoformat()
        per_child[cid] = {
            "projected_days": ch_projected,
            "suggested_end_date": ch_suggested,
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

    # Phase 4: cadence suggestion when target_days set (for "suggest best weekly cadence" UX)
    cadence_suggestion: Optional[Dict[str, Any]] = None
    if target_days is not None and target_days > 0:
        cadence_suggestion = suggest_cadence(start_date, end_date, target_days, exclusion_ranges)

    return {
        "projected_days": projected_days,
        "projected_hours": projected_hours,
        "occurrence_dates": all_dates,
        "suggested_end_date": suggested_end_date,
        "per_subject": per_subject,
        "per_child": per_child,
        "per_child_subject": per_child_subject,
        "cadence_suggestion": cadence_suggestion,
    }


def suggest_cadence(
    start_date: date,
    end_date: date,
    target_days: int,
    exclusion_ranges: List[Tuple[date, date]],
) -> Dict[str, Any]:
    """
    Phase 4: Suggest minimum weekdays per week to reach target_days in the date range.
    Counts Mon–Fri (weekdays 1–5) in range minus exclusions; returns min_weekdays_per_week
    and a short message for the UI.
    """
    if target_days <= 0 or start_date > end_date:
        return {}
    total_days = (end_date - start_date).days + 1
    num_weeks = max(0.1, total_days / 7.0)
    # Count eligible weekdays (Mon=1 .. Fri=5) in range
    eligible = 0
    current = start_date
    while current <= end_date:
        our_day = _python_weekday_to_ours(current)
        if 1 <= our_day <= 5 and not _is_excluded(current, exclusion_ranges):
            eligible += 1
        current += timedelta(days=1)
    min_weekdays_per_week = min(5, max(1, (target_days + int(num_weeks) - 1) // max(1, int(num_weeks)))) if num_weeks >= 1 else 5
    if eligible >= target_days:
        return {
            "min_weekdays_per_week": min_weekdays_per_week,
            "eligible_days_in_range": eligible,
            "message": f"Use at least {min_weekdays_per_week} weekdays per week to reach {target_days} days.",
        }
    return {
        "min_weekdays_per_week": min_weekdays_per_week,
        "eligible_days_in_range": eligible,
        "message": f"To reach {target_days} days, use at least {min_weekdays_per_week} weekdays per week, or extend your end date (only {eligible} eligible days in current range).",
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

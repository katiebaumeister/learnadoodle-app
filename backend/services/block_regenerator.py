"""
Block-aware regeneration for Plan My Year Apply.
Creates Lesson events linked to the plan by academic_year_id, generation_batch_id, source_block_id,
and generated_by='plan_year'. They are real events (event_type=Lesson); plan linkage and
"count as instructional time" (counts_toward_plan) are how we attach/detach from the plan.

Only touches events from this plan for this block that have no curriculum_lesson_id (user-owned
filled slots are never overwritten).
"""

from datetime import date, datetime, timedelta, timezone
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from services.blocks_calculator import get_block_occurrence_dates

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore


def _parse_time_to_iso(date_obj: date, time_str: str, tz_name: Optional[str] = None) -> str:
    """
    Build ISO timestamp in UTC: date + time_str (e.g. '09:00') interpreted as local time in tz_name.
    If tz_name is None or 'UTC', time is treated as UTC (legacy). Otherwise the time is interpreted
    in the given timezone (e.g. 'America/New_York') and converted to UTC so calendar displays correctly.
    """
    parts = (time_str or "09:00").strip().split(":")
    h = int(parts[0]) if len(parts) >= 1 and parts[0].strip() else 9
    m = int(parts[1].split()[0]) if len(parts) >= 2 and parts[1] else 0
    h = max(0, min(23, h))
    m = max(0, min(59, m))
    if not tz_name or tz_name.upper() == "UTC":
        return f"{date_obj.isoformat()}T{h:02d}:{m:02d}:00+00:00"
    try:
        local_tz = ZoneInfo(tz_name)
        local_dt = datetime(date_obj.year, date_obj.month, date_obj.day, h, m, 0, tzinfo=local_tz)
        utc_dt = local_dt.astimezone(timezone.utc)
        return utc_dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    except Exception:
        return f"{date_obj.isoformat()}T{h:02d}:{m:02d}:00+00:00"


def _event_date_from_start_ts(ev: Dict[str, Any]) -> Optional[date]:
    """Extract date from event start_ts."""
    start_ts = ev.get("start_ts") or ev.get("start")
    if not start_ts:
        return None
    if isinstance(start_ts, str) and "T" in start_ts:
        return date.fromisoformat(start_ts.split("T")[0])
    return None


def _normalized_child_id_set(raw: Any) -> Set[str]:
    if not isinstance(raw, list):
        return set()
    return {str(c).strip() for c in raw if c is not None and str(c).strip()}


def _whole_family_child_assignees_match(row_child_ids: Any, expected: Set[str]) -> bool:
    """Whole-family row: child_id null; child_ids overlaps expected assignees (or both empty)."""
    row_set = _normalized_child_id_set(row_child_ids)
    if not expected and not row_set:
        return True
    if expected and row_set == expected:
        return True
    if expected and row_set and (row_set & expected):
        return True
    return False


def _find_existing_whole_family_plan_slot_same_day(
    supabase,
    family_id: str,
    academic_year_id: str,
    subject_id: Any,
    day: date,
    expected_child_ids: List[Any],
) -> Optional[str]:
    """
    If apply_to_calendar runs with a new block_id, existing_by_key misses older plan_year rows
    (different source_block_id). Find a whole-family instructional slot on the same calendar day
    so we update it instead of inserting a duplicate History row.
    """
    if subject_id is None:
        return None
    want = _normalized_child_id_set(expected_child_ids)
    range_start_ts = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(day, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    res = (
        supabase.table("events")
        .select("id, child_id, child_ids, curriculum_lesson_id")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("subject_id", subject_id)
        .eq("generated_by", "plan_year")
        .is_("deleted_at", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .execute()
    )
    matches: List[Dict[str, Any]] = []
    for e in res.data or []:
        if e.get("child_id") is not None:
            continue
        if not _whole_family_child_assignees_match(e.get("child_ids"), want):
            continue
        matches.append(e)
    if not matches:
        return None

    def _has_curriculum_slot(ev: Dict[str, Any]) -> bool:
        cl = ev.get("curriculum_lesson_id")
        return cl is not None and str(cl).strip() != ""

    # Prefer an empty slot; if the user already pasted curriculum, adopt that row (update times/block) instead of inserting a duplicate.
    matches.sort(key=lambda r: (1 if _has_curriculum_slot(r) else 0, str(r.get("id") or "")))
    return str(matches[0]["id"])


def _dedupe_empty_whole_family_slots_for_day(
    supabase,
    family_id: str,
    academic_year_id: str,
    subject_id: Any,
    day: date,
    expected_child_ids: List[Any],
) -> int:
    """Soft-delete extra empty whole-family plan_year rows on the same day (same subject, assignees)."""
    if subject_id is None:
        return 0
    want = _normalized_child_id_set(expected_child_ids)
    range_start_ts = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(day, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    res = (
        supabase.table("events")
        .select("id, child_id, child_ids, curriculum_lesson_id")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("subject_id", subject_id)
        .eq("generated_by", "plan_year")
        .is_("deleted_at", "null")
        .is_("curriculum_lesson_id", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .execute()
    )
    empties: List[Dict[str, Any]] = []
    for e in res.data or []:
        if e.get("child_id") is not None:
            continue
        if not _whole_family_child_assignees_match(e.get("child_ids"), want):
            continue
        empties.append(e)
    if len(empties) <= 1:
        return 0
    empties.sort(key=lambda r: str(r.get("id") or ""))
    keep_id = str(empties[0]["id"])
    remove_ids = [str(x["id"]) for x in empties[1:] if str(x["id"]) != keep_id]
    if not remove_ids:
        return 0
    try:
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("events").update({"deleted_at": now}).in_("id", remove_ids).eq("family_id", family_id).execute()
    except Exception:
        return 0
    return len(remove_ids)


def _find_existing_single_child_plan_slot_same_day(
    supabase,
    family_id: str,
    academic_year_id: str,
    subject_id: Any,
    day: date,
    child_id: Any,
) -> Optional[str]:
    """
    Single-child equivalent of the whole-family same-day fallback.
    When block_id changes during edit, adopt the existing empty plan_year row for
    this child/subject/day instead of inserting a duplicate.
    """
    if subject_id is None or child_id is None:
        return None
    range_start_ts = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(day, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    want = str(child_id).strip()
    res = (
        supabase.table("events")
        .select("id, child_id, child_ids, curriculum_lesson_id")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("subject_id", subject_id)
        .eq("generated_by", "plan_year")
        .is_("deleted_at", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .execute()
    )
    matches: List[Dict[str, Any]] = []
    for e in res.data or []:
        row_child_id = e.get("child_id")
        if row_child_id is not None and str(row_child_id).strip() == want:
            matches.append(e)
            continue
        row_child_ids = _normalized_child_id_set(e.get("child_ids"))
        if want and want in row_child_ids:
            matches.append(e)
    if not matches:
        return None

    def _has_curriculum_slot(ev: Dict[str, Any]) -> bool:
        cl = ev.get("curriculum_lesson_id")
        return cl is not None and str(cl).strip() != ""

    matches.sort(key=lambda r: (1 if _has_curriculum_slot(r) else 0, str(r.get("id") or "")))
    return str(matches[0]["id"])


def _dedupe_empty_single_child_slots_for_day(
    supabase,
    family_id: str,
    academic_year_id: str,
    subject_id: Any,
    day: date,
    child_id: Any,
) -> int:
    """Soft-delete extra empty single-child plan_year rows on the same day."""
    if subject_id is None or child_id is None:
        return 0
    range_start_ts = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(day, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    want = str(child_id).strip()
    res = (
        supabase.table("events")
        .select("id, child_id, child_ids")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("subject_id", subject_id)
        .eq("generated_by", "plan_year")
        .is_("deleted_at", "null")
        .is_("curriculum_lesson_id", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .execute()
    )
    matches: List[Dict[str, Any]] = []
    for e in res.data or []:
        row_child_id = e.get("child_id")
        if row_child_id is not None and str(row_child_id).strip() == want:
            matches.append(e)
            continue
        row_child_ids = _normalized_child_id_set(e.get("child_ids"))
        if want and want in row_child_ids:
            matches.append(e)
    if len(matches) <= 1:
        return 0
    matches.sort(key=lambda r: str(r.get("id") or ""))
    keep_id = str(matches[0]["id"])
    remove_ids = [str(x["id"]) for x in matches[1:] if str(x["id"]) != keep_id]
    if not remove_ids:
        return 0
    try:
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("events").update({"deleted_at": now}).in_("id", remove_ids).eq("family_id", family_id).execute()
    except Exception:
        return 0
    return len(remove_ids)


def _format_db_exc(exc: Exception) -> str:
    """Compact message for PostgREST / DB errors in logs."""
    parts = [type(exc).__name__, str(exc)]
    details = getattr(exc, "details", None)
    message = getattr(exc, "message", None)
    code = getattr(exc, "code", None)
    if message and message not in parts:
        parts.append(f"message={message!r}")
    if code:
        parts.append(f"code={code!r}")
    if details:
        parts.append(f"details={details!r}")
    return " | ".join(parts)


def _looks_like_overlap_constraint_error(msg: str) -> bool:
    m = (msg or "").lower()
    return (
        "exclusion" in m
        or "overlap" in m
        or "23p01" in m
        or "conflicting key" in m
        or "gist" in m
    )


_MISSING_EVENT_REVISION_USER_RE = re.compile(
    r'Key \(user_id\)=\(([0-9a-fA-F-]{36})\) is not present in table "users"',
    re.IGNORECASE,
)


def _extract_missing_event_revision_user_id(msg: str) -> Optional[str]:
    m = _MISSING_EVENT_REVISION_USER_RE.search(msg or "")
    if not m:
        return None
    user_id = (m.group(1) or "").strip()
    return user_id or None


def _ensure_event_revision_user_fk_target(supabase, user_id: str) -> bool:
    """
    Self-heal for event_revisions_user_id_fkey:
    if the referenced users.id is missing, create a minimal row so event writes can proceed.
    """
    if not user_id:
        return False
    uid = str(user_id).strip()
    if not uid:
        return False

    # Already present.
    try:
        existing = supabase.table("users").select("id").eq("id", uid).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            return True
    except Exception:
        # Continue to insert attempt.
        pass

    # Try progressively richer payloads in case the table has required columns.
    payloads = [
        {"id": uid},
        {"id": uid, "email": f"service+{uid[:8]}@learnadoodle.local"},
        {"id": uid, "email": f"service+{uid[:8]}@learnadoodle.local", "name": "System"},
    ]
    for payload in payloads:
        try:
            supabase.table("users").insert(payload).execute()
            return True
        except Exception:
            continue
    return False


def _safe_overlap_update(supabase, family_id: str, row: Dict[str, Any], *, ignore_conflicts: bool = False) -> bool:
    payload = {
        "start_ts": row["start_ts"],
        "end_ts": row["end_ts"],
        "subject_id": row["subject_id"],
        "title": row["title"],
        "generation_batch_id": row["generation_batch_id"],
        "is_flexible": row.get("is_flexible", True),
        "status": "scheduled",
    }
    if row.get("source_block_id") is not None:
        payload["source_block_id"] = row["source_block_id"]
    if "child_ids" in row and row["child_ids"] is not None:
        payload["child_ids"] = row["child_ids"]
    if row.get("deleted_at"):
        payload["deleted_at"] = None
    if ignore_conflicts:
        payload["child_id"] = None
        payload["is_flexible"] = True

    try:
        supabase.table("events").update(payload).eq("id", row["id"]).eq("family_id", family_id).execute()
        return True
    except Exception as e1:
        err1 = _format_db_exc(e1)
        missing_uid = _extract_missing_event_revision_user_id(err1)
        if missing_uid and _ensure_event_revision_user_fk_target(supabase, missing_uid):
            try:
                supabase.table("events").update(payload).eq("id", row["id"]).eq("family_id", family_id).execute()
                return True
            except Exception:
                pass
        fallback_payload = dict(payload)
        if "child_ids" in row and row["child_ids"] is not None:
            fallback_payload["child_ids"] = row["child_ids"]
        fallback_payload["child_id"] = None
        fallback_payload["is_flexible"] = True
        try:
            supabase.table("events").update(fallback_payload).eq("id", row["id"]).eq("family_id", family_id).execute()
            return True
        except Exception as e2:
            err2 = _format_db_exc(e2)
            missing_uid2 = _extract_missing_event_revision_user_id(err2)
            if missing_uid2 and _ensure_event_revision_user_fk_target(supabase, missing_uid2):
                try:
                    supabase.table("events").update(fallback_payload).eq("id", row["id"]).eq("family_id", family_id).execute()
                    return True
                except Exception:
                    pass
            return False


def _build_conflict_ignoring_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Bypass overlap checks while keeping assignees and times intact."""
    safe = dict(row)
    child_ids = safe.get("child_ids")
    if not child_ids and safe.get("child_id") is not None:
        safe["child_ids"] = [safe.get("child_id")]
    safe["is_flexible"] = True
    return safe


def _safe_overlap_insert(supabase, row: Dict[str, Any], *, ignore_conflicts: bool = False) -> bool:
    if ignore_conflicts:
        try:
            supabase.table("events").insert(_build_conflict_ignoring_row(row)).execute()
            return True
        except Exception as e0:
            err0 = _format_db_exc(e0)
            if _looks_like_overlap_constraint_error(err0):
                pass
            else:
                missing_uid0 = _extract_missing_event_revision_user_id(err0)
                if missing_uid0 and _ensure_event_revision_user_fk_target(supabase, missing_uid0):
                    try:
                        supabase.table("events").insert(_build_conflict_ignoring_row(row)).execute()
                        return True
                    except Exception:
                        pass
    def _parse_iso(ts: Any) -> Optional[datetime]:
        if not ts:
            return None
        s = str(ts).strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None

    def _event_has_child(ev: Dict[str, Any], child: Optional[str]) -> bool:
        if not child:
            return False
        row_child = ev.get("child_id")
        if row_child is not None and str(row_child).strip() == child:
            return True
        row_children = _normalized_child_id_set(ev.get("child_ids"))
        return child in row_children

    def _purge_soft_deleted_overlaps_for_row() -> int:
        family_id = row.get("family_id")
        if not family_id:
            return 0
        row_start = _parse_iso(row.get("start_ts"))
        row_end = _parse_iso(row.get("end_ts"))
        if row_start is None or row_end is None:
            return 0
        child_for_match = str(row.get("child_id")).strip() if row.get("child_id") else None
        if not child_for_match:
            child_ids = row.get("child_ids") or []
            child_for_match = str(child_ids[0]).strip() if isinstance(child_ids, list) and len(child_ids) > 0 else None
        # If this is a family-level row, no child overlap cleanup is needed.
        if not child_for_match:
            return 0
        # Narrow window around the candidate row; then filter overlap in Python.
        window_start = (row_start - timedelta(hours=2)).isoformat()
        window_end = (row_end + timedelta(hours=2)).isoformat()
        try:
            res = (
                supabase.table("events")
                .select("id, start_ts, end_ts, child_id, child_ids, deleted_at")
                .eq("family_id", family_id)
                .not_.is_("deleted_at", "null")
                .gte("start_ts", window_start)
                .lte("start_ts", window_end)
                .execute()
            )
        except Exception:
            return 0
        candidates = res.data or []
        purge_ids: List[str] = []
        for ev in candidates:
            if not _event_has_child(ev, child_for_match):
                continue
            ev_start = _parse_iso(ev.get("start_ts"))
            ev_end = _parse_iso(ev.get("end_ts")) or ev_start
            if ev_start is None or ev_end is None:
                continue
            if row_start < ev_end and ev_start < row_end:
                eid = str(ev.get("id") or "").strip()
                if eid:
                    purge_ids.append(eid)
        if not purge_ids:
            return 0
        try:
            supabase.table("events").delete().in_("id", purge_ids).eq("family_id", family_id).execute()
            return len(purge_ids)
        except Exception:
            return 0

    try:
        supabase.table("events").insert(row).execute()
        return True
    except Exception as e1:
        err1 = _format_db_exc(e1)
        if _looks_like_overlap_constraint_error(err1):
            purged = _purge_soft_deleted_overlaps_for_row()
            if purged > 0:
                try:
                    supabase.table("events").insert(row).execute()
                    print(
                        f"[BACKEND] block_regen overlap cleanup removed {purged} soft-deleted conflicting event(s); retry insert succeeded",
                        flush=True,
                    )
                    return True
                except Exception as e1_retry_after_purge:
                    err1 = _format_db_exc(e1_retry_after_purge)
        missing_uid = _extract_missing_event_revision_user_id(err1)
        if missing_uid and _ensure_event_revision_user_fk_target(supabase, missing_uid):
            try:
                supabase.table("events").insert(row).execute()
                return True
            except Exception as e1_retry:
                err1 = _format_db_exc(e1_retry)
        fallback_row = dict(row)
        child_id = fallback_row.get("child_id")
        child_ids = fallback_row.get("child_ids")
        if (not child_ids) and child_id is not None:
            fallback_row["child_ids"] = [child_id]
        fallback_row["child_id"] = None
        fallback_row["is_flexible"] = True
        try:
            supabase.table("events").insert(fallback_row).execute()
            return True
        except Exception as e2:
            err2 = _format_db_exc(e2)
            missing_uid2 = _extract_missing_event_revision_user_id(err2)
            if missing_uid2 and _ensure_event_revision_user_fk_target(supabase, missing_uid2):
                try:
                    supabase.table("events").insert(fallback_row).execute()
                    return True
                except Exception as e2_retry:
                    err2 = _format_db_exc(e2_retry)
            # Plan-year placeholders are excluded from events_no_overlap_exclude (see migration
            # 20260221_events_no_overlap_exclude_plan_year_placeholders). Use when the DB still
            # enforces overlap on flexible rows (older constraint) or other overlap edge cases.
            if _looks_like_overlap_constraint_error(err1) or _looks_like_overlap_constraint_error(err2):
                ph_row = dict(fallback_row)
                ph_row["is_placeholder"] = True
                ph_row["generated_by"] = "plan_year"
                ph_row["is_flexible"] = True
                try:
                    supabase.table("events").insert(ph_row).execute()
                    return True
                except Exception as e3:
                    err3 = _format_db_exc(e3)
                    missing_uid3 = _extract_missing_event_revision_user_id(err3)
                    if missing_uid3 and _ensure_event_revision_user_fk_target(supabase, missing_uid3):
                        try:
                            supabase.table("events").insert(ph_row).execute()
                            return True
                        except Exception as e3_retry:
                            err3 = _format_db_exc(e3_retry)
                    print(
                        f"[BACKEND] block_regen insert failed (incl. placeholder fallback) subject={row.get('subject_id')} "
                        f"start={row.get('start_ts')}: 1={err1} | 2={err2} | 3={err3}",
                        flush=True,
                    )
                    return False
            print(
                f"[BACKEND] block_regen insert failed subject={row.get('subject_id')} start={row.get('start_ts')}: "
                f"1={err1} | 2={err2}",
                flush=True,
            )
            return False


def regenerate_block(
    supabase,
    family_id: str,
    academic_year_id: str,
    block: Dict[str, Any],
    start_date: date,
    end_date: date,
    exclusion_ranges: List[Tuple[date, date]],
    generation_batch_id: str,
    subject_name: str,
    family_child_ids: List[Any],
    child_id_override: str = None,
    *,
    family_timezone: Optional[str] = None,
    log_event_fn=None,
    user_id: str = None,
    ignore_conflicts: bool = False,
) -> Dict[str, int]:
    """
    Regenerate plan events for a single block only.
    - Updates existing plan events for this block (same date/child) with new times/subject.
    - Inserts new Lesson events for (date, child) that don't exist.
    - Deletes plan events for (date, child) that are no longer in the block's occurrence set.
    Never touches: events with curriculum_lesson_id set (user-filled), or events from other blocks.

    Returns: {"updated": n, "inserted": n, "deleted": n}
    """
    block_id = block.get("block_id")
    if not block_id:
        return {"updated": 0, "inserted": 0, "deleted": 0}

    occ_dates_list = get_block_occurrence_dates(block, start_date, end_date, exclusion_ranges)
    occ_dates: Set[date] = set(occ_dates_list)

    child_ids = list(block.get("child_ids") or [])
    if not child_ids:
        child_ids = family_child_ids if family_child_ids else [None]
    if child_id_override and not block.get("child_ids"):
        child_ids = [child_id_override]

    # Whole-family block: one event per date with all children on child_ids (one chip, all circles).
    # Also treat child_ids == [None] (e.g. no family children) as whole-family so we still insert one event per date.
    is_whole_family = (
        (len(child_ids) > 1 and not any(cid is None for cid in child_ids))
        or (len(child_ids) == 1 and child_ids[0] is None)
    )
    whole_family_sentinel = None  # key (d, None) for whole-family event on date d

    # Fetch existing plan events for this block (include soft-deleted so we can undelete on re-apply).
    # Identify by generated_by + academic_year_id + source_block_id; only touch empty slots (no curriculum_lesson_id).
    existing_res = (
        supabase.table("events")
        .select("id, start_ts, end_ts, child_id, child_ids, subject_id, title, deleted_at")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("source_block_id", block_id)
        .eq("generated_by", "plan_year")
        .is_("curriculum_lesson_id", "null")
        .execute()
    )
    existing = existing_res.data or []

    # Key by (date, child_id) for single-child; (date, None) for whole-family event on that date
    existing_by_key: Dict[Tuple[date, Any], Dict] = {}
    for e in existing:
        d = _event_date_from_start_ts(e)
        if d is None:
            continue
        cid = e.get("child_id")
        e_child_ids = e.get("child_ids") or []
        if is_whole_family and cid is None and e_child_ids and len(e_child_ids) > 1:
            existing_by_key[(d, whole_family_sentinel)] = e
        else:
            existing_by_key[(d, cid)] = e

    if is_whole_family:
        desired_keys = {(d, whole_family_sentinel) for d in occ_dates}
    else:
        desired_keys = set()
        for d in occ_dates:
            for cid in child_ids:
                if cid is not None:
                    desired_keys.add((d, cid))

    to_update: List[Dict[str, Any]] = []
    to_insert: List[Dict[str, Any]] = []
    to_delete_ids: List[str] = []

    for d in occ_dates:
        start_ts = _parse_time_to_iso(d, block.get("start_time", "09:00"), family_timezone)
        end_ts = _parse_time_to_iso(d, block.get("end_time", "10:00"), family_timezone)
        if block.get("all_day"):
            start_ts = _parse_time_to_iso(d, "09:00", family_timezone)
            end_ts = _parse_time_to_iso(d, "15:00", family_timezone)
        subject_id = block.get("subject_id")

        if is_whole_family:
            key = (d, whole_family_sentinel)
            if key in existing_by_key:
                e = existing_by_key[key]
                to_update.append({
                    "id": e["id"],
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                    "subject_id": subject_id,
                    "title": subject_name,
                    "generation_batch_id": generation_batch_id,
                    "deleted_at": e.get("deleted_at"),
                    "status": "scheduled",
                    "is_flexible": True,
                })
            else:
                to_insert.append({
                    "family_id": family_id,
                    "child_id": None,
                    "child_ids": [c for c in child_ids if c is not None] if child_ids else [],
                    "title": subject_name,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                    "status": "scheduled",
                    "source": "system",
                    "event_type": "Lesson",
                    "subject_id": subject_id,
                    "is_placeholder": False,
                    "generated_by": "plan_year",
                    "academic_year_id": academic_year_id,
                    "generation_batch_id": generation_batch_id,
                    "source_block_id": block_id,
                    "counts_toward_plan": True,
                    "is_flexible": True,
                })
        else:
            for cid in child_ids:
                if cid is None:
                    continue  # skip for "no child" (e.g. family has no children)
                key = (d, cid)
                if key in existing_by_key:
                    e = existing_by_key[key]
                    to_update.append({
                        "id": e["id"],
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                        "subject_id": subject_id,
                        "title": subject_name,
                        "generation_batch_id": generation_batch_id,
                        "deleted_at": e.get("deleted_at"),
                        "is_flexible": True,
                    })
                else:
                    to_insert.append({
                        "family_id": family_id,
                        "child_id": cid,
                        "title": subject_name,
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                        "status": "scheduled",
                        "source": "system",
                        "event_type": "Lesson",
                        "subject_id": subject_id,
                        "is_placeholder": False,
                        "generated_by": "plan_year",
                        "academic_year_id": academic_year_id,
                        "generation_batch_id": generation_batch_id,
                        "source_block_id": block_id,
                        "counts_toward_plan": True,
                        "is_flexible": True,
                    })

    # New block_id would miss older plan_year rows in existing_by_key → duplicate whole-family events on the same day.
    # Reconcile: update an existing same-day whole-family slot (prefer empty; else adopt filled) instead of inserting.
    if is_whole_family and to_insert:
        reconciled: List[Dict[str, Any]] = []
        for ins in to_insert:
            if ins.get("child_id") is not None:
                reconciled.append(ins)
                continue
            d_ins = _event_date_from_start_ts(ins)
            if d_ins is None:
                reconciled.append(ins)
                continue
            dup_id = _find_existing_whole_family_plan_slot_same_day(
                supabase,
                family_id,
                academic_year_id,
                ins.get("subject_id"),
                d_ins,
                child_ids,
            )
            if dup_id:
                to_update.append({
                    "id": dup_id,
                    "start_ts": ins["start_ts"],
                    "end_ts": ins["end_ts"],
                    "subject_id": ins["subject_id"],
                    "title": ins["title"],
                    "generation_batch_id": ins["generation_batch_id"],
                    "source_block_id": ins.get("source_block_id"),
                    "child_ids": ins.get("child_ids"),
                    "is_flexible": True,
                })
            else:
                reconciled.append(ins)
        to_insert = reconciled
    elif (not is_whole_family) and to_insert:
        reconciled: List[Dict[str, Any]] = []
        for ins in to_insert:
            cid = ins.get("child_id")
            if cid is None:
                reconciled.append(ins)
                continue
            d_ins = _event_date_from_start_ts(ins)
            if d_ins is None:
                reconciled.append(ins)
                continue
            dup_id = _find_existing_single_child_plan_slot_same_day(
                supabase,
                family_id,
                academic_year_id,
                ins.get("subject_id"),
                d_ins,
                cid,
            )
            if dup_id:
                to_update.append({
                    "id": dup_id,
                    "start_ts": ins["start_ts"],
                    "end_ts": ins["end_ts"],
                    "subject_id": ins["subject_id"],
                    "title": ins["title"],
                    "generation_batch_id": ins["generation_batch_id"],
                    "source_block_id": ins.get("source_block_id"),
                    "is_flexible": True,
                })
            else:
                reconciled.append(ins)
        to_insert = reconciled

    # Only delete events that fall within the regeneration window (>= start_date) and are no longer desired
    for (d, cid), e in existing_by_key.items():
        if d >= start_date and (d, cid) not in desired_keys:
            to_delete_ids.append(e["id"])

    # Execute: updates, then inserts, then deletes (soft-delete if schema has deleted_at)
    updated_count = 0
    if to_update and family_timezone:
        print(
            f"[BACKEND] block_regen sample update: start_ts={to_update[0].get('start_ts')} tz={family_timezone}",
            flush=True,
        )
    for row in to_update:
        try:
            if _safe_overlap_update(supabase, family_id, row, ignore_conflicts=ignore_conflicts):
                updated_count += 1
            else:
                print(f"[BACKEND] block_regen update failed for id={row.get('id')}: overlap-safe fallback also failed", flush=True)
        except Exception as exc:
            print(f"[BACKEND] block_regen update failed for id={row.get('id')}: {_format_db_exc(exc)}", flush=True)

    inserted_count = 0
    if to_insert:
        for row in to_insert:
            if _safe_overlap_insert(supabase, row, ignore_conflicts=ignore_conflicts):
                inserted_count += 1
            else:
                print(
                    f"[BACKEND] block_regen insert failed for subject={row.get('subject_id')} start={row.get('start_ts')}: overlap-safe fallback also failed",
                    flush=True,
                )

    deleted_count = 0
    if to_delete_ids:
        # Soft delete (events table has deleted_at)
        try:
            supabase.table("events").update({
                "deleted_at": datetime.now(timezone.utc).isoformat(),
            }).in_("id", to_delete_ids).eq("family_id", family_id).execute()
            deleted_count = len(to_delete_ids)
        except Exception:
            try:
                supabase.table("events").delete().in_("id", to_delete_ids).eq("family_id", family_id).execute()
                deleted_count = len(to_delete_ids)
            except Exception:
                pass

    if is_whole_family and occ_dates:
        sid = block.get("subject_id")
        if sid is not None:
            for d in occ_dates:
                deleted_count += _dedupe_empty_whole_family_slots_for_day(
                    supabase, family_id, academic_year_id, sid, d, child_ids
                )
    elif occ_dates:
        sid = block.get("subject_id")
        if sid is not None:
            for d in occ_dates:
                for cid in child_ids:
                    if cid is None:
                        continue
                    deleted_count += _dedupe_empty_single_child_slots_for_day(
                        supabase, family_id, academic_year_id, sid, d, cid
                    )

    if log_event_fn and user_id:
        log_event_fn(
            "plan_block_regenerated",
            academic_year_id=academic_year_id,
            block_id=block_id,
            user_id=user_id,
            updated=updated_count,
            inserted=inserted_count,
            deleted=deleted_count,
            generation_batch_id=generation_batch_id,
        )

    return {
        "updated": updated_count,
        "inserted": inserted_count,
        "deleted": deleted_count,
    }

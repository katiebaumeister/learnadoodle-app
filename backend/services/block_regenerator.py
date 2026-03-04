"""
Block-aware regeneration for Plan My Year Apply.
Creates Lesson events linked to the plan by academic_year_id, generation_batch_id, source_block_id,
and generated_by='plan_year'. They are real events (event_type=Lesson); plan linkage and
"count as instructional time" (counts_toward_plan) are how we attach/detach from the plan.

Only touches events from this plan for this block that have no curriculum_lesson_id (user-owned
filled slots are never overwritten).
"""

from datetime import date, datetime, timedelta, timezone
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
                    })

    for (d, cid), e in existing_by_key.items():
        if (d, cid) not in desired_keys:
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
            payload = {
                "start_ts": row["start_ts"],
                "end_ts": row["end_ts"],
                "subject_id": row["subject_id"],
                "title": row["title"],
                "generation_batch_id": row["generation_batch_id"],
            }
            # Undelete if this plan event was soft-deleted so plan_health sees it again
            if row.get("deleted_at"):
                payload["deleted_at"] = None
            supabase.table("events").update(payload).eq("id", row["id"]).eq("family_id", family_id).execute()
            updated_count += 1
        except Exception as exc:
            print(f"[BACKEND] block_regen update failed for id={row.get('id')}: {exc}", flush=True)

    inserted_count = 0
    if to_insert:
        ins = supabase.table("events").insert(to_insert).execute()
        inserted_count = len(ins.data) if ins.data else len(to_insert)

    deleted_count = 0
    if to_delete_ids:
        # Soft delete (events table has deleted_at)
        try:
            from datetime import datetime, timezone
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

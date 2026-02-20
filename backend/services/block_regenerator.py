"""
Block-aware regeneration for Plan My Year Apply.
Only touches events that are still placeholders (is_placeholder=true, generated_by='plan_year')
for the given block (source_block_id). Never updates or deletes customized events.

Collision avoidance (Option B): before inserting a placeholder for (date, child), we skip insert
if any existing event on that date for the same child and subject has counts_toward_plan=true
and deleted_at IS NULL. This avoids duplicating when a parent has moved a lesson (e.g. to 1–3pm);
we do not then insert a new placeholder at the block's original slot (e.g. 9–11am).
"""

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

# Qualifying event type for collision avoidance (must match plan_health / compliance)
QUALIFYING_EVENT_TYPE = "lesson"

from services.blocks_calculator import get_block_occurrence_dates


def _parse_time_to_iso(date_obj: date, time_str: str) -> str:
    """Build ISO timestamp: date + time_str (e.g. '09:00') -> YYYY-MM-DDTHH:MM:00+00:00"""
    parts = (time_str or "09:00").strip().split(":")
    h = int(parts[0]) if len(parts) >= 1 and parts[0].strip() else 9
    m = int(parts[1].split()[0]) if len(parts) >= 2 and parts[1] else 0
    h = max(0, min(23, h))
    m = max(0, min(59, m))
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
    log_event_fn=None,
    user_id: str = None,
) -> Dict[str, int]:
    """
    Regenerate placeholder events for a single block only.
    - Updates existing overwrite-safe placeholders (same date/child) with new times/subject.
    - Inserts new placeholders for (date, child) that don't exist.
    - Deletes placeholders for (date, child) that are no longer in the block's occurrence set.
    Never touches: is_placeholder=false, or events from other blocks.

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

    # Fetch existing overwrite-safe placeholders for this block only (include soft-deleted so we can undelete on re-apply)
    existing_res = (
        supabase.table("events")
        .select("id, start_ts, end_ts, child_id, subject_id, title, deleted_at")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("source_block_id", block_id)
        .eq("is_placeholder", True)
        .eq("generated_by", "plan_year")
        .execute()
    )
    existing = existing_res.data or []

    # Key by (date, child_id) for matching
    existing_by_key: Dict[Tuple[date, Any], Dict] = {}
    for e in existing:
        d = _event_date_from_start_ts(e)
        if d is not None:
            cid = e.get("child_id")
            existing_by_key[(d, cid)] = e

    # Collision avoidance (Option B): do not insert placeholder if an existing qualifying event
    # on that date for same child + subject already counts toward plan (respects parent's intent).
    # Matches compliance definition: lesson, not canceled, counts_toward_plan=true, deleted_at IS NULL.
    # Time range: [start_of_day(min_occ), end_of_day(max_occ)) = [min 00:00, max+1 00:00).
    occupied_slots: Set[Tuple[date, Any]] = set()
    if occ_dates and child_ids and block.get("subject_id"):
        min_d = min(occ_dates)
        max_d = max(occ_dates)
        max_d_next = max_d + timedelta(days=1)
        occupants_res = (
            supabase.table("events")
            .select("start_ts, child_id, child_ids, event_type, status")
            .eq("family_id", family_id)
            .eq("subject_id", block["subject_id"])
            .eq("counts_toward_plan", True)
            .is_("deleted_at", "null")
            .eq("event_type", "Lesson")  # qualifying type (align with plan_health)
            .neq("status", "canceled")
            .gte("start_ts", f"{min_d.isoformat()}T00:00:00")
            .lt("start_ts", f"{max_d_next.isoformat()}T00:00:00")
            .execute()
        )
        for e in occupants_res.data or []:
            # Only count as occupant if it's a qualifying event type (match compliance)
            etype = (e.get("event_type") or "").strip().lower()
            if etype != QUALIFYING_EVENT_TYPE:
                continue
            d = _event_date_from_start_ts(e)
            if d is None or d not in occ_dates:
                continue
            # Both child_id and child_ids: family lessons can block for each participating child
            cids_to_add: List[Any] = []
            if e.get("child_id") is not None:
                cids_to_add.append(e["child_id"])
            if e.get("child_ids") and isinstance(e["child_ids"], list):
                cids_to_add.extend(e["child_ids"])
            for cid in cids_to_add:
                if cid in child_ids:
                    occupied_slots.add((d, cid))

    desired_keys: Set[Tuple[date, Any]] = set()
    for d in occ_dates:
        for cid in child_ids:
            desired_keys.add((d, cid))

    to_update: List[Dict[str, Any]] = []
    to_insert: List[Dict[str, Any]] = []
    to_delete_ids: List[str] = []

    for d in occ_dates:
        start_ts = _parse_time_to_iso(d, block.get("start_time", "09:00"))
        end_ts = _parse_time_to_iso(d, block.get("end_time", "10:00"))
        if block.get("all_day"):
            start_ts = f"{d.isoformat()}T09:00:00+00:00"
            end_ts = f"{d.isoformat()}T15:00:00+00:00"
        subject_id = block.get("subject_id")
        for cid in child_ids:
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
            elif key not in occupied_slots:
                # Skip insert if parent already has a counting lesson that day for this child+subject
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
                    "is_placeholder": True,
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
    for row in to_update:
        try:
            payload = {
                "start_ts": row["start_ts"],
                "end_ts": row["end_ts"],
                "subject_id": row["subject_id"],
                "title": row["title"],
                "generation_batch_id": row["generation_batch_id"],
            }
            # Undelete if this placeholder was soft-deleted so plan_health sees it again
            if row.get("deleted_at"):
                payload["deleted_at"] = None
            supabase.table("events").update(payload).eq("id", row["id"]).eq("family_id", family_id).execute()
            updated_count += 1
        except Exception:
            pass

    inserted_count = 0
    if to_insert:
        try:
            ins = supabase.table("events").insert(to_insert).execute()
            inserted_count = len(ins.data) if ins.data else len(to_insert)
        except Exception as bulk_err:
            err_str = str(bulk_err).lower()
            if "overlap" in err_str or "p0001" in err_str:
                for ev in to_insert:
                    try:
                        supabase.table("events").insert(ev).execute()
                        inserted_count += 1
                    except Exception:
                        pass
            else:
                raise

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

    return {"updated": updated_count, "inserted": inserted_count, "deleted": deleted_count}

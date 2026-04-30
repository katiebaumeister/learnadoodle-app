"""
Rhythm rebalance: spread scheduled load across instructional weekdays using plan targets,
and surface backlog events plus syllabus plan_suggestions when weeks look sparse vs targets.

Uses the same minute rules as plan_health where possible.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from services.plan_health import _child_ids_from_event, _event_minutes, _parse_ts_to_date


def _to_yc_weekday(d: date) -> int:
    """Match year_calculator: Sun=0 .. Sat=6 from Python weekday Mon=0..Sun=6."""
    return (d.weekday() + 1) % 7


def _is_allowed_weekday(d: date, allowed: List[int]) -> bool:
    if not allowed:
        return True
    return _to_yc_weekday(d) in allowed


def _parse_iso_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def _week_start_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _weekly_target_minutes_from_plan(plan: Dict[str, Any]) -> float:
    """Total family weekly instructional minutes implied by academic_year_plan."""
    sd = _parse_iso_date(plan.get("start_date"))
    ed = _parse_iso_date(plan.get("end_date"))
    if not sd or not ed or ed <= sd:
        return 0.0
    weeks = max(1, (ed - sd).days // 7)
    st = plan.get("subject_targets") or {}
    total = 0.0
    if isinstance(st, dict):
        for v in st.values():
            if isinstance(v, dict):
                th = float(v.get("target_hours") or 0)
                if th > 0:
                    total += (th * 60.0) / weeks
    if total > 0:
        return total
    th = float(plan.get("target_hours") or 0)
    if th > 0:
        return (th * 60.0) / weeks
    return 0.0


def _shift_preserving_wall_time(
    current_start_iso: str, new_day: date
) -> str:
    """Keep local clock time from current start on a new calendar day (UTC-safe)."""
    try:
        cur = datetime.fromisoformat(str(current_start_iso).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        cur = datetime.now(timezone.utc)
    # Use UTC components to build new instant on new_day — good enough for preview moves
    new_dt = datetime(
        new_day.year,
        new_day.month,
        new_day.day,
        cur.hour,
        cur.minute,
        cur.second,
        tzinfo=cur.tzinfo or timezone.utc,
    )
    return new_dt.isoformat()


def _plan_suggestions_for_sparse_week(
    rows: List[Dict[str, Any]],
    child_id: str,
    week_start: date,
) -> List[Dict[str, Any]]:
    """Prefer suggestions with target_day in this ISO week; then unscheduled (no target_day) for this child."""
    wk_end = week_start + timedelta(days=7)
    out: List[Dict[str, Any]] = []
    unscheduled: List[Dict[str, Any]] = []
    for r in rows:
        if str(r.get("child_id") or "") != str(child_id):
            continue
        td = r.get("target_day")
        if not td:
            unscheduled.append(r)
            continue
        try:
            tdd = date.fromisoformat(str(td)[:10])
        except (ValueError, TypeError):
            unscheduled.append(r)
            continue
        if week_start <= tdd < wk_end:
            out.append(r)
    ordered = out + unscheduled
    seen = set()
    unique: List[Dict[str, Any]] = []
    for r in ordered:
        rid = str(r.get("id") or "")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        unique.append(r)
        if len(unique) >= 5:
            break
    return unique


_WEEKDAY_SHORT = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _compute_planner_synopsis(
    ws: date,
    we: date,
    horizon_weeks: int,
    child_ids: List[str],
    by_c_w_d: Any,
    weekly_family_target_min: float,
    backlog_hints: List[Dict[str, Any]],
    backlog_count: int,
    syllabus_count: int,
    moves_count: int,
) -> Dict[str, Any]:
    """UI-facing planner status: pace label, hours/week, gap, weekday pressure, copy."""
    total_scheduled_min = 0
    # Python Monday=0 .. Sunday=6
    by_py_weekday: List[int] = [0] * 7
    for cid in child_ids:
        week_map = by_c_w_d.get(cid) or {}
        for _wk, days_map in week_map.items():
            for d, lst in days_map.items():
                msum = sum(m for _, m in lst)
                total_scheduled_min += msum
                wd = d.weekday()
                if 0 <= wd <= 6:
                    by_py_weekday[wd] += msum

    sched_hrs_week = (total_scheduled_min / 60.0) / max(1, horizon_weeks)
    target_hrs_week = weekly_family_target_min / 60.0 if weekly_family_target_min > 0 else 0.0
    gap_hrs_week: Optional[float] = None
    if target_hrs_week > 0:
        gap_hrs_week = round(target_hrs_week - sched_hrs_week, 2)

    has_targets = target_hrs_week > 0.05
    pace_key = "no_targets"
    pace_label = "No plan target"
    if has_targets:
        ratio = sched_hrs_week / target_hrs_week if target_hrs_week > 0 else 0
        if ratio > 1.08:
            pace_key = "overloaded"
            pace_label = "Overloaded"
        elif ratio >= 0.98:
            pace_key = "on_track"
            pace_label = "On track"
        elif ratio >= 0.88:
            pace_key = "light"
            pace_label = "Light"
        else:
            pace_key = "behind"
            pace_label = "Behind"

    sparse_n = len(backlog_hints)
    # Heaviest / lightest instructional weekdays (Mon–Fri focus)
    active = [(i, by_py_weekday[i]) for i in range(5) if by_py_weekday[i] > 0]
    heavy_name = ""
    light_name = ""
    if active:
        hi = max(active, key=lambda x: x[1])
        lo = min(active, key=lambda x: x[1])
        heavy_name = _WEEKDAY_SHORT[hi[0]]
        light_name = _WEEKDAY_SHORT[lo[0]]

    pressure_parts: List[str] = []
    if heavy_name and light_name and heavy_name != light_name:
        pressure_parts.append(f"{heavy_name} heavier")
        pressure_parts.append(f"{light_name} lighter")
    if sparse_n > 0:
        pressure_parts.append(f"{sparse_n} sparse week{'s' if sparse_n != 1 else ''}")
    if moves_count > 0:
        pressure_parts.append(f"{moves_count} shift{'s' if moves_count != 1 else ''} suggested")
    pressure_line = " · ".join(pressure_parts) if pressure_parts else "No strong weekday skew in this window"

    # Sentence summaries
    if not has_targets:
        summary = (
            "No active plan targets were found for this window. "
            "We can still spread lessons across your allowed weekdays and surface backlog or syllabus items."
        )
        pace_detail = (
            "Showing rhythm only from your current schedule and planner weekdays — add targets in Plan My Year "
            "for pace comparisons."
        )
    else:
        if pace_key == "on_track":
            summary = "You're roughly on pace for the next few weeks relative to your plan targets."
            pace_detail = "A few moves may still reduce busy-day clustering."
        elif pace_key == "light" or pace_key == "behind":
            summary = (
                f"Scheduled time is below your weekly target (~{target_hrs_week:.1f} hrs/week). "
                "Light weeks or backlog items can help close the gap."
            )
            pace_detail = "Consider filling sparse weeks or scheduling suggested work below."
        elif pace_key == "overloaded":
            summary = "Your schedule is dense in this window relative to target — early-week clustering is common."
            pace_detail = "Spreading moves can free capacity on lighter days."
        else:
            summary = "Review load and suggested actions below."
            pace_detail = ""

    load_balance_line = ""
    if heavy_name and light_name and heavy_name != light_name:
        load_balance_line = f"{heavy_name} tends to carry more; {light_name} is lighter."
    elif not active:
        load_balance_line = "Not enough scheduled lessons in this window to compare weekdays."
    else:
        load_balance_line = "Weekday load is fairly even."

    open_items_line = f"{backlog_count} backlog item(s) and {syllabus_count} syllabus suggestion(s) available."
    if backlog_count == 0 and syllabus_count == 0:
        open_items_line = "No backlog or syllabus suggestions on file."

    projected_gap_hrs: Optional[float] = None
    if has_targets and gap_hrs_week is not None:
        projected_gap_hrs = round(gap_hrs_week * horizon_weeks, 1)

    return {
        "paceKey": pace_key,
        "paceLabel": pace_label,
        "hasActiveTargets": has_targets,
        "scheduledHrsPerWeek": round(sched_hrs_week, 2),
        "targetHrsPerWeek": round(target_hrs_week, 2) if has_targets else None,
        "gapHrsPerWeek": gap_hrs_week,
        "scheduledHrsHorizon": round((total_scheduled_min / 60.0), 2),
        "targetHrsHorizon": round(target_hrs_week * horizon_weeks, 2) if has_targets else None,
        "projectedGapHrsHorizon": projected_gap_hrs,
        "sparseWeeksCount": sparse_n,
        "pressureLine": pressure_line,
        "heavyWeekday": heavy_name or None,
        "lightWeekday": light_name or None,
        "summarySentence": summary,
        "paceDetailSentence": pace_detail,
        "loadBalanceLine": load_balance_line,
        "openItemsLine": open_items_line,
        "totalMovesSuggested": moves_count,
    }


def compute_rebalance_rhythm(
    supabase: Any,
    family_id: str,
    week_start: date,
    horizon_weeks: int = 4,
    child_ids_filter: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Returns { ok, moves, count, insights }.
    moves: same shape as rebalance_schedule RPC for client reuse.
    """
    horizon_weeks = max(1, min(12, int(horizon_weeks)))
    ws = _week_start_monday(week_start)
    we = ws + timedelta(days=7 * horizon_weeks)
    start_iso = datetime.combine(ws, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    end_iso = datetime.combine(we, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()

    # Planner defaults (year-scoped; fallback to any row for backward compatibility)
    school_year_label = f"{ws.year}/{str((ws.year + 1) % 100).zfill(2)}" if ws.month >= 8 else f"{ws.year - 1}/{str(ws.year % 100).zfill(2)}"
    try:
        fps = (
            supabase.table("family_planner_settings")
            .select("allowed_weekdays, default_planned_hours_per_day")
            .eq("family_id", family_id)
            .eq("school_year_label", school_year_label)
            .limit(1)
            .execute()
        )
        rows = fps.data or []
        if not rows:
            legacy = (
                supabase.table("family_planner_settings")
                .select("allowed_weekdays, default_planned_hours_per_day")
                .eq("family_id", family_id)
                .limit(1)
                .execute()
            )
            rows = legacy.data or []
        fps_row = rows[0] if rows else {}
    except Exception:
        fps_row = {}
    allowed_weekdays: List[int] = list(fps_row.get("allowed_weekdays") or [1, 2, 3, 4, 5])
    default_day_cap_min = float(fps_row.get("default_planned_hours_per_day") or 0) * 60.0

    # Children in family
    ch_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
    all_child_ids = [str(r["id"]) for r in (ch_res.data or [])]
    if child_ids_filter:
        want = {str(x) for x in child_ids_filter}
        child_ids = [c for c in all_child_ids if c in want]
    else:
        child_ids = all_child_ids
    n_children = max(1, len(child_ids))

    # Overlapping academic year plan(s) — use strongest target from any overlapping row
    ws_s = ws.isoformat()[:10]
    we_s = we.isoformat()[:10]
    plans_res = (
        supabase.table("academic_year_plan")
        .select("id, start_date, end_date, target_hours, subject_targets")
        .eq("family_id", family_id)
        .lte("start_date", we_s)
        .gte("end_date", ws_s)
        .execute()
    )
    plans = plans_res.data or []
    weekly_family_target = 0.0
    for p in plans:
        weekly_family_target = max(weekly_family_target, _weekly_target_minutes_from_plan(p))
    weekly_per_child_target = weekly_family_target / n_children if weekly_family_target > 0 else 0.0

    num_allowed = max(1, len([d for d in allowed_weekdays if 0 <= d <= 6]))
    ideal_per_day = (
        weekly_per_child_target / num_allowed if weekly_per_child_target > 0 else 0.0
    )
    if ideal_per_day <= 0 and default_day_cap_min > 0:
        ideal_per_day = default_day_cap_min / max(1, num_allowed / 5.0)  # soft hint

    # Scheduled events in window
    ev_res = (
        supabase.table("events")
        .select(
            "id, start_ts, end_ts, child_id, child_ids, subject_id, title, "
            "instructional_minutes, status, is_backlog, deleted_at, canceled_at, source_block_id"
        )
        .eq("family_id", family_id)
        .gte("start_ts", start_iso)
        .lte("start_ts", end_iso)
        .execute()
    )
    events = [e for e in (ev_res.data or []) if not e.get("deleted_at") and not e.get("canceled_at")]
    events = [e for e in events if not e.get("is_backlog")]
    events = [e for e in events if (e.get("status") or "").lower() == "scheduled"]

    # Backlog (for hints)
    try:
        backlog_res = (
            supabase.table("events")
            .select("id, title, child_id, subject_id, instructional_minutes, estimated_minutes")
            .eq("family_id", family_id)
            .or_("is_backlog.eq.true,status.eq.backlog")
            .limit(80)
            .execute()
        )
        backlog_rows = backlog_res.data or []
    except Exception:
        backlog_res = (
            supabase.table("events")
            .select("id, title, child_id, subject_id, instructional_minutes, estimated_minutes")
            .eq("family_id", family_id)
            .eq("is_backlog", True)
            .limit(80)
            .execute()
        )
        backlog_rows = backlog_res.data or []

    # Syllabus / curriculum plan suggestions (table may be absent in some DBs)
    plan_suggestion_rows: List[Dict[str, Any]] = []
    try:
        ps_res = (
            supabase.table("plan_suggestions")
            .select("id, title, child_id, subject_id, estimated_minutes, target_day, status")
            .eq("family_id", family_id)
            .eq("status", "suggested")
            .order("target_day")
            .limit(100)
            .execute()
        )
        plan_suggestion_rows = list(ps_res.data or [])
    except Exception:
        plan_suggestion_rows = []

    # Per child / week / day: list of events with minutes
    # Structure: child -> week_start_date -> day -> [(ev, minutes)]
    by_c_w_d: Dict[str, Dict[date, Dict[date, List[Tuple[Dict[str, Any], int]]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )

    for ev in events:
        cids = _child_ids_from_event(ev)
        if not cids:
            continue
        for cid in cids:
            if cid not in child_ids:
                continue
            d = _parse_ts_to_date(ev.get("start_ts"))
            if d is None or d < ws or d >= we:
                continue
            if not _is_allowed_weekday(d, allowed_weekdays):
                continue
            m = _event_minutes(ev)
            if m <= 0:
                continue
            wk = _week_start_monday(d)
            by_c_w_d[cid][wk][d].append((ev, m))

    moves: List[Dict[str, str]] = []
    hot_ratio = 1.28
    cold_ratio = 0.72
    max_day_minutes = max(ideal_per_day * 2.2, 360.0) if ideal_per_day > 0 else 600.0

    for cid in child_ids:
        for wk, days_map in by_c_w_d[cid].items():
            # Actual weekly total for rhythm when no plan target
            week_total = 0
            day_totals: Dict[date, int] = {}
            for d, lst in days_map.items():
                s = sum(m for _, m in lst)
                day_totals[d] = s
                week_total += s
            if weekly_per_child_target <= 0 and week_total > 0:
                ideal_local = week_total / max(1, len(day_totals))
            else:
                ideal_local = ideal_per_day if ideal_per_day > 0 else (
                    week_total / max(1, len(day_totals)) if week_total > 0 else 120.0
                )
            ideal_local = max(ideal_local, 1.0)

            hot_days = sorted(
                [d for d, tot in day_totals.items() if tot > ideal_local * hot_ratio],
                key=lambda x: day_totals[x],
                reverse=True,
            )
            cold_days = sorted(
                [d for d, tot in day_totals.items() if tot < ideal_local * cold_ratio],
                key=lambda x: day_totals[x],
            )
            # Expand cold pool: allowed weekdays in this week with no or low load
            for offset in range(7):
                d2 = wk + timedelta(days=offset)
                if d2 >= we:
                    break
                if not _is_allowed_weekday(d2, allowed_weekdays):
                    continue
                if d2 not in day_totals:
                    day_totals[d2] = 0
                    cold_days.append(d2)
            cold_days = sorted(set(cold_days), key=lambda x: day_totals.get(x, 0))

            simulated = dict(day_totals)

            for hd in hot_days:
                if not cold_days:
                    break
                items = sorted(days_map[hd], key=lambda t: t[1], reverse=True)
                for ev, em in items:
                    if simulated[hd] <= ideal_local * hot_ratio:
                        break
                    # pick coldest day that fits cap
                    dest = None
                    for cd in cold_days:
                        if cd == hd:
                            continue
                        if simulated.get(cd, 0) + em <= max_day_minutes:
                            dest = cd
                            break
                    if dest is None:
                        continue
                    cur_start = ev.get("start_ts")
                    if not cur_start:
                        continue
                    proposed = _shift_preserving_wall_time(str(cur_start), dest)
                    moves.append(
                        {
                            "eventId": str(ev["id"]),
                            "currentStart": str(cur_start),
                            "proposedStart": proposed,
                            "reason": f"Spread load: lighter day vs busy {hd.isoformat()}",
                        }
                    )
                    simulated[hd] -= em
                    simulated[dest] = simulated.get(dest, 0) + em
                    if hd not in days_map:
                        days_map[hd] = []
                    if dest not in days_map:
                        days_map[dest] = []
                    # remove ev from hd list
                    days_map[hd] = [(e, m) for e, m in days_map[hd] if e["id"] != ev["id"]]
                    days_map[dest].append((ev, em))

    # Backlog + syllabus suggestion hints when under target (every week in horizon, including empty)
    backlog_hints: List[Dict[str, Any]] = []
    if weekly_per_child_target > 0:
        has_fill_sources = bool(backlog_rows) or bool(plan_suggestion_rows)
        seen_hint_keys: set = set()
        sparse_threshold = weekly_per_child_target * 0.82
        for cid in child_ids:
            for i in range(horizon_weeks):
                wk = ws + timedelta(days=7 * i)
                days_map = by_c_w_d[cid].get(wk)
                if not days_map:
                    week_total = 0
                else:
                    week_total = sum(
                        sum(m for _, m in lst) for lst in days_map.values()
                    )
                if week_total >= sparse_threshold or not has_fill_sources:
                    continue
                hint_key = (str(cid), wk.isoformat())
                if hint_key in seen_hint_keys:
                    continue
                seen_hint_keys.add(hint_key)
                child_backlog = [
                    b for b in backlog_rows if str(b.get("child_id") or "") == str(cid)
                ]
                sample_bl = child_backlog[:5] if child_backlog else backlog_rows[:5]
                sug_rows = _plan_suggestions_for_sparse_week(plan_suggestion_rows, cid, wk)
                backlog_hints.append(
                    {
                        "childId": cid,
                        "weekStart": wk.isoformat(),
                        "scheduledMinutes": int(week_total),
                        "targetMinutes": int(weekly_per_child_target),
                        "message": (
                            "This week is light vs your plan targets — schedule backlog items "
                            "or place syllabus suggestions on the calendar."
                        ),
                        "sampleBacklog": [
                            {
                                "id": str(b.get("id")),
                                "title": b.get("title") or "Backlog item",
                                "childId": str(b.get("child_id") or cid),
                            }
                            for b in sample_bl
                        ],
                        "samplePlanSuggestions": [
                            {
                                "id": str(s.get("id")),
                                "title": s.get("title") or "Lesson",
                                "targetDay": s.get("target_day"),
                                "estimatedMinutes": s.get("estimated_minutes"),
                                "childId": str(s.get("child_id") or cid),
                            }
                            for s in sug_rows
                        ],
                    }
                )
                if len(backlog_hints) >= 10:
                    break
            if len(backlog_hints) >= 10:
                break

    plan_preview = [
        {
            "id": str(s.get("id")),
            "title": s.get("title") or "Lesson",
            "childId": str(s.get("child_id")),
            "targetDay": s.get("target_day"),
            "estimatedMinutes": s.get("estimated_minutes"),
        }
        for s in (plan_suggestion_rows or [])[:12]
    ]

    planner_synopsis = _compute_planner_synopsis(
        ws,
        we,
        horizon_weeks,
        child_ids,
        by_c_w_d,
        weekly_family_target,
        backlog_hints,
        len(backlog_rows),
        len(plan_suggestion_rows),
        len(moves),
    )

    return {
        "ok": True,
        "moves": moves,
        "count": len(moves),
        "insights": {
            "weeklyPerChildTargetMinutes": round(weekly_per_child_target, 1),
            "weeklyFamilyTargetMinutes": round(weekly_family_target, 1),
            "idealMinutesPerInstructionalDay": round(ideal_per_day, 1),
            "allowedWeekdays": allowed_weekdays,
            "horizonWeeks": horizon_weeks,
            "weekStart": ws.isoformat(),
            "backlogHints": backlog_hints[:10],
            "backlogCount": len(backlog_rows),
            "planSuggestionCount": len(plan_suggestion_rows),
            "planSuggestionsPreview": plan_preview,
            "plannerSynopsis": planner_synopsis,
        },
    }

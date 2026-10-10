"""
Conservative AI abuse safeguards: monthly + daily unit caps, new-family tighter limits.

Enforcement is server-side. Plan tiers are not wired to billing yet — everyone is
treated as the free/default allowance unless env overrides raise the ceiling.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, status

from ai_usage_ledger import UNIT_WEIGHTS

logger = logging.getLogger(__name__)

# Conservative defaults (override via env without redeploying product copy).
_MONTHLY_DEFAULT = int(os.environ.get("AI_MONTHLY_UNITS_DEFAULT", "40"))
_MONTHLY_NEW_FAMILY = int(os.environ.get("AI_MONTHLY_UNITS_NEW_FAMILY", "15"))
_DAILY_DEFAULT = int(os.environ.get("AI_DAILY_UNITS_DEFAULT", "20"))
_DAILY_NEW_FAMILY = int(os.environ.get("AI_DAILY_UNITS_NEW_FAMILY", "8"))
_NEW_FAMILY_DAYS = int(os.environ.get("AI_NEW_FAMILY_DAYS", "7"))

def _env_flag(name: str, default: str = "") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes")


# Lift quotas in local/dev for now. Production keeps enforcement unless AI_QUOTA_DISABLED=true.
_IS_DEV = os.environ.get("ENVIRONMENT", "development").strip().lower() in (
    "development",
    "dev",
    "local",
)
_QUOTA_DISABLED = _env_flag("AI_QUOTA_DISABLED") or (
    _IS_DEV and not _env_flag("AI_QUOTA_FORCE_ENABLE")
)


def units_for_action(action_type: str, *, units: Optional[int] = None) -> int:
    if units is not None and units > 0:
        return int(units)
    return int(UNIT_WEIGHTS.get(action_type) or 1)


def _parse_created_at(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _family_limits(family_id: str) -> Tuple[int, int, bool]:
    """Return (monthly_cap, daily_cap, is_new_family). Fail closed to free caps."""
    monthly = _MONTHLY_DEFAULT
    daily = _DAILY_DEFAULT
    is_new = False
    try:
        from supabase_client import get_admin_client

        supa = get_admin_client()
        res = (
            supa.table("family")
            .select("created_at")
            .eq("id", family_id)
            .maybe_single()
            .execute()
        )
        created = _parse_created_at((res.data or {}).get("created_at"))
        if created:
            age = datetime.now(timezone.utc) - created
            if age < timedelta(days=max(1, _NEW_FAMILY_DAYS)):
                is_new = True
                monthly = _MONTHLY_NEW_FAMILY
                daily = _DAILY_NEW_FAMILY
    except Exception as e:
        logger.warning("ai_quota: family age lookup failed: %s", e)
    return monthly, daily, is_new


def _units_used_this_month(family_id: str) -> int:
    try:
        from supabase_client import get_admin_client

        supa = get_admin_client()
        res = supa.rpc(
            "get_family_ai_units_used_this_month",
            {"p_family_id": family_id},
        ).execute()
        return int(res.data or 0)
    except Exception as e:
        logger.warning("ai_quota: monthly usage lookup failed: %s", e)
        # Fail open on meter outage; IP/user AI rate limits still apply.
        return 0


def _units_used_today(family_id: str) -> int:
    try:
        from supabase_client import get_admin_client

        supa = get_admin_client()
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        res = (
            supa.table("ai_usage_ledger")
            .select("units")
            .eq("family_id", family_id)
            .gte("created_at", start.isoformat())
            .execute()
        )
        rows = res.data or []
        return int(sum(int(r.get("units") or 0) for r in rows))
    except Exception as e:
        logger.warning("ai_quota: daily usage lookup failed: %s", e)
        return 0


def get_family_ai_quota_snapshot(family_id: str) -> Dict[str, Any]:
    monthly_cap, daily_cap, is_new = _family_limits(family_id)
    used_month = _units_used_this_month(family_id)
    used_day = _units_used_today(family_id)
    return {
        "family_id": family_id,
        "monthly_cap": monthly_cap,
        "daily_cap": daily_cap,
        "used_month": used_month,
        "used_day": used_day,
        "remaining_month": max(0, monthly_cap - used_month),
        "remaining_day": max(0, daily_cap - used_day),
        "is_new_family": is_new,
    }


def assert_family_ai_allowed(
    family_id: Optional[str],
    action_type: str,
    *,
    units: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Raise 429 if the family would exceed conservative daily/monthly AI caps.
    Returns a small snapshot for logging/metadata.
    """
    if _QUOTA_DISABLED:
        return {"disabled": True}
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI features require a family account.",
        )

    cost = units_for_action(action_type, units=units)
    snap = get_family_ai_quota_snapshot(family_id)
    remaining_month = snap["remaining_month"]
    remaining_day = snap["remaining_day"]

    if cost > remaining_day or snap["used_day"] >= snap["daily_cap"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Daily AI limit reached. Try again tomorrow, or use non-AI tools for now."
            ),
            headers={"Retry-After": "3600"},
        )
    if cost > remaining_month or snap["used_month"] >= snap["monthly_cap"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Monthly AI allowance reached. Limits reset next month."
            ),
            headers={"Retry-After": "86400"},
        )

    snap["action_type"] = action_type
    snap["cost"] = cost
    return snap

"""
Record rows in public.ai_usage_ledger (service_role / admin client).
Unit weights mirror hi-world-app/constants/aiUsageUnits.ts
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Keep in sync with constants/aiUsageUnits.ts
UNIT_WEIGHTS: Dict[str, int] = {
    "chatbotSimple": 1,
    "chatbotPlannerAware": 2,
    "smallEdit": 2,
    "rebalanceSingleWeek": 10,
    "resolveConflicts": 6,
    "adjustSubjectPacing": 6,
    "parsePlainTextToStructure": 8,
    "generatePlanWeek": 12,
    "generatePlanMultiWeek": 18,
    "parseUploadedMaterial": 25,
    "curriculumImportStructuring": 30,
    "fullSystemRebalanceMultiWeek": 25,
}


def record_ai_usage(
    family_id: Optional[str],
    action_type: str,
    *,
    units: Optional[int] = None,
    idempotency_key: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Best-effort insert; failures are logged and never raise to callers."""
    if not family_id:
        return
    u = units if units is not None else UNIT_WEIGHTS.get(action_type)
    if u is None:
        logger.warning("ai_usage_ledger: unknown action_type %s", action_type)
        return
    try:
        from supabase_client import get_admin_client

        supa = get_admin_client()
        row: Dict[str, Any] = {
            "family_id": family_id,
            "action_type": action_type,
            "units": u,
            "metadata": metadata or {},
        }
        if idempotency_key:
            row["idempotency_key"] = idempotency_key
        supa.table("ai_usage_ledger").insert(row).execute()
    except Exception as e:
        err = str(e).lower()
        if "duplicate" in err or "unique" in err or "23505" in err:
            logger.debug("ai_usage_ledger: duplicate idempotency_key=%s", idempotency_key)
            return
        logger.warning("ai_usage_ledger: insert failed: %s", e)

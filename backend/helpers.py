from typing import Optional, Tuple

from fastapi import HTTPException, status
from supabase_client import get_admin_client


def get_placeholder_conversion_fields(event: dict) -> Tuple[dict, bool]:
    """
    If event is a plan_year placeholder, return fields to convert it to manual.
    Only is_placeholder is set to False. Preserve source_block_id, academic_year_id,
    generated_by, generation_batch_id for drift detection and analytics.
    Returns (fields_dict, did_convert).
    """
    if event.get("is_placeholder") is True and event.get("generated_by") == "plan_year":
        return ({"is_placeholder": False}, True)
    return {}, False


def get_family_id_for_user(user_id: str) -> Optional[str]:
    """Resolve family_id for any user (parent or child). Tries profiles first, then family_members."""
    supabase = get_admin_client()
    resp = supabase.table("profiles").select("family_id").eq("id", user_id).maybe_single().execute()
    if resp.data and resp.data.get("family_id"):
        return resp.data.get("family_id")
    # Fallback for child users whose profiles.family_id may not be set (e.g. invite flow only wrote family_members)
    try:
        fm = supabase.table("family_members").select("family_id").eq("user_id", user_id).limit(1).execute()
        if fm.data and len(fm.data) > 0 and fm.data[0].get("family_id"):
            return fm.data[0].get("family_id")
    except Exception:
        pass
    return None


def child_belongs_to_family(child_id: str, family_id: str) -> bool:
    supabase = get_admin_client()
    resp = supabase.table("children").select("id").eq("id", child_id).eq("family_id", family_id).limit(1).execute()
    return bool(resp.data)


def require_onboarding_complete(family_id: str) -> None:
    """
    Raise HTTP 400 if family has not completed onboarding (default_planning_mode set,
    at least one child, at least one subject). Use before plan creation / apply_to_calendar.
    """
    supabase = get_admin_client()
    try:
        family_res = supabase.table("family").select("*").eq("id", family_id).maybe_single().execute()
        row = family_res.data or {}
        planning_mode = row.get("default_planning_mode")
        completed = row.get("onboarding_completed") or row.get("has_completed_onboarding")
        if not planning_mode:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Complete setup first: choose a planning mode in Quick setup.",
            )
        if completed:
            return  # Trust the flag if set
        children_res = supabase.table("children").select("id").eq("family_id", family_id).limit(1).execute()
        if not children_res.data or len(children_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Complete setup first: add at least one child in Quick setup.",
            )
        subjects_res = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
        if not subjects_res.data or len(subjects_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Complete setup first: add at least one subject in Quick setup.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not verify setup. Please complete Quick setup first.",
        )

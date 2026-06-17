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
    """Resolve family_id for any user (parent or child). Tries profiles first, then family_members.
    Uses limit(1) instead of maybe_single() to avoid PostgREST 406 when 0 rows (e.g. new user, no family yet)."""
    supabase = get_admin_client()
    try:
        resp = supabase.table("profiles").select("family_id").eq("id", user_id).limit(1).execute()
        if resp.data and len(resp.data) > 0 and resp.data[0].get("family_id"):
            return resp.data[0].get("family_id")
    except Exception:
        pass
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


def delete_signup_confirmation_sent_for_email(email: str) -> None:
    """
    Delete any signup_confirmation_sent rows for the given email.
    Call this when deleting an auth user (e.g. from Family Settings "Erase Personal Data" flow)
    so the user can sign up again without seeing "Confirmation sent on...".
    A DB trigger (cleanup_signup_confirmation_sent_on_auth_user_delete) also runs when auth.users
    is deleted; this helper is for code paths that want to clean up explicitly.
    """
    if not email or not str(email).strip():
        return
    try:
        supabase = get_admin_client()
        supabase.table("signup_confirmation_sent").delete().eq(
            "email", str(email).strip().lower()
        ).execute()
    except Exception:
        pass


def require_onboarding_complete(family_id: str) -> None:
    """
    Raise HTTP 400 if family has not completed onboarding (planning mode set,
    at least one child). Subjects are not required for onboarding completion.
    Use before plan creation / apply_to_calendar.
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not verify setup. Please complete Quick setup first.",
        )

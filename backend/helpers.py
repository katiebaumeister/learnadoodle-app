from typing import Optional, Tuple

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
    supabase = get_admin_client()
    resp = supabase.table("profiles").select("family_id").eq("id", user_id).maybe_single().execute()
    if resp.data:
        return resp.data.get("family_id")
    return None


def child_belongs_to_family(child_id: str, family_id: str) -> bool:
    supabase = get_admin_client()
    resp = supabase.table("children").select("id").eq("id", child_id).eq("family_id", family_id).limit(1).execute()
    return bool(resp.data)

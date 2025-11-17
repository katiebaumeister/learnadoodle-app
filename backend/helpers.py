from typing import Optional

from supabase_client import get_admin_client


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

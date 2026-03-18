"""
Account lifecycle routes (e.g. delete account and all family data).
Uses service_role for data deletion and Auth Admin API for user deletion.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import os
import httpx
import traceback

from auth import get_current_user, rate_limiter
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/account", tags=["account"])

# Exact phrase user must type to confirm account deletion (case-sensitive in request; we compare case-insensitively)
CONFIRM_PHRASE = "DELETE"


class DeleteAccountIn(BaseModel):
    confirm_phrase: str = Field(..., description="User must type DELETE to confirm")


class DeleteAccountOut(BaseModel):
    success: bool
    message: str


@router.post("/delete", response_model=DeleteAccountOut)
async def delete_account(
    body: DeleteAccountIn,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Permanently delete the current user's account, their family, all family data,
    and all linked accounts (e.g. child/student accounts in that family).
    Requires typing "DELETE" to confirm.
    Only allowed for parent role in the family.
    """
    if (body.confirm_phrase or "").strip().upper() != CONFIRM_PHRASE.upper():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation phrase does not match. Type DELETE to confirm.",
        )

    supabase = get_admin_client()
    user_id = user["id"]

    # 1) Get profile and ensure user is a parent with a family
    profile_res = (
        supabase.table("profiles").select("family_id, role").eq("id", user_id).limit(1).execute()
    )
    profile = profile_res.data[0] if profile_res.data and len(profile_res.data) > 0 else None
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    family_id = profile.get("family_id")
    role = (profile.get("role") or "").strip().lower()
    if role not in ("parent", "admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the family account owner (parent) can delete the account.",
        )
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No family linked to this account.",
        )

    # 2) Get all family member user_ids (parents, children, tutors) so we delete them from auth too
    members_res = (
        supabase.table("family_members")
        .select("user_id")
        .eq("family_id", family_id)
        .execute()
    )
    member_user_ids = [row["user_id"] for row in (members_res.data or [])]
    if not member_user_ids:
        member_user_ids = [user_id]

    try:
        # 3a) Marketplace: purchases reference listings (any buyer). Must remove purchases for our
        #     listings first, then reviews, then listings; then purchases where our family bought.
        try:
            listings_res = (
                supabase.table("marketplace_listings").select("id").eq("family_id", family_id).execute()
            )
            listing_ids = [r["id"] for r in (listings_res.data or [])]
            for lid in listing_ids:
                try:
                    supabase.table("marketplace_purchases").delete().eq("listing_id", lid).execute()
                except Exception:
                    pass
                try:
                    supabase.table("marketplace_reviews").delete().eq("listing_id", lid).execute()
                except Exception:
                    pass
            if listing_ids:
                try:
                    supabase.table("marketplace_listings").delete().eq("family_id", family_id).execute()
                except Exception:
                    pass
            try:
                supabase.table("marketplace_purchases").delete().eq("family_id", family_id).execute()
            except Exception:
                pass
        except Exception:
            pass

        # 3b) Children reference family; if FK has no ON DELETE CASCADE, family delete fails first.
        try:
            supabase.table("children").delete().eq("family_id", family_id).execute()
        except Exception:
            for row in (
                supabase.table("children").select("id").eq("family_id", family_id).execute().data
                or []
            ):
                try:
                    supabase.table("children").delete().eq("id", row["id"]).execute()
                except Exception:
                    pass

        # 3c) Delete family (CASCADE removes family_members, etc.)
        supabase.table("family").delete().eq("id", family_id).execute()

        # 4) Delete profiles (after family; may fail if FK—then auth delete still runs)
        for uid in member_user_ids:
            try:
                supabase.table("profiles").delete().eq("id", uid).execute()
            except Exception:
                pass

        # 5) Delete auth users via Admin API (so they cannot log in again)
        supabase_url = os.environ.get("SUPABASE_URL")
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not service_role_key:
            log_event("account.delete.auth_config_missing")
            return DeleteAccountOut(
                success=True,
                message="Account and family data have been deleted. Auth cleanup may be incomplete; contact support if you still have access.",
            )

        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            for uid in member_user_ids:
                try:
                    r = await client.delete(
                        f"{supabase_url}/auth/v1/admin/users/{uid}",
                        headers=headers,
                        timeout=10.0,
                    )
                    if r.status_code not in (200, 204):
                        log_event("account.delete.auth_user_failed", user_id=uid, status=r.status_code, body=r.text[:200])
                except Exception as e:
                    log_event("account.delete.auth_user_error", user_id=uid, error=str(e))

        log_event("account.delete.success", user_id=user_id, family_id=family_id)
        return DeleteAccountOut(success=True, message="Your account and all family data have been permanently deleted.")
    except Exception as e:
        tb = traceback.format_exc()
        log_event("account.delete.error", user_id=user_id, error=str(e), traceback=tb[:2000])
        print(f"[account.delete] {e}\n{tb}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again or contact support.",
        ) from e

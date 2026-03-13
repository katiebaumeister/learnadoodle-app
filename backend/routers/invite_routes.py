"""
FastAPI routes for family invites
Part of Phase 6 - Parent/Child/Tutor Ecosystem + Integrations
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
import sys
import os
import json
from pathlib import Path
import secrets
import string
import httpx

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/invites", tags=["invites"])


# ============================================================
# Request/Response Models
# ============================================================

class CreateInviteIn(BaseModel):
    email: EmailStr = Field(..., description="Email address to invite")
    role: str = Field(..., description="Role: 'parent', 'child', or 'tutor'")
    child_scope: Optional[List[str]] = Field(None, description="For tutors: list of child IDs they can access")


class CreateInviteOut(BaseModel):
    id: str
    email: str
    token: str
    role: str
    child_scope: Optional[List[str]] = None
    expires_at: Optional[str] = None


class AcceptInviteIn(BaseModel):
    token: str = Field(..., description="Invite token")


class AcceptInviteOut(BaseModel):
    success: bool
    family_id: Optional[str] = None
    role: Optional[str] = None
    child_scope: Optional[List[str]] = None
    error: Optional[str] = None


class AcceptInviteWithPasswordIn(BaseModel):
    token: str = Field(..., description="Invite token from email link")
    email: EmailStr = Field(..., description="Email address on the invite")
    password: str = Field(..., min_length=6, description="Password for the new account")


class AcceptInviteWithPasswordOut(BaseModel):
    success: bool
    error: Optional[str] = None


# ============================================================
# Helper Functions
# ============================================================

def _generate_invite_token() -> str:
    """Generate a secure random token for invites"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))


def _validate_child_scope(supabase, family_id: str, child_scope: Optional[List[str]]) -> List[str]:
    """Validate that all child IDs in scope belong to the family"""
    if not child_scope:
        return []
    
    # Query children to verify they belong to family
    children_res = supabase.table("children").select("id").eq("family_id", family_id).in_("id", child_scope).execute()
    valid_child_ids = [c["id"] for c in (children_res.data or [])]
    
    if len(valid_child_ids) != len(child_scope):
        invalid_ids = set(child_scope) - set(valid_child_ids)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid child IDs: {', '.join(invalid_ids)}"
        )
    
    return valid_child_ids


# ============================================================
# Routes
# ============================================================

@router.post("/create", response_model=CreateInviteOut)
async def create_invite(
    body: CreateInviteIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create an invite for a new family member.
    Only parents can create invites.
    """
    log_event("invite.create.start", user_id=user["id"], email=body.email, role=body.role)
    
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Verify user is a parent in the family
        member_check = supabase.table("family_members").select("member_role").eq("family_id", family_id).eq("user_id", user["id"]).eq("member_role", "parent").single().execute()
        if not member_check.data:
            # Fallback: check if user's profile has family_id (backward compatibility)
            profile_check = supabase.table("profiles").select("id, family_id, role").eq("id", user["id"]).eq("family_id", family_id).single().execute()
            if not profile_check.data or profile_check.data.get("role") != "parent":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only parents can create invites"
                )
        
        # Validate child_scope for tutors
        validated_child_scope = []
        if body.role == "tutor":
            if not body.child_scope:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tutors must specify child_scope"
                )
            validated_child_scope = _validate_child_scope(supabase, family_id, body.child_scope)
        elif body.role == "child":
            # For children, find their child record and set scope
            child_res = supabase.table("children").select("id").eq("family_id", family_id).limit(1).execute()
            if child_res.data:
                validated_child_scope = [child_res.data[0]["id"]]
        elif body.role == "parent":
            # Parents don't need child_scope
            validated_child_scope = []
        
        # Generate invite token
        token = _generate_invite_token()
        
        # Set expiration (default 30 days)
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()
        
        # Create invite
        invite_res = supabase.table("invites").insert({
            "family_id": family_id,
            "email": body.email,
            "role": body.role,
            "child_scope": validated_child_scope,
            "token": token,
            "invited_by": user["id"],
            "expires_at": expires_at
        }).execute()
        
        if not invite_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create invite"
            )
        
        invite = invite_res.data[0]
        
        log_event("invite.create.success", user_id=user["id"], invite_id=invite["id"], email=body.email)
        
        return CreateInviteOut(
            id=invite["id"],
            email=invite["email"],
            token=invite["token"],
            role=invite["role"],
            child_scope=invite.get("child_scope"),
            expires_at=invite.get("expires_at")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("invite.create.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create invite: {str(e)}"
        )


@router.post("/accept", response_model=AcceptInviteOut)
async def accept_invite(
    body: AcceptInviteIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Accept an invite token.
    Creates/updates profile role and family_members entry.
    """
    log_event("invite.accept.start", user_id=user["id"], token=body.token[:8])
    
    try:
        supabase = get_admin_client()
        
        # Call RPC to accept invite
        result = supabase.rpc(
            "accept_invite",
            {
                "p_token": body.token,
                "p_user_id": user["id"]
            }
        ).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="RPC call failed"
            )
        
        rpc_result = result.data
        
        if not rpc_result.get("success"):
            return AcceptInviteOut(
                success=False,
                error=rpc_result.get("error", "Failed to accept invite")
            )
        
        log_event("invite.accept.success", user_id=user["id"], family_id=rpc_result.get("family_id"), role=rpc_result.get("role"))
        
        return AcceptInviteOut(
            success=True,
            family_id=rpc_result.get("family_id"),
            role=rpc_result.get("role"),
            child_scope=rpc_result.get("child_scope")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("invite.accept.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept invite: {str(e)}"
        )


@router.post("/accept_with_password", response_model=AcceptInviteWithPasswordOut)
async def accept_invite_with_password(
    body: AcceptInviteWithPasswordIn,
    __: None = Depends(rate_limiter),
):
    """
    Accept a parent or tutor invite by creating an account with the invited email.
    No second email is sent (account is created with email_confirm=True via Admin API).
    Use the invite link's /invites/:token/accept page and set password there.
    """
    log_event("invite.accept_with_password.start", token_preview=body.token[:8], email=body.email[:10])
    try:
        supabase = get_admin_client()
        invite_res = supabase.table("invites").select("*").eq("token", body.token).single().execute()
        if not invite_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
        invite = invite_res.data

        if invite.get("role") not in ("parent", "tutor"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This endpoint is for parent or tutor invites only. Use the child invite flow for child invites."
            )
        if invite.get("accepted_at"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invite has already been accepted")
        if invite.get("expires_at"):
            expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
            if expires_at < datetime.now(expires_at.tzinfo):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invite has expired")

        invite_email = (invite.get("email") or "").strip().lower()
        body_email = (body.email or "").strip().lower()
        if invite_email != body_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email does not match the invite")

        family_id = invite.get("family_id")
        if not family_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite: missing family")

        supabase_url = os.environ.get("SUPABASE_URL")
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Missing Supabase configuration"
            )
        admin_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {"role": invite.get("role"), "family_id": family_id},
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(admin_url, headers=headers, json=payload, timeout=15.0)
                if resp.status_code not in (200, 201):
                    error_text = resp.text
                    log_event("invite.accept_with_password.http_error", status=resp.status_code, error=error_text[:200])
                    if resp.status_code == 422:
                        try:
                            err_body = resp.json()
                            msg = (err_body.get("msg") or "") if isinstance(err_body.get("msg"), str) else ""
                            if err_body.get("error_code") == "email_exists" or "already been registered" in (msg or "").lower():
                                return AcceptInviteWithPasswordOut(
                                    success=False,
                                    error="An account with this email already exists. Please sign in and accept the invite from the app."
                                )
                        except (json.JSONDecodeError, ValueError, TypeError):
                            pass
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=error_text or "Failed to create account"
                    )
                user_data = resp.json()
                user_id = user_data.get("id")
                if not user_id:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create account: no user ID returned"
                    )
        except httpx.RequestError as e:
            log_event("invite.accept_with_password.request_error", error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create account: network error. Please try again."
            )

        supabase.table("profiles").upsert({
            "id": user_id,
            "email": body.email,
            "family_id": family_id,
            "role": invite.get("role"),
        }).execute()

        rpc_result = supabase.rpc(
            "accept_invite",
            {"p_token": body.token, "p_user_id": user_id},
        ).execute()
        if not rpc_result.data:
            log_event("invite.accept_with_password.rpc_failed", user_id=user_id)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to complete invite acceptance")
        result = rpc_result.data[0] if isinstance(rpc_result.data, list) and rpc_result.data else rpc_result.data
        if not result.get("success"):
            return AcceptInviteWithPasswordOut(success=False, error=result.get("error", "Failed to accept invite"))

        log_event("invite.accept_with_password.success", user_id=user_id, role=invite.get("role"))
        return AcceptInviteWithPasswordOut(success=True)
    except HTTPException:
        raise
    except Exception as e:
        log_event("invite.accept_with_password.error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept invite: {str(e)}"
        )


@router.get("/preview/{token}")
async def preview_invite(
    token: str,
):
    """
    Preview invite details without authentication.
    Used by the invite landing page to show what the user is accepting.
    """
    try:
        supabase = get_admin_client()
        
        # Get invite details (include invited_by for inviter name)
        invite_res = supabase.table("invites").select(
            "id, family_id, email, role, child_scope, expires_at, accepted_at, invited_by"
        ).eq("token", token).single().execute()
        
        if not invite_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found"
            )
        
        invite = invite_res.data
        
        # Check if already accepted
        if invite.get("accepted_at"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This invite has already been accepted"
            )
        
        # Check if expired
        if invite.get("expires_at"):
            from datetime import datetime
            expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
            if expires_at < datetime.now(expires_at.tzinfo):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This invite has expired"
                )
        
        # Get family name
        family_name = None
        try:
            family_res = supabase.table("family").select("name").eq("id", invite["family_id"]).single().execute()
            if family_res.data:
                family_name = family_res.data.get("name")
        except Exception:
            pass
        
        # Get child names for tutors
        child_names = []
        if invite.get("child_scope") and invite["role"] == "tutor":
            try:
                children_res = supabase.table("children").select("id, first_name").in_("id", invite["child_scope"]).execute()
                child_names = [
                    {"id": c["id"], "name": c.get("first_name") or "Child"}
                    for c in (children_res.data or [])
                ]
            except Exception:
                pass
        
        # Get child name for child invites
        child_name = None
        if invite.get("role") == "child" and invite.get("child_id"):
            try:
                child_res = supabase.table("children").select("first_name").eq("id", invite["child_id"]).single().execute()
                if child_res.data:
                    child_name = child_res.data.get("first_name")
            except Exception:
                pass
        
        # Get inviter display name for landing page
        inviter_name = None
        if invite.get("invited_by"):
            try:
                inviter_res = supabase.table("profiles").select("first_name, name").eq("id", invite["invited_by"]).single().execute()
                if inviter_res.data:
                    inviter_name = inviter_res.data.get("first_name") or inviter_res.data.get("name")
            except Exception:
                pass
        
        return {
            "token": token,
            "family_name": family_name,
            "email": invite.get("email"),
            "role": invite.get("role"),
            "child_scope": invite.get("child_scope") or [],
            "child_names": child_names,
            "child_id": invite.get("child_id"),
            "child_name": child_name,
            "inviter_name": inviter_name,
            "expires_at": invite.get("expires_at")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("invite.preview.error", token=token[:8], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview invite: {str(e)}"
        )


@router.get("/list")
async def list_invites(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    List invites for the current user's family.
    Only parents can view all invites.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            return []
        
        supabase = get_admin_client()
        
        # Get user's email to show invites sent to them
        profile_res = supabase.table("profiles").select("email").eq("id", user["id"]).single().execute()
        user_email = profile_res.data.get("email") if profile_res.data else None
        
        # Get invites for this family or sent to user's email
        invites_res = supabase.table("invites").select("*").eq("family_id", family_id).order("created_at", desc=True).execute()
        
        invites = []
        for invite in invites_res.data or []:
            # Only show invites sent to current user OR if user is a parent
            if invite.get("email") == user_email:
                invites.append(invite)
            elif invite.get("invited_by") == user["id"]:
                invites.append(invite)
            else:
                # Check if user is a parent
                member_check = supabase.table("family_members").select("member_role").eq("family_id", family_id).eq("user_id", user["id"]).eq("member_role", "parent").single().execute()
                if member_check.data:
                    invites.append(invite)
        
        return invites
        
    except Exception as e:
        log_event("invite.list.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list invites: {str(e)}"
        )


"""
Child Authentication Routes
Handles child invite creation and child account registration
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import secrets
import os
import httpx

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
from email_service import send_invite_email

router = APIRouter(prefix="/api/auth/child", tags=["child-auth"])


class CreateChildInviteIn(BaseModel):
    child_id: str


class CreateChildInviteOut(BaseModel):
    invite_id: str
    token: str
    invite_url: str
    expires_at: str


class AcceptChildInviteIn(BaseModel):
    token: str
    username: str
    email: EmailStr
    password: str


class AcceptChildInviteOut(BaseModel):
    success: bool
    user_id: str
    child_id: str
    message: str


@router.post("/create_invite", response_model=CreateChildInviteOut)
async def create_child_invite(
    body: CreateChildInviteIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create an invite for a child to log in.
    Only parents can create child invites.
    """
    log_event("child_auth.create_invite.start", user_id=user["id"], child_id=body.child_id)
    
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Verify child belongs to family
        if not child_belongs_to_family(body.child_id, family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child does not belong to your family"
            )
        
        # Get child info
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).single().execute()
        if not child_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Child not found"
            )
        
        child_name = child_res.data.get("first_name", "Child")
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()
        
        # Create invite using RPC
        invite_res = supabase.rpc("create_child_invite", {
            "_family_id": family_id,
            "_child_id": body.child_id,
            "_invited_by": user["id"]
        }).execute()
        
        if not invite_res.data:
            # Fallback: create directly
            invite_res = supabase.table("invites").insert({
                "family_id": family_id,
                "email": f"{child_name.lower().replace(' ', '')}@family.local",  # Placeholder
                "role": "child",
                "child_id": body.child_id,
                "child_scope": [body.child_id],
                "token": token,
                "invited_by": user["id"],
                "expires_at": expires_at
            }).select().execute()
        
        if not invite_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create invite"
            )
        
        invite = invite_res.data[0] if isinstance(invite_res.data, list) else invite_res.data
        
        # Build invite URL
        invite_url = f"/child/invite/{invite.get('token', token)}"
        
        log_event("child_auth.create_invite.success", user_id=user["id"], invite_id=invite.get("id"))
        
        return CreateChildInviteOut(
            invite_id=str(invite.get("id", "")),
            token=invite.get("token", token),
            invite_url=invite_url,
            expires_at=invite.get("expires_at", expires_at)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("child_auth.create_invite.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create child invite: {str(e)}"
        )


@router.post("/accept_invite", response_model=AcceptChildInviteOut)
async def accept_child_invite(
    body: AcceptChildInviteIn,
    __: None = Depends(rate_limiter),
):
    """
    Accept a child invite and create child account.
    This creates a Supabase auth user with role='child' and links to family_members.
    """
    log_event("child_auth.accept_invite.start", token_preview=body.token[:8])
    
    try:
        supabase = get_admin_client()
        
        # Find invite
        invite_res = supabase.table("invites").select("*").eq("token", body.token).eq("role", "child").single().execute()
        
        if not invite_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found"
            )
        
        invite = invite_res.data
        
        # Check expiration
        if invite.get("expires_at"):
            expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
            if expires_at < datetime.now(expires_at.tzinfo):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invite has expired"
                )
        
        # Check if already accepted
        if invite.get("accepted_at"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invite has already been accepted"
            )
        
        family_id = invite.get("family_id")
        child_id = invite.get("child_id") or (
            invite.get("child_scope") and len(invite["child_scope"]) and invite["child_scope"][0]
        )
        
        if not child_id or not family_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid invite: missing child_id or family_id"
            )
        
        # Create Supabase auth user using Admin API via HTTP
        # The Python Supabase client doesn't expose auth.admin, so we use REST API directly
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
            "Content-Type": "application/json"
        }
        
        payload = {
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {
                "role": "child",
                "child_id": child_id,
                "family_id": family_id,
                "username": body.username
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(admin_url, headers=headers, json=payload, timeout=10.0)
                if resp.status_code not in [200, 201]:
                    error_text = resp.text
                    log_event("child_auth.accept_invite.http_error", status=resp.status_code, error=error_text)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to create user: {error_text}"
                    )
                user_data = resp.json()
                user_id = user_data.get("id")
                
                if not user_id:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create user account: no user ID returned"
                    )
        except httpx.RequestError as e:
            log_event("child_auth.accept_invite.request_error", error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user account: network error"
            )
        except Exception as auth_error:
            log_event("child_auth.accept_invite.auth_create_failed", error=str(auth_error))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user account: {str(auth_error)}"
            )
        
        # Link user to family_members with child role
        # Set both child_id (explicit link) and child_scope (for get_accessible_children function)
        member_res = supabase.table("family_members").insert({
            "family_id": family_id,
            "user_id": user_id,
            "member_role": "child",
            "child_id": child_id,  # Explicit link to child record
            "child_scope": [child_id]  # Array for get_accessible_children function
        }).execute()
        
        # Update profile if exists
        supabase.table("profiles").upsert({
            "id": user_id,
            "email": body.email,
            "family_id": family_id,
            "role": "child"
        }).execute()
        
        # Mark invite as accepted
        supabase.table("invites").update({
            "accepted_at": datetime.now().isoformat(),
            "email": body.email  # Update with actual email
        }).eq("id", invite["id"]).execute()
        
        log_event("child_auth.accept_invite.success", user_id=user_id, child_id=child_id)
        
        return AcceptChildInviteOut(
            success=True,
            user_id=user_id,
            child_id=child_id,
            message="Child account created successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("child_auth.accept_invite.error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept invite: {str(e)}"
        )


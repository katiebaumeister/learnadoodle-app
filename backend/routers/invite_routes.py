"""
FastAPI routes for family invites
Part of Phase 6 - Parent/Child/Tutor Ecosystem + Integrations
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
import sys
from pathlib import Path
import secrets
import string

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
        
        # Get invite details
        invite_res = supabase.table("invites").select(
            "id, family_id, email, role, child_scope, expires_at, accepted_at"
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
        
        return {
            "token": token,
            "family_name": family_name,
            "email": invite.get("email"),
            "role": invite.get("role"),
            "child_scope": invite.get("child_scope") or [],
            "child_names": child_names,
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


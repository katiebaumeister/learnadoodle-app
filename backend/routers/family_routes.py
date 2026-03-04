"""
Family management routes for Settings modal
- GET /api/family/members - Get family members and children
- POST /api/family/invite - Invite a tutor (or other member)
- PATCH /api/family/tutors/{member_id} - Update tutor's child_scope
"""
import os
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
from email_service import send_invite_email

router = APIRouter(prefix="/api/family", tags=["family"])

# --- Pydantic Models ---

class ChildOut(BaseModel):
    id: str
    name: str
    first_name: Optional[str] = None
    grade: Optional[str] = None
    grade_level: Optional[str] = None
    archived: Optional[bool] = False

class MemberOut(BaseModel):
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: str
    member_role: Optional[str] = None
    child_scope: List[str] = Field(default_factory=list)

class FamilyMembersOut(BaseModel):
    id: Optional[str] = None
    family_name: Optional[str] = None
    onboarding_completed: Optional[bool] = False  # stored flag (convenience only)
    onboarding_is_valid: Optional[bool] = False  # derived: default_planning_mode + has_children + has_subjects
    default_planning_mode: Optional[str] = None  # HOMESCHOOL_COMPLIANCE | AFTERSCHOOL_GOALS | NONE
    children: List[ChildOut] = Field(default_factory=list)
    members: List[MemberOut] = Field(default_factory=list)

class InviteTutorIn(BaseModel):
    email: EmailStr = Field(..., description="Email of the member to invite")
    role: str = Field("tutor", description="Role: 'tutor', 'child', or 'parent'")
    child_ids: List[str] = Field(default_factory=list, description="List of child IDs (required for tutors, single ID for children, empty for parents)")

class InviteTutorOut(BaseModel):
    invite_code: str
    invite_url: str

class UpdateTutorScopeIn(BaseModel):
    child_ids: List[str] = Field(..., description="List of child IDs the tutor can see")

class UpdateFamilyIn(BaseModel):
    family_name: Optional[str] = Field(None, description="Family display name (e.g. 'Doodle Family')")

# --- Routes ---

@router.get("/members", response_model=FamilyMembersOut)
async def get_family_members(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get family members and children for the current user's family.
    Returns family name, children list, and all members (parents, tutors, children).
    Resilient: never returns 500; returns empty data if a table is missing or query fails.
    """
    log_event("family.get_members.start", user_id=user["id"])

    try:
        try:
            family_id = get_family_id_for_user(user["id"])
        except Exception as e:
            log_event("family.get_members.get_family_id_error", user_id=user["id"], error=str(e))
            family_id = None

        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )

        supabase = get_admin_client()
        family_name = None
        children = []
        members = []

        # Get family row (name, onboarding_completed, default_planning_mode)
        onboarding_completed = False
        default_planning_mode = None
        try:
            family_res = supabase.table("family").select("*").eq("id", family_id).maybe_single().execute()
            if family_res.data:
                family_name = family_res.data.get("family_name") or family_res.data.get("name")
                # Prefer onboarding_completed; fallback to legacy has_completed_onboarding
                onboarding_completed = family_res.data.get("onboarding_completed")
                if onboarding_completed is None and family_res.data.get("has_completed_onboarding") is True:
                    onboarding_completed = True
                default_planning_mode = family_res.data.get("default_planning_mode")
        except Exception as e:
            log_event("family.get_members.family_table_error", user_id=user["id"], error=str(e))

        # Get children
        try:
            children_res = supabase.table("children").select("id, first_name, grade, grade_level, archived").eq("family_id", family_id).execute()
            for child in (children_res.data or []):
                first_name = child.get("first_name") or "Child"
                grade = child.get("grade") or child.get("grade_level")
                archived = child.get("archived") is True
                children.append(ChildOut(
                    id=child["id"],
                    name=first_name,
                    first_name=first_name,
                    grade=grade,
                    grade_level=child.get("grade_level"),
                    archived=archived
                ))
        except Exception as e:
            log_event("family.get_members.children_table_error", user_id=user["id"], error=str(e))

        # Derived onboarding validity (avoids stale onboarding_completed)
        has_children = len(children) > 0
        has_subjects = False
        try:
            subj_res = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
            has_subjects = bool(subj_res.data and len(subj_res.data) > 0)
        except Exception as e:
            log_event("family.get_members.subjects_check_error", user_id=user["id"], error=str(e))
        onboarding_is_valid = bool(
            default_planning_mode is not None
            and default_planning_mode != ""
            and has_children
            and has_subjects
        )

        # Get family members - table may not exist or RLS/migration not applied
        members_data = []
        try:
            members_res = supabase.table("family_members").select(
                "id, user_id, member_role, child_scope"
            ).eq("family_id", family_id).execute()
            members_data = list(members_res.data or [])
        except Exception as e:
            log_event("family.get_members.family_members_table_error", user_id=user["id"], error=str(e))

        # Batch fetch profile emails
        user_ids = [m.get("user_id") for m in members_data if m.get("user_id")]
        profiles_map = {}
        if user_ids:
            try:
                profiles_res = supabase.table("profiles").select("id, email").in_("id", user_ids).execute()
                for profile in (profiles_res.data or []):
                    profiles_map[profile["id"]] = profile.get("email")
            except Exception as e:
                log_event("family.get_members.profiles_table_error", user_id=user["id"], error=str(e))

        for member in members_data:
            mid = member.get("id")
            if not mid:
                continue
            email = profiles_map.get(member.get("user_id")) if member.get("user_id") else None
            name = email or None
            members.append(MemberOut(
                id=mid,
                name=name,
                email=email,
                role=member.get("member_role", "parent"),
                member_role=member.get("member_role"),
                child_scope=member.get("child_scope", []) or []
            ))

        log_event("family.get_members.success", user_id=user["id"], family_id=family_id, members_count=len(members))

        return FamilyMembersOut(
            id=family_id,
            family_name=family_name,
            onboarding_completed=onboarding_completed,
            onboarding_is_valid=onboarding_is_valid,
            default_planning_mode=default_planning_mode,
            children=children,
            members=members
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("family.get_members.unexpected_error", user_id=user["id"], error=str(e))
        # Never return 500: return 200 with empty/safe data so UI can still load
        return FamilyMembersOut(
            id=family_id,
            family_name=None,
            onboarding_completed=False,
            onboarding_is_valid=False,
            default_planning_mode=None,
            children=[],
            members=[]
        )


@router.patch("", response_model=dict)
async def update_family(
    body: UpdateFamilyIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Update family details (e.g. family name). Uses service role so it is not blocked by RLS.
    Verifies the user belongs to the family before updating.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    if body.family_name is None:
        return {"success": True, "family_id": family_id}

    supabase = get_admin_client()
    try:
        value = body.family_name.strip() if body.family_name else None
        update_payload = {"family_name": value}
        resp = supabase.table("family").update(update_payload).eq("id", family_id).execute()
        if not resp.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family record not found")
        log_event("family.update.success", user_id=user["id"], family_id=family_id)
        return {"success": True, "family_id": family_id, "family_name": value}
    except HTTPException:
        raise
    except Exception as e:
        log_event("family.update.error", user_id=user["id"], family_id=family_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save family name: {str(e)}",
        )


@router.post("/reset_data")
async def reset_family_data(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Delete all family-scoped data (events, children, subjects, materials, plans, etc.)
    and reset onboarding so the onboarding flow can be re-run. For testing only.
    Keeps the family and family_members; removes calendar/children/subjects/events.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
    supabase = get_admin_client()

    def _delete(table: str, column: str, value: str):
        try:
            supabase.table(table).delete().eq(column, value).execute()
        except Exception as e:
            log_event("family.reset_data.delete_error", table=table, error=str(e))

    def _delete_in(table: str, column: str, values: list):
        if not values:
            return
        try:
            supabase.table(table).delete().in_(column, values).execute()
        except Exception as e:
            log_event("family.reset_data.delete_in_error", table=table, error=str(e))

    # Get IDs before deleting parents
    try:
        ay_res = supabase.table("academic_years").select("id").eq("family_id", family_id).execute()
        ay_ids = [r["id"] for r in (ay_res.data or [])]
    except Exception:
        ay_ids = []
    try:
        child_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
        child_ids = [r["id"] for r in (child_res.data or [])]
    except Exception:
        child_ids = []
    try:
        subj_res = supabase.table("subject").select("id").eq("family_id", family_id).execute()
        subject_ids = [r["id"] for r in (subj_res.data or [])]
    except Exception:
        subject_ids = []

    # Delete in dependency order
    _delete("events", "family_id", family_id)
    _delete("academic_year_plan", "family_id", family_id)
    for ay_id in ay_ids:
        _delete("academic_year_holiday_settings", "academic_year_id", ay_id)
    _delete("academic_years", "family_id", family_id)
    _delete_in("child_support_profiles", "child_id", child_ids)
    _delete("children", "family_id", family_id)
    _delete("subject_track", "family_id", family_id)
    if subject_ids:
        _delete_in("materials", "subject_id", subject_ids)
    _delete("subject", "family_id", family_id)
    try:
        supabase.table("calendar_days").delete().eq("family_id", family_id).execute()
    except Exception:
        pass
    try:
        supabase.table("family_teaching_days").delete().eq("family_id", family_id).execute()
    except Exception:
        pass
    try:
        supabase.table("family_years").delete().eq("family_id", family_id).execute()
    except Exception:
        pass

    # Reset onboarding so modal shows again
    supabase.table("family").update({
        "onboarding_completed": False,
        "default_planning_mode": None,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", family_id).execute()

    log_event("family.reset_data.success", user_id=user["id"], family_id=family_id)
    return {"success": True, "message": "Family data reset. Refresh the page to see the onboarding flow."}


@router.post("/invite", response_model=InviteTutorOut)
async def invite_tutor(
    body: InviteTutorIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Invite a member (tutor, child, or parent) to the family.
    - Tutors: require child_ids specifying which children they can see
    - Children: require exactly one child_id (the child record being invited)
    - Parents: child_ids can be empty
    Only parents can create invites.
    """
    log_event("family.invite_tutor.start", user_id=user["id"], email=body.email, child_ids=body.child_ids)

    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )

        supabase = get_admin_client()

        # Verify current user is a parent
        # Use maybe_single() instead of single() to handle case where user doesn't have a family_members row yet
        current_member_res = supabase.table("family_members").select("member_role").eq("user_id", user["id"]).eq("family_id", family_id).maybe_single().execute()
        is_parent = False
        
        # Check family_members first
        if current_member_res and current_member_res.data and current_member_res.data.get("member_role") == 'parent':
            is_parent = True
        else:
            # Fallback: check profiles.role
            profile_res = supabase.table("profiles").select("role").eq("id", user["id"]).maybe_single().execute()
            if profile_res and profile_res.data and profile_res.data.get("role") == 'parent':
                is_parent = True
        
        if not is_parent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can invite members"
            )

        # Validate child_ids belong to family
        # For tutors: require at least one child
        # For children: require exactly one child (the child being invited)
        # For parents: child_ids can be empty
        if body.role == "tutor":
            if not body.child_ids or len(body.child_ids) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tutors must have access to at least one child"
                )
            for child_id in body.child_ids:
                if not child_belongs_to_family(child_id, family_id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Child ID {child_id} does not belong to your family"
                    )
        elif body.role == "child":
            if not body.child_ids or len(body.child_ids) != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Child invites must specify exactly one child record"
                )
            child_id = body.child_ids[0]
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Child ID {child_id} does not belong to your family"
                )

        # Use existing invite system
        import secrets
        from datetime import timedelta
        
        log_event("family.invite_tutor.before_token_gen", user_id=user["id"])
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()
        log_event("family.invite_tutor.after_token_gen", user_id=user["id"], token_preview=token[:8])

        # Create invite
        # Use RPC to bypass PostgREST RLS issues
        invite = None
        
        # Log that we're starting
        log_event("family.invite_tutor.starting", user_id=user["id"], method="rpc_first")
        
        # Ensure we're using the admin client (service_role) to bypass RLS
        log_event("family.invite_tutor.before_get_admin_client", user_id=user["id"])
        supabase = get_admin_client()
        log_event("family.invite_tutor.after_get_admin_client", user_id=user["id"])
        
        log_event("family.invite_tutor.before_try_block", user_id=user["id"])
        try:
            log_event("family.invite_tutor.inside_try_block", user_id=user["id"])
            # Call an RPC function that will insert the invite using SECURITY DEFINER
            # This bypasses RLS entirely
            log_event("family.invite_tutor.rpc_attempt", 
                     user_id=user["id"], 
                     rpc_function="create_family_invite",
                     family_id=family_id,
                     email=body.email[:10] if body.email else None)
            
            # Wrap the RPC call in try/except to catch PostgREST exceptions
            # PostgREST may raise APIError or other exceptions
            try:
                log_event("family.invite_tutor.about_to_call_rpc", user_id=user["id"])
                rpc_result = supabase.rpc(
                    "create_family_invite",
                    {
                        "p_family_id": family_id,
                        "p_email": body.email,
                        "p_token": token,
                        "p_role": body.role,
                        "p_child_scope": body.child_ids or [],
                        "p_expires_at": expires_at,
                        "p_invited_by": user["id"],
                    }
                ).execute()
                
                log_event("family.invite_tutor.rpc_execute_success", user_id=user["id"], has_data=bool(rpc_result.data))
            except BaseException as rpc_exec_error:  # Catch ALL exceptions including APIError
                # Log the RPC execution error specifically
                error_str = str(rpc_exec_error)
                error_type = type(rpc_exec_error).__name__
                error_repr = repr(rpc_exec_error)
                
                log_event("family.invite_tutor.rpc_exec_exception",
                         user_id=user["id"],
                         error=error_str,
                         error_type=error_type,
                         error_repr=error_repr[:500])
                
                # Check if it's a "function doesn't exist" error
                if "function" in error_str.lower() and ("does not exist" in error_str.lower() or "not found" in error_str.lower()):
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create invite: RPC function 'create_family_invite' does not exist. Please run create_family_invite_rpc.sql migration."
                    )
                
                # Check for PGRST116 error (0 rows returned)
                if "PGRST116" in error_str or "0 rows" in error_str.lower():
                    log_event("family.invite_tutor.rpc_pgrst116_error", 
                             user_id=user["id"],
                             error=error_str,
                             error_repr=error_repr[:500])
                    # Don't raise here - fall through to direct insert fallback
                    # PostgREST may have issues with jsonb-returning functions
                    log_event("family.invite_tutor.falling_back_to_direct_insert", user_id=user["id"])
                    raise Exception("PGRST116 - falling back to direct insert")  # This will trigger fallback
                
                # For other RPC errors, fall through to fallback
                raise  # Re-raise to be caught by outer handler
            
            # Check for errors in the response
            if hasattr(rpc_result, 'error') and rpc_result.error:
                error_msg = str(rpc_result.error)
                log_event("family.invite_tutor.rpc_error_attr", user_id=user["id"], error=error_msg)
                raise Exception(f"RPC error: {error_msg}")
            
            # Log detailed response info
            log_event("family.invite_tutor.rpc_response", 
                     user_id=user["id"],
                     has_data=bool(rpc_result.data),
                     data_type=str(type(rpc_result.data)) if rpc_result.data else None,
                     data_content=str(rpc_result.data)[:200] if rpc_result.data else None,
                     has_error=hasattr(rpc_result, 'error'),
                     error_value=str(rpc_result.error) if hasattr(rpc_result, 'error') and rpc_result.error else None)
            
            # Handle RPC response - it should return a JSONB object
            # PostgREST may wrap jsonb returns in an array or return as a single value
            if rpc_result.data is None:
                log_event("family.invite_tutor.rpc_data_is_none", user_id=user["id"])
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="RPC function returned no data. This may indicate the function failed or doesn't exist."
                )
            
            # PostgREST may return jsonb as an array with one element, or as a single dict
            raw_data = rpc_result.data
            if isinstance(raw_data, list) and len(raw_data) > 0:
                # PostgREST wrapped it in an array - extract the first element
                raw_data = raw_data[0]
                log_event("family.invite_tutor.rpc_data_was_array", user_id=user["id"], array_len=len(rpc_result.data))
            
            if raw_data:
                # RPC returns jsonb, which might be parsed as dict or string
                if isinstance(raw_data, dict):
                    rpc_data = raw_data
                elif isinstance(raw_data, str):
                    import json
                    try:
                        rpc_data = json.loads(raw_data)
                    except:
                        rpc_data = {"raw": raw_data}
                else:
                    # Try to convert to dict
                    rpc_data = dict(raw_data) if hasattr(raw_data, '__dict__') else {"raw": str(raw_data)}
                
                if rpc_data.get("success"):
                    invite_id = rpc_data.get("invite_id")
                    log_event("family.invite_tutor.rpc_success", user_id=user["id"], invite_id=invite_id)
                    invite = {"id": invite_id, "token": token}
                else:
                    error_msg = rpc_data.get("error", "Unknown error")
                    log_event("family.invite_tutor.rpc_error_response", user_id=user["id"], error=error_msg)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to create invite: {error_msg}"
                    )
            else:
                log_event("family.invite_tutor.rpc_no_data", user_id=user["id"])
                raise Exception("RPC returned no data")
        except HTTPException:
            raise
        except Exception as rpc_error:
            # Fallback to direct insert if RPC doesn't exist or fails
            error_str = str(rpc_error)
            error_type = type(rpc_error).__name__
            log_event("family.invite_tutor.rpc_fallback", 
                     user_id=user["id"], 
                     error=error_str,
                     error_type=error_type,
                     rpc_function="create_family_invite")
            
            # If RPC function doesn't exist, provide helpful error message
            if "function" in error_str.lower() and ("does not exist" in error_str.lower() or "not found" in error_str.lower()):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create invite: RPC function 'create_family_invite' does not exist. Please run create_family_invite_rpc.sql migration."
                )
            
            # Try direct insert as fallback
            log_event("family.invite_tutor.direct_insert_fallback", user_id=user["id"])
            try:
                invite_res = supabase.table("invites").insert({
                    "family_id": family_id,
                    "email": body.email,
                    "token": token,
                    "role": body.role,
                    "child_scope": body.child_ids or [],
                    "expires_at": expires_at,
                    "invited_by": user["id"],
                }).execute()
                
                log_event("family.invite_tutor.direct_insert_response",
                         user_id=user["id"],
                         has_data=bool(invite_res.data),
                         data_len=len(invite_res.data) if invite_res.data else 0)
                
                if invite_res.data and len(invite_res.data) > 0:
                    invite = invite_res.data[0]
                else:
                    # Try to fetch by token
                    log_event("family.invite_tutor.fetch_by_token_fallback", user_id=user["id"], token=token[:8])
                    fetch_res = supabase.table("invites").select("id, token").eq("token", token).limit(1).execute()
                    if fetch_res.data and len(fetch_res.data) > 0:
                        invite = fetch_res.data[0]
                        log_event("family.invite_tutor.fetch_success", user_id=user["id"], invite_id=invite.get("id"))
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to create invite: Insert was blocked by RLS. Please run create_family_invite_rpc.sql migration to create the RPC function."
                        )
            except HTTPException:
                raise
            except Exception as insert_error:
                error_str_insert = str(insert_error)
                log_event("family.invite_tutor.insert_fallback_error", 
                         user_id=user["id"], 
                         error=error_str_insert,
                         error_type=type(insert_error).__name__)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create invite: {error_str_insert}. Please run create_family_invite_rpc.sql migration."
                )
        
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create invite: No invite was created"
            )

        # Generate invite URLs: copy link = landing page; email button = create-password page (for child) or same (for others)
        invite_landing_base = os.environ.get("INVITE_LANDING_URL", "https://learnadoodle.com")
        invite_url = f"{invite_landing_base}/invites/{token}"
        accept_url = f"{invite_landing_base}/invites/{token}/accept"

        # Get inviter's name for email
        inviter_name = None
        try:
            inviter_profile = supabase.table("profiles").select("first_name, name").eq("id", user["id"]).single().execute()
            if inviter_profile.data:
                inviter_name = inviter_profile.data.get("first_name") or inviter_profile.data.get("name")
        except:
            pass

        # Get child name if this is a child invite
        child_name = None
        if body.role == "child" and body.child_ids and len(body.child_ids) > 0:
            try:
                child_res = supabase.table("children").select("first_name, name").eq("id", body.child_ids[0]).single().execute()
                if child_res.data:
                    child_name = child_res.data.get("first_name") or child_res.data.get("name")
            except:
                pass

        # Send invite email via Postmark (button = accept_url, copy-paste link = invite_url)
        email_sent = send_invite_email(
            to_email=body.email,
            invite_url=invite_url,
            role=body.role,
            inviter_name=inviter_name,
            child_name=child_name,
            accept_url=accept_url,
        )

        log_event(
            "family.invite_tutor.success",
            user_id=user["id"],
            invite_id=invite.get("id"),
            email_sent=email_sent,
        )

        return InviteTutorOut(
            invite_code=token,
            invite_url=invite_url
        )

    except HTTPException:
        log_event("family.invite_tutor.http_exception", user_id=user["id"])
        raise
    except BaseException as e:  # Catch ALL exceptions including APIError
        error_str = str(e)
        error_type = type(e).__name__
        import traceback
        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__)) if hasattr(e, '__traceback__') else None
        
        log_event("family.invite_tutor.error", 
                 user_id=user["id"], 
                 error=error_str,
                 error_type=error_type,
                 error_repr=repr(e)[:500],
                 traceback=tb_str[:1000] if tb_str else None)
        
        # Provide more helpful error message
        if "PGRST116" in error_str or "0 rows" in error_str.lower():
            detail_msg = "Failed to create invite: Insert was blocked by RLS. The RPC function may not exist or may have failed. Please verify create_family_invite_rpc.sql was run successfully."
        elif "function" in error_str.lower() and "does not exist" in error_str.lower():
            detail_msg = "Failed to create invite: RPC function 'create_family_invite' does not exist. Please run create_family_invite_rpc.sql migration."
        else:
            detail_msg = f"Failed to invite tutor: {error_str}"
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail_msg
        )

@router.patch("/tutors/{member_id}", response_model=MemberOut)
async def update_tutor_scope(
    member_id: str,
    body: UpdateTutorScopeIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Update a tutor's child_scope (which children they can see).
    Only parents can update tutor access.
    """
    log_event("family.update_tutor_scope.start", user_id=user["id"], member_id=member_id, child_ids=body.child_ids)

    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )

        supabase = get_admin_client()

        # Verify current user is a parent (family_members or profiles fallback)
        is_parent = False
        try:
            current_member_res = supabase.table("family_members").select("member_role").eq("user_id", user["id"]).eq("family_id", family_id).maybe_single().execute()
            if current_member_res.data and current_member_res.data.get("member_role") == 'parent':
                is_parent = True
        except Exception:
            pass
        if not is_parent:
            try:
                profile_res = supabase.table("profiles").select("role").eq("id", user["id"]).maybe_single().execute()
                if profile_res.data and profile_res.data.get("role") == 'parent':
                    is_parent = True
            except Exception:
                pass
        if not is_parent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can update tutor access"
            )

        # Verify member exists and is a tutor in this family
        try:
            member_res = supabase.table("family_members").select("*").eq("id", member_id).eq("family_id", family_id).maybe_single().execute()
        except Exception as e:
            log_event("family.update_tutor_scope.family_members_error", user_id=user["id"], error=str(e))
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tutor member not found"
            )
        if not member_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tutor member not found"
            )
        
        if member_res.data.get("member_role") != 'tutor':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member is not a tutor"
            )

        # Validate child_ids belong to family
        for child_id in body.child_ids:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Child ID {child_id} does not belong to your family"
                )

        # Update child_scope
        update_res = supabase.table("family_members").update({
            "child_scope": body.child_ids,
            "updated_at": datetime.now().isoformat()
        }).eq("id", member_id).select("*").single().execute()

        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update tutor scope"
            )

        # Get profile email for response
        profile_res = supabase.table("profiles").select("email").eq("id", update_res.data["user_id"]).single().execute()
        email = profile_res.data.get("email") if profile_res.data else None

        log_event("family.update_tutor_scope.success", user_id=user["id"], member_id=member_id)

        return MemberOut(
            id=update_res.data["id"],
            name=email,
            email=email,
            role="tutor",
            member_role="tutor",
            child_scope=update_res.data.get("child_scope", []) or []
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("family.update_tutor_scope.error", user_id=user["id"], member_id=member_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update tutor scope: {str(e)}"
        )


"""
FastAPI routes for calendar integrations and quota monitoring
Part of Phase 6 - Parent/Child/Tutor Ecosystem + Integrations
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import sys
from pathlib import Path
import os
import requests
import io

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

# YouTube API constants
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")
YOUTUBE_QUOTA_LIMIT = 10000  # Daily quota limit for YouTube Data API v3


# ============================================================
# Request/Response Models
# ============================================================

class YouTubeQuotaOut(BaseModel):
    provider: str = "youtube"
    usage_today: int = 0
    quota_limit: int = YOUTUBE_QUOTA_LIMIT
    usage_percent: float = 0.0
    reset_time: Optional[str] = None  # When quota resets (typically midnight)


class IntegrationStatusOut(BaseModel):
    provider: str
    connected: bool
    account_email: Optional[str] = None
    ics_url: Optional[str] = None
    quota_info: Optional[Dict[str, Any]] = None


# ============================================================
# Helper Functions
# ============================================================

def _check_parent_role(user_id: str, family_id: str, supabase) -> bool:
    """Check if user is a parent in the family"""
    try:
        # Check family_members first
        member_check = supabase.table("family_members").select("member_role").eq("family_id", family_id).eq("user_id", user_id).eq("member_role", "parent").single().execute()
        if member_check.data:
            return True
    except Exception:
        # If family_members query fails, fall through to profiles check
        pass
    
    # Fallback: check profiles.role
    try:
        profile_check = supabase.table("profiles").select("role, family_id").eq("id", user_id).single().execute()
        if profile_check.data:
            profile_family_id = profile_check.data.get("family_id")
            role = profile_check.data.get("role")
            # Check if profile's family_id matches and role is parent (or null, which defaults to parent)
            if profile_family_id == family_id:
                return role == "parent" or role is None  # Default to parent if role is null
    except Exception:
        pass
    
    # Final fallback: if user has children in this family, assume they're a parent
    try:
        children_check = supabase.table("children").select("id").eq("family_id", family_id).limit(1).execute()
        if children_check.data:
            return True  # Permissive: if they can see children, allow access
    except Exception:
        pass
    
    return False


def _generate_ics_content(events: List[Dict[str, Any]], title: str = "Learnadoodle Calendar") -> str:
    """Generate ICS file content from events"""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Learnadoodle//Calendar//EN",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{title}",
        "METHOD:PUBLISH",
    ]
    
    for event in events:
        start_dt = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(event.get("end_ts", event["start_ts"]).replace("Z", "+00:00"))
        
        # Format for ICS (YYYYMMDDTHHMMSSZ)
        dtstart = start_dt.strftime("%Y%m%dT%H%M%SZ")
        dtend = end_dt.strftime("%Y%m%dT%H%M%SZ")
        
        # Escape special characters in description
        description = event.get("description", "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
        title_text = event.get("title", "Event").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
        
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{event['id']}@learnadoodle.com",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{title_text}",
            f"DESCRIPTION:{description}",
            f"STATUS:{'CONFIRMED' if event.get('status') == 'done' else 'TENTATIVE'}",
            "END:VEVENT",
        ])
    
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


# ============================================================
# Routes
# ============================================================

@router.get("/status")
async def get_integration_status(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get integration status for the user's family.
    Only accessible to parents.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Verify user is a parent
        if not _check_parent_role(user["id"], family_id, supabase):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can view integrations"
            )
        
        # Get calendar integrations
        integrations = {}
        try:
            integrations_res = supabase.table("calendar_integrations").select("*").eq("family_id", family_id).execute()
            integrations = {i["provider"]: i for i in (integrations_res.data or [])}
        except Exception as e:
            log_event("integrations.status.calendar_integrations_query_failed", user_id=user["id"], error=str(e))
            # Continue with empty integrations dict
        
        # Get Google Calendar status (from google_calendar_credentials if exists)
        google_email = None
        try:
            google_cred_res = supabase.table("google_calendar_credentials").select("account_email").eq("family_id", family_id).limit(1).execute()
            if google_cred_res.data and len(google_cred_res.data) > 0:
                google_email = google_cred_res.data[0].get("account_email")
        except Exception as e:
            log_event("integrations.status.google_credentials_query_failed", user_id=user["id"], error=str(e))
            # Continue without google_email
        
        statuses = []
        
        # Google Calendar
        google_integration = integrations.get("google")
        google_connected = bool(google_email) or bool(google_integration and google_integration.get("access_token"))
        statuses.append(IntegrationStatusOut(
            provider="google",
            connected=google_connected,
            account_email=google_email or (google_integration and google_integration.get("account_email")),
            ics_url=None,
            quota_info=None
        ))
        
        # Apple Calendar (ICS)
        apple_integration = integrations.get("apple")
        statuses.append(IntegrationStatusOut(
            provider="apple",
            connected=bool(apple_integration),
            account_email=None,
            ics_url=apple_integration.get("ics_url") if apple_integration else None,
            quota_info=None
        ))
        
        # YouTube quota (always available)
        quota_info = None
        try:
            if YOUTUBE_API_KEY:
                # Calculate reset time (midnight PST/PDT)
                now = datetime.now()
                reset_time = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
                quota_info = {
                    "usage_today": 0,  # Would need to track this separately
                    "quota_limit": YOUTUBE_QUOTA_LIMIT,
                    "usage_percent": 0.0,
                    "reset_time": reset_time.isoformat()
                }
        except Exception as e:
            log_event("integrations.status.youtube_quota_failed", user_id=user["id"], error=str(e))
            # Continue without quota info
        
        statuses.append(IntegrationStatusOut(
            provider="youtube",
            connected=bool(YOUTUBE_API_KEY),  # Always "connected" if API key exists
            account_email=None,
            ics_url=None,
            quota_info=quota_info
        ))
        
        return statuses
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("integrations.status.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch integration status: {str(e)}"
        )


@router.get("/youtube/quota", response_model=YouTubeQuotaOut)
async def get_youtube_quota_info(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get YouTube Data API quota usage.
    Accessible to parents only.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Verify user is a parent
        if not _check_parent_role(user["id"], family_id, supabase):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can view quota information"
            )
        
        if not YOUTUBE_API_KEY:
            return YouTubeQuotaOut(
                provider="youtube",
                usage_today=0,
                quota_limit=YOUTUBE_QUOTA_LIMIT,
                usage_percent=0.0,
                reset_time=None
            )
        
        # Note: YouTube API doesn't provide a direct quota endpoint
        # We would need to track usage ourselves or use Google Cloud Console API
        # For now, return the quota limit and note that we can't track actual usage
        # In production, you'd want to track API calls in a separate table
        
        # Calculate reset time (midnight PST/PDT)
        now = datetime.now()
        reset_time = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        
        return YouTubeQuotaOut(
            provider="youtube",
            usage_today=0,  # Would need to track this separately
            quota_limit=YOUTUBE_QUOTA_LIMIT,
            usage_percent=0.0,
            reset_time=reset_time.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("integrations.youtube.quota.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch YouTube quota: {str(e)}"
        )


@router.get("/ics/family/{family_id}.ics")
async def get_family_ics(
    family_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate ICS file for all events in a family.
    Only accessible to family members.
    """
    try:
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        
        supabase = get_admin_client()
        
        # Get family name
        family_res = supabase.table("family").select("name").eq("id", family_id).single().execute()
        family_name = family_res.data.get("name", "Family") if family_res.data else "Family"
        
        # Get all future events for the family
        now = datetime.now().isoformat()
        events_res = supabase.table("events").select("id, title, description, start_ts, end_ts, status").eq("family_id", family_id).gte("start_ts", now).order("start_ts").execute()
        
        events = events_res.data or []
        
        # Generate ICS content
        ics_content = _generate_ics_content(events, f"{family_name} Calendar")
        
        return Response(
            content=ics_content,
            media_type="text/calendar",
            headers={
                "Content-Disposition": f'attachment; filename="learnadoodle-family-{family_id}.ics"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("integrations.ics.family.error", family_id=family_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate ICS file: {str(e)}"
        )


@router.get("/ics/child/{child_id}.ics")
async def get_child_ics(
    child_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate ICS file for all events for a specific child.
    Only accessible to users who can access that child.
    """
    try:
        supabase = get_admin_client()
        
        # Get child info
        child_res = supabase.table("children").select("id, first_name, family_id").eq("id", child_id).single().execute()
        if not child_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Child not found"
            )
        
        child = child_res.data
        family_id = child["family_id"]
        
        # Verify user has access to this child
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        
        # Check if user can access this specific child (using get_accessible_children RPC)
        try:
            accessible_res = supabase.rpc(
                "get_accessible_children",
                {"_user_id": user["id"]}
            ).execute()
            
            if accessible_res.data:
                accessible_child_ids = [c.get("child_id") for c in accessible_res.data if c.get("child_id")]
                if child_id not in accessible_child_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied to this child"
                    )
        except Exception as rpc_error:
            # Fallback: if RPC doesn't exist, allow if family_id matches
            log_event("integrations.ics.child.rpc_fallback", child_id=child_id, error=str(rpc_error))
            pass
        
        # Get all future events for the child
        now = datetime.now().isoformat()
        events_res = supabase.table("events").select("id, title, description, start_ts, end_ts, status").eq("child_id", child_id).gte("start_ts", now).order("start_ts").execute()
        
        events = events_res.data or []
        
        # Generate ICS content
        child_name = child.get("first_name") or child.get("name", "Child")
        ics_content = _generate_ics_content(events, f"{child_name} Calendar")
        
        return Response(
            content=ics_content,
            media_type="text/calendar",
            headers={
                "Content-Disposition": f'attachment; filename="learnadoodle-child-{child_id}.ics"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("integrations.ics.child.error", child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate ICS file: {str(e)}"
        )


@router.post("/apple/generate_ics_url")
async def generate_apple_ics_url(
    child_id: Optional[str] = Query(None, description="Generate ICS URL for specific child (optional, default: family)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate ICS subscription URL for Apple Calendar.
    Only accessible to parents.
    Returns the ICS URL that can be subscribed to in Apple Calendar.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Verify user is a parent
        if not _check_parent_role(user["id"], family_id, supabase):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can generate ICS URLs"
            )
        
        # Determine the ICS URL based on whether it's for a child or family
        base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
        if child_id:
            ics_url = f"{base_url}/api/integrations/ics/child/{child_id}.ics"
        else:
            ics_url = f"{base_url}/api/integrations/ics/family/{family_id}.ics"
        
        # Store in calendar_integrations
        supabase.table("calendar_integrations").upsert({
            "family_id": family_id,
            "provider": "apple",
            "ics_url": ics_url,
        }, on_conflict="family_id,provider").execute()
        
        return {
            "ics_url": ics_url,
            "instructions": "Copy this URL and subscribe to it in Apple Calendar using File > New Calendar Subscription"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("integrations.apple.ics_url.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate ICS URL: {str(e)}"
        )


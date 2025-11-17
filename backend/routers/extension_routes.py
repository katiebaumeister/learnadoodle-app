"""
FastAPI routes for browser extension integration
Allows browser extension to add external content and optionally mark as completed
"""
import os
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from auth import get_current_user, rate_limiter
    from helpers import get_family_id_for_user, child_belongs_to_family
    from logger import log_event
    from supabase_client import get_admin_client
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("auth", backend_dir / "auth.py")
    auth_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(auth_module)
    get_current_user = auth_module.get_current_user
    rate_limiter = auth_module.rate_limiter
    
    spec = importlib.util.spec_from_file_location("helpers", backend_dir / "helpers.py")
    helpers_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers_module)
    get_family_id_for_user = helpers_module.get_family_id_for_user
    child_belongs_to_family = helpers_module.child_belongs_to_family
    
    spec = importlib.util.spec_from_file_location("logger", backend_dir / "logger.py")
    logger_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(logger_module)
    log_event = logger_module.log_event
    
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client

# Import YouTube helpers from external_routes
try:
    from routers.external_routes import parse_youtube_url, fetch_youtube_video_meta
except ImportError:
    # Fallback: define locally if import fails
    import re
    import requests
    
    YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
    YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")
    
    def parse_youtube_url(url: str):
        """Parse YouTube URL and return (kind, yt_id)."""
        playlist_match = re.search(r"[?&]list=([A-Za-z0-9_\-]+)", url)
        if playlist_match:
            return ("playlist", playlist_match.group(1))
        
        video_match = re.search(r"[?&]v=([A-Za-z0-9_\-]{11})", url)
        if video_match:
            return ("video", video_match.group(1))
        
        youtu_be_match = re.search(r"youtu\.be/([A-Za-z0-9_\-]{11})", url)
        if youtu_be_match:
            return ("video", youtu_be_match.group(1))
        
        raise ValueError("Unsupported or unrecognized YouTube URL")
    
    def iso8601_duration_to_seconds(iso: str) -> int:
        """Convert ISO8601 duration (PT4M13S) to seconds."""
        import re
        total = 0
        for match in re.finditer(r'(\d+)([HMS])', iso):
            val, unit = int(match.group(1)), match.group(2)
            if unit == 'H':
                total += val * 3600
            elif unit == 'M':
                total += val * 60
            elif unit == 'S':
                total += val
        return total
    
    def fetch_youtube_video_meta(video_id: str) -> dict:
        """Fetch video metadata from YouTube API."""
        if not YOUTUBE_API_KEY:
            raise HTTPException(status_code=500, detail="Missing YOUTUBE_API_KEY")
        
        resp = requests.get(
            f"{YOUTUBE_API_BASE}/videos",
            params={
                "part": "snippet,contentDetails",
                "id": video_id,
                "key": YOUTUBE_API_KEY
            },
            timeout=20
        )
        resp.raise_for_status()
        data = resp.json()
        
        items = data.get("items", [])
        if not items:
            raise HTTPException(status_code=404, detail="YouTube video not found")
        
        item = items[0]
        snippet = item["snippet"]
        title = snippet["title"]
        duration_iso = item["contentDetails"]["duration"]
        duration_seconds = iso8601_duration_to_seconds(duration_iso)
        thumbnails = snippet.get("thumbnails", {})
        thumbnail_url = (
            thumbnails.get("high", {}).get("url") or
            thumbnails.get("medium", {}).get("url") or
            thumbnails.get("default", {}).get("url") or
            None
        )
        
        return {
            "title": title,
            "seconds": duration_seconds,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "thumbnail_url": thumbnail_url
        }

router = APIRouter(prefix="/api/extension", tags=["extension"])


class ExtensionAddIn(BaseModel):
    url: str
    child_id: Optional[str] = None
    mark_completed: Optional[bool] = False


class ExtensionAddOut(BaseModel):
    course_id: str
    lesson_id: Optional[str] = None
    title: str
    thumbnail_url: Optional[str] = None
    duration_sec: Optional[int] = None
    backlog_task_id: Optional[str] = None
    event_id: Optional[str] = None


@router.post("/add", response_model=ExtensionAddOut)
async def extension_add(
    body: ExtensionAddIn,
    request: Request,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Browser extension endpoint to add external content.
    Uses Supabase access token in Authorization header for auth.
    If mark_completed=true, immediately creates a completed event.
    Otherwise, creates a backlog task.
    """
    log_event("extension.add.start", user_id=user["id"], url=body.url[:50], mark_completed=body.mark_completed)
    
    try:
        # Get family_id from user
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        # If child_id provided, validate it belongs to family
        child_id = body.child_id
        if child_id:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: Child not in family"
                )
        else:
            # If no child_id, get first child for the family
            supabase = get_admin_client()
            children_res = supabase.table("children").select("id").eq(
                "family_id", family_id
            ).eq("archived", False).limit(1).execute()
            
            if not children_res.data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No children found for this family. Please specify child_id."
                )
            
            child_id = children_res.data[0]["id"]
        
        # Parse YouTube URL
        try:
            kind, yt_id = parse_youtube_url(body.url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Only support single videos for now
        if kind != "video":
            raise HTTPException(
                status_code=400,
                detail="Only single video URLs are supported. Playlist support coming soon."
            )
        
        # Fetch YouTube video metadata
        meta = fetch_youtube_video_meta(yt_id)
        
        supabase = get_admin_client()
        
        # Call RPC to create course/lesson and backlog task
        rpc_result = supabase.rpc(
            "add_external_link",
            {
                "p_family_id": family_id,
                "p_child_id": child_id,
                "p_provider_name": "YouTube",
                "p_title": meta["title"],
                "p_source_url": meta["url"],
                "p_thumbnail_url": meta.get("thumbnail_url"),
                "p_duration_sec": meta.get("seconds"),
                "p_imported_by": user["id"],
                "p_source_slug": yt_id
            }
        ).execute()
        
        if not rpc_result.data:
            raise HTTPException(status_code=500, detail="RPC call failed")
        
        result = rpc_result.data
        course_id = result["course_id"]
        lesson_id = result.get("lesson_id")
        backlog_task_id = result.get("backlog_task_id")
        
        event_id = None
        
        # If mark_completed=true, create a completed event
        if body.mark_completed:
            # Get lesson to link event to external_lesson_id
            duration_minutes = result.get("duration_sec", 0) // 60 if result.get("duration_sec") else 30
            if duration_minutes == 0:
                duration_minutes = 30  # Default to 30 minutes
            
            # Create event with status='done' and completed_from_extension=true
            # Use current time as completion time
            now = datetime.utcnow()
            start_ts = now - timedelta(minutes=duration_minutes)
            
            event_res = supabase.table("events").insert({
                "family_id": family_id,
                "child_id": child_id,
                "external_lesson_id": lesson_id,
                "title": meta["title"],
                "start_ts": start_ts.isoformat(),
                "end_ts": now.isoformat(),
                "status": "done",
                "completed_from_extension": True,
                "source": "manual"  # Use 'manual' since 'extension' is not in allowed values
            }).execute()
            
            if event_res.data:
                event_id = event_res.data[0]["id"]
                
                # Optionally delete the backlog task since we created an event
                if backlog_task_id:
                    try:
                        supabase.table("backlog_items").delete().eq("id", backlog_task_id).execute()
                        backlog_task_id = None  # Clear it from response
                    except Exception as e:
                        log_event("extension.add.backlog_delete_error", error=str(e))
                        # Non-critical, continue
            
            log_event("extension.add.event_created", 
                     user_id=user["id"], 
                     event_id=event_id,
                     lesson_id=lesson_id)
        
        log_event("extension.add.success", 
                 user_id=user["id"], 
                 course_id=course_id,
                 backlog_task_id=backlog_task_id,
                 event_id=event_id,
                 mark_completed=body.mark_completed)
        
        return ExtensionAddOut(
            course_id=course_id,
            lesson_id=lesson_id,
            title=result["title"],
            thumbnail_url=result.get("thumbnail_url"),
            duration_sec=result.get("duration_sec"),
            backlog_task_id=backlog_task_id,
            event_id=event_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("extension.add.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add link: {str(e)}"
        )


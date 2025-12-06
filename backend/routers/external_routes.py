"""
FastAPI routes for external content integration (Khan Academy, etc.)
Link-only catalog for external educational content
"""
import os
import re
import math
import hashlib
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional, Tuple
import sys
from pathlib import Path
from fastapi import status
from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from datetime import datetime, date, timedelta, time
from urllib.parse import quote as encodeURIComponent
from cache import get_cached, set_cached
from logger import log_event
from metrics import increment_counter, get_metrics
import requests

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from supabase_client import get_admin_client
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client

router = APIRouter(prefix="/api/external", tags=["external"])
ALLOWED_METRICS_EMAILS = set(filter(None, os.environ.get("METRICS_ALLOWED_EMAILS", "").split(",")))


class CourseOut(BaseModel):
    id: str
    provider_name: str
    subject: Optional[str]
    grade_band: Optional[str]
    lesson_count: Optional[int]
    public_url: str
    source_url: Optional[str] = None  # Original source URL for attribution
    license: Optional[str]
    attribution_text: Optional[str]
    subject_key: Optional[str]
    stage_key: Optional[str]


class LessonOut(BaseModel):
    id: str
    ordinal: int
    title_safe: str
    resource_type: Optional[str]
    public_url: str


class UnitOut(BaseModel):
    ordinal: int
    title_safe: str
    public_url: Optional[str]
    lessons: List[LessonOut]


class OutlineOut(BaseModel):
    course_id: str
    provider_name: str
    subject: Optional[str]
    grade_band: Optional[str]
    public_url: str
    units: List[UnitOut]


class ScheduleIn(BaseModel):
    family_id: str
    child_id: str
    course_id: str
    start_date: str  # YYYY-MM-DD
    days_per_week: int
    sessions_per_day: int = 1
    start_time: Optional[str] = "10:00"
    block_minutes: Optional[int] = 45


class ProgressUpsert(BaseModel):
    child_id: str
    external_lesson_id: str
    status: str

    def validate_status(self) -> None:
        if self.status not in {"not_started", "in_progress", "done", "skipped"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status value")


@router.get("/courses")
async def list_courses(
    provider: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    subject_key: Optional[str] = Query(None),
    stage_key: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List external courses with optional filters"""
    try:
        search_term = q or ''
        cache_key = "courses:" + ":".join([
            provider or '',
            subject or '',
            subject_key or '',
            stage_key or '',
            search_term,
            str(limit),
            str(offset),
        ])

        cached = get_cached(cache_key)
        if cached:
            increment_counter("courses_cache_hits")
            log_event("external.courses.cached", user_email=_user.get("email"), offset=offset, limit=limit)
            return cached

        supabase = get_admin_client()

        # Get provider ID if provider filter is specified
        provider_id = None
        if provider:
            provider_resp = supabase.table("external_providers").select("id").eq("name", provider).limit(1).execute()
            if provider_resp.data:
                provider_id = provider_resp.data[0]["id"]

        # Build query
        query = supabase.table("external_courses").select(
            """
            id,
            subject,
            grade_band,
            lesson_count,
            public_url,
            source_url,
            subject_key,
            stage_key,
            external_providers (
                name,
                license,
                attribution_text
            )
            """,
            count="exact"
        )

        if provider_id:
            query = query.eq("provider_id", provider_id)

        if subject:
            query = query.eq("subject", subject)

        if subject_key:
            query = query.eq("subject_key", subject_key)

        if stage_key:
            query = query.eq("stage_key", stage_key)

        if q:
            query = query.ilike("source_slug", f"%{q}%")

        resp = query.order("subject").range(offset, offset + limit - 1).execute()

        # Supabase Python client raises exceptions on error, doesn't set resp.error
        # So we can directly use resp.data
        data = resp.data or []
        total = resp.count if hasattr(resp, 'count') else len(data)

        courses = []
        for course in data:
            provider_data = course.get("external_providers")
            if isinstance(provider_data, list) and len(provider_data) > 0:
                provider_data = provider_data[0]
            elif not provider_data:
                provider_data = {}

            course_obj = CourseOut(
                id=course["id"],
                provider_name=provider_data.get("name", "Unknown"),
                subject=course.get("subject"),
                grade_band=course.get("grade_band"),
                lesson_count=course.get("lesson_count"),
                public_url=course["public_url"],
                source_url=course.get("source_url"),  # Include source_url for attribution
                license=provider_data.get("license"),
                attribution_text=provider_data.get("attribution_text"),
                subject_key=course.get("subject_key"),
                stage_key=course.get("stage_key"),
            )
            courses.append(course_obj.dict())

        result = {
            "items": courses,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
        set_cached(cache_key, result, ttl_seconds=60)
        increment_counter("courses_cache_miss")
        increment_counter("courses_total_requests")
        log_event("external.courses.fetch", total=total, limit=limit, offset=offset, user_email=_user.get("email"))
        return result
    except Exception as e:
        # If table doesn't exist, return empty array instead of error
        error_msg = str(e)
        if "does not exist" in error_msg or "42P01" in error_msg:
            print(f"[EXTERNAL] Tables don't exist yet. Run the SQL migration: add-external-content-integration.sql")
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        print(f"[EXTERNAL] Error fetching courses: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch courses: {error_msg}")


@router.get("/courses/{course_id}/outline", response_model=OutlineOut)
async def course_outline(
    course_id: str,
    _: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get course outline (units and lessons)"""
    try:
        cache_key = f"outline:{course_id}"
        cached_outline = get_cached(cache_key)
        if cached_outline:
            increment_counter("outline_cache_hits")
            log_event("external.outline.cached", course_id=course_id, user_email=_["email"])
            return cached_outline

        supabase = get_admin_client()

        # Get course header
        course_resp = supabase.table("external_courses").select(
            """
            id,
            subject,
            grade_band,
            public_url,
            external_providers (
                name
            )
            """
        ).eq("id", course_id).single().execute()

        if not course_resp.data:
            raise HTTPException(status_code=404, detail="Course not found")

        course_data = course_resp.data
        provider_data = course_data.get("external_providers")
        if isinstance(provider_data, list) and len(provider_data) > 0:
            provider_data = provider_data[0]
        elif not provider_data:
            provider_data = {}

        # Get units
        units_resp = supabase.table("external_units").select(
            "id, ordinal, title_safe, public_url"
        ).eq("course_id", course_id).order("ordinal").execute()

        units = []
        for unit in units_resp.data or []:
            # Get lessons for this unit
            lessons_resp = supabase.table("external_lessons").select(
                "id, ordinal, title_safe, resource_type, public_url"
            ).eq("unit_id", unit["id"]).order("ordinal").execute()

            lessons = [
                LessonOut(
                    id=lesson["id"],
                    ordinal=lesson["ordinal"],
                    title_safe=lesson["title_safe"],
                    resource_type=lesson.get("resource_type"),
                    public_url=lesson["public_url"],
                )
                for lesson in lessons_resp.data or []
            ]

            units.append(UnitOut(
                ordinal=unit["ordinal"],
                title_safe=unit["title_safe"],
                public_url=unit.get("public_url"),
                lessons=lessons,
            ))

        outline_payload = OutlineOut(
            course_id=course_data["id"],
            provider_name=provider_data.get("name", "Unknown"),
            subject=course_data.get("subject"),
            grade_band=course_data.get("grade_band"),
            public_url=course_data["public_url"],
            units=units,
        )
        set_cached(cache_key, outline_payload, ttl_seconds=120)
        increment_counter("outline_cache_miss")
        log_event("external.outline.fetch", course_id=course_id, user_email=_["email"])
        return outline_payload
    except HTTPException:
        raise
    except Exception as e:
        print(f"[EXTERNAL] Error fetching outline: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch course outline: {str(e)}")


@router.post("/schedule_course")
async def schedule_course(
    body: ScheduleIn,
    current_user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Schedule an external course"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(current_user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        if not child_belongs_to_family(body.child_id, family_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not in family")

        resp = supabase.rpc(
            "schedule_external_course",
            {
                "p_family_id": body.family_id,
                "p_child_id": body.child_id,
                "p_course_id": body.course_id,
                "p_start_date": body.start_date,
                "p_days_per_week": body.days_per_week,
                "p_sessions_per_day": body.sessions_per_day,
                "p_start_time": body.start_time,
                "p_block_minutes": body.block_minutes,
            }
        ).execute()

        scheduled = resp.data or 0
        increment_counter("schedules_total")
        increment_counter("schedules_events", scheduled)
        log_event("external.schedule.run", course_id=body.course_id, child_id=body.child_id, scheduled=scheduled, user_email=current_user.get("email"))
        return {"scheduled_events": scheduled}
    except Exception as e:
        print(f"[EXTERNAL] Error scheduling course: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to schedule course: {str(e)}")


@router.get("/progress")
async def list_progress(
    child_id: str,
    user=Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    family_id = get_family_id_for_user(user["id"])
    if not family_id or not child_belongs_to_family(child_id, family_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    supabase = get_admin_client()
    resp = supabase.table("external_lesson_progress").select(
        "external_lesson_id,status,started_at,completed_at"
    ).eq("family_id", family_id).eq("child_id", child_id).execute()

    data = resp.data or []
    increment_counter("progress_list_calls")
    log_event("external.progress.list", child_id=child_id, count=len(data), user_email=user.get("email"))
    return data


@router.post("/progress")
async def upsert_progress(
    payload: ProgressUpsert,
    user=Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    payload.validate_status()
    family_id = get_family_id_for_user(user["id"])
    if not family_id or not child_belongs_to_family(payload.child_id, family_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    supabase = get_admin_client()
    now_iso = datetime.utcnow().isoformat()
    upsert_payload = {
        "family_id": family_id,
        "child_id": payload.child_id,
        "external_lesson_id": payload.external_lesson_id,
        "status": payload.status,
    }
    if payload.status == "in_progress":
        upsert_payload["started_at"] = now_iso
    if payload.status == "done":
        upsert_payload["completed_at"] = now_iso

    resp = supabase.table("external_lesson_progress").upsert(upsert_payload).execute()
    increment_counter("progress_updates")
    log_event("external.progress.upsert", child_id=payload.child_id, lesson_id=payload.external_lesson_id, status=payload.status, user_email=user.get("email"))
    return resp.data[0] if resp.data else upsert_payload


@router.get("/metrics")
async def external_metrics(user=Depends(get_current_user)):
    email = user.get("email")
    if ALLOWED_METRICS_EMAILS and (email not in ALLOWED_METRICS_EMAILS):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return get_metrics()


# ============================================================
# Continue Learning Deep Linking
# ============================================================

class ResumePointIn(BaseModel):
    child_id: str
    lesson_id: Optional[str] = None
    position_seconds: Optional[int] = Field(None, ge=0, description="Video timestamp in seconds")
    progress_percentage: Optional[float] = Field(None, ge=0, le=100, description="Progress 0-100")


class ResumePointOut(BaseModel):
    lesson_id: Optional[str]
    position_seconds: Optional[int]
    progress_percentage: Optional[float]
    last_viewed_at: str


class DeepLinkOut(BaseModel):
    deep_link: str
    qr_code_url: str
    share_text: str


@router.get("/courses/{course_id}/resume", response_model=ResumePointOut)
async def get_resume_point(
    course_id: str,
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get resume point for a course"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    if not child_belongs_to_family(child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    supabase = get_admin_client()
    
    try:
        result = supabase.rpc("get_course_resume_point", {
            "_child_id": child_id,
            "_course_id": course_id
        }).execute()
        
        if result.data and len(result.data) > 0:
            resume = result.data[0]
            return ResumePointOut(
                lesson_id=resume.get("lesson_id"),
                position_seconds=resume.get("position_seconds"),
                progress_percentage=float(resume.get("progress_percentage", 0)) if resume.get("progress_percentage") else None,
                last_viewed_at=resume.get("last_viewed_at", datetime.now().isoformat())
            )
        else:
            # No resume point found
            return ResumePointOut(
                lesson_id=None,
                position_seconds=None,
                progress_percentage=None,
                last_viewed_at=datetime.now().isoformat()
            )
    except Exception as e:
        log_event("external.resume.get_error", user_id=user["id"], course_id=course_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get resume point: {str(e)}"
        )


@router.post("/courses/{course_id}/resume", response_model=ResumePointOut)
async def update_resume_point(
    course_id: str,
    body: ResumePointIn,
    course_type: str = Query("general", description="Course type: youtube, khan_academy, coursera, general"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Update resume point for a course"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    if not child_belongs_to_family(body.child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    supabase = get_admin_client()
    
    try:
        resume_data = {
            "family_id": family_id,
            "child_id": body.child_id,
            "course_id": course_id,
            "course_type": course_type,
            "last_lesson_id": body.lesson_id,
            "last_position_seconds": body.position_seconds,
            "progress_percentage": body.progress_percentage,
            "last_viewed_at": datetime.now().isoformat()
        }
        
        result = supabase.table("course_resume_points").upsert(
            resume_data,
            on_conflict="child_id,course_id"
        ).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update resume point"
            )
        
        resume = result.data[0]
        log_event("external.resume.updated", user_id=user["id"], course_id=course_id, child_id=body.child_id, lesson_id=body.lesson_id)
        
        return ResumePointOut(
            lesson_id=resume.get("last_lesson_id"),
            position_seconds=resume.get("last_position_seconds"),
            progress_percentage=float(resume.get("progress_percentage", 0)) if resume.get("progress_percentage") else None,
            last_viewed_at=resume.get("last_viewed_at", datetime.now().isoformat())
        )
    except Exception as e:
        log_event("external.resume.update_error", user_id=user["id"], course_id=course_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update resume point: {str(e)}"
        )


@router.post("/courses/{course_id}/deep-link", response_model=DeepLinkOut)
async def generate_deep_link(
    course_id: str,
    child_id: str = Query(..., description="Child ID"),
    lesson_id: Optional[str] = Query(None, description="Optional lesson ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate a shareable deep link for a course"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    if not child_belongs_to_family(child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    # Generate deep link URL
    base_url = os.environ.get("APP_BASE_URL", "https://app.learnadoodle.com")
    deep_link = f"{base_url}/continue/{course_id}?child={child_id}"
    if lesson_id:
        deep_link += f"&lesson={lesson_id}"
    
    # Generate QR code URL
    qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={encodeURIComponent(deep_link)}"
    
    # Generate share text
    share_text = f"Continue learning: {deep_link}"
    
    log_event("external.deep_link.generated", user_id=user["id"], course_id=course_id, child_id=child_id)
    
    return DeepLinkOut(
        deep_link=deep_link,
        qr_code_url=qr_code_url,
        share_text=share_text
    )


@router.post("/refresh")
async def trigger_refresh(
    dry_run: bool = Query(False),
    limit: Optional[int] = Query(None),
    secret: Optional[str] = Query(None),
):
    """
    Trigger external course metadata refresh.
    Protected by REFRESH_SECRET environment variable (for cloud schedulers).
    """
    expected_secret = os.environ.get("REFRESH_SECRET")
    if expected_secret and secret != expected_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid refresh secret"
        )
    
    try:
        # Import refresh function
        from tasks.refresh_external_courses import main as refresh_main
        
        log_event("external.refresh.triggered", dry_run=dry_run, limit=limit)
        result = refresh_main(dry_run=dry_run, limit=limit)
        
        if result["status"] == "error":
            raise HTTPException(
                status_code=500,
                detail=f"Refresh failed: {result.get('error', 'Unknown error')}"
            )
        
        log_event(
            "external.refresh.complete",
            total=result.get("total", 0),
            updated=result.get("updated", 0),
            errors=result.get("errors", 0),
        )
        
        return result
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Refresh module not available: {str(e)}"
        )
    except Exception as e:
        log_event("external.refresh.error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Refresh failed: {str(e)}"
        )


# ============================================================
# YouTube "Add From Link" Integration
# ============================================================

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")


def parse_youtube_url(url: str) -> Tuple[str, str]:
    """
    Parse YouTube URL and return (kind, yt_id) where kind in {'video','playlist'}.
    Raises ValueError if not recognized.
    """
    # Check for playlist first
    playlist_match = re.search(r"[?&]list=([A-Za-z0-9_\-]+)", url)
    if playlist_match:
        return ("playlist", playlist_match.group(1))
    
    # Check for video (watch or youtu.be)
    video_match = re.search(r"[?&]v=([A-Za-z0-9_\-]{11})", url)
    if video_match:
        return ("video", video_match.group(1))
    
    youtu_be_match = re.search(r"youtu\.be/([A-Za-z0-9_\-]{11})", url)
    if youtu_be_match:
        return ("video", youtu_be_match.group(1))
    
    raise ValueError("Unsupported or unrecognized YouTube URL")


def iso8601_duration_to_seconds(iso: str) -> int:
    """Convert ISO8601 duration (PT4M13S) to seconds."""
    try:
        import isodate
        return int(isodate.parse_duration(iso).total_seconds())
    except ImportError:
        # Fallback: simple regex parser
        seconds = 0
        if 'H' in iso:
            hours = re.search(r'(\d+)H', iso)
            if hours:
                seconds += int(hours.group(1)) * 3600
        if 'M' in iso:
            minutes = re.search(r'(\d+)M', iso)
            if minutes:
                seconds += int(minutes.group(1)) * 60
        if 'S' in iso:
            secs = re.search(r'(\d+)S', iso)
            if secs:
                seconds += int(secs.group(1))
        return seconds


def paraphrase_title(raw: str) -> str:
    """Clean and shorten YouTube titles."""
    t = re.sub(r"^\s*(Lesson\s*\d+[:\-]\s*)", "", raw, flags=re.I).strip()
    t = re.sub(r"\s*\|\s*.*$", "", t).strip()
    return t[:120] if t else "Lesson"


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
    # Get thumbnail (prefer high quality)
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


def fetch_youtube_playlist_items(playlist_id: str) -> List[dict]:
    """Fetch all items from a YouTube playlist."""
    if not YOUTUBE_API_KEY:
        raise HTTPException(status_code=500, detail="Missing YOUTUBE_API_KEY")
    
    items = []
    page_token = None
    video_ids = []
    
    # Fetch playlist items
    while True:
        params = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "maxResults": 50,
            "key": YOUTUBE_API_KEY
        }
        if page_token:
            params["pageToken"] = page_token
        
        resp = requests.get(f"{YOUTUBE_API_BASE}/playlistItems", params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        for item in data.get("items", []):
            video_id = item["contentDetails"]["videoId"]
            video_ids.append(video_id)
            items.append({
                "title": item["snippet"]["title"],
                "video_id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}"
            })
        
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    
    # Fetch durations in bulk
    durations = {}
    for i in range(0, len(video_ids), 50):
        chunk_ids = video_ids[i:i+50]
        resp = requests.get(
            f"{YOUTUBE_API_BASE}/videos",
            params={
                "part": "contentDetails",
                "id": ",".join(chunk_ids),
                "key": YOUTUBE_API_KEY
            },
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        
        for item in data.get("items", []):
            durations[item["id"]] = iso8601_duration_to_seconds(item["contentDetails"]["duration"])
    
    # Attach durations
    for item in items:
        item["seconds"] = durations.get(item["video_id"], 0)
    
    return items


def fetch_youtube_playlist_title(playlist_id: str) -> str:
    """Fetch playlist title."""
    if not YOUTUBE_API_KEY:
        raise HTTPException(status_code=500, detail="Missing YOUTUBE_API_KEY")
    
    resp = requests.get(
        f"{YOUTUBE_API_BASE}/playlists",
        params={
            "part": "snippet",
            "id": playlist_id,
            "key": YOUTUBE_API_KEY
        },
        timeout=20
    )
    resp.raise_for_status()
    data = resp.json()
    
    items = data.get("items", [])
    if not items:
        return "Playlist"
    
    return items[0]["snippet"]["title"]


class AddFromLinkIn(BaseModel):
    family_id: str
    url: str  # HttpUrl validation happens in route
    child_id: Optional[str] = None
    start_date: Optional[str] = None  # YYYY-MM-DD
    days_per_week: Optional[int] = 4
    sessions_per_day: Optional[int] = 1
    start_time: Optional[str] = "10:00"  # HH:MM
    block_minutes: Optional[int] = 30


class AddLinkIn(BaseModel):
    child_id: str
    url: str


class AddLinkOut(BaseModel):
    course_id: str
    lesson_id: Optional[str] = None
    title: str
    thumbnail_url: Optional[str] = None
    duration_sec: Optional[int] = None
    backlog_task_id: str


class AddFromLinkOut(BaseModel):
    item_id: str
    kind: str
    created_lessons: int
    scheduled_events: int = 0
    preview_title: str
    preview_count: int
    preview_total_minutes: Optional[int] = None


@router.post("/add_from_link", response_model=AddFromLinkOut)
async def add_from_link(
    body: AddFromLinkIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Add content from URL (YouTube, Khan Academy, Coursera, or general link).
    Creates family-private lessons and optionally schedules them.
    """
    log_event("external.add_from_link.start", user_id=user["id"], url=body.url[:50])
    
    try:
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )
        
        # Validate child if provided
        if body.child_id and not child_belongs_to_family(body.child_id, family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Child not in family"
            )
        
        # Detect provider and parse URL
        provider = None
        parsed_data = None
        
        # Try YouTube first
        try:
            kind, yt_id = parse_youtube_url(body.url)
            provider = 'youtube'
            parsed_data = {'kind': kind, 'id': yt_id}
        except ValueError:
            pass
        
        # Try Khan Academy
        if not provider:
            try:
                # Check dependencies first
                try:
                    import requests
                    from bs4 import BeautifulSoup
                except ImportError as dep_error:
                    log_event("external.add_from_link.khan_academy_missing_deps", user_id=user["id"], error=str(dep_error), missing_module=str(dep_error))
                    raise ImportError(f"Missing dependencies for Khan Academy parser: {dep_error}. Install with: pip install requests beautifulsoup4")
                
                from parsers.khan_academy import parse_khan_academy_url, fetch_khan_academy_course, fetch_khan_academy_unit, fetch_khan_academy_lesson
                log_event("external.add_from_link.khan_academy_parsing", user_id=user["id"], url=body.url[:100])
                kind, ka_id = parse_khan_academy_url(body.url)
                log_event("external.add_from_link.khan_academy_parsed", user_id=user["id"], kind=kind, ka_id=ka_id[:50], url=body.url[:100])
                provider = 'khan_academy'
                parsed_data = {'kind': kind, 'id': ka_id}
                log_event("external.add_from_link.khan_academy_detected", user_id=user["id"], kind=kind, ka_id=ka_id[:50])
            except ValueError as e:
                # URL doesn't match Khan Academy pattern - but if it's clearly a KA URL, fall through to general parser
                log_event("external.add_from_link.khan_academy_parse_failed", user_id=user["id"], error=str(e), error_type="ValueError", url=body.url[:100], traceback=str(e))
                # Don't set provider - let it fall through to general parser
                pass
            except ImportError as e:
                log_event("external.add_from_link.khan_academy_import_failed", user_id=user["id"], error=str(e), error_type="ImportError", missing_module=str(e))
                # Don't set provider - let it fall through to general parser
                pass
            except Exception as e:
                # Catch any other exceptions during parsing
                import traceback
                tb = traceback.format_exc()
                log_event("external.add_from_link.khan_academy_error", user_id=user["id"], error=str(e), error_type=type(e).__name__, url=body.url[:100], traceback=tb[:500])
                # Don't set provider - let it fall through to general parser
                pass
        
        # Try Coursera
        if not provider:
            try:
                from parsers.coursera import parse_coursera_url, fetch_coursera_course, fetch_coursera_specialization
                kind, coursera_id = parse_coursera_url(body.url)
                provider = 'coursera'
                parsed_data = {'kind': kind, 'id': coursera_id}
            except (ValueError, ImportError):
                pass
        
        # Try general link parser (LLM-based)
        # Also use as fallback for Khan Academy URLs that don't match expected patterns
        if not provider:
            try:
                # Check dependencies first
                try:
                    import requests
                    from bs4 import BeautifulSoup
                    from openai import AsyncOpenAI
                except ImportError as dep_error:
                    log_event("external.add_from_link.general_parser_missing_deps", user_id=user["id"], error=str(dep_error), missing_module=str(dep_error))
                    raise ImportError(f"Missing dependencies for general parser: {dep_error}. Install with: pip install requests beautifulsoup4 openai")
                
                from parsers.general_link import parse_general_link
                # Check if it's clearly a Khan Academy URL but parsing failed
                if 'khanacademy.org' in body.url.lower():
                    log_event("external.add_from_link.khan_academy_fallback_to_general", user_id=user["id"], url=body.url[:100])
                log_event("external.add_from_link.using_general_parser", user_id=user["id"], url=body.url[:100])
                provider = 'general'
                parsed_data = {'url': body.url}
            except ImportError as e:
                log_event("external.add_from_link.general_parser_import_failed", user_id=user["id"], error=str(e), error_type="ImportError", missing_module=str(e))
                # If general parser import fails, we can't proceed
                pass
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                log_event("external.add_from_link.general_parser_error", user_id=user["id"], error=str(e), error_type=type(e).__name__, traceback=tb[:500])
                # Even if there's an error, try to use general parser
                provider = 'general'
                parsed_data = {'url': body.url}
        
        if not provider:
            # Last resort: try to use general parser even if import check failed
            # This handles cases where the import check had an issue but the parser might still work
            if 'khanacademy.org' in body.url.lower() or 'youtube.com' in body.url.lower() or 'coursera.org' in body.url.lower() or body.url.startswith('http'):
                try:
                    from parsers.general_link import parse_general_link
                    log_event("external.add_from_link.force_general_parser", user_id=user["id"], url=body.url[:100])
                    provider = 'general'
                    parsed_data = {'url': body.url}
                except Exception as e:
                    log_event("external.add_from_link.force_general_failed", user_id=user["id"], error=str(e))
                    # Provide more helpful error message
                    error_detail = "Unsupported URL. Supported: YouTube, Khan Academy, Coursera, or general educational links"
                    if 'khanacademy.org' in body.url.lower():
                        error_detail = f"Khan Academy URL detected but parsing failed. URL: {body.url[:100]}. The general parser also failed: {str(e)}"
                    raise HTTPException(status_code=400, detail=error_detail)
            else:
                # Provide more helpful error message
                error_detail = "Unsupported URL. Supported: YouTube, Khan Academy, Coursera, or general educational links"
                if 'khanacademy.org' in body.url.lower():
                    error_detail = f"Khan Academy URL detected but parsing failed. URL: {body.url[:100]}. Please try a course, unit, or lesson URL."
                raise HTTPException(status_code=400, detail=error_detail)
        
        supabase = get_admin_client()
        
        # Helper function to get or create provider
        def get_or_create_provider(provider_name: str):
            """Get provider_id, creating provider if it doesn't exist"""
            provider_resp = supabase.table("external_providers").select("id").eq("name", provider_name).limit(1).execute()
            if provider_resp.data:
                return provider_resp.data[0]["id"]
            
            # Create provider if it doesn't exist
            base_urls = {
                "Khan Academy": "https://www.khanacademy.org",
                "Coursera": "https://www.coursera.org",
                "YouTube": "https://www.youtube.com",
                "General": "https://example.com"
            }
            new_provider = supabase.table("external_providers").insert({
                "name": provider_name,
                "base_url": base_urls.get(provider_name, "https://example.com"),
                "license": "Terms of Service",
                "attribution_text": f"Content from {provider_name}",
                "is_link_only": True
            }).execute()
            return new_provider.data[0]["id"] if new_provider.data else None
        
        # Route to appropriate handler based on provider
        if provider == 'youtube':
            # Existing YouTube handling
            kind = parsed_data['kind']
            yt_id = parsed_data['id']
            
            # Handle video
            if kind == "video":
                meta = fetch_youtube_video_meta(yt_id)
                minutes = math.ceil((meta["seconds"] or 0) / 60) if meta["seconds"] else None
            
            # Upsert item
            item_resp = supabase.table("family_youtube_items").upsert({
                "family_id": family_id,
                "kind": "video",
                "yt_id": yt_id,
                "title_safe": paraphrase_title(meta["title"]),
                "public_url": meta["url"],
                "duration_seconds": meta["seconds"],
                "created_by": user["id"]
            }, on_conflict="family_id,yt_id").execute()
            
            item = item_resp.data[0] if item_resp.data else None
            if not item:
                raise HTTPException(status_code=500, detail="Failed to create item")
            
            # Upsert single lesson
            lesson_resp = supabase.table("family_youtube_lessons").upsert({
                "item_id": item["id"],
                "ordinal": 1,
                "title_safe": paraphrase_title(meta["title"]),
                "public_url": meta["url"],
                "est_minutes": minutes
            }, on_conflict="item_id,ordinal").execute()
            
            created_lessons = 1
            scheduled_events = 0
            
            # Schedule if requested
            if body.child_id and body.start_date:
                scheduled_events = schedule_youtube_lessons(
                    supabase=supabase,
                    family_id=family_id,
                    child_id=body.child_id,
                    item_id=item["id"],
                    start_date=body.start_date,
                    days_per_week=body.days_per_week or 4,
                    sessions_per_day=body.sessions_per_day or 1,
                    start_time=body.start_time or "10:00",
                    block_minutes=body.block_minutes or 30
                )
            
            log_event("external.add_from_link.success", user_id=user["id"], kind="video", lessons=created_lessons, scheduled=scheduled_events)
            
            return AddFromLinkOut(
                item_id=item["id"],
                kind="video",
                created_lessons=created_lessons,
                scheduled_events=scheduled_events,
                preview_title=item["title_safe"],
                preview_count=1,
                preview_total_minutes=minutes
            )
        
            # Handle playlist
            if kind == "playlist":
                items = fetch_youtube_playlist_items(yt_id)
                if not items:
                    raise HTTPException(status_code=404, detail="Playlist is empty or unavailable")
                
                playlist_title = fetch_youtube_playlist_title(yt_id)
                
                # Upsert item
                item_resp = supabase.table("family_youtube_items").upsert({
                    "family_id": family_id,
                    "kind": "playlist",
                    "yt_id": yt_id,
                    "title_safe": paraphrase_title(playlist_title),
                    "public_url": f"https://www.youtube.com/playlist?list={yt_id}",
                    "created_by": user["id"]
                }, on_conflict="family_id,yt_id").execute()
                
                item = item_resp.data[0] if item_resp.data else None
                if not item:
                    raise HTTPException(status_code=500, detail="Failed to create item")
                
                # Upsert lessons
                lessons_payload = []
                total_minutes = 0
                for idx, it in enumerate(items, start=1):
                    minutes = math.ceil((it.get("seconds") or 0) / 60) if it.get("seconds") else None
                    if minutes:
                        total_minutes += minutes
                    lessons_payload.append({
                        "item_id": item["id"],
                        "ordinal": idx,
                        "title_safe": paraphrase_title(it["title"]),
                        "public_url": it["url"],
                        "est_minutes": minutes
                    })
                
                # Batch upsert lessons
                for i in range(0, len(lessons_payload), 500):
                    chunk = lessons_payload[i:i+500]
                    supabase.table("family_youtube_lessons").upsert(
                        chunk,
                        on_conflict="item_id,ordinal"
                    ).execute()
                
                created_lessons = len(lessons_payload)
                scheduled_events = 0
                
                # Schedule if requested
                if body.child_id and body.start_date:
                    scheduled_events = schedule_youtube_lessons(
                        supabase=supabase,
                        family_id=family_id,
                        child_id=body.child_id,
                        item_id=item["id"],
                        start_date=body.start_date,
                        days_per_week=body.days_per_week or 4,
                        sessions_per_day=body.sessions_per_day or 1,
                        start_time=body.start_time or "10:00",
                        block_minutes=body.block_minutes or 30
                    )
                
                log_event("external.add_from_link.success", user_id=user["id"], kind="playlist", lessons=created_lessons, scheduled=scheduled_events)
                
                return AddFromLinkOut(
                    item_id=item["id"],
                    kind="playlist",
                    created_lessons=created_lessons,
                    scheduled_events=scheduled_events,
                    preview_title=item["title_safe"],
                    preview_count=created_lessons,
                    preview_total_minutes=total_minutes if total_minutes > 0 else None
                )
        
        elif provider == 'khan_academy':
            # Khan Academy handling
            from parsers.khan_academy import fetch_khan_academy_course, fetch_khan_academy_unit, fetch_khan_academy_lesson
            kind = parsed_data['kind']
            ka_id = parsed_data['id']
            
            if kind == 'course':
                course_data = fetch_khan_academy_course(ka_id)
                # Get or create provider
                provider_id = get_or_create_provider("Khan Academy")
                # Generate source_slug from URL
                source_slug = hashlib.md5(body.url.encode()).hexdigest()
                
                # Create or update external_course entry (using correct schema)
                course_resp = supabase.table("external_courses").upsert({
                    "provider_id": provider_id,
                    "source_slug": source_slug,
                    "public_url": course_data['url'],
                    "source_url": body.url,
                    "subject": course_data['title'],  # Use subject field for title
                    "imported_by": user["id"],
                    "lesson_count": sum(len(u.get('lessons', [])) for u in course_data.get('units', []))
                }, on_conflict="provider_id,source_slug").execute()
                
                course = course_resp.data[0] if course_resp.data else None
                if not course:
                    raise HTTPException(status_code=500, detail="Failed to create course")
                
                # Create units and lessons
                created_lessons = 0
                for unit_idx, unit in enumerate(course_data.get('units', [])[:10], 1):
                    unit_data = fetch_khan_academy_unit(unit.get('slug', ''))
                    
                    # Create or update unit
                    unit_resp = supabase.table("external_units").upsert({
                        "course_id": course["id"],
                        "ordinal": unit_idx,
                        "title_safe": unit_data.get('title', f"Unit {unit_idx}"),
                        "public_url": unit_data.get('url', course_data['url']),
                        "source_url": unit_data.get('url', course_data['url'])
                    }, on_conflict="course_id,ordinal").execute()
                    
                    unit_id = unit_resp.data[0]["id"] if unit_resp.data else None
                    if not unit_id:
                        continue
                    
                    # Create or update lessons for this unit
                    for lesson_idx, lesson in enumerate(unit_data.get('lessons', [])[:20], 1):
                        supabase.table("external_lessons").upsert({
                            "unit_id": unit_id,
                            "ordinal": lesson_idx,
                            "title_safe": lesson.get('title', f"Lesson {lesson_idx}"),
                            "resource_type": "video",
                            "public_url": lesson.get('url', unit_data.get('url')),
                            "source_url": lesson.get('url', unit_data.get('url'))
                        }, on_conflict="unit_id,ordinal").execute()
                        created_lessons += 1
                
                # Create backlog items for lessons if child_id is provided
                backlog_count = 0
                if body.child_id:
                    # Get all units for this course, then all lessons
                    units_resp = supabase.table("external_units").select("id").eq("course_id", course["id"]).execute()
                    for unit in (units_resp.data or []):
                        lessons_resp = supabase.table("external_lessons").select("id, title_safe, duration_minutes_est").eq("unit_id", unit["id"]).order("ordinal").execute()
                        for lesson in (lessons_resp.data or []):
                            supabase.table("backlog_items").insert({
                                "family_id": family_id,
                                "child_id": body.child_id,
                                "title": lesson.get("title_safe", "Lesson"),
                                "notes": f"External content: {course_data['title']} - {body.url}",
                                "estimated_minutes": lesson.get("duration_minutes_est"),
                                "created_by": user["id"]
                            }).execute()
                            backlog_count += 1
                
                return AddFromLinkOut(
                    item_id=course["id"],
                    kind="course",
                    created_lessons=created_lessons,
                    scheduled_events=0,
                    preview_title=course_data['title'],
                    preview_count=created_lessons,
                    preview_total_minutes=None
                )
            elif kind == 'unit':
                # Handle Khan Academy unit
                unit_data = fetch_khan_academy_unit(ka_id)
                
                # Get or create provider
                provider_id = get_or_create_provider("Khan Academy")
                # Generate source_slug from URL
                source_slug = hashlib.md5(body.url.encode()).hexdigest()
                
                # Create or update external_course entry for the unit (using correct schema)
                course_resp = supabase.table("external_courses").upsert({
                    "provider_id": provider_id,
                    "source_slug": source_slug,
                    "public_url": unit_data['url'],
                    "source_url": body.url,
                    "subject": unit_data['title'],  # Use subject field for title
                    "imported_by": user["id"],
                    "lesson_count": len(unit_data.get('lessons', []))
                }, on_conflict="provider_id,source_slug").execute()
                
                course = course_resp.data[0] if course_resp.data else None
                if not course:
                    raise HTTPException(status_code=500, detail="Failed to create course")
                
                # Create or update a unit for this unit-level course
                unit_resp = supabase.table("external_units").upsert({
                    "course_id": course["id"],
                    "ordinal": 1,
                    "title_safe": unit_data['title'],
                    "public_url": unit_data['url'],
                    "source_url": body.url
                }, on_conflict="course_id,ordinal").execute()
                
                unit_id = unit_resp.data[0]["id"] if unit_resp.data else None
                if not unit_id:
                    raise HTTPException(status_code=500, detail="Failed to create unit")
                
                # Create or update lessons from unit
                created_lessons = 0
                for lesson_idx, lesson in enumerate(unit_data.get('lessons', [])[:50], 1):
                    supabase.table("external_lessons").upsert({
                        "unit_id": unit_id,
                        "ordinal": lesson_idx,
                        "title_safe": lesson.get('title', f"Lesson {lesson_idx}"),
                        "resource_type": "video",
                        "public_url": lesson.get('url', unit_data['url']),
                        "source_url": lesson.get('url', unit_data['url'])
                    }, on_conflict="unit_id,ordinal").execute()
                    created_lessons += 1
                
                # If no lessons found, create a single lesson pointing to the unit URL
                if created_lessons == 0:
                    supabase.table("external_lessons").upsert({
                        "unit_id": unit_id,
                        "ordinal": 1,
                        "title_safe": unit_data['title'],
                        "resource_type": "video",
                        "public_url": unit_data['url'],
                        "source_url": body.url
                    }, on_conflict="unit_id,ordinal").execute()
                    created_lessons = 1
                
                # Create backlog items for lessons if child_id is provided
                backlog_count = 0
                if body.child_id:
                    lessons_resp = supabase.table("external_lessons").select("id, title_safe, duration_minutes_est").eq("unit_id", unit_id).order("ordinal").execute()
                    for lesson in (lessons_resp.data or []):
                        supabase.table("backlog_items").insert({
                            "family_id": family_id,
                            "child_id": body.child_id,
                            "title": lesson.get("title_safe", "Lesson"),
                            "notes": f"External content: {unit_data['title']} - {body.url}",
                            "estimated_minutes": lesson.get("duration_minutes_est"),
                            "created_by": user["id"]
                        }).execute()
                        backlog_count += 1
                
                return AddFromLinkOut(
                    item_id=course["id"],
                    kind="unit",
                    created_lessons=created_lessons,
                    scheduled_events=0,
                    preview_title=unit_data['title'],
                    preview_count=created_lessons,
                    preview_total_minutes=None
                )
            elif kind == 'lesson':
                # Handle Khan Academy lesson
                lesson_data = fetch_khan_academy_lesson(ka_id)
                
                # Get or create provider
                provider_id = get_or_create_provider("Khan Academy")
                # Generate source_slug from URL
                source_slug = hashlib.md5(body.url.encode()).hexdigest()
                
                # Create or update external_course entry for the lesson (single lesson course)
                course_resp = supabase.table("external_courses").upsert({
                    "provider_id": provider_id,
                    "source_slug": source_slug,
                    "public_url": lesson_data['url'],
                    "source_url": body.url,
                    "subject": lesson_data['title'],  # Use subject field for title
                    "imported_by": user["id"],
                    "lesson_count": 1
                }, on_conflict="provider_id,source_slug").execute()
                
                course = course_resp.data[0] if course_resp.data else None
                if not course:
                    raise HTTPException(status_code=500, detail="Failed to create course")
                
                # Create or update a unit for this single lesson course
                unit_resp = supabase.table("external_units").upsert({
                    "course_id": course["id"],
                    "ordinal": 1,
                    "title_safe": lesson_data['title'],
                    "public_url": lesson_data['url'],
                    "source_url": body.url
                }, on_conflict="course_id,ordinal").execute()
                
                unit_id = unit_resp.data[0]["id"] if unit_resp.data else None
                if not unit_id:
                    raise HTTPException(status_code=500, detail="Failed to create unit")
                
                # Create or update single lesson
                lesson_resp = supabase.table("external_lessons").upsert({
                    "unit_id": unit_id,
                    "ordinal": 1,
                    "title_safe": lesson_data['title'],
                    "resource_type": "video",
                    "public_url": lesson_data['url'],
                    "source_url": body.url
                }, on_conflict="unit_id,ordinal").execute()
                
                # Create backlog item if child_id is provided
                backlog_count = 0
                if body.child_id and lesson_resp.data:
                    lesson = lesson_resp.data[0]
                    supabase.table("backlog_items").insert({
                        "family_id": family_id,
                        "child_id": body.child_id,
                        "title": lesson.get("title_safe", "Lesson"),
                        "notes": f"External content: {lesson_data['title']} - {body.url}",
                        "estimated_minutes": lesson.get("duration_minutes_est"),
                        "created_by": user["id"]
                    }).execute()
                    backlog_count = 1
                
                return AddFromLinkOut(
                    item_id=course["id"],
                    kind="lesson",
                    created_lessons=1,
                    scheduled_events=0,
                    preview_title=lesson_data['title'],
                    preview_count=1,
                    preview_total_minutes=None
                )
            else:
                raise HTTPException(status_code=400, detail=f"Khan Academy {kind} not yet supported")
        
        elif provider == 'coursera':
            # Coursera handling
            from parsers.coursera import fetch_coursera_course, fetch_coursera_specialization
            kind = parsed_data['kind']
            coursera_id = parsed_data['id']
            
            if kind == 'course':
                course_data = fetch_coursera_course(coursera_id)
                # Get or create provider
                provider_id = get_or_create_provider("Coursera")
                # Generate source_slug from URL
                source_slug = hashlib.md5(body.url.encode()).hexdigest()
                
                course_resp = supabase.table("external_courses").upsert({
                    "provider_id": provider_id,
                    "source_slug": source_slug,
                    "public_url": course_data['url'],
                    "source_url": body.url,
                    "subject": course_data['title'],  # Use subject field for title
                    "imported_by": user["id"],
                    "lesson_count": len(course_data.get('modules', []))
                }, on_conflict="provider_id,source_slug").execute()
                
                course = course_resp.data[0] if course_resp.data else None
                if not course:
                    raise HTTPException(status_code=500, detail="Failed to create course")
                
                created_lessons = len(course_data.get('modules', []))
                
                return AddFromLinkOut(
                    item_id=course["id"],
                    kind="course",
                    created_lessons=created_lessons,
                    scheduled_events=0,
                    preview_title=course_data['title'],
                    preview_count=created_lessons,
                    preview_total_minutes=None
                )
            else:
                raise HTTPException(status_code=400, detail=f"Coursera {kind} not yet supported")
        
        elif provider == 'general':
            # General link handling (LLM-based)
            from parsers.general_link import parse_general_link
            course_data = await parse_general_link(body.url)
            
            # Get or create provider
            provider_id = get_or_create_provider("General")
            # Generate source_slug from URL
            source_slug = hashlib.md5(body.url.encode()).hexdigest()
            
            # Count total lessons
            total_lessons = sum(len(unit.get('lessons', [])) for unit in course_data.get('units', []))
            
            course_resp = supabase.table("external_courses").upsert({
                "provider_id": provider_id,
                "source_slug": source_slug,
                "public_url": course_data['url'],
                "source_url": body.url,
                "subject": course_data['title'],  # Use subject field for title
                "imported_by": user["id"],
                "lesson_count": total_lessons if total_lessons > 0 else 1
            }, on_conflict="provider_id,source_slug").execute()
            
            course = course_resp.data[0] if course_resp.data else None
            if not course:
                raise HTTPException(status_code=500, detail="Failed to create course")
            
            # Create or update units and lessons from extracted structure
            created_lessons = 0
            for unit_idx, unit in enumerate(course_data.get('units', [])[:10], 1):
                # Create or update unit
                unit_resp = supabase.table("external_units").upsert({
                    "course_id": course["id"],
                    "ordinal": unit_idx,
                    "title_safe": unit.get('title', f"Unit {unit_idx}"),
                    "public_url": course_data['url'],
                    "source_url": body.url
                }, on_conflict="course_id,ordinal").execute()
                
                unit_id = unit_resp.data[0]["id"] if unit_resp.data else None
                if not unit_id:
                    continue
                
                # Create or update lessons for this unit
                for lesson_idx, lesson in enumerate(unit.get('lessons', [])[:20], 1):
                    supabase.table("external_lessons").upsert({
                        "unit_id": unit_id,
                        "ordinal": lesson_idx,
                        "title_safe": lesson.get('title', f"Lesson {lesson_idx}"),
                        "resource_type": "link",
                        "public_url": lesson.get('url', course_data['url']),
                        "source_url": lesson.get('url', course_data['url'])
                    }, on_conflict="unit_id,ordinal").execute()
                    created_lessons += 1
            
            # If no units/lessons found, create a default unit and lesson
            if created_lessons == 0:
                unit_resp = supabase.table("external_units").upsert({
                    "course_id": course["id"],
                    "ordinal": 1,
                    "title_safe": course_data['title'],
                    "public_url": course_data['url'],
                    "source_url": body.url
                }, on_conflict="course_id,ordinal").execute()
                
                unit_id = unit_resp.data[0]["id"] if unit_resp.data else None
                if unit_id:
                    supabase.table("external_lessons").upsert({
                        "unit_id": unit_id,
                        "ordinal": 1,
                        "title_safe": course_data['title'],
                        "resource_type": "link",
                        "public_url": course_data['url'],
                        "source_url": body.url
                    }, on_conflict="unit_id,ordinal").execute()
                    created_lessons = 1
            
            # Create backlog items for lessons if child_id is provided
            backlog_count = 0
            if body.child_id:
                # Get all units for this course, then all lessons
                units_resp = supabase.table("external_units").select("id").eq("course_id", course["id"]).execute()
                for unit in (units_resp.data or []):
                    lessons_resp = supabase.table("external_lessons").select("id, title_safe, duration_minutes_est").eq("unit_id", unit["id"]).order("ordinal").execute()
                    for lesson in (lessons_resp.data or []):
                        supabase.table("backlog_items").insert({
                            "family_id": family_id,
                            "child_id": body.child_id,
                            "title": lesson.get("title_safe", "Lesson"),
                            "notes": f"External content: {course_data['title']} - {body.url}",
                            "estimated_minutes": lesson.get("duration_minutes_est"),
                            "created_by": user["id"]
                        }).execute()
                        backlog_count += 1
            
            return AddFromLinkOut(
                item_id=course["id"],
                kind="course",
                created_lessons=created_lessons,
                scheduled_events=0,
                preview_title=course_data['title'],
                preview_count=created_lessons,
                preview_total_minutes=None
            )
        
        else:
            raise HTTPException(status_code=400, detail="Unsupported provider")
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("external.add_from_link.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to add from link: {str(e)}")


@router.post("/add_link", response_model=AddLinkOut)
async def add_link(
    body: AddLinkIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Add external content link (YouTube video) to external_courses and create backlog task.
    Uses external_courses/external_lessons tables (not family_youtube_items).
    """
    log_event("external.add_link.start", user_id=user["id"], url=body.url[:50])
    
    try:
        # Get family_id from user
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        # Validate child belongs to family
        if not child_belongs_to_family(body.child_id, family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Child not in family"
            )
        
        # Parse YouTube URL
        try:
            kind, yt_id = parse_youtube_url(body.url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Only support single videos for now (playlists can be added later)
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
                "p_child_id": body.child_id,
                "p_provider_name": "YouTube",
                "p_title": meta["title"],
                "p_source_url": meta["url"],
                "p_thumbnail_url": meta.get("thumbnail_url"),
                "p_duration_sec": meta.get("seconds"),
                "p_imported_by": user["id"],
                "p_source_slug": yt_id  # Use YouTube video ID as source_slug
            }
        ).execute()
        
        if not rpc_result.data:
            raise HTTPException(status_code=500, detail="RPC call failed")
        
        result = rpc_result.data
        
        log_event("external.add_link.success", 
                 user_id=user["id"], 
                 course_id=result.get("course_id"),
                 backlog_task_id=result.get("backlog_task_id"))
        
        return AddLinkOut(
            course_id=result["course_id"],
            lesson_id=result.get("lesson_id"),
            title=result["title"],
            thumbnail_url=result.get("thumbnail_url"),
            duration_sec=result.get("duration_sec"),
            backlog_task_id=result["backlog_task_id"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("external.add_link.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add link: {str(e)}"
        )


def schedule_youtube_lessons(
    supabase,
    family_id: str,
    child_id: str,
    item_id: str,
    start_date: str,
    days_per_week: int,
    sessions_per_day: int,
    start_time: str,
    block_minutes: int
) -> int:
    """Schedule YouTube lessons as events."""
    # Get lessons ordered by ordinal
    lessons_resp = supabase.table("family_youtube_lessons").select(
        "id, ordinal, est_minutes"
    ).eq("item_id", item_id).order("ordinal", desc=False).execute()
    
    lessons = lessons_resp.data or []
    if not lessons:
        return 0
    
    # Parse start date and time
    start_dt = date.fromisoformat(start_date)
    start_time_obj = time.fromisoformat(start_time)
    
    placed = 0
    v_dow = 0  # day of week (0 to days_per_week-1)
    v_session = 0  # session within day
    current_date = start_dt
    
    for lesson in lessons:
        # Advance to next day if needed
        if v_session == 0:
            if v_dow >= days_per_week:
                v_dow = 0
                current_date = current_date + timedelta(days=7)
            target_date = start_dt + timedelta(days=v_dow)
        else:
            target_date = current_date
        
        # Calculate event times
        minutes = lesson.get("est_minutes") or block_minutes
        start_datetime = datetime.combine(target_date, start_time_obj)
        end_datetime = start_datetime + timedelta(minutes=minutes)
        
        # Check for existing event (idempotency)
        existing = supabase.table("events").select("id").eq(
            "child_id", child_id
        ).eq("family_youtube_lesson_id", lesson["id"]).limit(1).execute()
        
        if not existing.data:
            # Get lesson details including public_url for source_link
            lesson_detail = supabase.table("family_youtube_lessons").select(
                "title_safe, public_url"
            ).eq("id", lesson["id"]).single().execute()
            
            lesson_url = lesson_detail.data.get("public_url") if lesson_detail.data else None
            
            # Insert event with source_link
            supabase.table("events").insert({
                "family_id": family_id,
                "child_id": child_id,
                "start_ts": start_datetime.isoformat(),
                "end_ts": end_datetime.isoformat(),
                "title": lesson_detail.data.get("title_safe", "YouTube Lesson") if lesson_detail.data else "YouTube Lesson",
                "family_youtube_lesson_id": lesson["id"],
                "source_link": lesson_url,
                "status": "scheduled"
            }).execute()
            placed += 1
        
        # Advance session/day counters
        v_session += 1
        if v_session >= sessions_per_day:
            v_session = 0
            v_dow += 1
            current_date = target_date + timedelta(days=1)
    
    return placed


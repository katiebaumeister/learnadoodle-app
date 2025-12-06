"""
FastAPI routes for Accreditation & Defensibility Features
Implements: Academic Coverage Map, Simple Mastery Charts, College Readiness Dashboard
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import sys
import re
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
from cache import cached

router = APIRouter(prefix="/api/accreditation", tags=["accreditation"])


# ============================================================
# Request/Response Models
# ============================================================

class AcademicCoverageOut(BaseModel):
    child_id: str
    academic_year: str
    coverage_data: Dict[str, Any]
    total_hours: Optional[float] = None
    total_credits: Optional[float] = None
    coverage_percentage: Optional[float] = None
    calculated_at: str


class MasteryChartDataOut(BaseModel):
    skill_id: str
    skill_name: str
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    mastery_level: float  # 1-5 scale
    evidence_count: int
    trend: str  # improving, stable, declining
    date: str


class MasteryChartsOut(BaseModel):
    child_id: str
    charts_data: List[MasteryChartDataOut]
    subject_breakdown: Dict[str, Dict[str, Any]]


class CollegeReadinessOut(BaseModel):
    child_id: str
    readiness_data: Dict[str, Any]
    readiness_score: float  # 0-100
    calculated_at: str


class UpdateCollegeReadinessInput(BaseModel):
    test_scores: Optional[Dict[str, Any]] = None
    extracurriculars: Optional[Dict[str, Any]] = None


# ============================================================
# Cached Helper Functions
# ============================================================

@cached(ttl_seconds=300)  # Cache for 5 minutes
def _fetch_subjects_for_family(family_id: str):
    """Fetch subjects for a family (cached for 5 minutes)"""
    supabase = get_admin_client()
    subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
    return {s["id"]: s["name"] for s in (subjects_res.data or [])}


# ============================================================
# Routes - Academic Coverage Map
# ============================================================

@router.get("/coverage-map", response_model=AcademicCoverageOut)
async def get_coverage_map(
    child_id: str = Query(..., description="Child ID"),
    academic_year: Optional[str] = Query(None, description="Academic year (e.g., '2024-2025'). Defaults to current year"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get academic coverage map for a child.
    Calculates hours, credits, and evidence by subject for the academic year.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family not found"
            )
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, first_name, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data.get("family_id") != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child not accessible"
            )
        
        # Determine academic year
        if not academic_year:
            # Get current academic year (default: calendar year)
            current_year = datetime.now().year
            academic_year = f"{current_year}-{current_year + 1}"
        
        # Check if coverage already exists
        log_event("accreditation.coverage.check_start", user_id=user["id"], child_id=child_id, academic_year=academic_year)
        try:
            coverage_res = supabase.table("academic_coverage").select("*").eq("child_id", child_id).eq("academic_year", academic_year).maybe_single().execute()
            
            if coverage_res.data:
                log_event("accreditation.coverage.found_existing", user_id=user["id"], child_id=child_id, academic_year=academic_year)
                return AcademicCoverageOut(**coverage_res.data)
        except Exception as check_error:
            # Coverage check failed (expected if table doesn't exist yet) - suppress log
            # log_event("accreditation.coverage.check_error", user_id=user["id"], child_id=child_id, error=str(check_error), error_type=type(check_error).__name__, level="debug")
            pass
            # Continue to calculate if check fails
        
        # Calculate coverage from events, attendance, and credits
        # Get academic year date range (simplified: calendar year)
        year_parts = academic_year.split("-")
        year_start = int(year_parts[0])
        start_date = datetime(year_start, 1, 1).isoformat()
        end_date = datetime(year_start + 1, 12, 31).isoformat()
        
        # Get events for this year
        events_res = supabase.table("events").select(
            "id, subject_id, start_ts, end_ts, status"
        ).eq("child_id", child_id).gte("start_ts", start_date).lte("start_ts", end_date).execute()
        
        # Get attendance records
        attendance_res = supabase.table("attendance_records").select(
            "day_date, minutes, status"
        ).eq("child_id", child_id).gte("day_date", start_date.split("T")[0]).lte("day_date", end_date.split("T")[0]).execute()
        
        # Get credits from grades
        grades_res = supabase.table("grades").select(
            "subject_id, credits, created_at"
        ).eq("child_id", child_id).gte("created_at", start_date).lte("created_at", end_date).execute()
        
        # Get uploads (evidence)
        uploads_res = supabase.table("uploads").select(
            "id, subject_id, created_at"
        ).eq("child_id", child_id).gte("created_at", start_date).lte("created_at", end_date).execute()
        
        # Get subjects (cached)
        subjects_map = _fetch_subjects_for_family(family_id)
        
        # Calculate coverage by subject
        coverage_by_subject = {}
        total_hours = 0
        total_credits = 0
        
        for subject_id, subject_name in subjects_map.items():
            # Calculate hours from attendance
            subject_minutes = sum(
                (a.get("minutes") or 0) for a in (attendance_res.data or [])
                if a.get("status") == "present"
            )
            # Also add from events
            subject_events = [e for e in (events_res.data or []) if e.get("subject_id") == subject_id and e.get("status") == "done"]
            for event in subject_events:
                if event.get("start_ts") and event.get("end_ts"):
                    try:
                        start_ts = event["start_ts"]
                        end_ts = event["end_ts"]
                        # Handle different datetime formats
                        if isinstance(start_ts, str):
                            start_ts = start_ts.replace("Z", "+00:00")
                        if isinstance(end_ts, str):
                            end_ts = end_ts.replace("Z", "+00:00")
                        start = datetime.fromisoformat(start_ts)
                        end = datetime.fromisoformat(end_ts)
                        duration = (end - start).total_seconds() / 60
                        if duration > 0:  # Only add positive durations
                            subject_minutes += duration
                    except Exception as e:
                        # Log but don't fail on date parsing errors
                        log_event("accreditation.coverage.date_parse_error", user_id=user["id"], child_id=child_id, error=str(e))
                        pass
            
            subject_hours = subject_minutes / 60
            
            # Calculate credits
            subject_credits = sum(
                (g.get("credits") or 0) for g in (grades_res.data or [])
                if g.get("subject_id") == subject_id
            )
            
            # Count evidence
            evidence_count = len([u for u in (uploads_res.data or []) if u.get("subject_id") == subject_id])
            evidence_count += len(subject_events)
            
            if subject_hours > 0 or subject_credits > 0 or evidence_count > 0:
                coverage_by_subject[subject_id] = {
                    "name": subject_name,
                    "hours": round(subject_hours, 2),
                    "credits": round(subject_credits, 2),
                    "evidence_count": evidence_count,
                    "topics_covered": [],  # Could be populated from events/materials
                    "standards_met": []  # Could be populated from standards mapping
                }
                total_hours += subject_hours
                total_credits += subject_credits
        
        # Create coverage record
        coverage_data = {
            "subjects": coverage_by_subject
        }
        
        coverage_record = {
            "family_id": family_id,
            "child_id": child_id,
            "academic_year": academic_year,
            "coverage_data": coverage_data,
            "total_hours": round(total_hours, 2),
            "total_credits": round(total_credits, 2),
            "coverage_percentage": None,  # Would need state requirements to calculate
            "calculated_at": datetime.now().isoformat()
        }
        
        # Try upsert - if it fails, try insert then update
        log_event("accreditation.coverage.upsert_start", user_id=user["id"], child_id=child_id, academic_year=academic_year, record_keys=list(coverage_record.keys()))
        try:
            result = supabase.table("academic_coverage").upsert(
                coverage_record,
                on_conflict="child_id,academic_year"
            ).execute()
            
            log_event("accreditation.coverage.upsert_result", user_id=user["id"], child_id=child_id, has_data=bool(result.data), data_len=len(result.data) if result.data else 0)
            
            if result.data and len(result.data) > 0:
                log_event("accreditation.coverage.upsert_success", user_id=user["id"], child_id=child_id, academic_year=academic_year)
                return AcademicCoverageOut(**result.data[0])
            elif result.data is None:
                # Upsert succeeded but returned no data - try to fetch it
                log_event("accreditation.coverage.upsert_no_data_fetching", user_id=user["id"], child_id=child_id, academic_year=academic_year)
                fetch_result = supabase.table("academic_coverage").select("*").eq("child_id", child_id).eq("academic_year", academic_year).single().execute()
                if fetch_result.data:
                    log_event("accreditation.coverage.fetch_success", user_id=user["id"], child_id=child_id, academic_year=academic_year)
                    return AcademicCoverageOut(**fetch_result.data)
                else:
                    log_event("accreditation.coverage.fetch_no_data", user_id=user["id"], child_id=child_id, academic_year=academic_year)
        except Exception as upsert_error:
            # If upsert fails, try insert then update
            error_msg = str(upsert_error)
            error_type = type(upsert_error).__name__
            # Upsert failed (expected if table doesn't exist yet) - suppress log
            # log_event("accreditation.coverage.upsert_error", user_id=user["id"], child_id=child_id, error=error_msg, error_type=error_type, error_repr=repr(upsert_error), level="debug")
            pass
            
            try:
                # Try to insert first
                insert_result = supabase.table("academic_coverage").insert(coverage_record).execute()
                if insert_result.data and len(insert_result.data) > 0:
                    return AcademicCoverageOut(**insert_result.data[0])
            except Exception as insert_error:
                # Insert failed (likely due to conflict), try update
                log_event("accreditation.coverage.insert_fallback", user_id=user["id"], child_id=child_id, error=str(insert_error))
                
                try:
                    update_result = supabase.table("academic_coverage").update({
                        "coverage_data": coverage_data,
                        "total_hours": round(total_hours, 2),
                        "total_credits": round(total_credits, 2),
                        "calculated_at": datetime.now().isoformat()
                    }).eq("child_id", child_id).eq("academic_year", academic_year).execute()
                    
                    if update_result.data and len(update_result.data) > 0:
                        return AcademicCoverageOut(**update_result.data[0])
                    elif update_result.data is None:
                        # Update succeeded but returned no data - try to fetch it
                        fetch_result = supabase.table("academic_coverage").select("*").eq("child_id", child_id).eq("academic_year", academic_year).single().execute()
                        if fetch_result.data:
                            return AcademicCoverageOut(**fetch_result.data)
                except Exception as update_error:
                    log_event("accreditation.coverage.update_fallback", user_id=user["id"], child_id=child_id, error=str(update_error))
        
        # If all else fails, try to return existing record or return empty data gracefully
        log_event("accreditation.coverage.final_fallback", user_id=user["id"], child_id=child_id, academic_year=academic_year)
        try:
            existing_result = supabase.table("academic_coverage").select("*").eq("child_id", child_id).eq("academic_year", academic_year).maybe_single().execute()
            if existing_result.data:
                log_event("accreditation.coverage.final_fallback_found", user_id=user["id"], child_id=child_id, academic_year=academic_year)
                return AcademicCoverageOut(**existing_result.data)
        except Exception as final_error:
            # Final fallback failed (expected if table doesn't exist yet) - suppress log
            # log_event("accreditation.coverage.final_fallback_error", user_id=user["id"], child_id=child_id, error=str(final_error), error_type=type(final_error).__name__, level="debug")
            pass
        
        # Return empty coverage data instead of 500 error (non-critical, suppress log)
        # log_event("accreditation.coverage.returning_empty", user_id=user["id"], child_id=child_id, academic_year=academic_year, level="debug")
        return AcademicCoverageOut(
            child_id=child_id,
            academic_year=academic_year,
            coverage_data={"subjects": {}},
            total_hours=0.0,
            total_credits=0.0,
            coverage_percentage=None,
            calculated_at=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("accreditation.coverage.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get coverage map: {str(e)}"
        )


# ============================================================
# Routes - Mastery Charts
# ============================================================

@router.get("/mastery-charts", response_model=MasteryChartsOut)
async def get_mastery_charts(
    child_id: str = Query(..., description="Child ID"),
    subject_id: Optional[str] = Query(None, description="Filter by subject"),
    days_back: int = Query(365, description="Days to look back"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get mastery charts data for a child.
    Calculates mastery levels from skill_evidence over time.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family not found"
            )
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, first_name, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data.get("family_id") != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child not accessible"
            )
        
        # Get date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        # Get skill evidence with skill and subject info
        # First get skills with subjects
        skills_res = supabase.table("skills").select("id, name, subject_id").eq("family_id", family_id).execute()
        skills_map = {s["id"]: s for s in (skills_res.data or [])}
        
        # Get skill evidence
        query = supabase.table("skill_evidence").select(
            "id, skill_id, demonstrated_at, confidence_score, proficiency_level"
        ).eq("child_id", child_id).gte("demonstrated_at", start_date.isoformat()).lte("demonstrated_at", end_date.isoformat())
        
        if subject_id:
            # Filter by subject through skills (already have skills_map)
            skill_ids = [s_id for s_id, s_data in skills_map.items() if s_data.get("subject_id") == subject_id]
            if skill_ids:
                query = query.in_("skill_id", skill_ids)
            else:
                # No skills for this subject
                return MasteryChartsOut(
                    child_id=child_id,
                    charts_data=[],
                    subject_breakdown={}
                )
        
        evidence_res = query.execute()
        
        # Get subjects (cached)
        subjects_map = _fetch_subjects_for_family(family_id)
        
        # Calculate mastery by skill
        skill_mastery = {}
        for evidence in (evidence_res.data or []):
            skill_id = evidence.get("skill_id")
            if not skill_id:
                continue
            
            # Get skill info from skills_map
            skill_info = skills_map.get(skill_id) or {}
            skill_name = skill_info.get("name", "Unknown Skill")
            skill_subject_id = skill_info.get("subject_id")
            
            if skill_id not in skill_mastery:
                skill_mastery[skill_id] = {
                    "skill_id": skill_id,
                    "skill_name": skill_name,
                    "subject_id": skill_subject_id,
                    "subject_name": subjects_map.get(skill_subject_id) if skill_subject_id else None,
                    "scores": [],
                    "evidence_count": 0,
                    "dates": []
                }
            
            # Add confidence score (1-5 scale)
            confidence = evidence.get("confidence_score")
            if confidence:
                skill_mastery[skill_id]["scores"].append(confidence)
            skill_mastery[skill_id]["evidence_count"] += 1
            
            # Track dates for trend analysis
            demonstrated_at = evidence.get("demonstrated_at")
            if demonstrated_at:
                skill_mastery[skill_id]["dates"].append(demonstrated_at)
        
        # Calculate mastery levels and trends
        charts_data = []
        subject_breakdown = {}
        
        for skill_id, data in skill_mastery.items():
            # Calculate average mastery level
            if data["scores"]:
                mastery_level = sum(data["scores"]) / len(data["scores"])
            else:
                mastery_level = 0
            
            # Determine trend (simplified: compare first half vs second half)
            dates = sorted(data["dates"])
            if len(dates) >= 4:
                mid_point = len(dates) // 2
                first_half_scores = [s for i, s in enumerate(data["scores"]) if i < mid_point]
                second_half_scores = [s for i, s in enumerate(data["scores"]) if i >= mid_point]
                
                if first_half_scores and second_half_scores:
                    first_avg = sum(first_half_scores) / len(first_half_scores)
                    second_avg = sum(second_half_scores) / len(second_half_scores)
                    
                    if second_avg > first_avg + 0.2:
                        trend = "improving"
                    elif second_avg < first_avg - 0.2:
                        trend = "declining"
                    else:
                        trend = "stable"
                else:
                    trend = "stable"
            else:
                trend = "stable"
            
            charts_data.append(MasteryChartDataOut(
                skill_id=skill_id,
                skill_name=data["skill_name"],
                subject_id=data["subject_id"],
                subject_name=data["subject_name"],
                mastery_level=round(mastery_level, 2),
                evidence_count=data["evidence_count"],
                trend=trend,
                date=dates[-1] if dates else datetime.now().isoformat()
            ))
            
            # Aggregate by subject
            if data["subject_id"]:
                subject_id = data["subject_id"]
                if subject_id not in subject_breakdown:
                    subject_breakdown[subject_id] = {
                        "name": data["subject_name"],
                        "skills": [],
                        "avg_mastery": 0,
                        "skills_count": 0
                    }
                subject_breakdown[subject_id]["skills"].append(mastery_level)
                subject_breakdown[subject_id]["skills_count"] += 1
        
        # Calculate subject averages
        for subject_id, data in subject_breakdown.items():
            if data["skills"]:
                data["avg_mastery"] = round(sum(data["skills"]) / len(data["skills"]), 2)
        
        return MasteryChartsOut(
            child_id=child_id,
            charts_data=charts_data,
            subject_breakdown=subject_breakdown
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("accreditation.mastery.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get mastery charts: {str(e)}"
        )


@router.post("/mastery-snapshot")
async def create_mastery_snapshot(
    child_id: str,
    snapshot_date: Optional[str] = Query(None, description="Snapshot date (YYYY-MM-DD). Defaults to today"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create a mastery snapshot for historical tracking.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family not found"
            )
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data.get("family_id") != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child not accessible"
            )
        
        # Parse snapshot date
        if snapshot_date:
            snapshot_dt = datetime.fromisoformat(snapshot_date)
        else:
            snapshot_dt = datetime.now()
        
        # Get mastery data by calling the endpoint logic directly
        # We'll calculate it inline to avoid circular dependency
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        
        # Get skill evidence
        evidence_res = supabase.table("skill_evidence").select(
            "id, skill_id, demonstrated_at, confidence_score, proficiency_level, skill:skill_id(id, name, subject_id)"
        ).eq("child_id", child_id).gte("demonstrated_at", start_date.isoformat()).lte("demonstrated_at", end_date.isoformat()).execute()
        
        # Get subjects (cached)
        subjects_map = _fetch_subjects_for_family(family_id)
        
        # Calculate mastery by skill
        skill_mastery = {}
        for evidence in (evidence_res.data or []):
            skill_id = evidence.get("skill_id")
            if not skill_id:
                continue
            
            skill_info = evidence.get("skill") or {}
            skill_name = skill_info.get("name", "Unknown Skill")
            skill_subject_id = skill_info.get("subject_id")
            
            if skill_id not in skill_mastery:
                skill_mastery[skill_id] = {
                    "skill_id": skill_id,
                    "skill_name": skill_name,
                    "subject_id": skill_subject_id,
                    "scores": [],
                    "evidence_count": 0,
                    "dates": []
                }
            
            confidence = evidence.get("confidence_score")
            if confidence:
                skill_mastery[skill_id]["scores"].append(confidence)
            skill_mastery[skill_id]["evidence_count"] += 1
            
            demonstrated_at = evidence.get("demonstrated_at")
            if demonstrated_at:
                skill_mastery[skill_id]["dates"].append(demonstrated_at)
        
        # Calculate mastery levels and trends
        mastery_data_skills = {}
        subject_breakdown = {}
        
        for skill_id, data in skill_mastery.items():
            if data["scores"]:
                mastery_level = sum(data["scores"]) / len(data["scores"])
            else:
                mastery_level = 0
            
            dates = sorted(data["dates"])
            if len(dates) >= 4:
                mid_point = len(dates) // 2
                first_half_scores = [s for i, s in enumerate(data["scores"]) if i < mid_point]
                second_half_scores = [s for i, s in enumerate(data["scores"]) if i >= mid_point]
                
                if first_half_scores and second_half_scores:
                    first_avg = sum(first_half_scores) / len(first_half_scores)
                    second_avg = sum(second_half_scores) / len(second_half_scores)
                    
                    if second_avg > first_avg + 0.2:
                        trend = "improving"
                    elif second_avg < first_avg - 0.2:
                        trend = "declining"
                    else:
                        trend = "stable"
                else:
                    trend = "stable"
            else:
                trend = "stable"
            
            mastery_data_skills[skill_id] = {
                "name": data["skill_name"],
                "mastery_level": round(mastery_level, 2),
                "evidence_count": data["evidence_count"],
                "trend": trend
            }
            
            if data["subject_id"]:
                subject_id = data["subject_id"]
                if subject_id not in subject_breakdown:
                    subject_breakdown[subject_id] = {
                        "name": subjects_map.get(subject_id),
                        "skills": [],
                        "avg_mastery": 0,
                        "skills_count": 0
                    }
                subject_breakdown[subject_id]["skills"].append(mastery_level)
                subject_breakdown[subject_id]["skills_count"] += 1
        
        for subject_id, data in subject_breakdown.items():
            if data["skills"]:
                data["avg_mastery"] = round(sum(data["skills"]) / len(data["skills"]), 2)
        
        # Structure mastery data
        mastery_data = {
            "skills": mastery_data_skills,
            "subjects": subject_breakdown
        }
        
        # Create snapshot
        snapshot_record = {
            "family_id": family_id,
            "child_id": child_id,
            "snapshot_date": snapshot_dt.date().isoformat(),
            "mastery_data": mastery_data
        }
        
        result = supabase.table("mastery_snapshots").upsert(snapshot_record, on_conflict="child_id,snapshot_date").execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create snapshot"
            )
        
        return {"success": True, "snapshot_id": result.data[0]["id"]}
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("accreditation.snapshot.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create snapshot: {str(e)}"
        )


# ============================================================
# Routes - College Readiness Dashboard
# ============================================================

@router.get("/college-readiness", response_model=CollegeReadinessOut)
async def get_college_readiness(
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get college readiness dashboard data for a child.
    Calculates GPA, credits, test scores, and readiness score.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family not found"
            )
        
        # Verify child belongs to family and get grade
        child_res = supabase.table("children").select("id, first_name, family_id, grade").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data.get("family_id") != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child not accessible"
            )
        
        # Check if child is in 8th grade or higher
        child_grade = child_res.data.get("grade", "")
        if child_grade:
            # Normalize grade: "3rd Grade" -> "3", "K" -> "K", etc.
            normalized_grade = child_grade.replace("Kindergarten", "K").replace("K", "K")
            # Extract numeric grade
            grade_match = re.search(r'(\d+)', normalized_grade)
            if grade_match:
                grade_num = int(grade_match.group(1))
                if grade_num < 8:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="College readiness dashboard is only available for 8th grade and above"
                    )
            elif normalized_grade.upper() in ['K', '1', '2', '3', '4', '5', '6', '7']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="College readiness dashboard is only available for 8th grade and above"
                )
        
        # Check if readiness record exists
        readiness_res = supabase.table("college_readiness").select("*").eq("child_id", child_id).maybe_single().execute()
        
        if readiness_res.data:
            data = readiness_res.data
            readiness_score = data.get("readiness_data", {}).get("readiness_score", 0)
            return CollegeReadinessOut(
                child_id=child_id,
                readiness_data=data.get("readiness_data", {}),
                readiness_score=readiness_score,
                calculated_at=data.get("calculated_at", datetime.now().isoformat())
            )
        
        # Calculate readiness metrics
        
        # 1. Academic metrics (GPA, credits, courses)
        grades_res = supabase.table("grades").select(
            "grade, score, credits, subject_id"
        ).eq("child_id", child_id).execute()
        
        # Calculate GPA (simplified: convert letter grades to 4.0 scale)
        grade_points = {
            "A+": 4.0, "A": 4.0, "A-": 3.7,
            "B+": 3.3, "B": 3.0, "B-": 2.7,
            "C+": 2.3, "C": 2.0, "C-": 1.7,
            "D+": 1.3, "D": 1.0, "D-": 0.7,
            "F": 0.0
        }
        
        total_points = 0
        total_credits = 0
        ap_courses = 0
        honors_courses = 0
        
        for grade in (grades_res.data or []):
            credits = grade.get("credits") or 0
            if credits > 0:
                total_credits += credits
                
                # Check for letter grade
                letter_grade = grade.get("grade", "").upper()
                if letter_grade in grade_points:
                    total_points += grade_points[letter_grade] * credits
                elif grade.get("score"):
                    # Convert numeric score to GPA (simplified)
                    score = grade.get("score")
                    if score >= 90:
                        total_points += 4.0 * credits
                    elif score >= 80:
                        total_points += 3.0 * credits
                    elif score >= 70:
                        total_points += 2.0 * credits
                    elif score >= 60:
                        total_points += 1.0 * credits
                
                # Check for AP/Honors (simplified: check term_label or notes)
                term_label = grade.get("term_label", "").upper()
                if "AP" in term_label:
                    ap_courses += 1
                elif "HONORS" in term_label or "HONOR" in term_label:
                    honors_courses += 1
        
        gpa = total_points / total_credits if total_credits > 0 else 0
        
        # 2. Standardized tests (would need separate table, placeholder for now)
        standardized_tests = {
            "sat_score": None,
            "act_score": None,
            "test_dates": []
        }
        
        # 3. Extracurriculars (would need separate tracking, placeholder)
        extracurriculars = {
            "activities": [],
            "leadership_roles": [],
            "volunteer_hours": 0
        }
        
        # Calculate readiness score (0-100)
        # Simplified scoring:
        # - GPA: 40% (0-4.0 scale -> 0-40 points)
        # - Credits: 20% (0-24 credits -> 0-20 points, assuming 24 = full)
        # - AP/Honors: 20% (0-10 courses -> 0-20 points)
        # - Tests: 10% (placeholder)
        # - Extracurriculars: 10% (placeholder)
        
        gpa_score = min(gpa * 10, 40)  # Max 40 points
        credits_score = min((total_credits / 24) * 20, 20) if total_credits > 0 else 0  # Max 20 points
        courses_score = min(((ap_courses + honors_courses) / 10) * 20, 20)  # Max 20 points
        test_score = 0  # Placeholder
        extracurricular_score = 0  # Placeholder
        
        readiness_score = round(gpa_score + credits_score + courses_score + test_score + extracurricular_score, 1)
        
        # Generate recommendations
        recommendations = []
        if gpa < 3.0:
            recommendations.append("Focus on improving grades to reach a 3.0+ GPA")
        if total_credits < 20:
            recommendations.append("Continue earning credits to reach 24+ credits")
        if ap_courses + honors_courses < 3:
            recommendations.append("Consider adding AP or Honors courses")
        if not standardized_tests.get("sat_score") and not standardized_tests.get("act_score"):
            recommendations.append("Consider taking SAT or ACT standardized tests")
        if extracurriculars.get("volunteer_hours", 0) < 100:
            recommendations.append("Aim for 100+ volunteer hours")
        
        readiness_data = {
            "academic": {
                "gpa": round(gpa, 2),
                "credits_earned": round(total_credits, 1),
                "ap_courses": ap_courses,
                "honors_courses": honors_courses
            },
            "standardized_tests": standardized_tests,
            "extracurriculars": extracurriculars,
            "readiness_score": readiness_score,
            "recommendations": recommendations
        }
        
        # Create readiness record
        readiness_record = {
            "family_id": family_id,
            "child_id": child_id,
            "readiness_data": readiness_data,
            "calculated_at": datetime.now().isoformat()
        }
        
        result = supabase.table("college_readiness").upsert(readiness_record, on_conflict="child_id").execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create readiness record"
            )
        
        return CollegeReadinessOut(
            child_id=child_id,
            readiness_data=readiness_data,
            readiness_score=readiness_score,
            calculated_at=result.data[0].get("calculated_at", datetime.now().isoformat())
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("accreditation.readiness.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get college readiness: {str(e)}"
        )


@router.post("/college-readiness/update")
async def update_college_readiness(
    child_id: str,
    input: UpdateCollegeReadinessInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Update college readiness data (test scores, extracurriculars).
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family not found"
            )
        
        # Get existing readiness record
        readiness_res = supabase.table("college_readiness").select("*").eq("child_id", child_id).maybe_single().execute()
        
        if readiness_res.data:
            readiness_data = readiness_res.data.get("readiness_data", {})
        else:
            # Create new record
            readiness_data = {
                "academic": {},
                "standardized_tests": {},
                "extracurriculars": {},
                "readiness_score": 0,
                "recommendations": []
            }
        
        # Update test scores
        if input.test_scores:
            if "standardized_tests" not in readiness_data:
                readiness_data["standardized_tests"] = {}
            readiness_data["standardized_tests"].update(input.test_scores)
        
        # Update extracurriculars
        if input.extracurriculars:
            if "extracurriculars" not in readiness_data:
                readiness_data["extracurriculars"] = {}
            readiness_data["extracurriculars"].update(input.extracurriculars)
        
        # Recalculate readiness score (simplified)
        # This would ideally call the calculation logic from get_college_readiness
        
        # Update record
        update_data = {
            "readiness_data": readiness_data,
            "updated_at": datetime.now().isoformat()
        }
        
        result = supabase.table("college_readiness").upsert({
            "family_id": family_id,
            "child_id": child_id,
            **update_data
        }, on_conflict="child_id").execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update readiness record"
            )
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("accreditation.readiness.update.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update college readiness: {str(e)}"
        )


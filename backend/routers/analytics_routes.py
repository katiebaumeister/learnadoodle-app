"""
FastAPI routes for analytics and recommendations
Provides insights based on outcomes and attendance data
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class SubjectPerformanceRow(BaseModel):
    subject_id: Optional[str]
    subject_name: str
    total_sessions: int
    completed_sessions: int
    avg_rating: Optional[float]
    avg_grade: Optional[str]
    common_strengths: List[str]
    common_struggles: List[str]
    attendance_rate: float


class TrendDataPoint(BaseModel):
    date: str  # Week start date (YYYY-MM-DD)
    avg_rating: Optional[float]
    completed_count: int


class SubjectTrend(BaseModel):
    subject_id: Optional[str]
    subject_name: str
    data_points: List[TrendDataPoint]


class Recommendation(BaseModel):
    type: str  # "struggle", "strength", "attendance", "pacing"
    priority: str  # "high", "medium", "low"
    title: str
    message: str
    action: Optional[str]  # Optional action item
    subject_id: Optional[str]
    subject_name: Optional[str]


class AnalyticsOut(BaseModel):
    subject_performance: List[SubjectPerformanceRow]
    trends: List[SubjectTrend]
    recommendations: List[Recommendation]


@router.get("/subject-performance", response_model=List[SubjectPerformanceRow])
async def get_subject_performance(
    childId: Optional[str] = Query(None, description="Filter by child ID"),
    days: int = Query(90, description="Number of days to look back"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get subject performance analytics aggregated from outcomes and attendance.
    
    Returns:
    - Total sessions, completed sessions, attendance rate
    - Average rating and grade
    - Most common strengths and struggles
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        # Build query for events
        events_query = supabase.table("events").select(
            "id, child_id, subject_id, status, start_ts"
        ).eq("family_id", family_id).gte(
            "start_ts", start_date.isoformat()
        ).lte("start_ts", end_date.isoformat())
        
        if childId:
            events_query = events_query.eq("child_id", childId)
        
        events_res = events_query.execute()
        events = events_res.data or []
        
        # Build query for outcomes
        outcomes_query = supabase.table("event_outcomes").select(
            "id, child_id, subject_id, rating, grade, strengths, struggles, created_at"
        ).eq("family_id", family_id).gte(
            "created_at", start_date.isoformat()
        )
        
        if childId:
            outcomes_query = outcomes_query.eq("child_id", childId)
        
        outcomes_res = outcomes_query.execute()
        outcomes = outcomes_res.data or []
        
        # Build query for attendance
        attendance_query = supabase.table("attendance_records").select(
            "id, child_id, event_id, status"
        ).eq("family_id", family_id).gte(
            "day_date", start_date.isoformat()
        ).lte("day_date", end_date.isoformat())
        
        if childId:
            attendance_query = attendance_query.eq("child_id", childId)
        
        attendance_res = attendance_query.execute()
        attendance = attendance_res.data or []
        
        # Get subject names
        subject_ids = list(set([e.get("subject_id") for e in events if e.get("subject_id")]))
        subject_lookup = {}
        if subject_ids:
            subjects_res = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
            for s in (subjects_res.data or []):
                subject_lookup[s["id"]] = s["name"]
        
        # Aggregate by subject
        by_subject = {}
        
        # Process events
        for event in events:
            subject_id = event.get("subject_id")
            subject_name = subject_lookup.get(subject_id, "Unassigned")
            key = subject_id or "none"
            
            if key not in by_subject:
                by_subject[key] = {
                    "subject_id": subject_id,
                    "subject_name": subject_name,
                    "total_sessions": 0,
                    "completed_sessions": 0,
                    "ratings": [],
                    "grades": [],
                    "strengths": [],
                    "struggles": [],
                    "attendance_present": 0,
                    "attendance_total": 0
                }
            
            by_subject[key]["total_sessions"] += 1
            if event.get("status") == "done":
                by_subject[key]["completed_sessions"] += 1
        
        # Process outcomes
        for outcome in outcomes:
            subject_id = outcome.get("subject_id")
            subject_name = subject_lookup.get(subject_id, "Unassigned")
            key = subject_id or "none"
            
            if key not in by_subject:
                by_subject[key] = {
                    "subject_id": subject_id,
                    "subject_name": subject_name,
                    "total_sessions": 0,
                    "completed_sessions": 0,
                    "ratings": [],
                    "grades": [],
                    "strengths": [],
                    "struggles": [],
                    "attendance_present": 0,
                    "attendance_total": 0
                }
            
            if outcome.get("rating"):
                by_subject[key]["ratings"].append(outcome["rating"])
            if outcome.get("grade"):
                by_subject[key]["grades"].append(outcome["grade"])
            if outcome.get("strengths"):
                by_subject[key]["strengths"].extend(outcome["strengths"])
            if outcome.get("struggles"):
                by_subject[key]["struggles"].extend(outcome["struggles"])
        
        # Process attendance
        attendance_by_event = {a["event_id"]: a for a in attendance}
        for event in events:
            if event["id"] in attendance_by_event:
                subject_id = event.get("subject_id")
                key = subject_id or "none"
                if key in by_subject:
                    by_subject[key]["attendance_total"] += 1
                    if attendance_by_event[event["id"]].get("status") == "present":
                        by_subject[key]["attendance_present"] += 1
        
        # Build response
        result = []
        for key, data in by_subject.items():
            # Calculate averages
            avg_rating = None
            if data["ratings"]:
                avg_rating = sum(data["ratings"]) / len(data["ratings"])
            
            # Most common grade (mode)
            avg_grade = None
            if data["grades"]:
                from collections import Counter
                grade_counts = Counter(data["grades"])
                avg_grade = grade_counts.most_common(1)[0][0]
            
            # Most common strengths/struggles (top 5)
            from collections import Counter
            strengths_counter = Counter(data["strengths"])
            struggles_counter = Counter(data["struggles"])
            
            common_strengths = [tag for tag, _ in strengths_counter.most_common(5)]
            common_struggles = [tag for tag, _ in struggles_counter.most_common(5)]
            
            # Attendance rate
            attendance_rate = 0.0
            if data["attendance_total"] > 0:
                attendance_rate = data["attendance_present"] / data["attendance_total"]
            
            result.append(SubjectPerformanceRow(
                subject_id=data["subject_id"],
                subject_name=data["subject_name"],
                total_sessions=data["total_sessions"],
                completed_sessions=data["completed_sessions"],
                avg_rating=avg_rating,
                avg_grade=avg_grade,
                common_strengths=common_strengths,
                common_struggles=common_struggles,
                attendance_rate=attendance_rate
            ))
        
        # Sort by total sessions (descending)
        result.sort(key=lambda x: x.total_sessions, reverse=True)
        
        log_event("analytics.subject_performance", {
            "family_id": family_id,
            "child_id": childId,
            "subjects_count": len(result)
        })
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("analytics.subject_performance.error", {
            "family_id": family_id,
            "error": str(e)
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get subject performance: {str(e)}"
        )


@router.get("/trends", response_model=List[SubjectTrend])
async def get_trends(
    childId: Optional[str] = Query(None, description="Filter by child ID"),
    weeks: int = Query(12, description="Number of weeks to look back"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get rating trends over time by subject.
    
    Returns weekly data points showing average rating and completion count.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        end_date = date.today()
        start_date = end_date - timedelta(weeks=weeks)
        
        # Get outcomes grouped by week and subject
        outcomes_query = supabase.table("event_outcomes").select(
            "id, child_id, subject_id, rating, created_at"
        ).eq("family_id", family_id).gte(
            "created_at", start_date.isoformat()
        )
        
        if childId:
            outcomes_query = outcomes_query.eq("child_id", childId)
        
        outcomes_res = outcomes_query.execute()
        outcomes = outcomes_res.data or []
        
        # Get subject names
        subject_ids = list(set([o.get("subject_id") for o in outcomes if o.get("subject_id")]))
        subject_lookup = {}
        if subject_ids:
            subjects_res = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
            for s in (subjects_res.data or []):
                subject_lookup[s["id"]] = s["name"]
        
        # Group by subject and week
        by_subject_week = {}
        
        for outcome in outcomes:
            subject_id = outcome.get("subject_id")
            subject_name = subject_lookup.get(subject_id, "Unassigned")
            key = subject_id or "none"
            
            # Calculate week start (Monday)
            created_date = datetime.fromisoformat(outcome["created_at"].replace("Z", "+00:00")).date()
            days_since_monday = created_date.weekday()
            week_start = created_date - timedelta(days=days_since_monday)
            week_key = f"{key}:{week_start.isoformat()}"
            
            if key not in by_subject_week:
                by_subject_week[key] = {
                    "subject_id": subject_id,
                    "subject_name": subject_name,
                    "weeks": {}
                }
            
            if week_key not in by_subject_week[key]["weeks"]:
                by_subject_week[key]["weeks"][week_key] = {
                    "week_start": week_start.isoformat(),
                    "ratings": [],
                    "completed_count": 0
                }
            
            if outcome.get("rating"):
                by_subject_week[key]["weeks"][week_key]["ratings"].append(outcome["rating"])
            by_subject_week[key]["weeks"][week_key]["completed_count"] += 1
        
        # Build response
        result = []
        for key, data in by_subject_week.items():
            data_points = []
            for week_key, week_data in sorted(data["weeks"].items(), key=lambda x: x[1]["week_start"]):
                avg_rating = None
                if week_data["ratings"]:
                    avg_rating = sum(week_data["ratings"]) / len(week_data["ratings"])
                
                data_points.append(TrendDataPoint(
                    date=week_data["week_start"],
                    avg_rating=avg_rating,
                    completed_count=week_data["completed_count"]
                ))
            
            result.append(SubjectTrend(
                subject_id=data["subject_id"],
                subject_name=data["subject_name"],
                data_points=data_points
            ))
        
        log_event("analytics.trends", {
            "family_id": family_id,
            "child_id": childId,
            "subjects_count": len(result)
        })
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("analytics.trends.error", {
            "family_id": family_id,
            "error": str(e)
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get trends: {str(e)}"
        )


@router.get("/recommendations", response_model=List[Recommendation])
async def get_recommendations(
    childId: Optional[str] = Query(None, description="Filter by child ID"),
    days: int = Query(30, description="Number of days to analyze"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate AI-powered recommendations based on outcomes and attendance patterns.
    
    Analyzes:
    - Recent struggles → suggests shorter sessions or extra practice
    - Strong performance → suggests advancing topics
    - Low attendance → suggests checking for burnout
    - Declining ratings → suggests reviewing approach
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        # Get recent outcomes
        outcomes_query = supabase.table("event_outcomes").select(
            "id, child_id, subject_id, rating, strengths, struggles, created_at"
        ).eq("family_id", family_id).gte(
            "created_at", start_date.isoformat()
        )
        
        if childId:
            outcomes_query = outcomes_query.eq("child_id", childId)
        
        outcomes_res = outcomes_query.execute()
        outcomes = outcomes_res.data or []
        
        # Get attendance data
        attendance_query = supabase.table("attendance_records").select(
            "id, child_id, event_id, status, day_date"
        ).eq("family_id", family_id).gte(
            "day_date", start_date.isoformat()
        )
        
        if childId:
            attendance_query = attendance_query.eq("child_id", childId)
        
        attendance_res = attendance_query.execute()
        attendance = attendance_res.data or []
        
        # Get subject names
        subject_ids = list(set([o.get("subject_id") for o in outcomes if o.get("subject_id")]))
        subject_lookup = {}
        if subject_ids:
            subjects_res = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
            for s in (subjects_res.data or []):
                subject_lookup[s["id"]] = s["name"]
        
        recommendations = []
        
        # Analyze by subject
        by_subject = {}
        for outcome in outcomes:
            subject_id = outcome.get("subject_id")
            key = subject_id or "none"
            if key not in by_subject:
                by_subject[key] = {
                    "subject_id": subject_id,
                    "subject_name": subject_lookup.get(subject_id, "Unassigned"),
                    "ratings": [],
                    "struggles": [],
                    "strengths": []
                }
            
            if outcome.get("rating"):
                by_subject[key]["ratings"].append(outcome["rating"])
            if outcome.get("struggles"):
                by_subject[key]["struggles"].extend(outcome["struggles"])
            if outcome.get("strengths"):
                by_subject[key]["strengths"].extend(outcome["strengths"])
        
        # Generate recommendations
        for key, data in by_subject.items():
            subject_id = data["subject_id"]
            subject_name = data["subject_name"]
            
            # Check for repeated struggles
            if data["struggles"]:
                from collections import Counter
                struggle_counts = Counter(data["struggles"])
                top_struggle = struggle_counts.most_common(1)[0]
                
                if top_struggle[1] >= 3:  # Appears 3+ times
                    recommendations.append(Recommendation(
                        type="struggle",
                        priority="high",
                        title=f"Repeated struggles in {subject_name}",
                        message=f"'{top_struggle[0]}' appears {top_struggle[1]} times in recent outcomes. Consider scheduling shorter, more frequent sessions or adding extra practice.",
                        action=f"Schedule shorter {subject_name} sessions",
                        subject_id=subject_id,
                        subject_name=subject_name
                    ))
            
            # Check for strong performance
            if data["ratings"]:
                avg_rating = sum(data["ratings"]) / len(data["ratings"])
                if avg_rating >= 4.5 and len(data["ratings"]) >= 5:
                    recommendations.append(Recommendation(
                        type="strength",
                        priority="medium",
                        title=f"Excellent progress in {subject_name}",
                        message=f"Average rating of {avg_rating:.1f}/5 over {len(data['ratings'])} sessions. Consider advancing to more challenging topics.",
                        action=f"Review {subject_name} curriculum for advancement",
                        subject_id=subject_id,
                        subject_name=subject_name
                    ))
            
            # Check for declining trend
            if len(data["ratings"]) >= 6:
                recent_avg = sum(data["ratings"][-3:]) / 3
                earlier_avg = sum(data["ratings"][:3]) / 3
                if recent_avg < earlier_avg - 0.5:  # Declined by 0.5+
                    recommendations.append(Recommendation(
                        type="pacing",
                        priority="high",
                        title=f"Performance declining in {subject_name}",
                        message=f"Average rating dropped from {earlier_avg:.1f} to {recent_avg:.1f}. Review approach or consider adjusting pace.",
                        action=f"Review {subject_name} teaching approach",
                        subject_id=subject_id,
                        subject_name=subject_name
                    ))
        
        # Check attendance rate
        if attendance:
            present_count = sum(1 for a in attendance if a.get("status") == "present")
            attendance_rate = present_count / len(attendance)
            
            if attendance_rate < 0.8:  # Less than 80%
                recommendations.append(Recommendation(
                    type="attendance",
                    priority="medium",
                    title="Low attendance rate",
                    message=f"Attendance rate is {attendance_rate*100:.0f}% over the last {days} days. Check for burnout or scheduling conflicts.",
                    action="Review schedule and check in with child",
                    subject_id=None,
                    subject_name=None
                ))
        
        # Sort by priority (high first)
        priority_order = {"high": 0, "medium": 1, "low": 2}
        recommendations.sort(key=lambda r: priority_order.get(r.priority, 3))
        
        log_event("analytics.recommendations", {
            "family_id": family_id,
            "child_id": childId,
            "recommendations_count": len(recommendations)
        })
        
        return recommendations
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("analytics.recommendations.error", {
            "family_id": family_id,
            "error": str(e)
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recommendations: {str(e)}"
        )


@router.get("/overview", response_model=AnalyticsOut)
async def get_analytics_overview(
    childId: Optional[str] = Query(None, description="Filter by child ID"),
    days: int = Query(90, description="Days for performance data"),
    weeks: int = Query(12, description="Weeks for trends"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get complete analytics overview: performance, trends, and recommendations.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    try:
        # Call the other endpoints directly (they're in the same module)
        performance = await get_subject_performance(
            childId=childId,
            days=days,
            user=user,
            __=None
        )
        
        trends = await get_trends(
            childId=childId,
            weeks=weeks,
            user=user,
            __=None
        )
        
        recommendations = await get_recommendations(
            childId=childId,
            days=min(days, 30),  # Recommendations use last 30 days
            user=user,
            __=None
        )
        
        return AnalyticsOut(
            subject_performance=performance,
            trends=trends,
            recommendations=recommendations
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("analytics.overview.error", {
            "family_id": family_id,
            "error": str(e)
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get analytics overview: {str(e)}"
        )


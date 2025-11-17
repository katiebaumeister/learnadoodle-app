"""
Blackout Sync Routes
Part of Phase 1 - Year-Round Intelligence Core (Chunk G)
Syncs state holidays/blackouts into calendar_days_cache
"""

from fastapi import APIRouter, Query, Depends, HTTPException, status
from typing import Optional
from datetime import datetime, date
import json
import logging

import sys
from pathlib import Path

# Add parent directory to path (same pattern as year_routes.py)
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from supabase_client import get_admin_client
from logger import log_event

def hash_family_id(family_id: str) -> str:
    """Hash family ID for logging (matches year_routes pattern)"""
    import hashlib
    return hashlib.sha256(family_id.encode()).hexdigest()[:16]

router = APIRouter(prefix="/api/year", tags=["blackouts"])

logger = logging.getLogger(__name__)


@router.get("/sync_blackouts")
async def sync_blackouts(
    year: int = Query(..., description="Year (e.g., 2025)"),
    state: str = Query(..., description="State code (e.g., CA)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Sync state holidays/blackouts from storage bucket into calendar_days_cache.
    Marks days as is_shiftable=false.
    """
    log_event("year.sync_blackouts.start", user_id=user["id"], year=year, state=state)
    
    try:
        # Get user's family ID
        supabase = get_admin_client()
        profile_resp = supabase.table("profiles").select("family_id").eq("id", user["id"]).single().execute()
        
        if not profile_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        family_id = profile_resp.data["family_id"]
        
        # Try to read from storage bucket: state_blackouts/{STATE}/{YEAR}.json
        bucket_name = "state_blackouts"
        file_path = f"{state}/{year}.json"
        
        try:
            file_resp = supabase.storage.from_(bucket_name).download(file_path)
            
            if not file_resp:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Blackout file not found: {file_path}"
                )
            
            # Parse JSON
            blackout_data = json.loads(file_resp.decode('utf-8'))
            
            if not isinstance(blackout_data, list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid blackout file format: expected array of dates"
                )
            
            # Upsert into calendar_days_cache
            upserted = 0
            skipped = 0
            
            for date_str in blackout_data:
                try:
                    # Parse date string (expecting YYYY-MM-DD)
                    blackout_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                    
                    # Upsert into calendar_days_cache
                    # Note: calendar_days_cache might need family_id, date, and other fields
                    # Adjust based on your actual schema
                    upsert_resp = supabase.table("calendar_days_cache").upsert({
                        "family_id": family_id,
                        "date": blackout_date.isoformat(),
                        "day_status": "off",
                        "is_shiftable": False,
                        "is_frozen": False,
                    }, {
                        "on_conflict": "family_id,date",
                        "ignore_duplicates": False
                    }).execute()
                    
                    if upsert_resp.data:
                        upserted += 1
                    else:
                        skipped += 1
                        
                except ValueError as e:
                    logger.warning(f"Invalid date format in blackout file: {date_str}: {e}")
                    skipped += 1
                    continue
                except Exception as e:
                    logger.error(f"Error upserting blackout date {date_str}: {e}")
                    skipped += 1
                    continue
            
            log_event(
                "year.sync_blackouts.success",
                user_id=user["id"],
                family_hash=hash_family_id(family_id),
                year=year,
                state=state,
                upserted=upserted,
                skipped=skipped
            )
            
            return {
                "success": True,
                "year": year,
                "state": state,
                "upserted": upserted,
                "skipped": skipped,
                "total": len(blackout_data)
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error reading blackout file: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read blackout file: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("year.sync_blackouts.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync blackouts: {str(e)}"
        )


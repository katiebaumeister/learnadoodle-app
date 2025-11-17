"""
FastAPI routes for state standards lookup
Returns curriculum requirements for compliance sidebar
"""
from fastapi import APIRouter, HTTPException, Depends, Path as PathParam
from typing import Dict, Any
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from logger import log_event

router = APIRouter(prefix="/api/state_standards", tags=["standards"])

# Mock state standards data - in production, this would come from a database or external API
STATE_STANDARDS_DATA: Dict[str, Dict[str, Any]] = {
    "CA": {
        "name": "California",
        "standards": "Common Core State Standards",
        "subjects": ["English Language Arts", "Mathematics", "Science", "History-Social Science"],
        "testing": ["CAASPP"],
        "hours_required": None,  # Varies by grade
    },
    "NY": {
        "name": "New York",
        "standards": "Next Generation Learning Standards",
        "subjects": ["English Language Arts", "Mathematics", "Science", "Social Studies"],
        "testing": ["NYSED Assessments"],
        "hours_required": None,
    },
    "TX": {
        "name": "Texas",
        "standards": "Texas Essential Knowledge and Skills (TEKS)",
        "subjects": ["English Language Arts", "Mathematics", "Science", "Social Studies"],
        "testing": ["STAAR"],
        "hours_required": None,
    },
    # Add more states as needed
}


@router.get("/{state}")
async def get_state_standards(
    state: str = PathParam(..., description="Two-letter state code (e.g., CA, NY, TX)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Returns curriculum requirements for a given state.
    Used for compliance sidebar display.
    """
    state_upper = state.upper()
    
    if state_upper not in STATE_STANDARDS_DATA:
        # Return a generic response for states not in our database
        log_event("state_standards.lookup", user_id=user["id"], state=state_upper, found=False)
        return {
            "state": state_upper,
            "name": state_upper,
            "standards": "State-specific standards",
            "subjects": ["English Language Arts", "Mathematics", "Science", "Social Studies"],
            "testing": [],
            "hours_required": None,
            "note": "Specific requirements may vary. Please consult your state's education department.",
        }
    
    log_event("state_standards.lookup", user_id=user["id"], state=state_upper, found=True)
    return STATE_STANDARDS_DATA[state_upper]


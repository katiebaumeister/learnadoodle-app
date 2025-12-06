"""
Planner Instrumentation & Logging Module
Tracks planner runs, errors, warnings, and user actions
"""
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import time
import logging
import traceback
from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Global Supabase client (will be initialized)
_supabase: Optional[Client] = None


def init_instrumentation(supabase_url: str, supabase_key: str) -> None:
    """Initialize the instrumentation module with Supabase client"""
    global _supabase
    _supabase = create_client(supabase_url, supabase_key)
    logger.info("Planner instrumentation initialized")


def get_supabase() -> Client:
    """Get the Supabase client"""
    if _supabase is None:
        raise RuntimeError("Instrumentation not initialized. Call init_instrumentation() first.")
    return _supabase


# ============================================================================
# Planner Runs
# ============================================================================

def log_run_start(
    family_id: str,
    child_id: Optional[str],
    mode: str,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """
    Log the start of a planner run
    
    Args:
        family_id: Family UUID
        child_id: Child UUID (optional)
        mode: Run mode ('auto_reschedule', 'manual_adjustment', 'full_plan', 'weekly_rules_update')
        metadata: Additional context
    
    Returns:
        Run ID (UUID string)
    """
    try:
        supabase = get_supabase()
        
        payload = {
            "family_id": family_id,
            "child_id": child_id,
            "mode": mode,
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "metadata": metadata or {}
        }
        
        result = supabase.table("planner_runs").insert(payload).execute()
        
        if result.data and len(result.data) > 0:
            run_id = result.data[0]["id"]
            logger.debug(f"Planner run started: {run_id} (mode={mode}, child_id={child_id})")
            return run_id
        else:
            logger.error("Failed to create planner run: No data returned")
            return None
    except Exception as e:
        logger.error(f"Error logging planner run start: {e}", exc_info=True)
        return None


def log_run_end(
    run_id: str,
    status: str,
    event_count: Optional[int] = None,
    task_count: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Log the end of a planner run
    
    Args:
        run_id: Run ID from log_run_start()
        status: Final status ('completed', 'failed', 'cancelled')
        event_count: Number of events created/updated
        task_count: Number of tasks processed
        metadata: Additional context
    
    Returns:
        True if successful
    """
    if not run_id:
        return False
    
    try:
        supabase = get_supabase()
        
        # Calculate duration
        run_data = supabase.table("planner_runs").select("started_at").eq("id", run_id).execute()
        if not run_data.data:
            logger.warning(f"Run {run_id} not found for duration calculation")
            return False
        
        # Parse started_at and ensure it's timezone-aware
        started_at_str = run_data.data[0]["started_at"]
        if started_at_str.endswith("Z"):
            started_at = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
        else:
            started_at = datetime.fromisoformat(started_at_str)
            if started_at.tzinfo is None:
                # If naive, assume UTC
                started_at = started_at.replace(tzinfo=timezone.utc)
        
        # Use timezone-aware datetime for finished_at
        finished_at = datetime.now(timezone.utc)
        
        # Calculate duration (both are now timezone-aware)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
        
        payload = {
            "finished_at": finished_at.isoformat().replace('+00:00', 'Z'),
            "status": status,
            "duration_ms": duration_ms,
            "metadata": metadata or {}
        }
        
        if event_count is not None:
            payload["event_count"] = event_count
        if task_count is not None:
            payload["task_count"] = task_count
        
        result = supabase.table("planner_runs").update(payload).eq("id", run_id).execute()
        
        if result.data:
            logger.debug(
                f"Planner run ended: {run_id} (status={status}, duration={duration_ms}ms, "
                f"events={event_count})"
            )
            return True
        else:
            logger.error(f"Failed to update planner run: {run_id}")
            return False
    except Exception as e:
        logger.error(f"Error logging planner run end: {e}", exc_info=True)
        return False


# ============================================================================
# Errors
# ============================================================================

def log_error(
    family_id: str,
    child_id: Optional[str],
    error_type: str,
    message: str,
    run_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    exception: Optional[Exception] = None
) -> Optional[str]:
    """
    Log a planner error
    
    Args:
        family_id: Family UUID
        child_id: Child UUID (optional)
        error_type: Error classification ('validation_error', 'api_error', 'database_error', etc.)
        message: Error message
        run_id: Associated run ID (optional)
        metadata: Additional context
        exception: Exception object (optional, for stack trace)
    
    Returns:
        Error ID (UUID string) or None
    """
    try:
        supabase = get_supabase()
        
        stack_trace = None
        if exception:
            stack_trace = traceback.format_exc()
        
        payload = {
            "family_id": family_id,
            "child_id": child_id,
            "run_id": run_id,
            "error_type": error_type,
            "message": message,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        }
        
        if stack_trace:
            payload["stack_trace"] = stack_trace
        
        result = supabase.table("planner_errors").insert(payload).execute()
        
        if result.data and len(result.data) > 0:
            error_id = result.data[0]["id"]
            logger.warning(f"Planner error logged: {error_id} ({error_type}): {message}")
            return error_id
        else:
            logger.error("Failed to log planner error: No data returned")
            return None
    except Exception as e:
        logger.error(f"Error logging planner error: {e}", exc_info=True)
        return None


# ============================================================================
# Warnings
# ============================================================================

def log_warning(
    family_id: str,
    child_id: Optional[str],
    warning_type: str,
    message: str,
    run_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Log a planner warning (non-fatal issue)
    
    Args:
        family_id: Family UUID
        child_id: Child UUID (optional)
        warning_type: Warning classification ('constraint_violation', 'optimization_warning', etc.)
        message: Warning message
        run_id: Associated run ID (optional)
        metadata: Additional context
    
    Returns:
        Warning ID (UUID string) or None
    """
    try:
        supabase = get_supabase()
        
        payload = {
            "family_id": family_id,
            "child_id": child_id,
            "run_id": run_id,
            "warning_type": warning_type,
            "message": message,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        }
        
        result = supabase.table("planner_warnings").insert(payload).execute()
        
        if result.data and len(result.data) > 0:
            warning_id = result.data[0]["id"]
            logger.info(f"Planner warning logged: {warning_id} ({warning_type}): {message}")
            return warning_id
        else:
            logger.error("Failed to log planner warning: No data returned")
            return None
    except Exception as e:
        logger.error(f"Error logging planner warning: {e}", exc_info=True)
        return None


# ============================================================================
# User Actions
# ============================================================================

def log_action(
    family_id: str,
    user_id: str,
    action_type: str,
    child_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Log a user action in the planner UI
    
    Args:
        family_id: Family UUID
        user_id: User UUID
        action_type: Action classification ('drag_drop', 'add_event', 'delete_event', etc.)
        child_id: Child UUID (optional)
        metadata: Additional context (event IDs, dates, etc.)
    
    Returns:
        Action ID (UUID string) or None
    """
    try:
        supabase = get_supabase()
        
        payload = {
            "family_id": family_id,
            "user_id": user_id,
            "child_id": child_id,
            "action_type": action_type,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        }
        
        result = supabase.table("planner_user_actions").insert(payload).execute()
        
        if result.data and len(result.data) > 0:
            action_id = result.data[0]["id"]
            logger.debug(f"User action logged: {action_id} ({action_type})")
            return action_id
        else:
            logger.error("Failed to log user action: No data returned")
            return None
    except Exception as e:
        logger.error(f"Error logging user action: {e}", exc_info=True)
        return None


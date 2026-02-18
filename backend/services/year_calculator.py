"""
Year Planning Calculation Engine

Deterministic functions for computing instructional days, hours, and end dates.
No AI - pure mathematical calculations based on:
- Allowed weekdays (Mon-Fri default)
- Holidays (global + custom)
- Start/end dates
- Target days or hours

WEEKDAY CONVENTION:
- This module uses: 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
- Python's date.weekday() returns: 0=Monday, 1=Tuesday, ..., 6=Sunday
- Conversion happens in is_instructional_day() to normalize to our convention
- API boundary should normalize input to this convention before calling these functions
"""

from typing import List, Set, Optional
from datetime import date, timedelta
from enum import Enum
import math


class CalculationMode(str, Enum):
    """Academic year calculation modes"""
    FIXED_END = "FIXED_END"  # End date is fixed, compute days/hours
    TARGET_DAYS = "TARGET_DAYS"  # Target days is fixed, compute end date
    TARGET_HOURS = "TARGET_HOURS"  # Target hours is fixed, compute end date


def is_instructional_day(
    check_date: date,
    allowed_weekdays: List[int],
    holiday_dates: Set[date]
) -> bool:
    """
    Check if a date is an instructional day
    
    Args:
        check_date: Date to check
        allowed_weekdays: List of weekday numbers in our convention (0=Sunday, 1=Monday, ..., 6=Saturday)
        holiday_dates: Set of holiday dates (as date objects)
    
    Returns:
        True if the date is an instructional day
    
    Note:
        Weekday convention: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
        This function converts from Python's weekday() (Mon=0, Sun=6) to our convention (Sun=0, Sat=6)
    """
    # Convert Python weekday (Mon=0, Sun=6) to our convention (Sun=0, Sat=6)
    # Python weekday(): Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    # Our convention:     Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
    python_weekday = check_date.weekday()  # Mon=0, Sun=6
    day_of_week = (python_weekday + 1) % 7  # Convert to Sun=0, Sat=6
    
    # Check if day is in allowed weekdays
    if day_of_week not in allowed_weekdays:
        return False
    
    # Check if date is a holiday
    if check_date in holiday_dates:
        return False
    
    return True


def count_instructional_days(
    start_date: date,
    end_date: date,
    allowed_weekdays: List[int],
    holiday_dates: Set[date]
) -> int:
    """
    Count instructional days in a date range
    
    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        allowed_weekdays: List of weekday numbers (0=Sunday, 6=Saturday)
        holiday_dates: Set of holiday dates
    
    Returns:
        Number of instructional days
    """
    count = 0
    current_date = start_date
    
    while current_date <= end_date:
        if is_instructional_day(current_date, allowed_weekdays, holiday_dates):
            count += 1
        current_date += timedelta(days=1)
    
    return count


def get_instructional_dates_list(
    start_date: date,
    end_date: date,
    allowed_weekdays: List[int],
    holiday_dates: Set[date],
    limit: Optional[int] = None,
) -> List[date]:
    """
    Return ordered list of instructional dates in range.
    Optionally limit to first N dates (e.g. first 180 for plan year).

    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        allowed_weekdays: List of weekday numbers (0=Sunday, 6=Saturday)
        holiday_dates: Set of holiday dates
        limit: If set, return at most this many dates (first N in order)

    Returns:
        List of date objects in chronological order
    """
    result: List[date] = []
    current_date = start_date

    while current_date <= end_date:
        if is_instructional_day(current_date, allowed_weekdays, holiday_dates):
            result.append(current_date)
            if limit is not None and len(result) >= limit:
                break
        current_date += timedelta(days=1)

    return result


def compute_end_date(
    start_date: date,
    target_days: int,
    allowed_weekdays: List[int],
    holiday_dates: Set[date],
    max_iterations: int = 5000
) -> date:
    """
    Compute end date given start date and target instructional days
    
    Args:
        start_date: Start date
        target_days: Target number of instructional days (must be > 0)
        allowed_weekdays: List of weekday numbers (0=Sunday, 6=Saturday)
        holiday_dates: Set of holiday dates
        max_iterations: Safety limit to prevent infinite loops (default: 5000 days ~13.7 years)
    
    Returns:
        End date (last instructional day)
    
    Raises:
        RuntimeError: If max_iterations is exceeded (indicates invalid inputs or too many holidays)
        ValueError: If target_days <= 0
    """
    if target_days <= 0:
        raise ValueError("target_days must be greater than 0")
    
    count = 0
    current_date = start_date
    
    for iteration in range(max_iterations):
        if is_instructional_day(current_date, allowed_weekdays, holiday_dates):
            count += 1
            # If we've reached target, this is the last instructional day
            if count == target_days:
                return current_date
        
        current_date += timedelta(days=1)
    
    # If we hit max iterations, raise an error rather than silently returning wrong date
    raise RuntimeError(
        f"compute_end_date exceeded max_iterations ({max_iterations}); "
        f"reached {count} of {target_days} instructional days. "
        f"Check inputs: allowed_weekdays={allowed_weekdays}, "
        f"holiday_count={len(holiday_dates)}, start_date={start_date.isoformat()}"
    )


def compute_days_from_hours(
    target_hours: int,
    hours_per_day: float
) -> int:
    """
    Convert target hours to target days
    
    Args:
        target_hours: Target instructional hours (must be > 0)
        hours_per_day: Hours per instructional day (must be > 0)
    
    Returns:
        Target instructional days (rounded up)
    
    Raises:
        ValueError: If target_hours <= 0 or hours_per_day <= 0
    """
    if target_hours <= 0:
        raise ValueError("target_hours must be greater than 0")
    if hours_per_day <= 0:
        raise ValueError("hours_per_day must be greater than 0")
    
    return math.ceil(target_hours / hours_per_day)


def compute_hours_from_days(
    instructional_days: int,
    hours_per_day: float
) -> float:
    """
    Convert instructional days to total hours
    
    Args:
        instructional_days: Number of instructional days
        hours_per_day: Hours per instructional day
    
    Returns:
        Total instructional hours
    """
    return instructional_days * hours_per_day


def recalculate_year(
    mode: str,
    start_date: date,
    end_date: Optional[date],
    target_instructional_days: Optional[int],
    target_instructional_hours: Optional[int],
    planned_hours_per_day: Optional[float],
    allowed_weekdays: List[int],
    holiday_dates: Set[date]
) -> dict:
    """
    Main recalculation function - computes missing values based on mode
    
    Args:
        mode: Calculation mode string ("FIXED_END", "TARGET_DAYS", "TARGET_HOURS")
        start_date: Start date
        end_date: End date (required for FIXED_END mode)
        target_instructional_days: Target days (required for TARGET_DAYS mode, must be > 0)
        target_instructional_hours: Target hours (required for TARGET_HOURS mode, must be > 0)
        planned_hours_per_day: Hours per day (required for TARGET_HOURS mode, must be > 0)
        allowed_weekdays: List of allowed weekday numbers (0=Sunday, 6=Saturday)
        holiday_dates: Set of holiday dates
    
    Returns:
        Dictionary with computed values (all dates as ISO strings):
        {
            "instructional_days": int,
            "instructional_hours": float (if hours_per_day provided),
            "end_date": str (ISO format, if computed),
            "non_instructional_days": int (includes weekends + holidays + disallowed weekdays),
            "required_hours": float (for TARGET_HOURS mode, the target),
            "planned_hours": float (for TARGET_HOURS mode, computed days * hours_per_day)
        }
    
    Raises:
        ValueError: For invalid mode, missing required fields, or invalid values (<= 0)
        RuntimeError: If compute_end_date exceeds max_iterations
    """
    # Parse mode string to enum (fixes mode comparison bug)
    try:
        mode_enum = CalculationMode(mode)
    except ValueError:
        raise ValueError(f"Invalid mode: {mode}. Must be one of: FIXED_END, TARGET_DAYS, TARGET_HOURS")
    
    result = {}
    
    if mode_enum == CalculationMode.FIXED_END:
        if not end_date:
            raise ValueError("end_date is required for FIXED_END mode")
        
        # Count instructional days
        instructional_days = count_instructional_days(
            start_date, end_date, allowed_weekdays, holiday_dates
        )
        result["instructional_days"] = instructional_days
        
        # Compute hours if hours_per_day is provided
        if planned_hours_per_day:
            result["instructional_hours"] = compute_hours_from_days(
                instructional_days, planned_hours_per_day
            )
        
        # Count total days
        # non_instructional_days includes: weekends + holidays + any disallowed weekdays
        total_days = (end_date - start_date).days + 1
        result["non_instructional_days"] = total_days - instructional_days
        result["end_date"] = end_date.isoformat()
    
    elif mode_enum == CalculationMode.TARGET_DAYS:
        if target_instructional_days is None or target_instructional_days <= 0:
            raise ValueError(
                "target_instructional_days is required for TARGET_DAYS mode and must be greater than 0"
            )
        
        # Compute end date
        computed_end_date = compute_end_date(
            start_date, target_instructional_days, allowed_weekdays, holiday_dates
        )
        result["end_date"] = computed_end_date.isoformat()
        result["instructional_days"] = target_instructional_days
        
        # Compute hours if hours_per_day is provided
        if planned_hours_per_day:
            result["instructional_hours"] = compute_hours_from_days(
                target_instructional_days, planned_hours_per_day
            )
        
        # Count total days
        # non_instructional_days includes: weekends + holidays + any disallowed weekdays
        total_days = (computed_end_date - start_date).days + 1
        result["non_instructional_days"] = total_days - target_instructional_days
    
    elif mode_enum == CalculationMode.TARGET_HOURS:
        if target_instructional_hours is None or target_instructional_hours <= 0:
            raise ValueError(
                "target_instructional_hours is required for TARGET_HOURS mode and must be greater than 0"
            )
        if planned_hours_per_day is None or planned_hours_per_day <= 0:
            raise ValueError(
                "planned_hours_per_day is required for TARGET_HOURS mode and must be greater than 0"
            )
        
        # Convert hours to days (rounded up)
        target_days = compute_days_from_hours(target_instructional_hours, planned_hours_per_day)
        
        # Compute end date
        computed_end_date = compute_end_date(
            start_date, target_days, allowed_weekdays, holiday_dates
        )
        result["end_date"] = computed_end_date.isoformat()
        result["instructional_days"] = target_days
        
        # Return both required_hours (the target/requirement) and planned_hours (computed)
        result["required_hours"] = float(target_instructional_hours)
        result["planned_hours"] = compute_hours_from_days(target_days, planned_hours_per_day)
        result["instructional_hours"] = result["planned_hours"]  # For backward compatibility
        
        # Count total days
        # non_instructional_days includes: weekends + holidays + any disallowed weekdays
        total_days = (computed_end_date - start_date).days + 1
        result["non_instructional_days"] = total_days - target_days
    
    else:
        raise ValueError(f"Unknown mode: {mode}")
    
    return result

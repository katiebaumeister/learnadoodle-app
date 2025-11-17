"""
Nightly refresh job for external course metadata.

This script:
1. Fetches all courses from the database
2. Re-ingests course specs to detect changes via crawl_checksum
3. Updates courses that have changed
4. Logs metrics and events

Can be run:
- As a standalone script (for external cron)
- Via pg_cron (see add-external-refresh-cron.sql)
- Via FastAPI endpoint (for cloud schedulers)
"""
import json
import os
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

# Add parent directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from supabase_client import get_admin_client
    from logger import log_event
    from metrics import increment_counter
    from tasks.ingest_external_courses import load_course_spec, upsert_course, sha_checksum
except ImportError as e:
    print(f"Error importing modules: {e}", file=sys.stderr)
    sys.exit(1)

SAMPLE_DIR = backend_dir / "tasks" / "samples"


def get_all_courses() -> List[Dict[str, Any]]:
    """Fetch all courses from the database."""
    supabase = get_admin_client()
    resp = supabase.table("external_courses").select(
        "id, provider_id, source_slug, crawl_checksum, last_crawled_at, external_providers(name)"
    ).execute()
    
    if resp.error:
        raise Exception(f"Error fetching courses: {resp.error}")
    
    return resp.data or []


def find_spec_file(source_slug: str, provider_name: str) -> Path:
    """
    Find the spec file for a course.
    Currently looks in samples/ directory. In production, this could:
    - Fetch from a URL
    - Read from S3/storage
    - Use a webhook/API
    """
    # Try common patterns
    patterns = [
        f"khan_{source_slug}.json",
        f"{source_slug}.json",
        f"{provider_name.lower().replace(' ', '_')}_{source_slug}.json",
    ]
    
    for pattern in patterns:
        path = SAMPLE_DIR / pattern
        if path.exists():
            return path
    
    # Fallback: try to find any matching file
    for file in SAMPLE_DIR.glob("*.json"):
        try:
            spec = load_course_spec(file)
            if spec.get("course", {}).get("source_slug") == source_slug:
                return file
        except Exception:
            continue
    
    raise FileNotFoundError(f"No spec file found for source_slug: {source_slug}")


def refresh_course(course: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
    """
    Refresh a single course by re-ingesting its spec.
    Returns dict with status, changed flag, and error if any.
    """
    provider_name = course.get("external_providers", {})
    if isinstance(provider_name, list) and len(provider_name) > 0:
        provider_name = provider_name[0].get("name", "Unknown")
    elif isinstance(provider_name, dict):
        provider_name = provider_name.get("name", "Unknown")
    else:
        provider_name = "Unknown"
    
    source_slug = course.get("source_slug")
    old_checksum = course.get("crawl_checksum")
    
    try:
        spec_path = find_spec_file(source_slug, provider_name)
        spec = load_course_spec(spec_path)
        
        # Calculate new checksum
        course_data = spec.get("course", {})
        new_checksum = sha_checksum(course_data)
        
        changed = old_checksum != new_checksum
        
        if changed:
            log_event(
                "refresh.course.changed",
                course_id=course.get("id"),
                source_slug=source_slug,
                old_checksum=old_checksum[:16] if old_checksum else None,
                new_checksum=new_checksum[:16],
            )
            
            if not dry_run:
                upsert_course(spec)
                increment_counter("refresh.courses.updated")
            else:
                log_event("refresh.course.dry_run", source_slug=source_slug)
        else:
            log_event(
                "refresh.course.unchanged",
                course_id=course.get("id"),
                source_slug=source_slug,
            )
            increment_counter("refresh.courses.unchanged")
        
        return {
            "course_id": course.get("id"),
            "source_slug": source_slug,
            "changed": changed,
            "error": None,
        }
    except FileNotFoundError as e:
        error_msg = str(e)
        log_event(
            "refresh.course.error.spec_not_found",
            course_id=course.get("id"),
            source_slug=source_slug,
            error=error_msg,
        )
        increment_counter("refresh.courses.errors")
        return {
            "course_id": course.get("id"),
            "source_slug": source_slug,
            "changed": False,
            "error": error_msg,
        }
    except Exception as e:
        error_msg = str(e)
        log_event(
            "refresh.course.error",
            course_id=course.get("id"),
            source_slug=source_slug,
            error=error_msg,
        )
        increment_counter("refresh.courses.errors")
        return {
            "course_id": course.get("id"),
            "source_slug": source_slug,
            "changed": False,
            "error": error_msg,
        }


def main(dry_run: bool = False, limit: int = None):
    """
    Main refresh function.
    
    Args:
        dry_run: If True, don't actually update courses
        limit: Maximum number of courses to refresh (None = all)
    """
    log_event("refresh.job.start", dry_run=dry_run, limit=limit)
    increment_counter("refresh.job.runs")
    
    try:
        courses = get_all_courses()
        
        if limit:
            courses = courses[:limit]
        
        log_event("refresh.job.courses_found", count=len(courses))
        
        results = []
        updated_count = 0
        error_count = 0
        
        for course in courses:
            result = refresh_course(course, dry_run=dry_run)
            results.append(result)
            
            if result["error"]:
                error_count += 1
            elif result["changed"]:
                updated_count += 1
        
        log_event(
            "refresh.job.complete",
            total=len(courses),
            updated=updated_count,
            unchanged=len(courses) - updated_count - error_count,
            errors=error_count,
            dry_run=dry_run,
        )
        
        return {
            "status": "success",
            "total": len(courses),
            "updated": updated_count,
            "unchanged": len(courses) - updated_count - error_count,
            "errors": error_count,
            "results": results,
        }
    except Exception as e:
        error_msg = str(e)
        log_event("refresh.job.error", error=error_msg)
        increment_counter("refresh.job.errors")
        print(f"Refresh job failed: {error_msg}", file=sys.stderr)
        return {
            "status": "error",
            "error": error_msg,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Refresh external course metadata"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't actually update courses, just check for changes",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Maximum number of courses to refresh",
    )
    args = parser.parse_args()
    
    result = main(dry_run=args.dry_run, limit=args.limit)
    
    if result["status"] == "error":
        sys.exit(1)
    
    # Print summary
    print(f"Refresh complete:")
    print(f"  Total courses: {result.get('total', 0)}")
    print(f"  Updated: {result.get('updated', 0)}")
    print(f"  Unchanged: {result.get('unchanged', 0)}")
    print(f"  Errors: {result.get('errors', 0)}")


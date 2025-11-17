import json
import os
import argparse
import hashlib
import datetime as dt
from pathlib import Path
from typing import Dict, Any, List
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from supabase_client import get_admin_client
from logger import log_event
from metrics import increment_counter

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore

SAMPLE_DIR = BACKEND_DIR / "tasks" / "samples"


def load_course_spec(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def paraphrase(label: str) -> str:
    label = label.strip()
    if not label:
        return label

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        # Simple fallback: remove common prefixes
        return (
            label.replace("Unit", "").replace(":", "-")
            .replace("Intro to", "Foundations of")
            .strip()
        )

    client = OpenAI()
    prompt = (
        "Rewrite this lesson title in 6 words or fewer, neutral tone, "
        "avoid long overlap with the original:\n"
        f"Original: {label}\n"
        "Rewritten:"
    )
    response = client.responses.create(
        model="gpt-4o-mini",
        input=prompt,
        max_output_tokens=32,
    )
    rewritten = response.output[0].content[0].text.strip()
    if not rewritten:
        return label
    return rewritten


def sha_checksum(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def upsert_course(spec: Dict[str, Any]) -> None:
    supabase = get_admin_client()
    provider = spec["course"]["provider"]

    provider_resp = supabase.table("external_providers").select("id").eq("name", provider).execute()
    if provider_resp.data:
        provider_id = provider_resp.data[0]["id"]
    else:
        raise ValueError(f"Provider '{provider}' not found. Seed providers table first.")

    course = spec["course"]
    slug = course["source_slug"]
    checksum = sha_checksum(course)
    log_event("ingest.course.start", provider=provider, slug=slug)

    upsert_course_resp = supabase.table("external_courses").upsert(
        {
            "provider_id": provider_id,
            "source_slug": slug,
            "public_url": course["public_url"],
            "subject": course.get("subject"),
            "grade_band": course.get("grade_band"),
            "lesson_count": sum(len(u.get("lessons", [])) for u in course["units"]),
            "last_crawled_at": dt.datetime.utcnow().isoformat(),
            "crawl_checksum": checksum,
            "subject_key": course.get("subject_key"),
            "stage_key": course.get("stage_key"),
        },
        on_conflict="provider_id,source_slug",
        ignore_duplicates=False,
    ).execute()

    course_id = upsert_course_resp.data[0]["id"]

    # Upsert units and lessons
    for unit in course["units"]:
        unit_payload = {
            "course_id": course_id,
            "ordinal": unit["ordinal"],
            "title_raw": unit["title_raw"],
            "title_safe": paraphrase(unit["title_raw"]),
            "public_url": unit.get("public_url"),
        }
        unit_resp = supabase.table("external_units").upsert(
            unit_payload,
            on_conflict="course_id,ordinal",
            ignore_duplicates=False,
        ).execute()
        unit_id = unit_resp.data[0]["id"]

        lesson_rows: List[Dict[str, Any]] = []
        for lesson in unit.get("lessons", []):
            lesson_rows.append(
                {
                    "unit_id": unit_id,
                    "ordinal": lesson["ordinal"],
                    "title_raw": lesson["title_raw"],
                    "title_safe": paraphrase(lesson["title_raw"]),
                    "resource_type": lesson.get("resource_type", "unknown"),
                    "public_url": lesson["public_url"],
                    "duration_minutes_est": lesson.get("duration_minutes_est"),
                    "is_free_to_access": lesson.get("is_free_to_access", True),
                }
            )

        if lesson_rows:
            supabase.table("external_lessons").upsert(
                lesson_rows,
                on_conflict="unit_id,ordinal",
                ignore_duplicates=False,
            ).execute()

    log_event("ingest.course.success", provider=provider, slug=slug, units=len(course["units"]))
    increment_counter("ingest_courses")


def main():
    parser = argparse.ArgumentParser(description="Ingest external course metadata")
    parser.add_argument(
        "spec",
        help="Path to JSON spec (defaults to sample)",
        nargs="?",
        default=str(SAMPLE_DIR / "khan_algebra.json"),
    )
    args = parser.parse_args()
    spec_path = Path(args.spec)

    if not spec_path.exists():
        raise FileNotFoundError(f"Spec file not found: {spec_path}")

    spec = load_course_spec(spec_path)
    upsert_course(spec)
    log_event("ingest.script.complete", spec=str(spec_path))


if __name__ == "__main__":
    main()

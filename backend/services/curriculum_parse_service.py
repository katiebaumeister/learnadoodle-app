"""
Plain-text curriculum extraction (Import & extract).
Uses deterministic pre-parse + OpenAI to extract structure from pasted text.
Does NOT generate or invent content; only extracts what is present.

Implementation note (Import & extract feature):
- Raw text is received: POST /api/curriculum/parse-text (curriculum_routes.py) receives raw_text in body.
- Pre-parsing: services/plain_text_preparser.py preparse_plain_text() runs first (line tagging, structure hints).
- OpenAI extraction: extract_curriculum_from_plain_text() in this module builds prompt with pre-parse summary
  and raw text, calls OpenAI with strict extraction-only instructions.
- Validation/normalization: _validate_and_normalize_parsed() in this module normalizes LLM output into
  ParsedDraftCurriculum shape; fallback single unit for flat lesson lists when needed.
- Source rows saved: POST /api/curriculum/commit-parsed-draft inserts into syllabus_imports (raw_text, metadata).
- Canonical curriculum rows: same commit inserts curriculum_units (source_type=plain_text_parsed, source_ref=
  syllabus_import_id) and curriculum_lessons linked to those units.
- Scheduling hook: Later, Plan My Year or commit engine can list curriculum_lessons by subject (subject_tags)
  and map onto placeholder slots or set events.curriculum_lesson_id.
"""
import json
import re
import uuid
from typing import Any, Dict, List, Optional

from services.plain_text_preparser import PreParseResult, preparse_plain_text


ALLOWED_LESSON_TYPES = {"lesson", "assignment", "project", "assessment", "reading", "lab", "review", "activity"}


def _ensure_temp_id() -> str:
    return f"temp-{uuid.uuid4().hex[:12]}"


def _coerce_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return max(0, min(1, float(val)))
    try:
        return max(0, min(1, float(val)))
    except (TypeError, ValueError):
        return None


def _build_system_prompt() -> str:
    return """You are a curriculum structure extraction assistant.
Your task is to extract structured educational content from user-provided text only.
Do NOT invent curriculum that is not present in the source.
Do NOT add extra lessons, units, or assignments unless clearly stated in the text.
Do NOT write learning objectives or descriptions unless they appear in the source.
Return valid JSON only. No markdown. No commentary outside the JSON.

Use the source text and pre-parse hints to identify:
- units (or week/section groupings)
- lessons (or day/session items)
- assignments
- assessments
- dates or due hints

If something is ambiguous, include it in unassigned_items with a reason, or set a low confidence.
Preserve sequence and original wording as much as possible.
When instructed to ignore policy text, do not include it in units/lessons; list it in ignored_items with reason.
Do not expand or elaborate; only extract what is there."""


def _build_user_prompt(
    raw_text: str,
    pre_parse: PreParseResult,
    subject_name: str,
    source_type: Optional[str],
    parse_mode: Optional[str],
    detect_dates: bool,
    preserve_headings: bool,
    ignore_policy: bool,
    extract_assignments: bool,
    extract_assessments: bool,
    special_instructions: Optional[str],
) -> str:
    lines_summary = []
    for ln in pre_parse.lines[:200]:  # cap for prompt size
        lines_summary.append(f"  {ln.line_index}: [{ln.heuristic_tag}] {ln.raw[:80]}")
    structure = pre_parse.likely_structure
    parts = [
        f"Subject: {subject_name}",
        f"Source type: {source_type or 'auto_detect'}",
        f"Parse mode: {parse_mode or 'auto_detect'}",
        f"Detect dates: {detect_dates}",
        f"Preserve source headings: {preserve_headings}",
        f"Ignore policy/admin text: {ignore_policy}",
        f"Extract assignments: {extract_assignments}",
        f"Extract assessments: {extract_assessments}",
        "",
        "Pre-parser summary:",
        f"  dominant_mode: {structure.get('dominant_mode', 'mixed')}",
        f"  contains_dates: {structure.get('contains_dates', False)}",
        f"  contains_assignments: {structure.get('contains_assignments', False)}",
        f"  contains_assessments: {structure.get('contains_assessments', False)}",
        f"  contains_admin_text: {structure.get('contains_admin_text', False)}",
        "",
        "Tagged lines (line_index, heuristic_tag, raw):",
        "\n".join(lines_summary[:100]),
        "",
        "RAW SOURCE TEXT (extract from this only):",
        "---",
        raw_text[:25000],
        "---",
    ]
    if special_instructions:
        parts.insert(-2, f"Special instructions: {special_instructions}")

    schema = """
Return a single JSON object with this structure (no other top-level keys):
{
  "summary": "optional one-line summary of what was extracted",
  "units": [
    {
      "temp_id": "unique-string",
      "source_label": "optional original heading text",
      "title": "unit title",
      "description": null,
      "sequence_index": 1,
      "inferred_from": ["optional line numbers or text refs"],
      "lessons": [
        {
          "temp_id": "unique-string",
          "title": "lesson title",
          "objective": null,
          "notes": null,
          "sequence_index": 1,
          "minutes_est": null,
          "modality": null,
          "lesson_type": "lesson|assignment|project|assessment|reading|lab|review|activity",
          "date_text": null,
          "suggested_date": null,
          "inferred_from": null,
          "confidence": 0.0-1.0
        }
      ],
      "assignments": [],
      "assessments": []
    }
  ],
  "unassigned_items": [
    { "temp_id": "string", "raw_text": "string", "inferred_type": null, "confidence": 0.5, "reason": "why unassigned" }
  ],
  "ignored_items": [
    { "raw_text": "string", "reason": "e.g. policy text" }
  ],
  "parser_warnings": ["string"]
}

Rules: Only include units/lessons that are clearly present. Use unassigned_items for uncertain lines. Use ignored_items for policy/admin when ignore_policy is true.
"""
    return "\n".join(parts) + "\n\n" + schema.strip()


def _validate_and_normalize_parsed(raw: Dict[str, Any], subject_id: str, family_id: str, raw_text: str) -> Dict[str, Any]:
    """Validate and normalize LLM output into ParsedDraftCurriculum shape."""
    warnings = list(raw.get("parser_warnings") or [])
    units_in = raw.get("units")
    if not isinstance(units_in, list):
        units_in = []
    units_out: List[Dict[str, Any]] = []
    for ui, u in enumerate(units_in):
        if not isinstance(u, dict):
            continue
        title = (u.get("title") or u.get("source_label") or "").strip()
        if not title:
            title = f"Unit {ui + 1}"
            warnings.append(f"Unit at index {ui} had no title; set to '{title}'")
        lessons_in = u.get("lessons") or []
        if not isinstance(lessons_in, list):
            lessons_in = []
        lessons_out: List[Dict[str, Any]] = []
        for li, le in enumerate(lessons_in):
            if not isinstance(le, dict):
                continue
            lesson_title = (le.get("title") or "").strip()
            if not lesson_title:
                continue
            lt = (le.get("lesson_type") or "lesson").strip().lower()
            if lt not in ALLOWED_LESSON_TYPES:
                lt = "lesson"
            lessons_out.append({
                "temp_id": le.get("temp_id") or _ensure_temp_id(),
                "title": lesson_title,
                "objective": (le.get("objective") or "").strip() or None,
                "notes": (le.get("notes") or "").strip() or None,
                "sequence_index": li + 1,
                "minutes_est": le.get("minutes_est") if isinstance(le.get("minutes_est"), (int, float)) else None,
                "modality": (le.get("modality") or "practice").strip() or None,
                "lesson_type": lt,
                "date_text": (le.get("date_text") or "").strip() or None,
                "suggested_date": (le.get("suggested_date") or "").strip() or None,
                "inferred_from": le.get("inferred_from") if isinstance(le.get("inferred_from"), list) else None,
                "confidence": _coerce_float(le.get("confidence")),
            })
        if not lessons_out and not (u.get("assignments") or u.get("assessments")):
            continue
        units_out.append({
            "temp_id": u.get("temp_id") or _ensure_temp_id(),
            "source_label": (u.get("source_label") or "").strip() or None,
            "title": title,
            "description": (u.get("description") or "").strip() or None,
            "sequence_index": ui + 1,
            "inferred_from": u.get("inferred_from") if isinstance(u.get("inferred_from"), list) else None,
            "lessons": lessons_out,
            "assignments": [],  # keep assignments as lessons with lesson_type=assignment for now
            "assessments": [],
        })

    # Single fallback unit if only flat lessons and none extracted
    unassigned = list(raw.get("unassigned_items") or [])
    if isinstance(unassigned, list):
        unassigned = [x for x in unassigned if isinstance(x, dict) and (x.get("raw_text") or x.get("title"))]
    ignored = list(raw.get("ignored_items") or [])
    if isinstance(ignored, list):
        ignored = [x if isinstance(x, dict) else {"raw_text": str(x), "reason": "unknown"} for x in ignored]

    # If no units but we have unassigned that look like lessons, create one inferred unit
    if not units_out and unassigned:
        inferred_lessons = []
        for i, item in enumerate(unassigned):
            raw_t = (item.get("raw_text") or item.get("title") or "").strip()
            if not raw_t or len(raw_t) > 500:
                continue
            inferred_lessons.append({
                "temp_id": item.get("temp_id") or _ensure_temp_id(),
                "title": raw_t[:200],
                "objective": None,
                "notes": None,
                "sequence_index": i + 1,
                "minutes_est": None,
                "modality": None,
                "lesson_type": "lesson",
                "date_text": None,
                "suggested_date": None,
                "inferred_from": None,
                "confidence": _coerce_float(item.get("confidence")) or 0.5,
            })
        if inferred_lessons:
            units_out = [{
                "temp_id": _ensure_temp_id(),
                "source_label": "Imported lessons",
                "title": "Imported lessons",
                "description": None,
                "sequence_index": 1,
                "inferred_from": ["unassigned"],
                "lessons": inferred_lessons,
                "assignments": [],
                "assessments": [],
            }]
            warnings.append("No clear unit structure found; grouped lines into a single 'Imported lessons' unit.")
            unassigned = []

    if not units_out:
        warnings.append("No units could be extracted. Check the source text or try different parse options.")

    return {
        "subject_id": subject_id,
        "family_id": family_id,
        "source_mode": "plain_text_parse",
        "source_title": (raw.get("source_title") or "").strip() or None,
        "source_type": (raw.get("source_type") or "").strip() or None,
        "raw_text": raw_text,
        "summary": (raw.get("summary") or "").strip() or None,
        "units": units_out,
        "unassigned_items": unassigned,
        "ignored_items": ignored,
        "parser_warnings": warnings,
        "parser_metadata": {
            "dominant_mode": (raw.get("parser_metadata") or {}).get("dominant_mode"),
            "detected_dates": (raw.get("parser_metadata") or {}).get("detected_dates"),
            "detected_assignments": (raw.get("parser_metadata") or {}).get("detected_assignments"),
            "detected_assessments": (raw.get("parser_metadata") or {}).get("detected_assessments"),
            "contained_admin_text": (raw.get("parser_metadata") or {}).get("contained_admin_text"),
        },
    }


async def extract_curriculum_from_plain_text(
    subject_id: str,
    family_id: str,
    subject_name: str,
    raw_text: str,
    *,
    source_title: Optional[str] = None,
    source_type: Optional[str] = None,
    parse_mode: Optional[str] = None,
    detect_dates: bool = True,
    preserve_source_headings: bool = True,
    ignore_policy_text: bool = True,
    extract_assignments: bool = True,
    extract_assessments: bool = True,
    learner_stage: Optional[str] = None,
    special_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run pre-parse then LLM extraction; validate and return parsed draft.
    Raises ValueError if text is empty or extraction fails.
    """
    raw_text = (raw_text or "").strip()
    if not raw_text:
        raise ValueError("Raw text is required for extraction.")

    pre_parse = preparse_plain_text(raw_text)
    import os
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    user_content = _build_user_prompt(
        raw_text=raw_text,
        pre_parse=pre_parse,
        subject_name=subject_name,
        source_type=source_type,
        parse_mode=parse_mode,
        detect_dates=detect_dates,
        preserve_headings=preserve_source_headings,
        ignore_policy=ignore_policy_text,
        extract_assignments=extract_assignments,
        extract_assessments=extract_assessments,
        special_instructions=special_instructions,
    )
    system_content = _build_system_prompt()

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
        timeout=90.0,
    )
    content = response.choices[0].message.content
    if not content or not content.strip():
        raise ValueError("Empty response from extraction.")

    try:
        raw = json.loads(content)
    except json.JSONDecodeError as e:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            raw = json.loads(match.group(0))
        else:
            raise ValueError(f"Invalid JSON from extraction: {e}") from e

    return _validate_and_normalize_parsed(raw, subject_id=subject_id, family_id=family_id, raw_text=raw_text)

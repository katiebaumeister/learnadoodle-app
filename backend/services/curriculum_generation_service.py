"""
Generate Curriculum from scratch: AI-generated curriculum draft for a subject.
Uses OpenAI to produce structured units and lessons; validates and normalizes output.
Scheduling/commit to calendar is handled elsewhere (not in this service).

Implementation note (Generate Curriculum feature):
- Generation starts: POST /api/curriculum/generate-draft (curriculum_routes.py) calls
  generate_curriculum_draft() in this module.
- OpenAI call: generate_curriculum_draft() builds prompts via build_user_prompt/build_system_prompt,
  then calls client.chat.completions.create() (this file, same function).
- Draft validation: validate_and_normalize_draft() in this module normalizes LLM output into
  DraftCurriculum shape (units, lessons, modality/difficulty mapping).
- Final persistence: POST /api/curriculum/commit-generated-draft (curriculum_routes.py)
  inserts into curriculum_units (source_type='ai_generated') and curriculum_lessons.
- Scheduling hook: Later, Plan My Year or a commit engine can list curriculum_lessons by
  subject (via curriculum_units.subject_tags or by linking units to subject_id when that
  is added), then map lessons onto placeholder slots or create events with
  curriculum_lesson_id set.
"""
import json
import re
import uuid
from typing import Any, Dict, List, Optional

# Allowed values for DB (curriculum_lessons CHECK constraints)
MODALITY_ALLOWED = {"reading", "video", "hands_on", "discussion", "practice", "quiz", "project"}
DIFFICULTY_ALLOWED = {"gentle", "standard", "stretch"}

# Normalization maps for LLM output that may use different wording
MODALITY_MAP = {
    "reading": "reading",
    "video": "video",
    "hands_on": "hands_on",
    "hands-on": "hands_on",
    "hands on": "hands_on",
    "discussion": "discussion",
    "practice": "practice",
    "worksheet": "practice",
    "quiz": "quiz",
    "project": "project",
    "lab": "hands_on",
    "assessment": "quiz",
    "mixed": "discussion",
    "fieldwork": "hands_on",
    "activity": "hands_on",
}
DIFFICULTY_MAP = {
    "gentle": "gentle",
    "standard": "standard",
    "advanced": "stretch",
    "stretch": "stretch",
    "easy": "gentle",
    "hard": "stretch",
}


def _normalize_modality(s: Optional[str]) -> str:
    if not s or not str(s).strip():
        return "practice"
    key = str(s).strip().lower().replace(" ", "_")
    return MODALITY_MAP.get(key) or MODALITY_MAP.get(key.replace("_", "")) or "practice"


def _normalize_difficulty(s: Optional[str]) -> str:
    if not s or not str(s).strip():
        return "standard"
    key = str(s).strip().lower()
    return DIFFICULTY_MAP.get(key) or "standard"


def _coerce_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, int):
        return val
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


def _coerce_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _ensure_temp_id() -> str:
    return f"temp-{uuid.uuid4().hex[:12]}"


def validate_and_normalize_draft(raw: Dict[str, Any], subject_id: str, family_id: str) -> Dict[str, Any]:
    """
    Validate and normalize LLM output into DraftCurriculum shape.
    - At least 1 unit; each unit has non-empty title and at least 1 lesson.
    - Each lesson has non-empty title; sequence_index and minutes_est normalized.
    - modality/difficulty mapped to allowed DB values.
    """
    warnings: List[str] = []
    units_in = raw.get("units") or raw.get("unit")
    if isinstance(units_in, dict):
        units_in = [units_in]
    if not units_in or not isinstance(units_in, list):
        raise ValueError("Generated curriculum must have at least one unit")

    units_out: List[Dict[str, Any]] = []
    for ui, u in enumerate(units_in):
        if not isinstance(u, dict):
            continue
        title = (u.get("title") or u.get("unit_title") or "").strip()
        if not title:
            title = f"Unit {ui + 1}"
            warnings.append(f"Unit {ui + 1} had no title; set to '{title}'")
        lessons_in = u.get("lessons") or u.get("sections") or []
        if not lessons_in and "lessons" in u:
            lessons_in = u["lessons"]
        if not isinstance(lessons_in, list):
            lessons_in = []
        if not lessons_in:
            warnings.append(f"Unit '{title}' had no lessons; skipping empty unit")
            continue

        lessons_out: List[Dict[str, Any]] = []
        for li, le in enumerate(lessons_in):
            if not isinstance(le, dict):
                continue
            lesson_title = (le.get("title") or le.get("name") or "").strip()
            if not lesson_title:
                lesson_title = f"Lesson {li + 1}"
                warnings.append(f"Lesson {li + 1} in unit '{title}' had no title")
            seq = _coerce_int(le.get("sequence_index") or le.get("sequence_index") or (li + 1))
            if seq is None or seq < 1:
                seq = li + 1
            minutes = _coerce_int(le.get("minutes_est") or le.get("minutes_estimate") or le.get("minutes"))
            if minutes is not None and (minutes < 5 or minutes > 240):
                minutes = max(5, min(240, minutes))
            materials = le.get("materials") or le.get("materials_suggestions")
            if isinstance(materials, list):
                materials = [str(m) if not isinstance(m, str) else m for m in materials]
            elif isinstance(materials, str):
                materials = [materials] if materials.strip() else []
            else:
                materials = []
            modality = _normalize_modality(le.get("modality") or le.get("lesson_type"))
            difficulty = _normalize_difficulty(le.get("difficulty") or le.get("rigor"))
            lessons_out.append({
                "temp_id": le.get("temp_id") or _ensure_temp_id(),
                "title": lesson_title,
                "objective": (le.get("objective") or le.get("description") or "").strip() or None,
                "notes": (le.get("notes") or "").strip() or None,
                "sequence_index": seq,
                "minutes_est": minutes or 60,
                "modality": modality,
                "lesson_type": (le.get("lesson_type") or "lesson") if isinstance(le.get("lesson_type"), str) else "lesson",
                "materials": materials,
                "assessment_idea": (le.get("assessment_idea") or le.get("assessment") or "").strip() or None,
                "pacing_suggestion": (le.get("pacing_suggestion") or "").strip() or None,
                "difficulty": difficulty,
            })
        # Normalize sequence_index for lessons (1-based, unique)
        for i, le in enumerate(lessons_out):
            le["sequence_index"] = i + 1
        unit_minutes = _coerce_int(u.get("estimated_total_minutes"))
        if unit_minutes is None and lessons_out:
            unit_minutes = sum(le.get("minutes_est") or 60 for le in lessons_out)
        units_out.append({
            "temp_id": u.get("temp_id") or _ensure_temp_id(),
            "title": title,
            "description": (u.get("description") or "").strip() or None,
            "sequence_index": ui + 1,
            "estimated_total_minutes": unit_minutes,
            "pacing_note": (u.get("pacing_note") or "").strip() or None,
            "lessons": lessons_out,
        })

    if not units_out:
        raise ValueError("Generated curriculum had no valid units with lessons")

    return {
        "subject_id": subject_id,
        "family_id": family_id,
        "source_mode": "ai_generate",
        "course_title": (raw.get("course_title") or raw.get("title") or "").strip() or None,
        "summary": (raw.get("summary") or "").strip() or None,
        "estimated_total_minutes": _coerce_int(raw.get("estimated_total_minutes")) or sum(
            u.get("estimated_total_minutes") or 0 for u in units_out
        ),
        "units": units_out,
        "warnings": warnings,
    }


def build_system_prompt() -> str:
    return """You are an educational curriculum planner generating structured homeschool or after-school curriculum outlines.
Return valid JSON only. Do not include markdown. Do not include explanatory text outside the JSON.
Generate a curriculum draft with units and lessons appropriate for the provided subject, learner stage, duration, and preferences.

Each unit must include a title and a list of lessons.
Each lesson must include:
- title (string)
- objective (string, brief learning objective)
- minutes_est (integer, 15-120 typical)
- modality (one of: reading, video, hands_on, discussion, practice, quiz, project)
- lesson_type (one of: lesson, project, assessment, review, fieldwork, activity)

Optionally include per lesson:
- materials (array of strings)
- assessment_idea (string)
- pacing_suggestion (string)
- difficulty (gentle, standard, stretch)

Optionally include per unit:
- description (string)
- estimated_total_minutes (integer)
- pacing_note (string)

Keep output practical, age-appropriate, and internally consistent.
Do not invent unsupported special-needs accommodations unless explicitly requested.
Do not include dangerous, sexual, or otherwise age-inappropriate content.
Prefer concrete, usable lesson titles over vague abstractions.
Do not produce empty units. Each unit must have at least one lesson."""


def build_user_prompt(
    subject_name: str,
    generation_scope: str,
    learner_stage: Optional[str] = None,
    duration_mode: str = "multi_unit_course",
    custom_weeks: Optional[int] = None,
    lesson_count_target: Optional[int] = None,
    typical_lesson_minutes: Optional[int] = None,
    educational_style: Optional[str] = None,
    rigor_level: Optional[str] = None,
    include_assessments: bool = True,
    include_projects: bool = True,
    include_materials: bool = True,
    include_pacing: bool = True,
    special_instructions: Optional[str] = None,
) -> str:
    parts = [
        f"Subject: {subject_name}",
        f"Goal/Scope: {generation_scope}",
    ]
    if learner_stage:
        parts.append(f"Learner stage: {learner_stage}")
    parts.append(f"Duration mode: {duration_mode}")
    if custom_weeks:
        parts.append(f"Custom weeks: {custom_weeks}")
    if lesson_count_target:
        parts.append(f"Target lesson count: {lesson_count_target}")
    if typical_lesson_minutes:
        parts.append(f"Typical lesson length (minutes): {typical_lesson_minutes}")
    if educational_style:
        parts.append(f"Educational style: {educational_style}")
    if rigor_level:
        parts.append(f"Rigor: {rigor_level}")
    parts.append(f"Include assessments: {include_assessments}")
    parts.append(f"Include projects: {include_projects}")
    parts.append(f"Include materials suggestions: {include_materials}")
    parts.append(f"Include pacing suggestions: {include_pacing}")
    if special_instructions:
        parts.append(f"Special instructions: {special_instructions}")

    schema = """
Return a single JSON object with this exact structure (no other keys at top level):
{
  "course_title": "optional course title",
  "summary": "optional one-line summary",
  "estimated_total_minutes": 0,
  "units": [
    {
      "temp_id": "unique-string-id",
      "title": "Unit title",
      "description": "optional",
      "sequence_index": 1,
      "estimated_total_minutes": 0,
      "pacing_note": "optional",
      "lessons": [
        {
          "temp_id": "unique-string-id",
          "title": "Lesson title",
          "objective": "What the learner will achieve",
          "notes": "optional",
          "sequence_index": 1,
          "minutes_est": 60,
          "modality": "reading|video|hands_on|discussion|practice|quiz|project",
          "lesson_type": "lesson|project|assessment|review|fieldwork|activity",
          "materials": ["item1", "item2"],
          "assessment_idea": "optional",
          "pacing_suggestion": "optional",
          "difficulty": "gentle|standard|stretch"
        }
      ]
    }
  ]
}
"""
    return "\n".join(parts) + "\n\n" + schema.strip()


async def generate_curriculum_draft(
    subject_id: str,
    family_id: str,
    subject_name: str,
    generation_scope: str,
    user_id: str,
    *,
    child_ids: Optional[List[str]] = None,
    learner_stage: Optional[str] = None,
    age_range: Optional[Dict[str, int]] = None,
    duration_mode: str = "multi_unit_course",
    custom_weeks: Optional[int] = None,
    lesson_count_target: Optional[int] = None,
    typical_lesson_minutes: Optional[int] = None,
    educational_style: Optional[str] = None,
    rigor_level: Optional[str] = None,
    include_assessments: bool = True,
    include_projects: bool = True,
    include_materials: bool = True,
    include_pacing: bool = True,
    special_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Call OpenAI to generate a curriculum draft; validate and normalize; return DraftCurriculum.
    Raises ValueError on invalid or empty output.
    """
    import os
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    user_content = build_user_prompt(
        subject_name=subject_name,
        generation_scope=generation_scope,
        learner_stage=learner_stage,
        duration_mode=duration_mode,
        custom_weeks=custom_weeks,
        lesson_count_target=lesson_count_target,
        typical_lesson_minutes=typical_lesson_minutes,
        educational_style=educational_style,
        rigor_level=rigor_level,
        include_assessments=include_assessments,
        include_projects=include_projects,
        include_materials=include_materials,
        include_pacing=include_pacing,
        special_instructions=special_instructions,
    )
    system_content = build_system_prompt()

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
        timeout=120.0,
    )
    content = response.choices[0].message.content
    if not content or not content.strip():
        raise ValueError("Empty response from curriculum generator")

    try:
        raw = json.loads(content)
    except json.JSONDecodeError as e:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            raw = json.loads(match.group(0))
        else:
            raise ValueError(f"Invalid JSON from curriculum generator: {e}") from e

    return validate_and_normalize_draft(raw, subject_id=subject_id, family_id=family_id)

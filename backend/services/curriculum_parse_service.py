"""
Plain-text curriculum extraction (Import & extract).
Uses deterministic pre-parse + OpenAI to extract structure from pasted text.
Does NOT generate or invent content; only extracts what is present.

Implementation note (Import & extract feature):
- Raw text is received: POST /api/curriculum/parse-text (curriculum_routes.py) receives raw_text in body.
- Pre-parsing: services/plain_text_preparser.py preparse_plain_text() runs first (line tagging, structure hints).
- OpenAI extraction: extract_curriculum_from_plain_text() (single response) or stream_extract_curriculum_from_plain_text()
  (NDJSON stream for UI) builds prompt with pre-parse summary and raw text; POST /api/curriculum/parse-text-stream
  streams deltas then the normalized draft.
- Validation/normalization: _validate_and_normalize_parsed() in this module normalizes LLM output into
  ParsedDraftCurriculum shape; fallback single unit for flat lesson lists when needed.
- Source rows saved: POST /api/curriculum/commit-parsed-draft inserts into syllabus_imports (raw_text, metadata).
- Canonical curriculum rows: same commit inserts curriculum_units (source_type=plain_text_parsed, source_ref=
  syllabus_import_id) and curriculum_lessons linked to those units.
- Scheduling hook: Later, Plan My Year or commit engine can list curriculum_lessons by subject (subject_tags)
  and map onto placeholder slots or set events.curriculum_lesson_id.
"""
import asyncio
import json
import os
import re
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from logger import log_event
from services.plain_text_preparser import PreParseResult, preparse_plain_text

# Faster models (e.g. gpt-4o) can be set via env; parallel chunking does more for multi-unit pastes.
_DEFAULT_PARSE_MODEL = "gpt-4o-mini"
_MAX_PARALLEL_CHUNKS = 4
_MIN_CHUNK_CHARS = 280


ALLOWED_LESSON_TYPES = {"lesson", "assignment", "project", "assessment", "reading", "lab", "review", "activity"}


def _parse_llm_json_content(content: str) -> Dict[str, Any]:
    content = (content or "").strip()
    if not content:
        raise ValueError("Empty response from extraction.")
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError(f"Invalid JSON from extraction: {e}") from e


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

    # Compact schema = much shorter model output → faster than verbose null-heavy JSON (closer to chat TTFT).
    schema = """
Return one JSON object only (no markdown). Use compact output — omit empty arrays, omit unknown fields, do NOT emit null placeholders.

Required shape:
{
  "summary": "short one-line summary of this text (optional)",
  "units": [
    {
      "title": "unit title",
      "sequence_index": 1,
      "source_label": "optional heading from source",
      "lessons": [
        {
          "title": "lesson title",
          "sequence_index": 1,
          "lesson_type": "lesson|assignment|project|assessment|reading|lab|review|activity"
        }
      ]
    }
  ],
  "unassigned_items": [ { "temp_id": "t1", "raw_text": "line", "reason": "uncertain" } ],
  "ignored_items": [ { "raw_text": "snippet", "reason": "policy" } ],
  "parser_warnings": []
}

Rules:
- Include date_text on a lesson ONLY if a date appears next to that item in the source.
- Only add objective/notes/minutes_est/modality/confidence/inferred_from if the source explicitly gives them (otherwise omit).
- Only include units/lessons clearly present. unassigned_items for uncertain lines; ignored_items for policy/admin when ignore_policy is true.
- temp_id on unassigned_items: short unique string if you use that array.
"""
    return "\n".join(parts) + "\n\n" + schema.strip()


def _parse_model_name() -> str:
    m = (os.environ.get("CURRICULUM_PARSE_MODEL") or "").strip()
    return m if m else _DEFAULT_PARSE_MODEL


def split_raw_into_parallel_chunks(pre_parse: PreParseResult) -> Optional[List[str]]:
    """
    If the paste has 2+ unit/week headings, return text slices for parallel extraction.
    Otherwise None (use a single model call).
    """
    cleaned = (pre_parse.cleaned_text or "").strip()
    if not cleaned or not pre_parse.lines:
        return None
    line_strs = cleaned.split("\n")
    if len(line_strs) != len(pre_parse.lines):
        return None
    boundaries = [
        i
        for i, ln in enumerate(pre_parse.lines)
        if ln.heuristic_tag in ("unit_heading", "week_heading")
    ]
    if len(boundaries) < 2:
        return None
    raw_chunks: List[str] = []
    for bi, start in enumerate(boundaries):
        end = boundaries[bi + 1] if bi + 1 < len(boundaries) else len(line_strs)
        segment = "\n".join(line_strs[start:end]).strip()
        if segment:
            raw_chunks.append(segment)
    if boundaries[0] > 0 and raw_chunks:
        preamble = "\n".join(line_strs[: boundaries[0]]).strip()
        if preamble:
            raw_chunks[0] = f"{preamble}\n\n{raw_chunks[0]}"
    if len(raw_chunks) < 2:
        return None
    # Merge very small sections so each request has enough context
    merged: List[str] = []
    acc = raw_chunks[0]
    for c in raw_chunks[1:]:
        if len(acc) < _MIN_CHUNK_CHARS:
            acc = f"{acc}\n\n{c}"
        else:
            merged.append(acc)
            acc = c
    merged.append(acc)
    if len(merged) >= 2 and len(merged[-1]) < _MIN_CHUNK_CHARS // 2:
        merged[-2] = f"{merged[-2]}\n\n{merged[-1]}"
        merged.pop()
    if len(merged) < 2:
        return None
    return merged


def _merge_raw_extractions(partials: List[Dict[str, Any]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {
        "summary": None,
        "units": [],
        "unassigned_items": [],
        "ignored_items": [],
        "parser_warnings": [],
    }
    summaries: List[str] = []
    for p in partials:
        if not isinstance(p, dict):
            continue
        units = p.get("units")
        if isinstance(units, list):
            merged["units"].extend(units)
        for key in ("unassigned_items", "ignored_items", "parser_warnings"):
            block = p.get(key)
            if isinstance(block, list):
                merged[key].extend(block)
        s = (p.get("summary") or "").strip()
        if s:
            summaries.append(s)
    if summaries:
        merged["summary"] = " ".join(summaries[:5])
    return merged


async def _openai_extract_json_string(
    client: Any,
    model: str,
    system_content: str,
    user_content: str,
    *,
    stream: bool,
    timeout: float = 150.0,
) -> str:
    if stream:
        stream_resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
            stream=True,
            timeout=timeout,
        )
        pieces: List[str] = []
        async for chunk in stream_resp:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                pieces.append(delta.content)
        return "".join(pieces)

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
        timeout=timeout,
    )
    return response.choices[0].message.content or ""


def _preview_text_from_normalized_result(result: Dict[str, Any]) -> str:
    """Human-readable lines for synthetic streaming after parallel extract."""
    lines: List[str] = []
    summary = (result.get("summary") or "").strip()
    if summary:
        lines.append(summary)
        lines.append("")
    n = 1
    for u in result.get("units") or []:
        if not isinstance(u, dict):
            continue
        for le in u.get("lessons") or []:
            if not isinstance(le, dict):
                continue
            t = (le.get("title") or "").strip()
            if t:
                lines.append(f"{n}. {t}")
                n += 1
    return "\n".join(lines).strip()


def _preview_text_from_merge_raw(merged: Dict[str, Any]) -> str:
    """Lesson preview from merged raw LLM JSON (before full validation). Same shape as merge output."""
    lines: List[str] = []
    summary = (merged.get("summary") or "").strip()
    if summary:
        lines.append(summary)
        lines.append("")
    n = 1
    for u in merged.get("units") or []:
        if not isinstance(u, dict):
            continue
        for le in u.get("lessons") or []:
            if not isinstance(le, dict):
                continue
            t = (le.get("title") or "").strip()
            if t:
                lines.append(f"{n}. {t}")
                n += 1
    return "\n".join(lines).strip()


async def _openai_extract_one_plain_text_chunk(
    client: Any,
    model: str,
    system_content: str,
    chunk_text: str,
    *,
    subject_name: str,
    source_type: Optional[str],
    parse_mode: Optional[str],
    detect_dates: bool,
    preserve_source_headings: bool,
    ignore_policy_text: bool,
    extract_assignments: bool,
    extract_assessments: bool,
    special_instructions: Optional[str],
) -> Dict[str, Any]:
    text = (chunk_text or "").strip()
    if len(text) > 25000:
        text = text[:25000]
    pp = preparse_plain_text(text)
    user_content = _build_user_prompt(
        raw_text=text,
        pre_parse=pp,
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
    content = await _openai_extract_json_string(
        client, model, system_content, user_content, stream=False, timeout=120.0
    )
    return _parse_llm_json_content(content)


async def _extract_parallel_chunks(
    chunks: List[str],
    *,
    subject_id: str,
    family_id: str,
    subject_name: str,
    full_raw_text: str,
    source_type: Optional[str],
    parse_mode: Optional[str],
    detect_dates: bool,
    preserve_source_headings: bool,
    ignore_policy_text: bool,
    extract_assignments: bool,
    extract_assessments: bool,
    special_instructions: Optional[str],
) -> Dict[str, Any]:
    from openai import AsyncOpenAI

    model = _parse_model_name()
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    system_content = _build_system_prompt()
    sem = asyncio.Semaphore(_MAX_PARALLEL_CHUNKS)
    log_event(
        "curriculum.parse_text.parallel",
        family_id=family_id,
        subject_id=subject_id,
        fragments=len(chunks),
        model=model,
    )

    async def one_fragment(text: str) -> Dict[str, Any]:
        async with sem:
            return await _openai_extract_one_plain_text_chunk(
                client,
                model,
                system_content,
                text,
                subject_name=subject_name,
                source_type=source_type,
                parse_mode=parse_mode,
                detect_dates=detect_dates,
                preserve_source_headings=preserve_source_headings,
                ignore_policy_text=ignore_policy_text,
                extract_assignments=extract_assignments,
                extract_assessments=extract_assessments,
                special_instructions=special_instructions,
            )

    partials = await asyncio.gather(*[one_fragment(c) for c in chunks])
    merged_raw = _merge_raw_extractions(list(partials))
    return _validate_and_normalize_parsed(
        merged_raw, subject_id=subject_id, family_id=family_id, raw_text=full_raw_text
    )


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
    Multi–unit/week pastes use parallel fragment calls (wall time ~ slowest fragment).
    Raises ValueError if text is empty or extraction fails.
    """
    raw_text = (raw_text or "").strip()
    if not raw_text:
        raise ValueError("Raw text is required for extraction.")

    pre_parse = preparse_plain_text(raw_text)
    chunks_opt = split_raw_into_parallel_chunks(pre_parse)
    if chunks_opt and len(chunks_opt) >= 2:
        return await _extract_parallel_chunks(
            chunks_opt,
            subject_id=subject_id,
            family_id=family_id,
            subject_name=subject_name,
            full_raw_text=raw_text,
            source_type=source_type,
            parse_mode=parse_mode,
            detect_dates=detect_dates,
            preserve_source_headings=preserve_source_headings,
            ignore_policy_text=ignore_policy_text,
            extract_assignments=extract_assignments,
            extract_assessments=extract_assessments,
            special_instructions=special_instructions,
        )

    from openai import AsyncOpenAI

    model = _parse_model_name()
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
    content = await _openai_extract_json_string(
        client, model, system_content, user_content, stream=False, timeout=150.0
    )
    raw = _parse_llm_json_content(content)
    return _validate_and_normalize_parsed(raw, subject_id=subject_id, family_id=family_id, raw_text=raw_text)


async def stream_extract_curriculum_from_plain_text(
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
    user_id: Optional[str] = None,
) -> AsyncIterator[bytes]:
    """
    Streams NDJSON: delta lines, then complete draft.
    Multi-unit pastes run parallel non-streaming extracts, then emit synthetic deltas from the merged result
    (faster wall-clock than one huge JSON stream). Single-unit pastes stream the model response.
    """
    raw_text = (raw_text or "").strip()
    if not raw_text:
        raise ValueError("Raw text is required for extraction.")

    pre_parse = preparse_plain_text(raw_text)
    chunks_opt = split_raw_into_parallel_chunks(pre_parse)
    if chunks_opt and len(chunks_opt) >= 2:
        # Parallel LLM calls: stream preview as each fragment finishes (merge in chunk order for stable numbering).
        from openai import AsyncOpenAI

        n_chunks = len(chunks_opt)
        yield (
            json.dumps(
                {
                    "type": "delta",
                    "text": f"Reading {n_chunks} sections of your outline…\n\n",
                },
                ensure_ascii=False,
            )
            + "\n"
        ).encode("utf-8")

        model = _parse_model_name()
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        system_content = _build_system_prompt()
        sem = asyncio.Semaphore(_MAX_PARALLEL_CHUNKS)
        log_event(
            "curriculum.parse_text.parallel",
            family_id=family_id,
            subject_id=subject_id,
            fragments=n_chunks,
            model=model,
        )

        async def one_idx(i: int, ch: str):
            async with sem:
                data = await _openai_extract_one_plain_text_chunk(
                    client,
                    model,
                    system_content,
                    ch,
                    subject_name=subject_name,
                    source_type=source_type,
                    parse_mode=parse_mode,
                    detect_dates=detect_dates,
                    preserve_source_headings=preserve_source_headings,
                    ignore_policy_text=ignore_policy_text,
                    extract_assignments=extract_assignments,
                    extract_assessments=extract_assessments,
                    special_instructions=special_instructions,
                )
                return i, data

        tasks = [asyncio.create_task(one_idx(i, c)) for i, c in enumerate(chunks_opt)]
        partials_buf: List[Optional[Dict[str, Any]]] = [None] * n_chunks
        last_preview_len = 0
        stream_piece = 56

        for done in asyncio.as_completed(tasks):
            idx, raw_part = await done
            partials_buf[idx] = raw_part
            merge_in = [partials_buf[j] for j in range(n_chunks) if partials_buf[j] is not None]
            merged_raw = _merge_raw_extractions(merge_in)
            preview = _preview_text_from_merge_raw(merged_raw)
            if len(preview) > last_preview_len:
                piece = preview[last_preview_len:]
                last_preview_len = len(preview)
                for off in range(0, len(piece), stream_piece):
                    chunk_out = piece[off : off + stream_piece]
                    line = json.dumps({"type": "delta", "text": chunk_out}, ensure_ascii=False) + "\n"
                    yield line.encode("utf-8")

        merged_final = _merge_raw_extractions([partials_buf[j] for j in range(n_chunks) if partials_buf[j] is not None])
        result = _validate_and_normalize_parsed(
            merged_final, subject_id=subject_id, family_id=family_id, raw_text=raw_text
        )
        log_event(
            "curriculum.parse_text_stream.ok",
            family_id=family_id,
            subject_id=subject_id,
            units_count=len(result.get("units", [])),
            user_id=user_id or "",
        )
        done_line = json.dumps({"type": "complete", "data": result}, ensure_ascii=False) + "\n"
        yield done_line.encode("utf-8")
        return

    from openai import AsyncOpenAI

    model = _parse_model_name()
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

    stream = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
        stream=True,
        timeout=150.0,
    )

    pieces: List[str] = []
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta and delta.content:
            pieces.append(delta.content)
            line = json.dumps({"type": "delta", "text": delta.content}, ensure_ascii=False) + "\n"
            yield line.encode("utf-8")

    full = "".join(pieces)
    raw = _parse_llm_json_content(full)
    result = _validate_and_normalize_parsed(raw, subject_id=subject_id, family_id=family_id, raw_text=raw_text)
    log_event(
        "curriculum.parse_text_stream.ok",
        family_id=family_id,
        subject_id=subject_id,
        units_count=len(result.get("units", [])),
        user_id=user_id or "",
    )
    done_line = json.dumps({"type": "complete", "data": result}, ensure_ascii=False) + "\n"
    yield done_line.encode("utf-8")

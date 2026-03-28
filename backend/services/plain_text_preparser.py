"""
Deterministic pre-parser for plain-text curriculum extraction (Import & extract).
Tags lines, detects structure (units, lessons, weeks, dates, assignments, admin text),
produces a structured pre-parse result for the LLM extraction step.
Does NOT invent content; only classifies what is present.

Section boundaries include common syllabus shapes: Unit/Week/Module/Chapter plus Part, Section,
Topic/Theme/Strand, Quarter/Term/Semester, Q1, Phase/Stage, Block/Session/Period, markdown ## headers,
and similar — so multi-section pastes can be split for parallel extraction.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class PreParsedLine:
    line_index: int
    raw: str
    normalized: str
    indent_level: Optional[int] = None
    bullet_type: Optional[str] = None
    numbering_token: Optional[str] = None
    detected_date: Optional[str] = None
    heuristic_tag: str = "unknown"
    confidence: float = 0.5

    def to_dict(self) -> Dict[str, Any]:
        return {
            "line_index": self.line_index,
            "raw": self.raw,
            "normalized": self.normalized,
            "indent_level": self.indent_level,
            "bullet_type": self.bullet_type,
            "numbering_token": self.numbering_token,
            "detected_date": self.detected_date,
            "heuristic_tag": self.heuristic_tag,
            "confidence": self.confidence,
        }


@dataclass
class PreParseResult:
    cleaned_text: str
    lines: List[PreParsedLine]
    likely_structure: Dict[str, Any] = field(default_factory=dict)
    ignored_candidate_lines: List[int] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cleaned_text": self.cleaned_text,
            "lines": [ln.to_dict() for ln in self.lines],
            "likely_structure": self.likely_structure,
            "ignored_candidate_lines": self.ignored_candidate_lines,
            "warnings": self.warnings,
        }


# Patterns for top-level section headings
UNIT_PATTERNS = [
    re.compile(r"^\s*unit\s+(\d+)[\s.:\-—]", re.I),
    re.compile(r"^\s*unit\s+(\d+)\s*$", re.I),
    re.compile(r"^\s*#?\s*unit\s+(\d+)[\s.:\-—]", re.I),
]
LESSON_PATTERNS = [
    re.compile(r"^\s*lesson\s+(\d+)[\s.:\-—]", re.I),
    re.compile(r"^\s*lesson\s+(\d+)\s*$", re.I),
]
WEEK_PATTERNS = [
    re.compile(r"^\s*week\s+(\d+)[\s.:\-—]", re.I),
    re.compile(r"^\s*week\s+(\d+)\s*$", re.I),
]
DAY_PATTERNS = [
    re.compile(r"^\s*day\s+(\d+)[\s.:\-—]", re.I),
]
MODULE_PATTERNS = [
    re.compile(r"^\s*module\s+(\d+)[\s.:\-—]", re.I),
]
CHAPTER_PATTERNS = [
    re.compile(r"^\s*chapter\s+(\d+)[\s.:\-—]", re.I),
]

# Broader syllabus / outline boundaries (treated as unit_heading for parallel extract + structure).
# Optional ### markdown after optional indent; keep patterns specific to reduce false positives ("part of").
_SYLLABUS_MD = r"\s*(?:#{1,3}\s+)?"
SYLLABUS_SECTION_PATTERNS = [
    # Part 1:, Part II., Part One —
    re.compile(
        rf"^{_SYLLABUS_MD}part\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s.:\-—]",
        re.I,
    ),
    re.compile(rf"^{_SYLLABUS_MD}part\s+(\d+|[ivxlcdm]+)\s*$", re.I),
    # Section 1:, Section A., Section I —
    re.compile(rf"^{_SYLLABUS_MD}section\s+(\d+|[a-z]|[ivxlcdm]+)\b[\s.:\-—]", re.I),
    re.compile(rf"^{_SYLLABUS_MD}section\s+(\d+|[a-z]|[ivxlcdm]+)\s*$", re.I),
    # Topic / theme / strand / domain (curriculum maps)
    re.compile(
        rf"^{_SYLLABUS_MD}(topic|theme|strand|domain|big\s+idea|essential\s+question|unit\s+essential)\s+(\d+|[a-z])\b[\s.:\-—]",
        re.I,
    ),
    # Quarter 1, Term 2, Semester 1, Trimester 3, Q1:
    re.compile(rf"^{_SYLLABUS_MD}(quarter|term|semester|trimester)\s+\d+\b[\s.:\-—]?", re.I),
    re.compile(rf"^{_SYLLABUS_MD}q\s*\d+\b[\s.:\-—]", re.I),
    # Phase 1, Stage 2 (course design)
    re.compile(rf"^{_SYLLABUS_MD}(phase|stage)\s+\d+\b[\s.:\-—]", re.I),
    # Block 1, Session 3, Period 2 (schedules)
    re.compile(rf"^{_SYLLABUS_MD}(block|session|period)\s+\d+\b[\s.:\-—]", re.I),
    # Pacing: "Days 1–5", "Days 1-5" at line start
    re.compile(rf"^{_SYLLABUS_MD}days?\s+\d+\s*[\-–—]\s*\d+\b", re.I),
    # Explicit markdown: ## Unit 2, ### Week 3, # Part 1
    re.compile(
        r"^\s{0,3}#{1,3}\s+(unit|part|section|chapter|module|quarter|semester|topic|theme)\s+",
        re.I,
    ),
]

# Assignment / assessment keywords
ASSIGNMENT_KEYWORDS = {"assignment", "homework", "hw", "reading", "read", "essay", "paper", "write"}
ASSESSMENT_KEYWORDS = {"quiz", "quizzes", "test", "exam", "midterm", "final", "project", "lab", "presentation"}
ADMIN_POLICY_PATTERNS = [
    re.compile(r"attendance\s+policy", re.I),
    re.compile(r"grading\s+(scale|policy)", re.I),
    re.compile(r"late\s+(work|policy|assignment)", re.I),
    re.compile(r"office\s+hours", re.I),
    re.compile(r"contact\s+(info|information)", re.I),
    re.compile(r"email\s*:", re.I),
    re.compile(r"prerequisite", re.I),
    re.compile(r"required\s+texts?", re.I),
    re.compile(r"classroom\s+rules", re.I),
    re.compile(r"academic\s+integrity", re.I),
    re.compile(r"due\s+dates?\s*$", re.I),
]

# Date-like patterns (simple)
DATE_PATTERNS = [
    re.compile(r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}\b", re.I),
    re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\.?\s*\d{1,2},?\s*\d{4}\b", re.I),
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b(due|by)\s*:\s*.+", re.I),
    re.compile(r"\b(friday|monday|tuesday|wednesday|thursday|saturday|sunday)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", re.I),
]

# Numbering: "1.", "1)", "I.", "A.", "a."
NUMBERING_PATTERN = re.compile(r"^\s*((?:\d+[.)]\s*)|(?:[IVXLCDM]+[.)]\s*)|(?:[A-Za-z][.)]\s*))(.+)$")


def _normalize_text(raw: str) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    text = raw.strip()
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _indent_level(s: str) -> int:
    stripped = s.lstrip()
    if not s or not stripped:
        return 0
    spaces = len(s) - len(stripped)
    return spaces // 2 if spaces else 0


def _detect_date(s: str) -> Optional[str]:
    for pat in DATE_PATTERNS:
        m = pat.search(s)
        if m:
            return m.group(0).strip()
    return None


def _tag_line(line: PreParsedLine) -> None:
    raw = line.raw
    norm = line.normalized.strip().lower()
    if not norm:
        line.heuristic_tag = "content_line"
        line.confidence = 0.3
        return

    # Admin/policy
    for pat in ADMIN_POLICY_PATTERNS:
        if pat.search(raw):
            line.heuristic_tag = "admin_policy"
            line.confidence = 0.85
            return

    # Unit
    for pat in UNIT_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "unit_heading"
            line.confidence = 0.9
            return
    if re.match(r"^\s*unit\s+[\w\s]+", raw, re.I):
        line.heuristic_tag = "unit_heading"
        line.confidence = 0.8
        return

    # Lesson
    for pat in LESSON_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "lesson_heading"
            line.confidence = 0.9
            return
    if re.match(r"^\s*lesson\s+[\w\s]+", raw, re.I):
        line.heuristic_tag = "lesson_heading"
        line.confidence = 0.8
        return

    # Week
    for pat in WEEK_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "week_heading"
            line.confidence = 0.9
            return

    # Day
    for pat in DAY_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "day_heading"
            line.confidence = 0.85
            return

    # Module / Chapter
    for pat in MODULE_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "unit_heading"
            line.confidence = 0.8
            return
    for pat in CHAPTER_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "unit_heading"
            line.confidence = 0.8
            return

    # Markdown week headings (keep week_heading for structure stats)
    if re.match(r"^\s{0,3}#{1,3}\s+week\s+", raw, re.I):
        line.heuristic_tag = "week_heading"
        line.confidence = 0.88
        return

    for pat in SYLLABUS_SECTION_PATTERNS:
        if pat.match(raw):
            line.heuristic_tag = "unit_heading"
            line.confidence = 0.82
            return

    # Assignment / assessment by keyword at start
    first_word = norm.split()[0] if norm.split() else ""
    if first_word in ASSIGNMENT_KEYWORDS or "assignment" in norm[:30]:
        line.heuristic_tag = "assignment_heading"
        line.confidence = 0.75
        return
    if first_word in ASSESSMENT_KEYWORDS or any(k in norm[:40] for k in ("quiz", "test", "exam", "project", "lab")):
        line.heuristic_tag = "assessment_heading"
        line.confidence = 0.75
        return

    # Date line
    dt = _detect_date(raw)
    if dt:
        line.detected_date = dt
        line.heuristic_tag = "date_line"
        line.confidence = 0.7
        return

    # Numbered list item (likely lesson or content)
    num_m = NUMBERING_PATTERN.match(raw)
    if num_m:
        line.numbering_token = num_m.group(1).strip()
        if line.indent_level and line.indent_level > 0:
            line.heuristic_tag = "lesson_heading"
            line.confidence = 0.6
        else:
            line.heuristic_tag = "lesson_heading"
            line.confidence = 0.55
        return

    # Bullet
    if re.match(r"^\s*[\-\*•]\s+", raw):
        line.bullet_type = "bullet"
        line.heuristic_tag = "content_line"
        line.confidence = 0.5
        return

    # Short line that looks like a title
    if len(norm) < 80 and not norm.endswith(".") and line.indent_level == 0:
        line.heuristic_tag = "lesson_heading"
        line.confidence = 0.45
        return

    line.heuristic_tag = "content_line"
    line.confidence = 0.4


def preparse_plain_text(raw_text: str) -> PreParseResult:
    """
    Run deterministic pre-parse on pasted text.
    Returns PreParseResult with tagged lines, structure hints, and warnings.
    """
    cleaned = _normalize_text(raw_text)
    if not cleaned:
        return PreParseResult(
            cleaned_text="",
            lines=[],
            likely_structure={"dominant_mode": "mixed", "contains_dates": False, "contains_assignments": False, "contains_assessments": False, "contains_admin_text": False},
            warnings=["Input text is empty."],
        )

    line_strs = cleaned.split("\n")
    lines: List[PreParsedLine] = []
    ignored_candidates: List[int] = []
    warnings: List[str] = []
    tag_counts: Dict[str, int] = {}

    for i, raw_line in enumerate(line_strs):
        normalized = raw_line.strip()
        indent = _indent_level(raw_line)
        bullet = None
        if re.match(r"^\s*[\-\*•]\s+", raw_line):
            bullet = "bullet"
        numbering = None
        num_m = NUMBERING_PATTERN.match(raw_line)
        if num_m:
            numbering = num_m.group(1).strip()
        detected_date = _detect_date(raw_line)

        pl = PreParsedLine(
            line_index=i,
            raw=raw_line,
            normalized=normalized,
            indent_level=indent if indent > 0 else None,
            bullet_type=bullet,
            numbering_token=numbering,
            detected_date=detected_date,
        )
        _tag_line(pl)
        lines.append(pl)
        tag_counts[pl.heuristic_tag] = tag_counts.get(pl.heuristic_tag, 0) + 1
        if pl.heuristic_tag == "admin_policy":
            ignored_candidates.append(i)

    # Determine dominant mode
    unit_count = tag_counts.get("unit_heading", 0) + tag_counts.get("week_heading", 0)
    lesson_count = tag_counts.get("lesson_heading", 0) + tag_counts.get("day_heading", 0)
    assign_count = tag_counts.get("assignment_heading", 0)
    assess_count = tag_counts.get("assessment_heading", 0)
    date_count = sum(1 for ln in lines if ln.detected_date)
    admin_count = tag_counts.get("admin_policy", 0)

    dominant = "mixed"
    if unit_count > lesson_count and unit_count >= 2:
        dominant = "unit_based"
    elif "week_heading" in tag_counts and tag_counts.get("week_heading", 0) >= 1:
        dominant = "week_based"
    elif lesson_count >= 2 and unit_count == 0:
        dominant = "lesson_based"
    if date_count > 2:
        dominant = "date_based" if dominant == "mixed" else dominant

    likely_structure = {
        "dominant_mode": dominant,
        "contains_dates": date_count > 0,
        "contains_assignments": assign_count > 0,
        "contains_assessments": assess_count > 0,
        "contains_admin_text": admin_count > 0,
    }

    if not lines:
        warnings.append("No lines remained after cleaning.")

    return PreParseResult(
        cleaned_text=cleaned,
        lines=lines,
        likely_structure=likely_structure,
        ignored_candidate_lines=ignored_candidates,
        warnings=warnings,
    )

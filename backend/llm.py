"""
OpenAI LLM helpers with retries and safe defaults
All AI calls happen server-side only, never from browser
"""
import os
import asyncio
import json
import backoff
from openai import AsyncOpenAI
from typing import Any, Dict

_OPENAI_KEY = os.environ["OPENAI_API_KEY"]
client = AsyncOpenAI(api_key=_OPENAI_KEY)

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_extract_outline(text: str) -> Dict[str, Any]:
    """
    Extract structured outline from syllabus text.
    
    Returns normalized structure:
    {
      "units": [
        {
          "title": "Unit 1: Algebra",
          "weeks": 2,
          "sections": [
            {"title": "Variables", "minutes_estimate": 60, "due_hint": "Week 1"}
          ]
        }
      ],
      "assignments": [
        {"title": "Homework 1", "due_hint": "Week 1", "minutes_estimate": 30}
      ],
      "metadata": {"course_name": "...", "total_weeks": 12}
    }
    """
    # Truncate to reasonable token limit (120k chars ~ 30k tokens)
    truncated_text = text[:120000] if len(text) > 120000 else text
    
    prompt = f"""You are parsing a homeschool course syllabus.
Extract and return ONLY valid JSON with this structure:
{{
  "units": [
    {{
      "title": "Unit name",
      "weeks": 2,
      "sections": [
        {{"title": "Section name", "minutes_estimate": 60, "due_hint": "Week 1"}}
      ]
    }}
  ],
  "assignments": [
    {{"title": "Assignment name", "due_hint": "Week 1", "minutes_estimate": 30}}
  ],
  "metadata": {{"course_name": "...", "total_weeks": 12}}
}}

Rules:
- Only return valid JSON, no commentary
- minutes_estimate should be reasonable (30-120 for typical sessions)
- due_hint can be relative ("Week 1", "End of Unit 2") or absolute dates
- If units/assignments aren't clear, infer reasonable structure

SYLLABUS TEXT:
{truncated_text}
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a syllabus parser. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
    except json.JSONDecodeError as e:
        # Fallback: try to extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_inspire_learning(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate personalized learning recommendations based on child's progress, interests, and struggles.
    
    Input context:
    - family_id, child_id
    - subjects: list of subjects the child is studying
    - recent_outcomes: list of event_outcomes with strengths/struggles
    - viewing_history: list of external_courses/external_lessons the child has viewed
    - interests: list of interests from onboarding
    
    Returns:
    {
      "suggestions": [
        {
          "title": "Introduction to Fractions",
          "source": "YouTube",
          "type": "video",
          "duration_min": 15,
          "link": "https://youtube.com/watch?v=...",
          "description": "Brief description of why this is recommended"
        }
      ]
    }
    """
    child_name = context.get("child_name", "the student")
    subjects = context.get("subjects", [])
    recent_outcomes = context.get("recent_outcomes", [])
    viewing_history = context.get("viewing_history", [])
    interests = context.get("interests", [])
    
    # Build context summary
    subjects_text = ", ".join(subjects) if subjects else "various subjects"
    
    # Extract strengths and struggles from outcomes
    all_strengths = []
    all_struggles = []
    for outcome in recent_outcomes:
        all_strengths.extend(outcome.get("strengths", []))
        all_struggles.extend(outcome.get("struggles", []))
    
    strengths_text = ", ".join(set(all_strengths)) if all_strengths else "general progress"
    struggles_text = ", ".join(set(all_struggles)) if all_struggles else "none noted"
    
    # Build viewing history summary
    viewing_summary = ""
    if viewing_history:
        sources = set([v.get("source", "external") for v in viewing_history])
        viewing_summary = f"Recently viewed content from: {', '.join(sources)}"
    
    interests_text = ", ".join(interests) if interests else "general learning"
    
    prompt = f"""You are an educational recommendation engine. Generate personalized learning suggestions for {child_name}.

Context:
- Subjects: {subjects_text}
- Strengths: {strengths_text}
- Struggles: {struggles_text}
- Interests: {interests_text}
{viewing_summary and f"- {viewing_summary}" or ""}

Generate 5-8 diverse learning recommendations that:
1. Address areas where the student struggles (if any)
2. Build on their strengths
3. Align with their interests
4. Include a mix of content types (videos, articles, projects, courses)
5. Are age-appropriate and engaging

CRITICAL: You MUST provide REAL, WORKING URLs. Do NOT use placeholder URLs like "https://example.com" or "https://youtube.com/watch?v=...". 
- For YouTube videos: Use actual video IDs from well-known educational channels (e.g., "https://www.youtube.com/watch?v=dQw4w9WgXcQ" format)
- For Khan Academy: Use actual Khan Academy lesson URLs (e.g., "https://www.khanacademy.org/math/algebra/...")
- For articles: Use real educational websites (e.g., National Geographic Kids, Scholastic, etc.)
- If you cannot provide a real URL, use a search URL format like "https://www.youtube.com/results?search_query=..." or "https://www.khanacademy.org/search?page_search_query=..."

Return ONLY valid JSON with this structure:
{{
  "suggestions": [
    {{
      "title": "Specific, engaging title",
      "source": "YouTube|Khan Academy|Article|Project",
      "type": "video|article|project|course",
      "duration_min": 15,
      "link": "https://www.youtube.com/watch?v=REAL_VIDEO_ID or https://www.khanacademy.org/REAL_PATH",
      "description": "1-2 sentences explaining why this is recommended and how it helps"
    }}
  ]
}}

Rules:
- Only return valid JSON, no commentary
- Include 5-8 suggestions
- Mix of types: at least 2 videos, 1-2 articles, 1 project, 1 course
- Links MUST be real, working URLs - use YouTube search URLs if you don't know specific video IDs
- For YouTube: Prefer format "https://www.youtube.com/results?search_query=math+for+kids" if specific video unknown
- For Khan Academy: Use actual lesson paths or search URLs
- Descriptions should be specific and personalized
- Focus on actionable, engaging content
- If struggles are noted, prioritize content that addresses those areas
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an educational recommendation engine. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,  # Slightly higher for variety
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "suggestions" not in result or not isinstance(result["suggestions"], list):
            raise ValueError("LLM response missing 'suggestions' array")
        
        # Validate each suggestion
        for suggestion in result["suggestions"]:
            if "title" not in suggestion:
                raise ValueError("Suggestion missing 'title'")
            if "source" not in suggestion:
                raise ValueError("Suggestion missing 'source'")
            if "type" not in suggestion:
                raise ValueError("Suggestion missing 'type'")
            if suggestion["type"] not in ["video", "article", "project", "course"]:
                raise ValueError(f"Invalid suggestion type: {suggestion['type']}")
            if "link" not in suggestion:
                raise ValueError("Suggestion missing 'link'")
            if "duration_min" not in suggestion:
                suggestion["duration_min"] = 15  # Default
            if "description" not in suggestion:
                suggestion["description"] = ""  # Optional
        
        return result
    except json.JSONDecodeError as e:
        # Fallback: try to extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_suggest_plan(context: dict) -> Dict[str, Any]:
    """
    Suggest schedule plan using LLM.
    
    Input context includes:
    - availability windows
    - required minutes per subject
    - past done minutes
    - blackout periods
    - flexible tasks
    
    Output unified proposed changes:
    {
      "adds": [...],
      "moves": [...],
      "deletes": [...],
      "rationale": ["..."],
    }
    """
    prompt = f"""You are an intelligent scheduling assistant for homeschooling families.
Propose schedule changes for the coming weeks.

IMPORTANT: Only propose moves for events that actually conflict with blackouts or need rescheduling.
Do not propose moves for events that are already in valid time slots.

Constraints:
- Do not exceed per-day cap (240 minutes per day)
- Prefer 45-60 minute blocks (max 90 minutes)
- Avoid blackout days and outside teach windows
- Respect due hints from syllabus
- Balance subjects across the week
- Consider learning velocity (if child is slower, allocate more time)

IMPORTANT DELETION RULES:
- ONLY delete events that are TRUE DUPLICATES (same time, same subject, same child)
- NEVER delete events just to free up space - use moves instead
- If an event conflicts with a blackout, MOVE it, don't delete it
- Only delete if there's an unresolvable conflict or a genuine duplicate
- Preserve all scheduled learning time - deletion should be extremely rare

Return ONLY valid JSON with this structure:
{{
  "adds": [
    {{
      "child_id": "uuid",
      "subject_id": "uuid",
      "title": "Math - Chapter 5",
      "start": "2025-11-06T09:00:00Z",
      "end": "2025-11-06T10:00:00Z",
      "minutes": 60,
      "is_flexible": false
    }}
  ],
  "moves": [
    {{
      "event_id": "uuid",
      "from_start": "2025-11-05T14:00:00Z",
      "from_end": "2025-11-05T15:00:00Z",
      "to_start": "2025-11-07T09:00:00Z",
      "to_end": "2025-11-07T10:00:00Z",
      "reason": "Avoid blackout"
    }}
  ],
  "deletes": [
    {{
      "event_id": "uuid",
      "reason": "EXACT DUPLICATE: Same event scheduled twice at same time"
    }}
  ],
  "rationale": [
    "Moved Math to avoid blackout period",
    "Added Reading sessions to meet weekly target"
  ]
}}

CONTEXT:
{json.dumps(context, indent=2)}
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a scheduling assistant. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,  # Deterministic: same input = same output
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
    except json.JSONDecodeError as e:
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_pack_week(context: dict) -> Dict[str, Any]:
    """
    AI-powered week packing: suggest optimal event placement for a week.
    
    Input context includes:
    - week_start: Monday date (YYYY-MM-DD)
    - children: list of child IDs to pack for
    - year_plans: active year plans with targets
    - availability: teaching windows per day per child
    - existing_events: events already scheduled for the week
    - blackouts: blackout periods to avoid
    
    Output:
    {
      "events": [
        {
          "child_id": "uuid",
          "subject_id": "uuid",
          "title": "Math - Chapter 5",
          "start": "2025-11-06T09:00:00Z",
          "end": "2025-11-06T10:00:00Z",
          "minutes": 60
        }
      ],
      "rationale": ["Added Math sessions to meet weekly target", "Scheduled Reading during available windows"]
    }
    """
    # Extract constraint values from context
    max_minutes_per_day = context.get("max_minutes_per_day", 240)
    current_minutes_by_day = context.get("current_minutes_by_day", {})
    
    prompt = f"""You are an intelligent scheduling assistant for homeschooling families.
Pack a week (Monday to Sunday) with optimal event placement based on year plan targets and availability.

Constraints:
- CRITICAL: Do not exceed per-day cap of {max_minutes_per_day} minutes per day per child
- For each day, check current_minutes_by_day to see how many minutes are already scheduled
- Only add events if the total (existing + new) does not exceed {max_minutes_per_day} minutes per day per child
- Prefer 45-60 minute blocks (max 90 minutes)
- Avoid blackout days and outside teaching windows
- Meet weekly targets from year plans (hours per week per subject)
- Balance subjects across the week (don't pack everything on one day)
- Respect existing events (don't create duplicates)
- Consider learning velocity if provided
- IMPORTANT: If recent_struggles are provided for a child/subject, prefer shorter, more frequent sessions (e.g., 30-45 min instead of 60 min) to help with areas where the child has struggled
- STANDARDS-BASED PLANNING: If standards_gaps are provided for a child, prioritize scheduling events that address uncovered standards. Match subject_id to standards gaps by subject. Include standards context in event titles when relevant (e.g., "Math - Fractions (VA 4.3)")

Return ONLY valid JSON with this structure:
{{
  "events": [
    {{
      "child_id": "uuid",
      "subject_id": "uuid",
      "title": "Subject Name - Session",
      "start": "2025-11-06T09:00:00Z",
      "end": "2025-11-06T10:00:00Z",
      "minutes": 60
    }}
  ],
  "rationale": [
    "Added Math sessions to meet weekly target of 3 hours",
    "Scheduled Reading during available windows on Tuesday and Thursday"
  ]
}}

CONTEXT:
{json.dumps(context, indent=2)}
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a week packing assistant. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,  # Deterministic: same input = same output
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
    except json.JSONDecodeError as e:
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_catch_up(context: dict) -> Dict[str, Any]:
    """
    AI-powered catch-up: reschedule missed events intelligently.
    
    Input context includes:
    - missed_events: list of missed/overdue events with details
    - future_windows: available teaching windows in next 2-4 weeks
    - existing_events: events already scheduled (to avoid conflicts)
    - blackouts: blackout periods to avoid
    
    Output:
    {
      "rescheduled": [
        {{
          "event_id": "uuid",
          "original_start": "2025-11-05T10:00:00Z",
          "new_start": "2025-11-10T09:00:00Z",
          "new_end": "2025-11-10T10:00:00Z",
          "reason": "Moved to next available window"
        }}
      ],
      "rationale": ["Rescheduled 3 Math sessions to next week", "Moved Reading to avoid blackout"]
    }
    """
    # Extract constraint values from context
    max_minutes_per_day = context.get("max_minutes_per_day", 240)
    current_minutes_by_day = context.get("current_minutes_by_day", {})
    
    prompt = f"""You are an intelligent scheduling assistant for homeschooling families.
Reschedule missed events to optimal future time slots.

Constraints:
- CRITICAL: Do not exceed per-day cap of {max_minutes_per_day} minutes per day per child
- For each day, check current_minutes_by_day to see how many minutes are already scheduled
- Only reschedule events if the total (existing + rescheduled) does not exceed {max_minutes_per_day} minutes per day per child
- Find available windows in the next 2-4 weeks
- Avoid blackout days and outside teaching windows
- Don't create conflicts with existing scheduled events
- Preserve event duration (minutes)
- Prefer earlier slots when possible (catch up sooner)
- Balance catch-up across multiple days (don't pack everything on one day)
- IMPORTANT: If recent_struggles are provided for a child/subject, prefer shorter, more frequent sessions (e.g., split 60-min into two 30-min sessions) to help with areas where the child has struggled
- IMPORTANT: If a subject has recent strong ratings (4-5) from outcomes, you may compress/review instead of full lesson
- STANDARDS-BASED PLANNING: If standards_gaps are provided for a child, prioritize rescheduling events that address uncovered standards. Match subject_id to standards gaps by subject. This helps ensure standards coverage even when catching up on missed work.

Return ONLY valid JSON with this structure:
{{
  "rescheduled": [
    {{
      "event_id": "uuid",
      "original_start": "2025-11-05T10:00:00Z",
      "new_start": "2025-11-10T09:00:00Z",
      "new_end": "2025-11-10T10:00:00Z",
      "reason": "Moved to next available window"
    }}
  ],
  "rationale": [
    "Rescheduled 3 Math sessions to next week",
    "Moved Reading to avoid blackout period"
  ]
}}

CONTEXT:
{json.dumps(context, indent=2)}
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a catch-up scheduling assistant. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,  # Deterministic: same input = same output
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
    except json.JSONDecodeError as e:
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_event_tags(context: dict) -> Dict[str, Any]:
    """
    AI-powered tag suggestions for event outcomes.
    
    Input context includes:
    - title: event title
    - subject: subject name (if available)
    - description: event description/notes (if available)
    
    Output:
    {
      "suggested_strengths": ["Strong problem-solving", "Worked independently"],
      "suggested_struggles": ["Needed more support", "Concept confusion"]
    }
    """
    title = context.get("title", "Lesson")
    subject = context.get("subject", "General")
    description = context.get("description", "") or context.get("notes", "")
    
    prompt = f"""You are an educational assessment assistant for homeschooling families.
Given a lesson/event, suggest appropriate strengths and struggles tags that a parent might observe.

Event details:
- Title: {title}
- Subject: {subject}
- Description: {description or "(none)"}

Return ONLY valid JSON with this structure:
{{
  "suggested_strengths": [
    "Strong problem-solving",
    "Worked independently",
    "Quick grasp of concepts"
  ],
  "suggested_struggles": [
    "Needed more support",
    "Concept confusion",
    "Time management"
  ]
}}

Guidelines:
- Keep tags concise (2-5 words)
- Focus on observable learning behaviors
- Suggest 3-5 strengths and 2-4 struggles
- Make tags specific to the subject/topic when possible
- Use positive language for strengths, constructive language for struggles
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an educational assessment assistant. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,  # Slight creativity for tag suggestions
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
    except json.JSONDecodeError as e:
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_summarize_progress(context: dict) -> str:
    """
    Generate a natural language progress summary from snapshot data.
    
    Input context includes:
    - snapshot_rows: list of rows from get_progress_snapshot with outcomes and records
    - range_start: start date (YYYY-MM-DD)
    - range_end: end date (YYYY-MM-DD)
    
    Each row has:
    - child_name, subject_name
    - total_events, done_events, missed_events, upcoming_events
    - avg_rating (numeric, nullable)
    - recent_strengths (text[], nullable)
    - recent_struggles (text[], nullable)
    - latest_grade (text, nullable) - most recent grade for this child+subject
    - credits (numeric, nullable) - total credits earned for this child+subject
    - portfolio_count (bigint) - number of portfolio uploads for this child+subject
    
    Returns a natural language summary string.
    """
    rows = context.get("snapshot_rows", [])
    range_start = context.get("range_start", "")
    range_end = context.get("range_end", "")
    
    records = context.get("records", {})
    recent_grades = records.get("recent_grades", [])
    portfolio_counts = records.get("portfolio_counts", {})
    
    prompt = f"""You are an educational progress analyst for homeschooling families.
Generate a concise, insightful progress summary based on completed events, outcome reports, grades, and portfolio evidence.

Guidelines:
- Highlight trends: mention if performance is improving, declining, or stable
- Reference grades when available: "Algebra: A, 0.5 credits so far" or "Latest grade: B+"
- Mention portfolio activity when portfolio_count > 0: "Portfolio evidence added for [subject]"
- Connect struggles from outcomes to performance: "Recent struggles in X from records/outcomes suggest [insight]"
- Reference specific strengths/struggles when available (e.g., "trending up but repeated struggles in time management")
- Group by child, then by subject
- Be encouraging but honest about areas needing attention
- Keep each subject summary to 1-2 sentences

Example format:
"Math: 8/10 sessions completed. Average rating 4.2/5. Latest grade: A, 1.0 credits. Portfolio evidence added (3 uploads). Trending up but repeated struggles in time management. Strengths: strong problem-solving, worked independently."

Progress Data ({range_start} to {range_end}):
Each row includes:
- child_name, subject_name
- total_events, done_events, missed_events, upcoming_events
- avg_rating (average rating from outcomes)
- latest_grade (most recent grade for this child+subject, may be null)
- credits (total credits earned for this child+subject, may be null)
- portfolio_count (number of uploads for this child+subject)
- recent_strengths, recent_struggles (arrays of tags)

{json.dumps(rows, indent=2)}

Additional Records Context:
- Recent Grades (all children): {json.dumps(recent_grades, indent=2) if recent_grades else "None"}
- Portfolio Uploads Count: {json.dumps(portfolio_counts, indent=2) if portfolio_counts else "None"}

Return ONLY the summary text (no JSON, no markdown, plain text)."""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an educational progress analyst. Return only plain text summaries."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,  # Slight creativity for natural language
        )
        
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Fallback to simple text summary if LLM fails
        summary_parts = [f"Progress Summary ({range_start} to {range_end}):\n"]
        current_child = None
        for row in rows:
            if row.get("child_name") != current_child:
                if current_child is not None:
                    summary_parts.append("")
                current_child = row.get("child_name")
                summary_parts.append(f"{current_child}:")
            
            subject = row.get("subject_name", "—")
            done = row.get("done_events", 0)
            total = row.get("total_events", 0)
            avg_rating = row.get("avg_rating")
            latest_grade = row.get("latest_grade")
            credits = row.get("credits")
            portfolio_count = row.get("portfolio_count", 0)
            struggles = row.get("recent_struggles", [])
            
            line = f"  {subject}: {done}/{total} done"
            if avg_rating:
                line += f", avg rating {avg_rating:.1f}/5"
            if latest_grade:
                line += f", latest grade: {latest_grade}"
            if credits and credits > 0:
                line += f", {credits:.1f} credits"
            if portfolio_count and portfolio_count > 0:
                line += f", {portfolio_count} portfolio uploads"
            if struggles:
                line += f". Struggles: {', '.join(struggles[:3])}"
            summary_parts.append(line)
        
        return "\n".join(summary_parts)


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_syllabus(url: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a structured syllabus (units + lessons) from course/playlist metadata.
    
    Input:
    - url: Source URL (e.g., YouTube playlist URL)
    - metadata: Dict with title, description (optional), duration_sec (optional), etc.
    
    Returns:
    {
      "units": [
        {
          "title": "Unit name",
          "lessons": [
            {
              "title": "Lesson name",
              "duration_min": 15,
              "description": "Brief description"
            }
          ]
        }
      ]
    }
    """
    title = metadata.get("title", "Course")
    description = metadata.get("description", "")
    duration_sec = metadata.get("duration_sec")
    
    # Build duration hint
    duration_hint = ""
    if duration_sec:
        total_minutes = duration_sec // 60
        duration_hint = f"Total duration: approximately {total_minutes} minutes ({total_minutes // 60} hours {total_minutes % 60} minutes)."
    
    prompt = f"""You are generating a structured syllabus for an educational course/playlist.

Source URL: {url}
Title: {title}
{description and f"Description: {description}" or ""}
{duration_hint}

Generate a logical breakdown into units and lessons. Return ONLY valid JSON with this structure:
{{
  "units": [
    {{
      "title": "Unit name (e.g., 'Introduction to Algebra', 'Chapter 1: Basics')",
      "lessons": [
        {{
          "title": "Lesson name (specific and descriptive)",
          "duration_min": 15,
          "description": "Brief description of what this lesson covers (1-2 sentences)"
        }}
      ]
    }}
  ]
}}

Rules:
- Only return valid JSON, no commentary
- Break content into logical units (typically 3-8 units)
- Each unit should have 3-15 lessons
- duration_min should be reasonable (5-60 minutes per lesson)
- If total duration is provided, ensure lesson durations sum approximately to total
- Lesson titles should be specific and descriptive
- Descriptions should be concise (1-2 sentences)
- Units should be ordered logically (intro → intermediate → advanced)
- If description is empty, infer structure from title and URL type
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a syllabus generator. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,  # Low temperature for consistent structure
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "units" not in result or not isinstance(result["units"], list):
            raise ValueError("LLM response missing 'units' array")
        
        # Validate each unit has lessons
        for unit in result["units"]:
            if "title" not in unit:
                raise ValueError("Unit missing 'title'")
            if "lessons" not in unit or not isinstance(unit["lessons"], list):
                raise ValueError(f"Unit '{unit.get('title', '?')}' missing 'lessons' array")
            for lesson in unit["lessons"]:
                if "title" not in lesson:
                    raise ValueError("Lesson missing 'title'")
                if "duration_min" not in lesson:
                    lesson["duration_min"] = 15  # Default
                if "description" not in lesson:
                    lesson["description"] = ""  # Optional
        
        return result
    except json.JSONDecodeError as e:
        # Fallback: try to extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")



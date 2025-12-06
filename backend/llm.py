"""
OpenAI LLM helpers with retries and safe defaults
All AI calls happen server-side only, never from browser
"""
import os
import asyncio
import json
import backoff
from openai import AsyncOpenAI
from typing import Any, Dict, List, Optional

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
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }

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
    
    # Add support profile context
    support_profile = context.get("support_profile")
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        learning_modalities = support_profile.get("learning_modalities", [])
        support_needs = support_profile.get("support_needs", [])
        
        if diagnoses or learning_modalities or support_needs:
            support_context = "\n\nLearning Profile & Supports:\n"
            if diagnoses:
                support_context += f"- Diagnosed learning differences: {', '.join(diagnoses)}\n"
            if learning_modalities:
                support_context += f"- Preferred learning modalities: {', '.join(learning_modalities)}\n"
            if support_needs:
                support_context += f"- Support needs: {', '.join(support_needs)}\n"
            
            # Add specific guidance based on diagnoses
            if any('dyslexia' in d.lower() for d in diagnoses):
                support_context += "\nIMPORTANT: This child has dyslexia. Prioritize:\n"
                support_context += "- Multi-sensory materials (videos with visuals, audio books, hands-on activities)\n"
                support_context += "- Reading alternatives (audio books, read-aloud support, visual supplements)\n"
                support_context += "- Avoid text-heavy materials; suggest visual/audio alternatives\n"
            
            if any('adhd' in d.lower() for d in diagnoses):
                support_context += "\nIMPORTANT: This child has ADHD. Prioritize:\n"
                support_context += "- Shorter duration content (15-20 min videos, not 60+ min)\n"
                support_context += "- Interactive, engaging materials\n"
                support_context += "- Movement-based or hands-on activities\n"
            
            if any('dyscalculia' in d.lower() for d in diagnoses):
                support_context += "\nIMPORTANT: This child has dyscalculia. For math materials:\n"
                support_context += "- Visual, concrete representations\n"
                support_context += "- Step-by-step, scaffolded content\n"
                support_context += "- Hands-on manipulatives or visual aids\n"
    
    prompt = f"""You are an educational recommendation engine. Generate personalized learning suggestions for {child_name}.

Context:
- Subjects: {subjects_text}
- Strengths: {strengths_text}
- Struggles: {struggles_text}
- Interests: {interests_text}
{viewing_summary and f"- {viewing_summary}" or ""}{support_context}

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
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }
@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_suggest_plan(context: dict, reason: str = "rebalance") -> Dict[str, Any]:
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
    # Build reason-specific instructions
    reason_instructions = ""
    if reason == "rebalance":
        # Get current_minutes_by_day from context
        current_minutes = context.get("current_minutes_by_day", {})
        events = context.get("events", [])
        
        # Build a summary of current distribution
        minutes_summary = []
        for child_id, day_minutes in current_minutes.items():
            for date, minutes in day_minutes.items():
                minutes_summary.append(f"{date}: {minutes} min")
        
        reason_instructions = f"""
REBALANCE MODE: Your goal is to redistribute existing events to balance workload across days.

Current workload distribution:
{chr(10).join(minutes_summary) if minutes_summary else "No current minutes data available"}

You have {len(events)} existing events scheduled. Your task:
1. Analyze which days are overloaded (high minutes) vs underloaded (low minutes)
2. Move events from heavy days to lighter days to create a more even distribution
3. Aim for roughly equal minutes per day (within 20% variance when possible)
4. Even if there are no required_minutes, redistribute existing events for better balance
5. Preserve subject balance - don't cluster all Math on one day, all Reading on another
6. Look at the events array and propose moves to balance the schedule

IMPORTANT: You MUST propose moves even if events are in valid time slots. The goal is balance, not just fixing conflicts.
"""
    elif reason == "catch_up":
        reason_instructions = """
CATCH UP MODE: Focus on finding missed work and creating a realistic catch-up plan.
- Look for gaps in scheduled work compared to required_minutes
- Prioritize overdue or behind-schedule subjects
- Suggest adding catch-up sessions in available time slots
- Be realistic about what can be caught up - don't overload days
"""
    elif reason == "pack_week":
        reason_instructions = """
PACK WEEK MODE: Fill open time slots with useful learning tasks.
- Use flexible backlog items if available
- Fill gaps in the schedule with appropriate learning activities
- Maximize productive time without exceeding daily limits
"""
    
    prompt = f"""You are an intelligent scheduling assistant for homeschooling families.
Propose schedule changes for the coming weeks.

{reason_instructions}

IMPORTANT: Only propose moves for events that actually conflict with blackouts, need rescheduling, or serve the purpose above.
Do not propose moves for events that are already in valid time slots UNLESS you're rebalancing workload.

Constraints:
- Do not exceed per-day cap (240 minutes per day)
- Prefer 45-60 minute blocks (max 90 minutes)
- Avoid blackout days and outside teach windows
- Respect due hints from syllabus
- Balance subjects across the week
- Consider learning velocity (if child is slower, allocate more time)

Support Profile Adjustments (if available in context):
- ADHD: Use shorter durations (20-30 min blocks), schedule frequent breaks, avoid long sessions
- Dyslexia: Allow extra processing time (20% more), prefer multi-sensory materials, avoid text-heavy tasks
- Dyscalculia: Use smaller chunks for math (20-25 min blocks), scaffold step-by-step
- Autism: Maintain predictable schedules, avoid abrupt changes, prefer consistent times
- "Frequent breaks" support need: Schedule breaks every 20-30 minutes
- "Short bursts (Pomodoro-like)": Use 25-minute blocks with breaks
- "Allow extra processing time": Add 15-20% buffer to estimated durations

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
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }
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
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }
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
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }

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
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }
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


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_conversation_starters(context: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate personalized conversation starters for parents to connect with children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - recent_subjects: List[str]
    - recent_events: List[str]
    - support_profile: Dict (optional)
    - recent_strengths: List[str] (optional)
    
    Returns:
    [
        {
            "prompt": "Ask Lilly about dinosaurs...",
            "context": "Learning Biology: Dinosaurs",
            "type": "interest"
        }
    ]
    """
    child_name = context.get("child_name", "your child")
    recent_subjects = context.get("recent_subjects", [])
    recent_events = context.get("recent_events", [])
    support_profile = context.get("support_profile")
    
    prompt = f"""Generate 2-3 personalized conversation starters for a parent to connect with {child_name}.

Recent subjects: {', '.join(recent_subjects[:5]) if recent_subjects else 'various subjects'}
Recent activities: {', '.join(recent_events[:5]) if recent_events else 'various activities'}

Generate conversation starters that:
1. Reference specific recent learning (e.g., "Ask {child_name} about dinosaurs, they were reading about them in biology yesterday")
2. Connect to personal experiences (e.g., "Tell {child_name} a story about your childhood in DC, they're learning US history")
3. Encourage sharing interests and discoveries
4. Are natural and conversational

Return ONLY valid JSON array:
[
  {{
    "prompt": "Specific conversation starter text",
    "context": "Brief context about why this is relevant",
    "type": "interest" | "subject" | "personal" | "encouragement"
  }}
]
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates natural conversation starters for parents to connect with their children about learning."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Handle both array and object with array
        if isinstance(result, list):
            return result
        elif "starters" in result:
            return result["starters"]
        elif "conversation_starters" in result:
            return result["conversation_starters"]
        else:
            return []
    except Exception as e:
        return []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_write_feedback(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Help parents write encouraging feedback to children.
    
    Context should include:
    - child_name: str
    - child_grade: int (optional)
    - context: str (what feedback is about)
    - tone: str (encouraging, celebratory, supportive, gentle)
    - situation: str (optional, specific situation)
    - recent_events: List[Dict] (optional)
    - support_profile: Dict (optional)
    
    Returns:
    {
        "feedback_text": "Encouraging feedback message",
        "suggestions": ["suggestion 1", "suggestion 2"],
        "tips": ["tip 1", "tip 2"]
    }
    """
    child_name = context.get("child_name", "your child")
    feedback_context = context.get("context", "their progress")
    tone = context.get("tone", "encouraging")
    situation = context.get("situation", "")
    support_profile = context.get("support_profile")
    
    support_context = ""
    if support_profile:
        diagnoses = support_profile.get("diagnoses", [])
        if diagnoses:
            support_context += f"\nNote: {child_name} has a learning profile that includes {', '.join(diagnoses)}. Frame feedback positively and focus on effort and growth."
    
    prompt = f"""Help a parent write {tone} feedback to {child_name} about {feedback_context}.
{f"Specific situation: {situation}" if situation else ""}
{support_context}

Generate:
1. A warm, {tone} feedback message (2-3 sentences)
2. 2-3 specific suggestions for how to deliver this feedback
3. 2-3 tips for encouraging {child_name} further

Return ONLY valid JSON:
{{
  "feedback_text": "The actual feedback message to share",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "tips": ["Tip 1", "Tip 2"]
}}

Rules:
- Use positive, encouraging language
- Focus on effort and growth, not just outcomes
- Be specific and genuine
- Frame challenges as learning opportunities
- Consider the child's learning profile if provided
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that helps parents write encouraging, supportive feedback to their children. Always use positive, growth-oriented language."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "feedback_text" not in result:
            result["feedback_text"] = f"Great work on {feedback_context}! Keep up the excellent effort!"
        if "suggestions" not in result:
            result["suggestions"] = []
        if "tips" not in result:
            result["tips"] = []
        
        return result
    except Exception as e:
        # Fallback
        return {
            "feedback_text": f"I'm proud of your work on {feedback_context}. You're making great progress!",
            "suggestions": [
                f"Be specific about what {child_name} did well",
                f"Ask {child_name} what they enjoyed most"
            ],
            "tips": [
                "Focus on effort and process, not just outcomes",
                "Celebrate small wins and progress"
            ]
        }



@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_caption_and_tags(
    mime_type: str,
    title: str,
    image_url: Optional[str] = None,
    text_content: Optional[str] = None
) -> tuple[str, List[str], Dict[str, Any]]:
    """
    Generate auto-caption and tags for uploaded content.
    
    Returns:
        (caption: str, tags: List[str], metadata: Dict[str, Any])
    """
    try:
        # Determine content type
        is_image = mime_type.startswith("image/")
        is_pdf = mime_type == "application/pdf"
        is_video = mime_type.startswith("video/")
        is_audio = mime_type.startswith("audio/")
        
        prompt = f"""Generate a descriptive caption and relevant tags for this content.

Content Type: {mime_type}
Title: {title}
"""
        
        if is_image and image_url:
            prompt += f"\nImage URL: {image_url}\nNote: Analyze the image and describe what it shows."
        elif is_pdf and text_content:
            # Use first 2000 chars of text
            text_preview = text_content[:2000] if text_content else ""
            prompt += f"\nPDF Text Preview:\n{text_preview}\n\nGenerate a caption summarizing the PDF content."
        elif text_content:
            text_preview = text_content[:2000] if text_content else ""
            prompt += f"\nText Content Preview:\n{text_preview}"
        
        prompt += """

Return JSON with:
{
  "caption": "A clear, descriptive caption (1-2 sentences)",
  "tags": ["tag1", "tag2", "tag3"],
  "metadata": {
    "content_type": "image/pdf/video/audio/document",
    "subject_hints": ["math", "science", etc],
    "grade_level_hints": ["elementary", "middle", "high"]
  }
}

Rules:
- Caption should be concise but descriptive
- Tags should be relevant keywords (3-8 tags)
- Include subject hints if content suggests a subject area
- Include grade level hints if content suggests a grade level
"""
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a content analyzer. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        caption = result.get("caption", title)
        tags = result.get("tags", [])
        metadata = result.get("metadata", {})
        
        return caption, tags, metadata
    
    except Exception as e:
        # Fallback
        return title, [], {}


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_extract_assignments_and_lessons(
    pdf_text: str,
    extract_type: str = "both"
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract assignments and/or lessons from PDF text.
    
    Args:
        pdf_text: Extracted text from PDF
        extract_type: "assignments", "lessons", or "both"
    
    Returns:
        (assignments: List[Dict], lessons: List[Dict])
    """
    try:
        # Truncate to reasonable limit
        truncated_text = pdf_text[:50000] if len(pdf_text) > 50000 else pdf_text
        
        prompt = f"""Extract structured assignments and/or lessons from this PDF content.

Extract Type: {extract_type}

Return JSON with this structure:
{{
  "assignments": [
    {{
      "title": "Assignment name",
      "description": "Brief description",
      "due_date_hint": "Week 1 / End of Unit 2 / etc",
      "estimated_minutes": 60,
      "type": "homework/project/essay/worksheet/etc"
    }}
  ],
  "lessons": [
    {{
      "title": "Lesson name",
      "description": "Brief description",
      "estimated_minutes": 45,
      "topics": ["topic1", "topic2"],
      "materials_needed": ["material1", "material2"]
    }}
  ]
}}

Rules:
- Only extract if extract_type includes "assignments" or "lessons"
- If extract_type is "assignments", set lessons to []
- If extract_type is "lessons", set assignments to []
- estimated_minutes should be reasonable (15-120)
- due_date_hint can be relative or absolute
- Be specific with titles and descriptions

PDF CONTENT:
{truncated_text}
"""
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a PDF content extractor. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        assignments = result.get("assignments", [])
        lessons = result.get("lessons", [])
        
        # Filter based on extract_type
        if extract_type == "assignments":
            lessons = []
        elif extract_type == "lessons":
            assignments = []
        
        return assignments, lessons
    
    except Exception as e:
        # Fallback: return empty lists
        return [], []


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_coach_conversation(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    AI Personal Learning Coach conversation handler.
    
    Context includes:
    - family_id, user_id, child_id
    - session_type: 'parent' or 'child'
    - conversation_history: recent messages
    - context_data: learning context
    - goals: learning goals
    - child_info: child details (if child session)
    - recent_events: recent learning events
    - recent_assignments: recent assignments
    
    Returns:
    {
      "response": "coach response text",
      "recommendations": [
        {
          "type": "learning_strategy|resource|schedule_adjustment|goal_setting|motivation",
          "title": "Recommendation title",
          "description": "Description",
          "action_items": ["action 1", "action 2"],
          "priority": 1-5
        }
      ],
      "context_updates": {},  # Optional context updates
      "goals": []  # Optional goal updates
    }
    """
    session_type = context.get("session_type", "parent")
    conversation_history = context.get("conversation_history", [])
    child_info = context.get("child_info", {})
    recent_events = context.get("recent_events", [])
    recent_assignments = context.get("recent_assignments", [])
    
    # Build context summary
    child_name = child_info.get("first_name", "the student") if child_info else "your child"
    recent_activity = f"Recent learning activities: {len(recent_events)} events, {len(recent_assignments)} assignments"
    
    # Build conversation context
    conversation_text = "\n".join([
        f"{msg.get('role', 'user')}: {msg.get('content', '')}"
        for msg in conversation_history[-6:]  # Last 6 messages
    ])
    
    if session_type == "parent":
        system_prompt = """You are a supportive AI learning coach for homeschooling parents. 
You help parents understand their child's learning journey, provide encouragement, suggest strategies, 
and offer practical advice. Be warm, empathetic, and actionable. Keep responses concise (2-4 sentences) 
unless the parent asks for more detail."""
    else:
        system_prompt = f"""You are a friendly AI learning coach for {child_name}. 
You help students understand their learning, stay motivated, and develop good study habits. 
Be encouraging, age-appropriate, and supportive. Keep responses concise and engaging."""
    
    user_prompt = f"""Context:
- Session type: {session_type}
- {recent_activity}
- Current conversation:
{conversation_text}

Provide a helpful, personalized response. If appropriate, suggest 1-2 actionable recommendations.

Return JSON:
{{
  "response": "your response text",
  "recommendations": [
    {{
      "type": "learning_strategy|resource|schedule_adjustment|goal_setting|motivation",
      "title": "Short title",
      "description": "Brief description",
      "action_items": ["specific action 1", "specific action 2"],
      "priority": 3
    }}
  ]
}}"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        return {
            "response": result.get("response", "I'm here to help with your learning journey!"),
            "recommendations": result.get("recommendations", []),
            "context_updates": {},
            "goals": []
        }
    except Exception as e:
        # Fallback response
        return {
            "response": "I'm here to help! How can I support your learning today?",
            "recommendations": [],
            "context_updates": {},
            "goals": []
        }


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_advanced_insights(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate comprehensive multi-layer AI insights.
    
    Context includes:
    - family_id, child_id
    - events, assignments, outcomes
    - child_info, family_events
    
    Returns:
    {
      "insights": [
        {
          "insight_type": "emotional|tactical|strategic|predictive|prescriptive",
          "layer": "surface|pattern|deep|predictive",
          "title": "Insight title",
          "description": "Detailed description",
          "data_points": {},
          "confidence_score": 0.0-1.0,
          "impact_score": 1-5,
          "actionable": true,
          "proposed_changes": []
        }
      ]
    }
    """
    child_id = context.get("child_id")
    events = context.get("events", [])
    assignments = context.get("assignments", [])
    outcomes = context.get("outcomes", [])
    child_info = context.get("child_info", {})
    
    child_name = child_info.get("first_name", "the student") if child_info else None
    
    # Build summary
    events_summary = f"{len(events)} learning events"
    assignments_summary = f"{len(assignments)} assignments"
    outcomes_summary = f"{len(outcomes)} learning outcomes"
    
    # Analyze patterns
    completed_events = [e for e in events if e.get("status") == "done"]
    pending_assignments = [a for a in assignments if a.get("status") not in ["accepted", "reviewed"]]
    
    prompt = f"""Analyze learning data and generate comprehensive multi-layer insights.

Context:
- Child: {child_name or "Family-level"}
- {events_summary} ({len(completed_events)} completed)
- {assignments_summary} ({len(pending_assignments)} pending)
- {outcomes_summary}

Generate insights across multiple layers:
1. SURFACE layer: Immediate, observable patterns (what's happening now)
2. PATTERN layer: Trends and recurring behaviors (what patterns exist)
3. DEEP layer: Root causes and underlying factors (why it's happening)
4. PREDICTIVE layer: Future projections (what might happen)

And across multiple types:
- EMOTIONAL: Mood, motivation, engagement
- TACTICAL: Day-to-day actions and adjustments
- STRATEGIC: Long-term planning and goals
- PREDICTIVE: Future outcomes and trends
- PRESCRIPTIVE: Specific recommendations

Return JSON:
{{
  "insights": [
    {{
      "insight_type": "emotional|tactical|strategic|predictive|prescriptive",
      "layer": "surface|pattern|deep|predictive",
      "title": "Concise title",
      "description": "2-3 sentence description with specific data points",
      "data_points": {{"metric": "value"}},
      "confidence_score": 0.0-1.0,
      "impact_score": 1-5,
      "actionable": true/false,
      "proposed_changes": [
        {{"action": "description", "type": "schedule|assignment|goal"}}
      ]
    }}
  ]
}}

Generate 5-10 diverse insights covering different types and layers."""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an advanced learning analytics AI. Generate comprehensive, actionable insights."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        return {
            "insights": result.get("insights", [])
        }
    except Exception as e:
        # Fallback: return basic insights
        return {
            "insights": [
                {
                    "insight_type": "tactical",
                    "layer": "surface",
                    "title": "Learning Activity Summary",
                    "description": f"Recent learning activity shows {len(events)} events and {len(assignments)} assignments.",
                    "data_points": {"events": len(events), "assignments": len(assignments)},
                    "confidence_score": 0.7,
                    "impact_score": 3,
                    "actionable": True,
                    "proposed_changes": []
                }
            ]
        }


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_template_from_topic(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a learning template from a topic, syllabus, curriculum, etc.
    
    Context includes:
    - source_type: 'topic', 'syllabus', 'curriculum', 'learning_goal', 'subject'
    - source_data: The actual content (topic text, syllabus JSON, etc.)
    - template_type: 'lesson', 'unit', 'sequence', 'plan'
    - subjects, grade_levels, estimated_duration_days
    
    Returns:
    {
      "template_name": "Template name",
      "template_description": "Description",
      "template_data": {
        "events": [...],
        "structure": {...},
        "objectives": [...]
      },
      "cognitive_load_profile": {
        "low": 0.3,
        "medium": 0.5,
        "high": 0.2
      },
      "generation_prompt": "The prompt used",
      "confidence_score": 0.0-1.0
    }
    """
    source_type = context.get("source_type", "topic")
    source_data = context.get("source_data", {})
    template_type = context.get("template_type", "lesson")
    subjects = context.get("subjects", [])
    grade_levels = context.get("grade_levels", [])
    
    # Extract source content
    if isinstance(source_data, dict):
        source_text = source_data.get("text") or source_data.get("content") or str(source_data)
    else:
        source_text = str(source_data)
    
    # Truncate if too long
    if len(source_text) > 10000:
        source_text = source_text[:10000] + "..."
    
    subjects_text = ", ".join(subjects) if subjects else "various subjects"
    grade_text = ", ".join(grade_levels) if grade_levels else "appropriate grade levels"
    
    prompt = f"""Generate a {template_type} template from the following {source_type}:

Source Content:
{source_text}

Requirements:
- Template type: {template_type}
- Subjects: {subjects_text}
- Grade levels: {grade_text}
- Create a structured, actionable template

Return JSON:
{{
  "template_name": "Descriptive template name",
  "template_description": "2-3 sentence description",
  "template_data": {{
    "structure": {{
      "sections": ["section1", "section2"],
      "duration_minutes": 60,
      "objectives": ["objective1", "objective2"],
      "materials": ["material1", "material2"],
      "activities": [
        {{"title": "Activity name", "duration_minutes": 15, "cognitive_load": "medium"}}
      ]
    }}
  }},
  "cognitive_load_profile": {{
    "low": 0.3,
    "medium": 0.5,
    "high": 0.2
  }},
  "confidence_score": 0.0-1.0
}}

Make the template practical, age-appropriate, and well-structured."""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a curriculum design AI. Generate structured, practical learning templates."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        return {
            "template_name": result.get("template_name", "Generated Template"),
            "template_description": result.get("template_description", ""),
            "template_data": result.get("template_data", {}),
            "cognitive_load_profile": result.get("cognitive_load_profile", {"low": 0.33, "medium": 0.34, "high": 0.33}),
            "generation_prompt": prompt,
            "confidence_score": result.get("confidence_score", 0.7)
        }
    except Exception as e:
        # Fallback template
        return {
            "template_name": f"Template from {source_type}",
            "template_description": f"A {template_type} template generated from {source_type}",
            "template_data": {
                "structure": {
                    "sections": ["Introduction", "Main Content", "Conclusion"],
                    "duration_minutes": 60,
                    "objectives": ["Learn key concepts"],
                    "materials": [],
                    "activities": []
                }
            },
            "cognitive_load_profile": {"low": 0.33, "medium": 0.34, "high": 0.33},
            "generation_prompt": prompt,
            "confidence_score": 0.5
        }


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_review_recommendations(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate AI-powered review task recommendations.
    
    Context includes:
    - family_id, child_id, child_name
    - completed_assignments: assignments that need review
    - recent_events: recent learning events
    - outcomes: learning outcomes with strengths/struggles
    
    Returns:
    {
      "recommendations": [
        {
          "recommendation_type": "spaced_review|mastery_check|skill_practice|concept_reinforcement|assignment_review",
          "title": "Review title",
          "description": "Description",
          "reason": "Why this review is recommended",
          "linked_content_id": "assignment_id or skill_id",
          "linked_content_type": "assignment|skill|subject|event",
          "estimated_benefit": "Expected benefit",
          "estimated_time_minutes": 15,
          "cognitive_load": "low|medium|high",
          "optimal_timing": {"days_from_now": 3},
          "spaced_repetition_data": {},
          "mastery_level": 0.0-1.0,
          "target_mastery": 0.0-1.0,
          "priority": 1-5
        }
      ]
    }
    """
    child_name = context.get("child_name", "the student")
    completed_assignments = context.get("completed_assignments", [])
    recent_events = context.get("recent_events", [])
    outcomes = context.get("outcomes", [])
    
    # Build summary
    assignments_summary = f"{len(completed_assignments)} completed assignments available for review"
    events_summary = f"{len(recent_events)} recent learning events"
    outcomes_summary = f"{len(outcomes)} learning outcomes recorded"
    
    # Extract struggles and strengths
    all_struggles = []
    all_strengths = []
    for outcome in outcomes:
        all_struggles.extend(outcome.get("struggles", []))
        all_strengths.extend(outcome.get("strengths", []))
    
    struggles_text = ", ".join(set(all_struggles)) if all_struggles else "none noted"
    strengths_text = ", ".join(set(all_strengths)) if all_strengths else "general progress"
    
    prompt = f"""Generate personalized review task recommendations for {child_name}.

Context:
- {assignments_summary}
- {events_summary}
- {outcomes_summary}
- Areas of strength: {strengths_text}
- Areas needing support: {struggles_text}

Generate review recommendations using spaced repetition principles and mastery-based learning.
Focus on:
1. Spaced reviews of completed assignments (optimal timing based on forgetting curve)
2. Mastery checks for skills showing struggles
3. Skill practice for areas needing reinforcement
4. Concept reinforcement for recently learned topics
5. Assignment reviews for completed work

Return JSON:
{{
  "recommendations": [
    {{
      "recommendation_type": "spaced_review|mastery_check|skill_practice|concept_reinforcement|assignment_review",
      "title": "Specific review title",
      "description": "What this review covers",
      "reason": "Why this review is recommended now",
      "linked_content_id": "assignment_id or null",
      "linked_content_type": "assignment|skill|subject|event",
      "estimated_benefit": "Expected learning benefit",
      "estimated_time_minutes": 15-60,
      "cognitive_load": "low|medium|high",
      "optimal_timing": {{"days_from_now": 3}},
      "mastery_level": 0.0-1.0,
      "target_mastery": 0.8,
      "priority": 1-5
    }}
  ]
}}

Generate 5-10 diverse recommendations prioritizing:
- High-impact reviews (struggling areas)
- Optimal timing (spaced repetition)
- Manageable cognitive load
- Clear learning benefits"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an AI learning coach specializing in spaced repetition and mastery-based review recommendations."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        return {
            "recommendations": result.get("recommendations", [])
        }
    except Exception as e:
        # Fallback: generate basic recommendations from completed assignments
        recommendations = []
        for assignment in completed_assignments[:5]:
            recommendations.append({
                "recommendation_type": "assignment_review",
                "title": f"Review: {assignment.get('title', 'Assignment')}",
                "description": "Review this completed assignment to reinforce learning",
                "reason": "Completed assignment ready for review",
                "linked_content_id": assignment.get("id"),
                "linked_content_type": "assignment",
                "estimated_benefit": "Reinforce learning through review",
                "estimated_time_minutes": 15,
                "cognitive_load": "low",
                "optimal_timing": {"days_from_now": 3},
                "mastery_level": 0.7,
                "target_mastery": 0.8,
                "priority": 3,
            })
        
        return {
            "recommendations": recommendations
        }


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_learner_recommendations(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate personalized learning recommendations based on comprehensive learner profile.
    
    Context includes:
    - family_id, child_id, child_name, age, grade
    - diagnoses, learning_modalities, support_needs, executive_function (from support profile)
    - strengths, interests, academic_strengths, academic_challenges, preferred_subjects, motivation_factors (from learner profile)
    - recent_events, recent_outcomes, assignments (learning data)
    
    Returns:
    {
      "recommendations": [
        {
          "recommendation_type": "learning_strategy|resource|schedule_adjustment|subject_suggestion|activity_suggestion|support_strategy|goal_setting|skill_development",
          "title": "Recommendation title",
          "description": "Detailed description",
          "rationale": "Why this is recommended based on profile",
          "linked_content_type": "subject|assignment|event|resource",
          "linked_content_id": "ID if applicable",
          "priority": 1-5,
          "confidence_score": 0.0-1.0,
          "estimated_benefit": "Expected benefit",
          "estimated_time_minutes": 15-60,
          "cognitive_load": "low|medium|high",
          "influenced_by": {"strengths": [...], "interests": [...], "diagnoses": [...]}
        }
      ]
    }
    """
    child_name = context.get("child_name", "the student")
    age = context.get("age")
    grade = context.get("grade")
    
    # Support profile
    diagnoses = context.get("diagnoses", [])
    learning_modalities = context.get("learning_modalities", [])
    support_needs = context.get("support_needs", [])
    executive_function = context.get("executive_function", [])
    
    # Learner profile
    strengths = context.get("strengths", [])
    interests = context.get("interests", [])
    academic_strengths = context.get("academic_strengths", [])
    academic_challenges = context.get("academic_challenges", [])
    preferred_subjects = context.get("preferred_subjects", [])
    motivation_factors = context.get("motivation_factors", [])
    
    # Learning data
    recent_events = context.get("recent_events", [])
    recent_outcomes = context.get("recent_outcomes", [])
    assignments = context.get("assignments", [])
    
    # Build context summary
    profile_summary = f"Learner Profile for {child_name}"
    if age:
        profile_summary += f" (age {age})"
    if grade:
        profile_summary += f", {grade}"
    
    diagnoses_text = ", ".join(diagnoses) if diagnoses else "none"
    strengths_text = ", ".join(strengths[:5]) if strengths else "general abilities"
    interests_text = ", ".join(interests[:5]) if interests else "general learning"
    challenges_text = ", ".join(academic_challenges[:3]) if academic_challenges else "none noted"
    
    # Extract struggles from outcomes
    all_struggles = []
    all_strengths_outcomes = []
    for outcome in recent_outcomes:
        all_struggles.extend(outcome.get("struggles", []))
        all_strengths_outcomes.extend(outcome.get("strengths", []))
    
    struggles_text = ", ".join(set(all_struggles[:3])) if all_struggles else "none noted"
    
    prompt = f"""Generate personalized learning recommendations for {child_name} based on their comprehensive learner profile.

Profile Summary:
- Age/Grade: {profile_summary}
- Diagnoses: {diagnoses_text}
- Strengths: {strengths_text}
- Interests: {interests_text}
- Academic Challenges: {challenges_text}
- Learning Modalities: {", ".join(learning_modalities) if learning_modalities else "various"}
- Support Needs: {", ".join(support_needs[:3]) if support_needs else "standard support"}
- Motivation Factors: {", ".join(motivation_factors[:3]) if motivation_factors else "general motivation"}

Recent Learning:
- {len(recent_events)} recent events
- {len(recent_outcomes)} outcomes recorded
- Recent struggles: {struggles_text}
- Recent strengths: {", ".join(set(all_strengths_outcomes[:3])) if all_strengths_outcomes else "general progress"}

Generate 5-10 diverse, actionable recommendations that:
1. Leverage their strengths and interests
2. Address academic challenges with appropriate support
3. Align with their learning modalities and support needs
4. Consider their motivation factors
5. Build on recent learning patterns

Return JSON:
{{
  "recommendations": [
    {{
      "recommendation_type": "learning_strategy|resource|schedule_adjustment|subject_suggestion|activity_suggestion|support_strategy|goal_setting|skill_development",
      "title": "Specific, actionable recommendation title",
      "description": "Detailed description of what this recommendation involves",
      "rationale": "Why this recommendation is made based on the learner profile",
      "linked_content_type": "subject|assignment|event|resource|null",
      "linked_content_id": "ID if applicable, or null",
      "priority": 1-5,
      "confidence_score": 0.0-1.0,
      "estimated_benefit": "Expected learning benefit",
      "estimated_time_minutes": 15-60,
      "cognitive_load": "low|medium|high",
      "influenced_by": {{
        "strengths": ["list of strengths that influenced this"],
        "interests": ["list of interests that influenced this"],
        "diagnoses": ["list of diagnoses that influenced this"],
        "challenges": ["list of challenges that influenced this"]
      }}
    }}
  ]
}}

Prioritize recommendations that:
- Are highly personalized to the learner profile
- Address specific needs or leverage specific strengths
- Are actionable and achievable
- Consider sensory and support needs
- Align with motivation factors"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an AI learning coach specializing in personalized recommendations based on comprehensive learner profiles, including support needs, strengths, interests, and learning patterns."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        return {
            "recommendations": result.get("recommendations", [])
        }
    except Exception as e:
        # Fallback: generate basic recommendations from profile
        recommendations = []
        
        if interests:
            recommendations.append({
                "recommendation_type": "subject_suggestion",
                "title": f"Explore {interests[0]} more deeply",
                "description": f"Build on {child_name}'s interest in {interests[0]} with related learning activities",
                "rationale": f"Strong interest in {interests[0]} indicates engagement potential",
                "linked_content_type": None,
                "linked_content_id": None,
                "priority": 4,
                "confidence_score": 0.7,
                "estimated_benefit": "Increased engagement and motivation",
                "estimated_time_minutes": 30,
                "cognitive_load": "medium",
                "influenced_by": {"interests": [interests[0]]}
            })
        
        if academic_challenges:
            recommendations.append({
                "recommendation_type": "support_strategy",
                "title": f"Support for {academic_challenges[0]}",
                "description": f"Implement targeted support strategies for {academic_challenges[0]}",
                "rationale": f"Identified challenge in {academic_challenges[0]} needs targeted support",
                "linked_content_type": None,
                "linked_content_id": None,
                "priority": 5,
                "confidence_score": 0.8,
                "estimated_benefit": "Improved performance in challenging area",
                "estimated_time_minutes": 45,
                "cognitive_load": "medium",
                "influenced_by": {"challenges": [academic_challenges[0]]}
            })
        
        if strengths:
            recommendations.append({
                "recommendation_type": "learning_strategy",
                "title": f"Leverage {strengths[0]} strength",
                "description": f"Design learning activities that utilize {child_name}'s strength in {strengths[0]}",
                "rationale": f"Strong ability in {strengths[0]} can be leveraged for deeper learning",
                "linked_content_type": None,
                "linked_content_id": None,
                "priority": 3,
                "confidence_score": 0.6,
                "estimated_benefit": "Enhanced learning through strength-based approach",
                "estimated_time_minutes": 30,
                "cognitive_load": "low",
                "influenced_by": {"strengths": [strengths[0]]}
            })
        
        return {
            "recommendations": recommendations
        }

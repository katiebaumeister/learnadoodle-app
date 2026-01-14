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
        
        # Get performance data to inform adaptive rebalancing
        performance_data = context.get("performance_by_subject", {})
        recent_struggles = context.get("recent_struggles", {})
        
        # Build performance summary for rebalancing
        performance_summary = []
        struggling_subjects = []
        excelling_subjects = []
        
        for key, perf in performance_data.items():
            child_id, subject_id = key.split(":", 1) if ":" in key else (key, "none")
            avg_rating = perf.get("avg_rating")
            rating_count = perf.get("rating_count", 0)
            struggles_list = perf.get("struggles", [])
            strengths_list = perf.get("strengths", [])
            
            if avg_rating is not None and rating_count >= 2:  # Need at least 2 ratings for meaningful data
                if avg_rating <= 2.5:  # Low performance
                    struggling_subjects.append(f"{child_id}:{subject_id} (avg rating: {avg_rating:.1f}/5, {len(struggles_list)} struggles)")
                elif avg_rating >= 4.0:  # High performance
                    excelling_subjects.append(f"{child_id}:{subject_id} (avg rating: {avg_rating:.1f}/5, {len(strengths_list)} strengths)")
        
        reason_instructions = f"""
REBALANCE MODE: Your goal is to redistribute existing events to balance workload across days AND adapt to child performance.

Current workload distribution:
{chr(10).join(minutes_summary) if minutes_summary else "No current minutes data available"}

You have {len(events)} existing events scheduled. Your task:
1. Analyze which days are overloaded (high minutes) vs underloaded (low minutes)
2. Move events from heavy days to lighter days to create a more even distribution
3. Aim for roughly equal minutes per day (within 20% variance when possible)
4. Even if there are no required_minutes, redistribute existing events for better balance
5. Preserve subject balance - don't cluster all Math on one day, all Reading on another
6. Look at the events array and propose moves to balance the schedule

ADAPTIVE REBALANCING (based on child performance):
{f"- Subjects where child is struggling (low ratings): {chr(10).join(struggling_subjects)}" if struggling_subjects else "- No struggling subjects identified"}
{f"- Subjects where child is excelling (high ratings): {chr(10).join(excelling_subjects)}" if excelling_subjects else "- No excelling subjects identified"}

When rebalancing:
- For struggling subjects (avg rating ≤ 2.5): Consider ADDING extra sessions or INCREASING time allocated to help the child catch up. You can propose "adds" in addition to moves.
- For excelling subjects (avg rating ≥ 4.0): Consider REDUCING time slightly or maintaining current allocation, as the child is performing well.
- Use recent_struggles data to identify specific areas needing more support.
- Balance the need for even daily distribution with the need to support struggling subjects.

IMPORTANT: You MUST propose moves even if events are in valid time slots. The goal is balance AND adaptive support. You can propose both "moves" (redistribute) and "adds" (add extra time for struggling subjects).
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

IMPORTANT: If there are no flexible backlog items available, you should still return an empty adds array with a helpful message in rationale explaining that backlog items need to be added first.
"""
    
    # Format availability windows clearly for the LLM
    availability_summary = []
    avail = context.get("availability", [])
    if avail:
        # Group by child and date
        by_child_date = {}
        for entry in avail:
            child_id = entry.get("child_id")
            date = entry.get("date")
            windows = entry.get("windows", [])
            day_status = entry.get("day_status")
            
            if day_status == "off":
                continue  # Skip blackout days
            
            key = f"{child_id}:{date}"
            if key not in by_child_date:
                by_child_date[key] = {
                    "child_id": child_id,
                    "child_name": entry.get("child_name", "Child"),
                    "date": date,
                    "windows": []
                }
            
            if windows:
                by_child_date[key]["windows"].extend(windows)
        
        for key, entry in sorted(by_child_date.items()):
            windows_str = ", ".join([
                f"{w.get('start', 'N/A')} to {w.get('end', 'N/A')}"
                for w in entry["windows"]
            ]) if entry["windows"] else "No windows available"
            availability_summary.append(
                f"  {entry['child_name']} ({entry['date']}): {windows_str}"
            )
    
    availability_text = "\n".join(availability_summary) if availability_summary else "No availability windows found in context."
    
    prompt = f"""You are an intelligent scheduling assistant for homeschooling families.
Propose schedule changes for the coming weeks.

{reason_instructions}

CRITICAL: AVAILABLE TEACHING WINDOWS (You MUST schedule events ONLY within these times):
{availability_text}

IMPORTANT: Only propose moves for events that actually conflict with blackouts, need rescheduling, or serve the purpose above.
Do not propose moves for events that are already in valid time slots UNLESS you're rebalancing workload.

Constraints:
- Do not exceed per-day cap (240 minutes per day)
- Prefer 45-60 minute blocks (max 90 minutes)
- CRITICAL: ALL event start and end times MUST be within the teaching windows listed above
- NEVER schedule events outside the teaching windows (e.g., before 9 AM or after 3 PM unless the window explicitly allows it)
- Avoid blackout days (days with no windows listed above)
- Respect due hints from syllabus
- Balance subjects across the week
- Consider learning velocity (if child is slower, allocate more time)

ADAPTIVE SCHEDULING (use performance data when available):
- If performance_by_subject shows a child/subject with low average ratings (≤2.5), consider allocating MORE time to that subject
- If performance_by_subject shows a child/subject with high average ratings (≥4.0), you may allocate LESS time or maintain current allocation
- Use recent_struggles to identify specific areas needing support - prefer shorter, more frequent sessions for struggling subjects
- Use strengths data to identify subjects where the child excels - these may need less time or can be compressed

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
        proposal = json.loads(content)
        
        # Post-process: Validate and filter out suggestions outside teaching windows
        avail = context.get("availability", [])
        if avail:
            # Build availability map: (child_id, date) -> list of windows
            avail_map = {}
            for entry in avail:
                child_id = entry.get("child_id")
                date = entry.get("date")
                windows = entry.get("windows", [])
                day_status = entry.get("day_status")
                
                if day_status == "off":
                    continue  # Skip blackout days
                
                key = (child_id, date)
                if key not in avail_map:
                    avail_map[key] = []
                avail_map[key].extend(windows)
            
            # Helper to check if a timestamp is within any window for a child/date
            def is_within_window(child_id: str, timestamp: str, windows_list: list) -> bool:
                if not windows_list:
                    return False
                try:
                    from datetime import datetime
                    ts_dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    for window in windows_list:
                        win_start = window.get("start")
                        win_end = window.get("end")
                        if win_start and win_end:
                            try:
                                start_dt = datetime.fromisoformat(win_start.replace("Z", "+00:00"))
                                end_dt = datetime.fromisoformat(win_end.replace("Z", "+00:00"))
                                if start_dt <= ts_dt <= end_dt:
                                    return True
                            except:
                                pass
                except:
                    pass
                return False
            
            # Filter adds
            filtered_adds = []
            for add in proposal.get("adds", []):
                child_id = add.get("child_id")
                start_ts = add.get("start")
                end_ts = add.get("end")
                
                if not child_id or not start_ts:
                    continue
                
                # Extract date from start_ts
                try:
                    from datetime import datetime
                    start_dt = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                    date_str = start_dt.date().isoformat()
                    
                    windows_list = avail_map.get((child_id, date_str), [])
                    if is_within_window(child_id, start_ts, windows_list) and is_within_window(child_id, end_ts, windows_list):
                        filtered_adds.append(add)
                except:
                    pass  # Skip if parsing fails
            
            # Filter moves
            filtered_moves = []
            for move in proposal.get("moves", []):
                # Get child_id from the event being moved
                event_id = move.get("event_id")
                child_id = None
                
                # Try to find child_id from events in context
                events = context.get("events", [])
                for event in events:
                    if event.get("id") == event_id:
                        child_id = event.get("child_id")
                        break
                
                if not child_id:
                    continue
                
                to_start = move.get("to_start")
                to_end = move.get("to_end")
                
                if not to_start:
                    continue
                
                try:
                    from datetime import datetime
                    start_dt = datetime.fromisoformat(to_start.replace("Z", "+00:00"))
                    date_str = start_dt.date().isoformat()
                    
                    windows_list = avail_map.get((child_id, date_str), [])
                    if is_within_window(child_id, to_start, windows_list) and is_within_window(child_id, to_end, windows_list):
                        filtered_moves.append(move)
                except:
                    pass  # Skip if parsing fails
            
            # Update proposal with filtered results
            proposal["adds"] = filtered_adds
            proposal["moves"] = filtered_moves
            
            # Add note to rationale if we filtered anything
            original_adds_count = len(proposal.get("adds", [])) + (len(filtered_adds) - len(proposal.get("adds", [])))
            original_moves_count = len(proposal.get("moves", [])) + (len(filtered_moves) - len(proposal.get("moves", [])))
            if len(filtered_adds) < original_adds_count or len(filtered_moves) < original_moves_count:
                proposal.setdefault("rationale", []).append(
                    f"Filtered out {original_adds_count - len(filtered_adds)} adds and {original_moves_count - len(filtered_moves)} moves that were outside teaching windows"
                )
        
        return proposal
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
    context_data = context.get("context_data", {})
    recent_events = context_data.get("recent_events", context.get("recent_events", []))
    recent_assignments = context_data.get("assignments", context.get("recent_assignments", []))
    
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
and offer practical advice. Be warm, empathetic, and actionable.

IMPORTANT: When making recommendations, be SPECIFIC and CONCRETE. Instead of generic advice like 
"provide materials to explore art techniques," give specific suggestions like "try finding a new 
craft on Pinterest that interweaves elements of the color wheel" or "set up a science experiment 
matching the one from last week's Science Fair Project." Reference actual events, subjects, or 
activities from the evidence provided. Make suggestions that parents can act on immediately."""
    else:
        system_prompt = f"""You are a friendly AI learning coach for {child_name}. 
You help students understand their learning, stay motivated, and develop good study habits. 
Be encouraging, age-appropriate, and supportive. Keep responses concise and engaging."""
    
    # Get context data for evidence building
    context_data = context.get("context_data", {})
    children_info = context_data.get("children_info", [])
    recent_events = context_data.get("recent_events", context.get("recent_events", []))
    grades = context_data.get("grades", [])
    attendance = context_data.get("attendance", [])
    subjects = context_data.get("subjects", [])
    
    # Build evidence list from available data
    evidence_list = []
    if recent_events:
        event_titles = [e.get("title", "Event") for e in recent_events[:5] if e.get("title")]
        if event_titles:
            evidence_list.append(f"Recent events: {', '.join(event_titles)}")
    
    if grades:
        grade_items = []
        for grade in grades[:5]:
            subject_name = next((s.get("name", "Unknown") for s in subjects if s.get("id") == grade.get("subject_id")), "Unknown subject")
            grade_val = grade.get("grade", "N/A")
            if grade_val and grade_val != "N/A":
                grade_items.append(f"{subject_name} ({grade_val})")
        if grade_items:
            evidence_list.append(f"Recent grades: {', '.join(grade_items)}")
    
    if attendance:
        present_count = sum(1 for a in attendance if a.get("status") == "present")
        if present_count > 0:
            evidence_list.append(f"Attendance: {present_count} present out of {len(attendance)} sessions")
    
    if children_info:
        child = children_info[0] if children_info else {}
        
        # Get interests - handle various formats
        interests = None
        if child.get("learner_profile") and isinstance(child.get("learner_profile"), dict):
            interests = child.get("learner_profile", {}).get("interests")
        if not interests:
            interests = child.get("interests")
        
        if interests:
            # Clean up interests - handle string that might be JSON, or array
            clean_interests = []
            if isinstance(interests, str):
                # Try to parse if it's JSON string (may be nested)
                try:
                    parsed = json.loads(interests)
                    # If it's a list, extract items
                    if isinstance(parsed, list):
                        for item in parsed:
                            # Handle nested JSON strings
                            if isinstance(item, str):
                                try:
                                    nested = json.loads(item)
                                    if isinstance(nested, list):
                                        clean_interests.extend([str(i) for i in nested if i])
                                    else:
                                        clean_interests.append(str(nested))
                                except (json.JSONDecodeError, TypeError):
                                    clean_interests.append(item)
                            else:
                                clean_interests.append(str(item))
                    else:
                        clean_interests.append(str(parsed))
                except (json.JSONDecodeError, TypeError):
                    # Not JSON, just use as string
                    clean_interests = [interests]
            elif isinstance(interests, list):
                for item in interests:
                    if isinstance(item, str):
                        # Check if item is a JSON string
                        try:
                            nested = json.loads(item)
                            if isinstance(nested, list):
                                clean_interests.extend([str(i) for i in nested if i])
                            else:
                                clean_interests.append(str(nested))
                        except (json.JSONDecodeError, TypeError):
                            clean_interests.append(item)
                    else:
                        clean_interests.append(str(item))
            
            if clean_interests:
                # Remove any remaining quotes/brackets and clean up
                final_interests = []
                for item in clean_interests:
                    cleaned = str(item).strip().strip('"').strip("'").strip('[').strip(']')
                    if cleaned and cleaned not in final_interests:
                        final_interests.append(cleaned)
                if final_interests:
                    evidence_list.append(f"Interests: {', '.join(final_interests[:3])}")
        
        # Get learning style - handle various formats
        learning_style = None
        if child.get("learner_profile") and isinstance(child.get("learner_profile"), dict):
            learning_style = child.get("learner_profile", {}).get("learning_preferences")
        if not learning_style:
            learning_style = child.get("learning_style")
        
        if learning_style:
            # Clean up learning style
            clean_learning_style = []
            if isinstance(learning_style, str):
                try:
                    parsed = json.loads(learning_style)
                    if isinstance(parsed, list):
                        clean_learning_style = [str(item) for item in parsed if item]
                    else:
                        clean_learning_style = [str(parsed)]
                except (json.JSONDecodeError, TypeError):
                    clean_learning_style = [learning_style]
            elif isinstance(learning_style, list):
                clean_learning_style = [str(item) for item in learning_style if item]
            
            if clean_learning_style:
                # Remove any remaining quotes/brackets and clean up
                final_learning_style = []
                for item in clean_learning_style:
                    cleaned = str(item).strip().strip('"').strip("'").strip('[').strip(']')
                    if cleaned and cleaned not in final_learning_style:
                        final_learning_style.append(cleaned)
                if final_learning_style:
                    evidence_list.append(f"Learning style: {', '.join(final_learning_style[:2])}")
    
    # Build detailed evidence summary for more specific recommendations
    detailed_evidence_text = ""
    if evidence_list:
        detailed_evidence_text = "\nAvailable Evidence:\n" + "\n".join([f"- {e}" for e in evidence_list])
    
    user_prompt = f"""Context:
- Session type: {session_type}
- {recent_activity}
{detailed_evidence_text}

Current conversation:
{conversation_text}

Provide a helpful, personalized response. Keep the response text clean and natural - do NOT embed citations in the response itself.

CRITICAL: Make your recommendations SPECIFIC and ACTIONABLE by:
1. Referencing actual events, subjects, or activities from the evidence (e.g., "try finding a new craft on Pinterest that interweaves elements of the color wheel" instead of "explore art")
2. Suggesting concrete next steps that build on recent activities (e.g., "extend yesterday's Algebra hw with a related problem" instead of "do more math")
3. Tying suggestions directly to the child's interests and learning style from the evidence
4. Providing specific resources, platforms, or activities when relevant (Pinterest, Khan Academy, specific experiments, etc.)

Example: If evidence shows "Recent events: Creating Historical Art, Creating a Color Wheel" and "Interests: Arts", 
instead of saying "provide art materials," say "try finding a new craft on Pinterest that interweaves elements 
of the color wheel from last week" or "explore historical art techniques from different cultures to build on 
the Creating Historical Art session."

Return JSON:
{{
  "response": "your clean response text with SPECIFIC, actionable suggestions that reference actual events/activities from evidence",
  "evidence": {json.dumps(evidence_list) if evidence_list else "[]"},
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
        
        # Extract evidence from LLM response or use the pre-built evidence list
        llm_evidence = result.get("evidence", [])
        # Use LLM's evidence if provided, otherwise fall back to our pre-built list
        final_evidence = llm_evidence if llm_evidence else evidence_list
        
        return {
            "response": result.get("response", "I'm here to help with your learning journey!"),
            "evidence": final_evidence,
            "recommendations": result.get("recommendations", []),
            "context_updates": {},
            "goals": []
        }
    except Exception as e:
        # Fallback response - use pre-built evidence if available
        return {
            "response": "I'm here to help! How can I support your learning today?",
            "evidence": evidence_list if evidence_list else [],
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


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_plan_week(planner_context_json: str) -> Dict[str, Any]:
    """
    Generate a 7-day learning plan using LLM.
    
    Input: JSON string with planner context
    Output: Plan proposal with patch (create/move/update/delete) and summary
    """
    try:
        context = json.loads(planner_context_json)
        
        system_message = "You are an educational scheduling planner. Output ONLY valid JSON matching the provided schema. No markdown."
        
        user_message = f"""You are generating a 7-day learning plan (week view) for a family.

Hard requirements:
- Respect fixed events and blocked times. Never schedule inside them.
- Do not create overlapping events for the same child.
- Prefer consistent daily rhythms (same general time windows).
- Maintain sequence continuity: never schedule lesson N+1 before lesson N.
- Use progress estimates to choose appropriate durations and pacing.
- Use each child's learning style + interests to pick modalities and topics when flexible.
- If the week is overloaded, reduce optional work first and add short "catch-up" blocks only if needed.
- Every created item MUST include: child_ids, title, start, end, type, confidence (0-1), rationale.

Output format:
Return JSON with:
- summary: {{week_start, children: [{{child_id, planned_minutes}}], conflicts_resolved, new_items, moved_items}}
- patch: {{create: [...], move: [...], update: [...], delete: [...]}}
- notes: [{{child_id, message}}]

Now generate the plan proposal patch for the requested week.

CONTEXT JSON:
{planner_context_json}"""
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Ensure required fields exist
        if "summary" not in result:
            result["summary"] = {
                "week_start": context.get("week_start"),
                "children": [],
                "conflicts_resolved": 0,
                "new_items": len(result.get("patch", {}).get("create", [])),
                "moved_items": len(result.get("patch", {}).get("move", []))
            }
        
        if "patch" not in result:
            result["patch"] = {
                "create": [],
                "move": [],
                "update": [],
                "delete": []
            }
        
        if "notes" not in result:
            result["notes"] = []
        
        return result
        
    except json.JSONDecodeError as e:
        # Fallback: try to extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL) if 'content' in locals() else None
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")
    except Exception as e:
        # Return empty plan on error
        context_data = json.loads(planner_context_json) if isinstance(planner_context_json, str) else planner_context_json
        return {
            "summary": {
                "week_start": context_data.get("week_start", ""),
                "children": [],
                "conflicts_resolved": 0,
                "new_items": 0,
                "moved_items": 0
            },
            "patch": {
                "create": [],
                "move": [],
                "update": [],
                "delete": []
            },
            "notes": [{"child_id": None, "message": f"Error generating plan: {str(e)}"}]
        }


@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_build_curriculum(curriculum_context_json: str) -> Dict[str, Any]:
    """
    Build a structured curriculum unit with lessons and pacing using LLM.
    
    Input: JSON string with curriculum context
    Output: Curriculum structure with unit, lessons, and pacing
    """
    try:
        context = json.loads(curriculum_context_json)
        
        input_text = context.get("input_text", "")
        # Truncate very long input text to prevent timeouts (120k chars ~ 30k tokens)
        if len(input_text) > 120000:
            input_text = input_text[:120000] + "\n\n[Text truncated due to length - using first 120,000 characters]"
        source_type = context.get("source_type", "topic")
        students = context.get("students", [])
        constraints = context.get("constraints", {})
        availability = context.get("availability", [])
        existing_events = context.get("existing_events", [])
        
        # Build student profiles summary
        students_summary = []
        for student in students:
            profile = f"{student.get('name', 'Student')} (Grade {student.get('grade', 'Unknown')})"
            if student.get("learning_style"):
                profile += f", Learning style: {', '.join(student['learning_style'])}"
            if student.get("interests"):
                profile += f", Interests: {', '.join(student['interests'])}"
            students_summary.append(profile)
        
        # Build availability summary
        availability_summary = []
        for avail_entry in availability:
            windows = avail_entry.get("windows", [])
            if windows:
                windows_str = ", ".join([
                    f"{w.get('start', 'N/A')} to {w.get('end', 'N/A')}"
                    for w in windows
                ])
                availability_summary.append(
                    f"  {avail_entry.get('child_id', 'Child')} ({avail_entry.get('date', 'N/A')}): {windows_str}"
                )
        
        system_message = "You are a curriculum planning engine for a family learning calendar. Output ONLY valid JSON matching the provided schema. No markdown, no prose outside JSON."
        
        user_message = f"""You are building a structured curriculum unit that can be inserted into an existing schedule.

INPUT:
{input_text}

STUDENTS:
{chr(10).join(students_summary) if students_summary else "No student profiles provided"}

CONSTRAINTS:
- Total weeks: {constraints.get('weeks', 1)}
- Minutes per day: {constraints.get('minutes_per_day', 60)}
- Weekdays only: {constraints.get('weekdays_only', True)}
- Difficulty: {constraints.get('difficulty', 'standard')}
- Start date: {constraints.get('start_date', 'Not specified')}

AVAILABLE TIME WINDOWS:
{chr(10).join(availability_summary) if availability_summary else "No availability windows specified"}

REQUIREMENTS:
1. Create a unit with appropriate title, grade band, and subject tags
2. Break down into atomic, schedule-ready lessons
3. Each lesson must have:
   - Clear objective
   - Realistic minutes estimate (15-120 minutes)
   - Appropriate modality (reading, video, hands_on, discussion, practice, quiz, project)
   - Difficulty level matching constraints
   - Materials list (if needed)
   - Assessment check (quick verification)
   - Prerequisites (if any)
   - Links to resources (if any)
4. Generate a pacing sequence that fits within the week constraints
5. Schedule map should recommend day offsets and preferred time windows

OUTPUT JSON SCHEMA:
{{
  "unit": {{
    "title": "string",
    "grade_band": "string",
    "subject_tags": ["string"],
    "student_ids": ["string"],
    "total_minutes_est": 0,
    "weeks_est": 0,
    "source_type": "{source_type}",
    "metadata": {{}}
  }},
  "lessons": [
    {{
      "sequence_index": 1,
      "title": "string",
      "objective": "string",
      "minutes_est": 0,
      "modality": "reading|video|hands_on|discussion|practice|quiz|project",
      "difficulty": "gentle|standard|stretch",
      "materials": [{{"name":"string","type":"string","optional":true}}],
      "assessment": {{"type":"string","prompt":"string"}},
      "prereqs": ["string"],
      "links": [{{"title":"string","url":"string"}}]
    }}
  ],
  "pacing": {{
    "strategy": "fit_openings|prefer_mornings|avoid_days",
    "schedule_map": [
      {{
        "sequence_index": 1,
        "recommended_day_offset": 0,
        "preferred_time_windows": ["morning|midday|afternoon|evening"],
        "constraints_used": ["string"]
      }}
    ]
  }}
}}

Generate the curriculum now."""
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
            timeout=300.0  # 5 minute timeout for long syllabus processing
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate and ensure required fields
        if "unit" not in result:
            result["unit"] = {
                "title": "Untitled Unit",
                "grade_band": "",
                "subject_tags": [],
                "student_ids": [s.get("child_id") for s in students],
                "total_minutes_est": 0,
                "weeks_est": constraints.get("weeks", 1),
                "source_type": source_type,
                "metadata": {}
            }
        
        if "lessons" not in result:
            result["lessons"] = []
        
        # Calculate total minutes
        total_minutes = sum(lesson.get("minutes_est", 60) for lesson in result["lessons"])
        result["unit"]["total_minutes_est"] = total_minutes
        
        # Ensure pacing exists
        if "pacing" not in result:
            result["pacing"] = {
                "strategy": "fit_openings",
                "schedule_map": []
            }
        
        # Generate schedule_map if missing
        if not result["pacing"].get("schedule_map"):
            schedule_map = []
            for idx, lesson in enumerate(result["lessons"]):
                day_offset = idx if constraints.get("weekdays_only", True) else idx
                schedule_map.append({
                    "sequence_index": lesson.get("sequence_index", idx + 1),
                    "recommended_day_offset": day_offset,
                    "preferred_time_windows": ["morning", "midday"],
                    "constraints_used": []
                })
            result["pacing"]["schedule_map"] = schedule_map
        
        return result
        
    except json.JSONDecodeError as e:
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL) if 'content' in locals() else None
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Failed to parse LLM response as JSON: {e}")
    except asyncio.TimeoutError as e:
        # Handle timeout specifically
        context_data = json.loads(curriculum_context_json) if isinstance(curriculum_context_json, str) else curriculum_context_json
        students = context_data.get("students", [])
        raise ValueError(f"Request timed out while processing curriculum. The input may be too long. Please try with a shorter description or add notes to the material instead.")
    except Exception as e:
        # Return minimal structure on error
        context_data = json.loads(curriculum_context_json) if isinstance(curriculum_context_json, str) else curriculum_context_json
        students = context_data.get("students", [])
        error_msg = str(e)
        # Check if it's a timeout-related error
        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise ValueError(f"Request timed out while processing curriculum. The input may be too long. Please try with a shorter description or add notes to the material instead.")
        return {
            "unit": {
                "title": "Error: Could not generate curriculum",
                "grade_band": "",
                "subject_tags": [],
                "student_ids": [s.get("child_id") for s in students],
                "total_minutes_est": 0,
                "weeks_est": 1,
                "source_type": context_data.get("source_type", "topic"),
                "metadata": {"error": str(e)}
            },
            "lessons": [],
            "pacing": {
                "strategy": "fit_openings",
                "schedule_map": []
            }
        }

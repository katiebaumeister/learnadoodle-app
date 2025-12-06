"""
LLM function for generating weekly learning narratives
Separated to avoid conflicts with existing llm.py patterns
"""
import json
import re
from typing import Any, Dict
import backoff
import os
from openai import AsyncOpenAI

# Use same OpenAI client as llm.py
_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not _OPENAI_KEY:
    raise ValueError("OPENAI_API_KEY environment variable not set")

client = AsyncOpenAI(api_key=_OPENAI_KEY)

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_generate_weekly_narrative(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a personalized weekly learning narrative for a family.
    
    Context should include:
    - week_start: date string
    - week_end: date string
    - family_name: str (optional)
    - children: List[Dict] with:
      - name: str
      - grade: int (optional)
      - hours: float
      - events_completed: int
      - streak_days: int
      - subjects: Dict[str, Dict] with completed, trend
      - wins: List[str]
      - flags: List[str]
    - parent_wins: List[str]
    
    Returns:
    {
      "family_summary": str,  # Overall family narrative
      "per_child_summaries": [
        {"child_name": str, "summary": str}
      ],
      "tone": "reassuring" | "celebratory" | "supportive"
    }
    """
    children_data = context.get("children", [])
    family_name = context.get("family_name", "your family")
    week_start = context.get("week_start", "")
    week_end = context.get("week_end", "")
    
    # Build children context string
    children_context = []
    for child in children_data:
        child_str = f"- {child.get('name', 'Child')}"
        if child.get('grade'):
            child_str += f" (Grade {child['grade']})"
        child_str += f": {child.get('events_completed', 0)} activities completed"
        if child.get('hours'):
            child_str += f", {child['hours']:.1f} hours"
        if child.get('streak_days'):
            child_str += f", {child['streak_days']}-day streak"
        
        # Subject trends
        subjects = child.get('subjects', {})
        if subjects:
            subject_trends = []
            for subj, data in subjects.items():
                trend = data.get('trend', 'steady')
                completed = data.get('completed', 0)
                if trend == 'up':
                    subject_trends.append(f"{subj} improved ({completed} sessions)")
                elif trend == 'down':
                    subject_trends.append(f"{subj} slowed ({completed} sessions)")
                else:
                    subject_trends.append(f"{subj} steady ({completed} sessions)")
            if subject_trends:
                child_str += f". Subjects: {', '.join(subject_trends)}"
        
        # Wins and flags
        wins = child.get('wins', [])
        if wins:
            child_str += f". Highlights: {', '.join(wins)}"
        
        flags = child.get('flags', [])
        if flags:
            child_str += f". Notes: {', '.join(flags)}"
        
        # Behavior insights
        behavior = child.get('behavior', {})
        if behavior:
            behavior_insights = []
            if behavior.get('focused_pct', 0) > 50:
                behavior_insights.append(f"{behavior['focused_pct']}% focused sessions")
            if behavior.get('distracted_pct', 0) > 30:
                behavior_insights.append(f"{behavior['distracted_pct']}% distracted sessions")
            if behavior.get('excited_pct', 0) > 40:
                behavior_insights.append(f"{behavior['excited_pct']}% excited sessions")
            if behavior.get('overwhelmed_pct', 0) > 25:
                behavior_insights.append(f"{behavior['overwhelmed_pct']}% overwhelmed sessions")
            if behavior_insights:
                child_str += f". Behavior patterns: {', '.join(behavior_insights)}"
        
        # Support profile insights
        support_profile = child.get('support_profile')
        if support_profile:
            support_notes = []
            diagnoses = support_profile.get('diagnoses', [])
            support_needs = support_profile.get('support_needs', [])
            
            if diagnoses:
                support_notes.append(f"Learning profile: {', '.join(diagnoses)}")
            if support_needs:
                support_notes.append(f"Support needs: {', '.join(support_needs[:3])}")  # Limit to first 3
            
            if support_notes:
                child_str += f". {', '.join(support_notes)}"
        
        children_context.append(child_str)
    
    parent_wins = context.get("parent_wins", [])
    parent_performance = context.get("parent_performance", {})
    
    # Build parent performance context
    parent_perf_str = "consistent planning and engagement"
    if parent_performance:
        perf_parts = []
        if parent_performance.get("events_planned", 0) > 0:
            perf_parts.append(f"planned {parent_performance['events_planned']} activities")
        if parent_performance.get("completion_rate", 0) > 0.7:
            perf_parts.append(f"maintained {int(parent_performance['completion_rate'] * 100)}% completion rate")
        if parent_performance.get("resource_reuse", 0) > 0:
            perf_parts.append(f"reused {parent_performance['resource_reuse']} resources")
        if parent_performance.get("children_with_good_completion", 0) > 0:
            perf_parts.append(f"supported {parent_performance['children_with_good_completion']} children with strong completion rates")
        if perf_parts:
            parent_perf_str = ", ".join(perf_parts)
    
    parent_wins_str = ", ".join(parent_wins) if parent_wins else parent_perf_str
    
    prompt = f"""You are a supportive homeschool coach writing a weekly learning summary for {family_name}.

Week: {week_start} to {week_end}

Children's Progress:
{chr(10).join(children_context)}

When behavior patterns are mentioned (Focused, Distracted, Excited, Overwhelmed), use them to provide insights:
- High "Focused" percentage: Celebrate their ability to concentrate
- High "Distracted" percentage: Suggest strategies like shorter sessions or breaks
- High "Excited" percentage: Highlight their engagement and enthusiasm
- High "Overwhelmed" percentage: Recommend breaking tasks into smaller chunks or adjusting pace

IMPORTANT: If a child's learning profile includes support needs or diagnoses:
- For ADHD: Mention how shorter sessions or movement breaks helped (if applicable)
- For Dyslexia: Acknowledge multi-sensory approaches or reading alternatives used
- For support needs like "Frequent breaks" or "Short bursts": Celebrate when the schedule accommodated these needs
- Frame support accommodations as strengths: "Given [child]'s ADHD profile, the shorter morning sessions you used this week were a great fit. Keep pairing 20-minute learning bursts with movement breaks—consistency is improving."
- Never make parents feel like support needs are limitations; frame them as personalized strategies that are working

Parent Achievements: {parent_wins_str}

IMPORTANT: Include insights about BOTH student progress AND parent performance:
- Student progress: How each child is doing, their wins, challenges, and growth
- Parent performance: Acknowledge the parent's efforts, planning, consistency, and support. Examples:
  * "You planned {X} activities this week, showing great organization"
  * "Your consistency with {child}'s schedule is paying off - they completed {Y}% of planned activities"
  * "You adapted well when {situation} - that flexibility is exactly what homeschooling needs"
  * "Your support for {child}'s {interest/subject} is helping them thrive"
- Balance: Celebrate both what children accomplished AND what parents did to make it happen
- Frame parent efforts as valuable: "Your planning made this week smooth" or "Your patience with {challenge} shows great teaching"

Write a warm, reassuring weekly narrative that:
1. Celebrates progress and effort (not just completion rates) - for BOTH students and parents
2. Normalizes any challenges or dips ("This is totally normal...")
3. Highlights specific wins and growth moments - for students AND parent efforts
4. Uses a supportive, never guilt-inducing tone
5. Makes parents feel: "We are doing enough. We are actually doing great. Our efforts matter."
6. Acknowledges the parent's role in their children's learning success

Format your response as JSON:
{{
  "family_summary": "A 2-3 sentence overview of the week for the whole family, emphasizing collective progress and normalizing any challenges.",
  "per_child_summaries": [
    {{
      "child_name": "Name",
      "summary": "A personalized 2-4 sentence narrative for this child, highlighting their specific progress, wins, and any gentle context for challenges."
    }}
  ],
  "tone": "reassuring" | "celebratory" | "supportive"
}}

Rules:
- Keep summaries concise but meaningful (2-4 sentences per child)
- Use natural, conversational language
- Never use judgmental language or create anxiety
- Focus on growth, effort, and consistency over perfection
- If there were challenges, frame them as normal and manageable
- End on an encouraging note
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a supportive homeschool coach. Write warm, reassuring weekly summaries that help parents feel confident and validated. Always use a supportive, never guilt-inducing tone."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,  # Slightly higher for more natural narrative
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Validate structure
        if "family_summary" not in result:
            result["family_summary"] = f"This week, {family_name} made steady progress in learning."
        
        if "per_child_summaries" not in result or not isinstance(result["per_child_summaries"], list):
            result["per_child_summaries"] = []
        
        if "tone" not in result:
            result["tone"] = "supportive"
        
        return result
    except json.JSONDecodeError as e:
        # Fallback: try to extract JSON from response
        if 'content' in locals():
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        
        # Ultimate fallback
        return {
            "family_summary": f"This week, {family_name} continued their learning journey with dedication and effort.",
            "per_child_summaries": [
                {
                    "child_name": child.get("name", "Child"),
                    "summary": f"{child.get('name', 'Your child')} completed {child.get('events_completed', 0)} activities this week. Great progress!"
                }
                for child in children_data
            ],
            "tone": "supportive"
        }
    except Exception as e:
        # Fallback on any error
        return {
            "family_summary": f"This week, {family_name} made progress in their learning journey.",
            "per_child_summaries": [
                {
                    "child_name": child.get("name", "Child"),
                    "summary": f"{child.get('name', 'Your child')} completed {child.get('events_completed', 0)} activities this week."
                }
                for child in children_data
            ],
            "tone": "supportive"
        }


"""
LLM helper for extracting skills from curriculum text
"""
import json
import backoff
from typing import List, Dict, Any
from openai import AsyncOpenAI
import os

_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=_OPENAI_KEY) if _OPENAI_KEY else None

@backoff.on_exception(backoff.expo, Exception, max_tries=3)
async def llm_extract_skills(text: str) -> List[Dict[str, Any]]:
    """
    Extract skills with difficulty levels from unit/lesson text.
    
    Returns:
    [
        {
            "skill": "Solving linear equations",
            "difficulty": "intermediate",
            "weight": 2.5
        }
    ]
    """
    prompt = f"""Extract learning skills from this curriculum unit/lesson text.
Return ONLY valid JSON object with "skills" array:
{{
    "skills": [
        {{
            "skill": "Skill name (e.g., 'Solving linear equations')",
            "difficulty": "beginner|intermediate|advanced",
            "weight": 1.0-10.0
        }}
    ]
}}

Rules:
- Extract 3-10 key skills per unit
- difficulty: beginner (introductory), intermediate (core concepts), advanced (complex applications)
- weight: 1.0 (minor skill) to 10.0 (critical skill)
- Only return valid JSON, no commentary

TEXT:
{text[:8000]}
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a curriculum analyzer. Extract skills and return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        parsed = json.loads(content)
        
        # Handle both array and object with "skills" key
        if isinstance(parsed, list):
            return parsed
        elif isinstance(parsed, dict) and "skills" in parsed:
            return parsed["skills"]
        else:
            return []
    except json.JSONDecodeError as e:
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        return []


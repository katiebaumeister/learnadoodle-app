"""
General link parser using LLM to extract course structure
Works for any educational URL
"""
import re
import requests
from typing import Dict, List, Optional
from bs4 import BeautifulSoup
import os
from openai import AsyncOpenAI

# Initialize OpenAI client
_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=_OPENAI_KEY) if _OPENAI_KEY else None


def extract_page_content(url: str) -> Dict[str, str]:
    """
    Extract ONLY public metadata from a webpage (legal compliance).
    Returns title, description, Open Graph tags, and heading structure.
    Does NOT extract full content - only metadata and structure.
    """
    try:
        resp = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Check for login/paywall indicators
        if resp.status_code == 401 or resp.status_code == 403:
            raise ValueError(f"Page requires authentication (HTTP {resp.status_code}). Cannot parse behind login.")
        
        # Check for redirects to login pages
        final_url = resp.url.lower()
        if any(keyword in final_url for keyword in ['login', 'signin', 'auth', 'sign-up', 'register', 'subscription', 'paywall']):
            raise ValueError("Page redirects to login/paywall. Only public pages can be parsed.")
        
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Extract title (from title tag or Open Graph)
        og_title = soup.find('meta', {'property': 'og:title'})
        title = og_title.get('content', '').strip() if og_title else ''
        if not title:
            title_elem = soup.find('title') or soup.find('h1')
            title = title_elem.get_text().strip() if title_elem else ''
        
        # Extract description (Open Graph first, then meta description)
        desc_elem = soup.find('meta', {'property': 'og:description'}) or soup.find('meta', {'name': 'description'})
        description = desc_elem.get('content', '').strip() if desc_elem else ''
        
        # Extract Open Graph image
        og_image = soup.find('meta', {'property': 'og:image'})
        image_url = og_image.get('content', '').strip() if og_image else ''
        
        # Extract ONLY heading structure (H2, H3) - these are public metadata
        # This is legal because headings are structural metadata, not content
        headings = []
        for h2 in soup.find_all(['h2', 'h3'])[:50]:  # Limit to 50 headings
            heading_text = h2.get_text().strip()
            if heading_text:
                headings.append({
                    'level': h2.name,
                    'text': heading_text[:200]  # Limit heading text length
                })
        
        # Extract structured data (JSON-LD, schema.org) if present
        structured_data = []
        for script in soup.find_all('script', type='application/ld+json')[:5]:
            try:
                import json
                data = json.loads(script.string)
                if isinstance(data, dict) and data.get('@type') in ['Course', 'LearningResource', 'EducationalOrganization']:
                    structured_data.append({
                        'type': data.get('@type', ''),
                        'name': data.get('name', ''),
                        'description': data.get('description', '')[:500]  # Limit description
                    })
            except:
                pass
        
        # Check for paywall indicators in page content
        page_text_lower = soup.get_text().lower()
        paywall_keywords = ['subscribe', 'premium', 'members only', 'unlock', 'sign up to continue', 'free trial']
        if any(keyword in page_text_lower[:1000] for keyword in paywall_keywords):
            # Check if it's just marketing vs actual paywall
            # If page has substantial content, it's probably not behind paywall
            if len(soup.get_text()) < 500:
                raise ValueError("Page appears to be behind paywall. Only public content can be parsed.")
        
        return {
            'title': title,
            'description': description,
            'image_url': image_url,
            'headings': headings,  # Only structural metadata
            'structured_data': structured_data,  # Only public schema.org data
            'url': url
        }
    except requests.exceptions.HTTPError as e:
        if e.response.status_code in [401, 403]:
            raise ValueError(f"Page requires authentication (HTTP {e.response.status_code}). Cannot parse behind login.")
        raise ValueError(f"Failed to fetch page: {str(e)}")
    except Exception as e:
        raise ValueError(f"Failed to extract page content: {str(e)}")


async def llm_extract_course_structure(page_content: Dict[str, str]) -> Dict:
    """
    Use LLM to extract course structure from page metadata ONLY.
    Returns structured course outline with units/lessons.
    
    IMPORTANT: This function generates TRANSFORMATIVE summaries, not copies.
    It only uses public metadata (titles, descriptions, headings) - never full content.
    """
    if not client:
        raise ValueError("OpenAI API key not configured")
    
    # Build headings text (only structural metadata)
    headings_text = ""
    if page_content.get('headings'):
        headings_text = "\n".join([f"{h['level'].upper()}: {h['text']}" for h in page_content['headings'][:30]])
    
    # Build structured data text (only public schema.org data)
    structured_text = ""
    if page_content.get('structured_data'):
        structured_text = "\n".join([
            f"{sd.get('type', '')}: {sd.get('name', '')} - {sd.get('description', '')[:200]}"
            for sd in page_content['structured_data']
        ])
    
    prompt = f"""Extract course structure from this webpage METADATA ONLY.

Title: {page_content['title']}
Description: {page_content['description']}
Headings (structural metadata only): {headings_text[:1000]}
Structured Data: {structured_text[:500]}

IMPORTANT LEGAL REQUIREMENTS:
- You MUST summarize and paraphrase - NEVER copy text verbatim
- Generate TRANSFORMATIVE descriptions in your own words
- Only extract structural information (titles, lesson names, unit names)
- Do NOT reproduce copyrighted content

Extract:
1. Course title (use provided title or create a brief summary)
2. Course description (SUMMARIZE in your own words - do not copy verbatim)
3. List of units/modules/chapters (extract from headings/structure)
4. For each unit, list lessons/topics (extract from headings/structure)

Return as JSON:
{{
  "title": "Course Title (summarized)",
  "description": "Brief description in your own words (transformative summary)",
  "units": [
    {{
      "title": "Unit 1 Title (from headings)",
      "lessons": [
        {{"title": "Lesson 1 Title (from headings)"}},
        {{"title": "Lesson 2 Title (from headings)"}}
      ]
    }}
  ]
}}

If this doesn't appear to be a course, return:
{{
  "title": "Page Title",
  "description": "Brief summary in your own words",
  "units": []
}}
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts structured course information from web page METADATA ONLY. You MUST summarize and paraphrase - NEVER copy text verbatim. Always generate transformative descriptions in your own words. Always return valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,  # Higher temperature encourages more transformative summaries
            max_tokens=2000
        )
        
        content = response.choices[0].message.content.strip()
        
        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', content, re.DOTALL)
        if json_match:
            content = json_match.group(1)
        else:
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
        
        import json
        result = json.loads(content)
        
        # Add URL to result
        result['url'] = page_content['url']
        
        return result
    except Exception as e:
        # Fallback: return basic structure with source attribution
        return {
            'title': page_content.get('title', 'Course'),
            'description': f"Course from {page_content.get('url', 'external source')}",
            'url': page_content['url'],
            'units': []
        }


async def parse_general_link(url: str) -> Dict:
    """
    Parse any educational link and extract course structure.
    Uses LLM to intelligently extract structure.
    """
    # Extract page content
    page_content = extract_page_content(url)
    
    # Use LLM to extract structure
    course_structure = await llm_extract_course_structure(page_content)
    
    return course_structure


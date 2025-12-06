"""
Khan Academy URL parser and content fetcher
Supports courses, units, and lessons
"""
import re
import requests
from typing import Dict, List, Optional, Tuple
from bs4 import BeautifulSoup
import logging

# Set up logging for parser
logger = logging.getLogger(__name__)


def parse_khan_academy_url(url: str) -> Tuple[str, Optional[str]]:
    """
    Parse Khan Academy URL and return (kind, identifier).
    Returns: ('course', course_slug) or ('lesson', lesson_slug) or ('unit', unit_slug)
    Raises ValueError if not recognized.
    """
    logger.debug(f"Parsing Khan Academy URL: {url}")
    
    # Khan Academy URL patterns:
    # Course: https://www.khanacademy.org/math/algebra
    # Unit: https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:foundation-algebra
    # Lesson: https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:algebra-basics/a/intro-to-algebra
    # Nested: https://www.khanacademy.org/science/hs-bio/x230b3ff252126bb6:teacher-resources/x230b3ff252126bb6:untitled
    
    # Extract path after domain (case-insensitive, handle www or not)
    match = re.search(r'khanacademy\.org/([^?#]+)', url, re.IGNORECASE)
    if not match:
        logger.warning(f"No match found for Khan Academy URL pattern: {url}")
        raise ValueError("Invalid Khan Academy URL")
    
    path = match.group(1).strip('/')  # Remove leading/trailing slashes
    logger.debug(f"Extracted path: {path}")
    
    if not path:
        logger.warning(f"Empty path extracted from URL: {url}")
        raise ValueError("Invalid Khan Academy URL: empty path")
    
    parts = [p for p in path.split('/') if p]  # Remove empty parts
    logger.debug(f"Path parts: {parts}, count: {len(parts)}")
    
    if len(parts) < 2:
        logger.warning(f"Invalid URL structure - too few parts: {parts}")
        raise ValueError("Invalid Khan Academy URL structure")
    
    # Check for lesson (has 'a/' or 'v/' prefix)
    if len(parts) >= 4 and parts[-2] in ['a', 'v']:
        lesson_slug = parts[-1]
        logger.debug(f"Detected as lesson: {lesson_slug}")
        return ('lesson', lesson_slug)
    
    # Check for unit (has colon in slug) - handle nested structures
    # A unit can be at any level that has a colon, but we want the deepest one
    # For nested units, use the full path from course to unit
    if len(parts) >= 3:
        # Find the first part with a colon (unit identifier)
        unit_idx = None
        for i in range(2, len(parts)):
            if ':' in parts[i]:
                unit_idx = i
                logger.debug(f"Found colon in part {i}: {parts[i]}")
                break
        
        if unit_idx is not None:
            # For nested units, include the full path from course to unit
            # This handles cases like: science/hs-bio/x230b3ff252126bb6:teacher-resources/x230b3ff252126bb6:untitled
            unit_slug = '/'.join(parts[unit_idx:])  # Include all nested parts
            logger.debug(f"Detected as unit: {unit_slug}")
            return ('unit', unit_slug)
    
    # Otherwise it's a course
    course_slug = '/'.join(parts[:2])  # e.g., "math/algebra"
    logger.debug(f"Detected as course: {course_slug}")
    return ('course', course_slug)


def fetch_khan_academy_course(course_slug: str) -> Dict:
    """
    Fetch Khan Academy course metadata and structure.
    Returns course info with units and lessons.
    """
    url = f"https://www.khanacademy.org/{course_slug}"
    
    try:
        resp = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Check for login/paywall indicators
        if resp.status_code == 401 or resp.status_code == 403:
            raise ValueError(f"Page requires authentication (HTTP {resp.status_code}). Cannot parse behind login.")
        
        # Check for redirects to login pages
        final_url = resp.url.lower()
        if any(keyword in final_url for keyword in ['login', 'signin', 'auth', 'sign-up', 'register']):
            raise ValueError("Page redirects to login. Only public Khan Academy pages can be parsed.")
        
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Extract course title
        title_elem = soup.find('h1') or soup.find('title')
        title = title_elem.get_text().strip() if title_elem else course_slug.replace('/', ' ').title()
        
        # Extract description
        desc_elem = soup.find('meta', {'property': 'og:description'})
        description = desc_elem.get('content', '') if desc_elem else ''
        
        # Extract units and lessons from page structure
        # Khan Academy uses data-testid and class patterns
        units = []
        unit_elems = soup.find_all(['div', 'section'], class_=re.compile(r'unit|section'))
        
        for unit_elem in unit_elems[:20]:  # Limit to first 20 units
            unit_title_elem = unit_elem.find(['h2', 'h3', 'a'])
            if unit_title_elem:
                unit_title = unit_title_elem.get_text().strip()
                unit_link = unit_title_elem.get('href', '') if unit_title_elem.name == 'a' else ''
                
                if unit_title and unit_link:
                    unit_slug = unit_link.split('/')[-1] if unit_link else None
                    units.append({
                        'title': unit_title,
                        'slug': unit_slug,
                        'url': f"https://www.khanacademy.org{unit_link}" if unit_link.startswith('/') else unit_link
                    })
        
        return {
            'title': title,
            'description': description,
            'url': url,
            'slug': course_slug,
            'units': units[:10]  # Limit to 10 units
        }
    except Exception as e:
        raise ValueError(f"Failed to fetch Khan Academy course: {str(e)}")


def fetch_khan_academy_unit(unit_slug: str) -> Dict:
    """
    Fetch Khan Academy unit with lessons.
    Handles both simple units and nested unit paths.
    """
    # Unit slug can be:
    # - Simple: "x2f8bb11595b61c86:foundation-algebra" (assumes math course)
    # - Full path: "science/hs-bio/x230b3ff252126bb6:teacher-resources/x230b3ff252126bb6:untitled"
    if '/' in unit_slug:
        # Full path provided - use as-is
        url = f"https://www.khanacademy.org/{unit_slug}"
    else:
        # Simple unit slug - assume math course (legacy behavior)
        url = f"https://www.khanacademy.org/math/{unit_slug}"
    
    try:
        resp = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Check for login/paywall indicators
        if resp.status_code == 401 or resp.status_code == 403:
            raise ValueError(f"Page requires authentication (HTTP {resp.status_code}). Cannot parse behind login.")
        
        # Check for redirects to login pages
        final_url = resp.url.lower()
        if any(keyword in final_url for keyword in ['login', 'signin', 'auth', 'sign-up', 'register']):
            raise ValueError("Page redirects to login. Only public Khan Academy pages can be parsed.")
        
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        title_elem = soup.find('h1') or soup.find('title')
        title = title_elem.get_text().strip() if title_elem else unit_slug
        
        # Extract lessons
        lessons = []
        lesson_links = soup.find_all('a', href=re.compile(r'/(a|v)/'))
        
        for link in lesson_links[:50]:  # Limit to 50 lessons
            lesson_title = link.get_text().strip()
            lesson_href = link.get('href', '')
            
            if lesson_title and lesson_href:
                lesson_slug = lesson_href.split('/')[-1]
                lessons.append({
                    'title': lesson_title,
                    'slug': lesson_slug,
                    'url': f"https://www.khanacademy.org{lesson_href}" if lesson_href.startswith('/') else lesson_href
                })
        
        return {
            'title': title,
            'url': url,
            'slug': unit_slug,
            'lessons': lessons
        }
    except Exception as e:
        raise ValueError(f"Failed to fetch Khan Academy unit: {str(e)}")


def fetch_khan_academy_lesson(lesson_slug: str) -> Dict:
    """
    Fetch Khan Academy lesson metadata.
    Handles both simple lesson slugs and full paths.
    """
    # Lesson slug can be:
    # - Simple: "intro-to-algebra" (assumes math/algebra course)
    # - Full path: "science/hs-bio/x230b3ff252126bb6:teacher-resources/a/lesson-name"
    if '/' in lesson_slug:
        # Full path provided - use as-is
        url = f"https://www.khanacademy.org/{lesson_slug}"
    else:
        # Simple lesson slug - assume math/algebra course (legacy behavior)
        url = f"https://www.khanacademy.org/math/algebra/{lesson_slug}"
    
    try:
        resp = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Check for login/paywall indicators
        if resp.status_code == 401 or resp.status_code == 403:
            raise ValueError(f"Page requires authentication (HTTP {resp.status_code}). Cannot parse behind login.")
        
        # Check for redirects to login pages
        final_url = resp.url.lower()
        if any(keyword in final_url for keyword in ['login', 'signin', 'auth', 'sign-up', 'register']):
            raise ValueError("Page redirects to login. Only public Khan Academy pages can be parsed.")
        
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        title_elem = soup.find('h1') or soup.find('title')
        title = title_elem.get_text().strip() if title_elem else lesson_slug
        
        # Extract description
        desc_elem = soup.find('meta', {'property': 'og:description'})
        description = desc_elem.get('content', '') if desc_elem else ''
        
        return {
            'title': title,
            'description': description,
            'url': url,
            'slug': lesson_slug
        }
    except Exception as e:
        # If direct fetch fails, return basic info
        return {
            'title': lesson_slug.replace('-', ' ').title(),
            'description': '',
            'url': url,
            'slug': lesson_slug
        }


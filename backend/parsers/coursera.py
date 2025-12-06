"""
Coursera URL parser and content fetcher
Supports courses and specializations
"""
import re
import requests
from typing import Dict, List, Optional, Tuple
from bs4 import BeautifulSoup


def parse_coursera_url(url: str) -> Tuple[str, Optional[str]]:
    """
    Parse Coursera URL and return (kind, identifier).
    Returns: ('course', course_slug) or ('specialization', spec_slug)
    Raises ValueError if not recognized.
    """
    # Coursera URL patterns:
    # Course: https://www.coursera.org/learn/machine-learning
    # Specialization: https://www.coursera.org/specializations/machine-learning
    
    match = re.search(r'coursera\.org/(learn|specializations)/([^/?]+)', url)
    if not match:
        raise ValueError("Invalid Coursera URL")
    
    kind_str, slug = match.groups()
    kind = 'course' if kind_str == 'learn' else 'specialization'
    
    return (kind, slug)


def fetch_coursera_course(course_slug: str) -> Dict:
    """
    Fetch Coursera course metadata and structure.
    """
    url = f"https://www.coursera.org/learn/{course_slug}"
    
    try:
        resp = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Check for login/paywall indicators
        if resp.status_code == 401 or resp.status_code == 403:
            raise ValueError(f"Page requires authentication (HTTP {resp.status_code}). Cannot parse behind login.")
        
        # Check for redirects to login/paywall pages
        final_url = resp.url.lower()
        if any(keyword in final_url for keyword in ['login', 'signin', 'auth', 'sign-up', 'register', 'subscription', 'paywall', 'enroll']):
            raise ValueError("Page redirects to login/paywall. Only public Coursera pages can be parsed.")
        
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Extract course title
        title_elem = soup.find('h1') or soup.find('title')
        title = title_elem.get_text().strip() if title_elem else course_slug.replace('-', ' ').title()
        
        # Extract description
        desc_elem = soup.find('meta', {'property': 'og:description'}) or soup.find('meta', {'name': 'description'})
        description = desc_elem.get('content', '') if desc_elem else ''
        
        # Extract modules/weeks
        modules = []
        # Coursera uses various patterns for modules
        module_elems = soup.find_all(['div', 'section'], class_=re.compile(r'module|week|course-content'))
        
        for module_elem in module_elems[:20]:  # Limit to 20 modules
            module_title_elem = module_elem.find(['h2', 'h3', 'h4'])
            if module_title_elem:
                module_title = module_title_elem.get_text().strip()
                modules.append({
                    'title': module_title,
                    'lessons': []  # Would need deeper parsing to get individual lessons
                })
        
        # Estimate duration from page content
        duration_text = ''
        duration_elem = soup.find(string=re.compile(r'hour|week|month', re.I))
        if duration_elem:
            duration_text = duration_elem.strip()
        
        return {
            'title': title,
            'description': description,
            'url': url,
            'slug': course_slug,
            'modules': modules[:10],  # Limit to 10 modules
            'duration_estimate': duration_text
        }
    except Exception as e:
        raise ValueError(f"Failed to fetch Coursera course: {str(e)}")


def fetch_coursera_specialization(spec_slug: str) -> Dict:
    """
    Fetch Coursera specialization with courses.
    """
    url = f"https://www.coursera.org/specializations/{spec_slug}"
    
    try:
        resp = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Check for login/paywall indicators
        if resp.status_code == 401 or resp.status_code == 403:
            raise ValueError(f"Page requires authentication (HTTP {resp.status_code}). Cannot parse behind login.")
        
        # Check for redirects to login/paywall pages
        final_url = resp.url.lower()
        if any(keyword in final_url for keyword in ['login', 'signin', 'auth', 'sign-up', 'register', 'subscription', 'paywall', 'enroll']):
            raise ValueError("Page redirects to login/paywall. Only public Coursera pages can be parsed.")
        
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        title_elem = soup.find('h1') or soup.find('title')
        title = title_elem.get_text().strip() if title_elem else spec_slug.replace('-', ' ').title()
        
        desc_elem = soup.find('meta', {'property': 'og:description'})
        description = desc_elem.get('content', '') if desc_elem else ''
        
        # Extract courses in specialization
        courses = []
        course_links = soup.find_all('a', href=re.compile(r'/learn/'))
        
        for link in course_links[:20]:  # Limit to 20 courses
            course_title = link.get_text().strip()
            course_href = link.get('href', '')
            
            if course_title and course_href:
                course_slug = course_href.split('/learn/')[-1].split('/')[0]
                courses.append({
                    'title': course_title,
                    'slug': course_slug,
                    'url': f"https://www.coursera.org{course_href}" if course_href.startswith('/') else course_href
                })
        
        return {
            'title': title,
            'description': description,
            'url': url,
            'slug': spec_slug,
            'courses': courses
        }
    except Exception as e:
        raise ValueError(f"Failed to fetch Coursera specialization: {str(e)}")


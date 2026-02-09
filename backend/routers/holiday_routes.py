"""
Holiday API Routes
Provides country and subdivision lists for holiday picker
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import requests
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter

router = APIRouter(prefix="/api/holidays", tags=["holidays"])

# In-memory cache for countries and subdivisions
_countries_cache = None
_countries_cache_expiry = None
_subdivisions_cache = {}  # {country_code: {data: [...], expiry: datetime}}
CACHE_TTL_DAYS = 7

# Safe fallback list
FALLBACK_COUNTRIES = [
    {"code": "US", "name": "United States"},
    {"code": "CA", "name": "Canada"},
    {"code": "GB", "name": "United Kingdom"},
    {"code": "AU", "name": "Australia"},
    {"code": "NZ", "name": "New Zealand"},
]

# Top countries for quick access
TOP_COUNTRIES = ["US", "CA", "GB", "AU", "NZ"]


def fetch_countries_from_nager() -> List[Dict]:
    """Fetch available countries from Nager.Date API"""
    try:
        url = "https://date.nager.at/api/v3/AvailableCountries"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        countries_data = response.json()
        
        # Transform to our format
        countries = []
        for country in countries_data:
            countries.append({
                "code": country.get("countryCode", ""),
                "name": country.get("name", ""),
            })
        
        # Sort by name
        countries.sort(key=lambda x: x["name"])
        
        return countries
        
    except requests.RequestException as e:
        print(f"Error fetching countries from Nager.Date: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error fetching countries: {e}")
        return []


def fetch_subdivisions_from_nager(country_code: str) -> List[Dict]:
    """Fetch subdivisions (states/provinces) for a country from Nager.Date API"""
    try:
        # Nager.Date doesn't directly provide subdivisions endpoint
        # But we can check if the country has subdivisions by trying to fetch holidays
        # For now, we'll return known subdivisions for major countries
        
        # Known subdivisions for major countries
        subdivisions_map = {
            "US": [
                {"code": "AL", "name": "Alabama"},
                {"code": "AK", "name": "Alaska"},
                {"code": "AZ", "name": "Arizona"},
                {"code": "AR", "name": "Arkansas"},
                {"code": "CA", "name": "California"},
                {"code": "CO", "name": "Colorado"},
                {"code": "CT", "name": "Connecticut"},
                {"code": "DE", "name": "Delaware"},
                {"code": "FL", "name": "Florida"},
                {"code": "GA", "name": "Georgia"},
                {"code": "HI", "name": "Hawaii"},
                {"code": "ID", "name": "Idaho"},
                {"code": "IL", "name": "Illinois"},
                {"code": "IN", "name": "Indiana"},
                {"code": "IA", "name": "Iowa"},
                {"code": "KS", "name": "Kansas"},
                {"code": "KY", "name": "Kentucky"},
                {"code": "LA", "name": "Louisiana"},
                {"code": "ME", "name": "Maine"},
                {"code": "MD", "name": "Maryland"},
                {"code": "MA", "name": "Massachusetts"},
                {"code": "MI", "name": "Michigan"},
                {"code": "MN", "name": "Minnesota"},
                {"code": "MS", "name": "Mississippi"},
                {"code": "MO", "name": "Missouri"},
                {"code": "MT", "name": "Montana"},
                {"code": "NE", "name": "Nebraska"},
                {"code": "NV", "name": "Nevada"},
                {"code": "NH", "name": "New Hampshire"},
                {"code": "NJ", "name": "New Jersey"},
                {"code": "NM", "name": "New Mexico"},
                {"code": "NY", "name": "New York"},
                {"code": "NC", "name": "North Carolina"},
                {"code": "ND", "name": "North Dakota"},
                {"code": "OH", "name": "Ohio"},
                {"code": "OK", "name": "Oklahoma"},
                {"code": "OR", "name": "Oregon"},
                {"code": "PA", "name": "Pennsylvania"},
                {"code": "RI", "name": "Rhode Island"},
                {"code": "SC", "name": "South Carolina"},
                {"code": "SD", "name": "South Dakota"},
                {"code": "TN", "name": "Tennessee"},
                {"code": "TX", "name": "Texas"},
                {"code": "UT", "name": "Utah"},
                {"code": "VT", "name": "Vermont"},
                {"code": "VA", "name": "Virginia"},
                {"code": "WA", "name": "Washington"},
                {"code": "WV", "name": "West Virginia"},
                {"code": "WI", "name": "Wisconsin"},
                {"code": "WY", "name": "Wyoming"},
                {"code": "DC", "name": "District of Columbia"},
            ],
            "CA": [
                {"code": "AB", "name": "Alberta"},
                {"code": "BC", "name": "British Columbia"},
                {"code": "MB", "name": "Manitoba"},
                {"code": "NB", "name": "New Brunswick"},
                {"code": "NL", "name": "Newfoundland and Labrador"},
                {"code": "NS", "name": "Nova Scotia"},
                {"code": "NT", "name": "Northwest Territories"},
                {"code": "NU", "name": "Nunavut"},
                {"code": "ON", "name": "Ontario"},
                {"code": "PE", "name": "Prince Edward Island"},
                {"code": "QC", "name": "Quebec"},
                {"code": "SK", "name": "Saskatchewan"},
                {"code": "YT", "name": "Yukon"},
            ],
            "AU": [
                {"code": "NSW", "name": "New South Wales"},
                {"code": "VIC", "name": "Victoria"},
                {"code": "QLD", "name": "Queensland"},
                {"code": "WA", "name": "Western Australia"},
                {"code": "SA", "name": "South Australia"},
                {"code": "TAS", "name": "Tasmania"},
                {"code": "ACT", "name": "Australian Capital Territory"},
                {"code": "NT", "name": "Northern Territory"},
            ],
        }
        
        return subdivisions_map.get(country_code.upper(), [])
        
    except Exception as e:
        print(f"Error fetching subdivisions: {e}")
        return []


@router.get("/countries")
async def get_countries(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get list of available countries for holiday selection.
    Returns cached result if available, otherwise fetches from Nager.Date.
    """
    global _countries_cache, _countries_cache_expiry
    
    # Check cache
    if _countries_cache and _countries_cache_expiry and datetime.now() < _countries_cache_expiry:
        return {
            "countries": _countries_cache,
            "top": TOP_COUNTRIES,
        }
    
    # Fetch from API
    countries = fetch_countries_from_nager()
    
    # If fetch failed, use fallback
    if not countries:
        countries = FALLBACK_COUNTRIES.copy()
    else:
        # Ensure fallback countries are included
        fallback_codes = {c["code"] for c in FALLBACK_COUNTRIES}
        existing_codes = {c["code"] for c in countries}
        for fallback in FALLBACK_COUNTRIES:
            if fallback["code"] not in existing_codes:
                countries.append(fallback)
        countries.sort(key=lambda x: x["name"])
    
    # Update cache
    _countries_cache = countries
    _countries_cache_expiry = datetime.now() + timedelta(days=CACHE_TTL_DAYS)
    
    return {
        "countries": countries,
        "top": TOP_COUNTRIES,
    }


@router.get("/subdivisions")
async def get_subdivisions(
    country: str = Query(..., description="Country code (e.g., 'US', 'CA')"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get list of subdivisions (states/provinces) for a country.
    Returns cached result if available, otherwise fetches from provider.
    """
    country_code = country.upper()
    
    # Check cache
    if country_code in _subdivisions_cache:
        cached = _subdivisions_cache[country_code]
        if cached["expiry"] and datetime.now() < cached["expiry"]:
            return {"subdivisions": cached["data"]}
    
    # Fetch from API
    subdivisions = fetch_subdivisions_from_nager(country_code)
    
    # Update cache
    _subdivisions_cache[country_code] = {
        "data": subdivisions,
        "expiry": datetime.now() + timedelta(days=CACHE_TTL_DAYS),
    }
    
    return {"subdivisions": subdivisions}

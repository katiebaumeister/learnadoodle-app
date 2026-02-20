"""
Global Holiday Providers for Plan Year Feature

Supports multiple holiday data sources:
- Nager.Date (default, no API key required)
- Google ICS (stub for future)
- Calendarific (stub for future, requires API key)
"""

from typing import List, Dict, Optional
from datetime import date
import requests
from enum import Enum


class HolidayProvider(str, Enum):
    """Supported holiday providers"""
    NAGER_DATE = "NAGER_DATE"
    GOOGLE_ICS = "GOOGLE_ICS"
    CALENDARIFIC = "CALENDARIFIC"


class HolidayEntry:
    """Normalized holiday entry"""
    def __init__(
        self,
        date: date,
        name: str,
        type: str = "GLOBAL_HOLIDAY",
        source_id: Optional[str] = None
    ):
        self.date = date
        self.name = name
        self.type = type
        self.source_id = source_id or f"{date.isoformat()}_{name}"

    def to_dict(self) -> Dict:
        return {
            "date": self.date.isoformat(),
            "name": self.name,
            "type": self.type,
            "source_id": self.source_id
        }


class NagerDateProvider:
    """
    Nager.Date API provider (https://date.nager.at/)
    Free public holiday API, no API key required
    """
    
    BASE_URL = "https://date.nager.at/api/v3"
    
    @staticmethod
    def fetch_holidays(
        country_code: str,
        year: int,
        region: Optional[str] = None
    ) -> List[HolidayEntry]:
        """
        Fetch holidays from Nager.Date API
        
        Args:
            country_code: ISO 3166-1 alpha-2 country code (e.g., 'US', 'AU')
            year: Year to fetch holidays for
            region: Optional state/province code (not all countries support this)
        
        Returns:
            List of HolidayEntry objects
        """
        try:
            url = f"{NagerDateProvider.BASE_URL}/PublicHolidays/{year}/{country_code}"
            response = None
            for timeout in (15, 25):
                try:
                    response = requests.get(url, timeout=timeout)
                    response.raise_for_status()
                    break
                except requests.RequestException as e:
                    if timeout == 25:
                        raise
            holidays_data = response.json()
            
            entries = []
            for holiday in holidays_data:
                # Parse date string (format: YYYY-MM-DD)
                holiday_date = date.fromisoformat(holiday["date"])
                
                # Use localName if available, otherwise name
                holiday_name = holiday.get("localName") or holiday.get("name", "Holiday")
                
                # Create stable source_id from API response
                source_id = f"nager_{country_code}_{year}_{holiday['date']}"
                
                entries.append(HolidayEntry(
                    date=holiday_date,
                    name=holiday_name,
                    type="GLOBAL_HOLIDAY",
                    source_id=source_id
                ))
            
            return entries
            
        except requests.RequestException as e:
            # Log error but return empty list to allow graceful degradation
            print(f"Error fetching holidays from Nager.Date: {e}")
            return []
        except Exception as e:
            print(f"Unexpected error in Nager.Date provider: {e}")
            return []


class GoogleICSProvider:
    """
    Google Public Holiday Calendar (ICS) provider
    STUB: Not yet implemented
    """
    
    @staticmethod
    def fetch_holidays(
        country_code: str,
        year: int,
        region: Optional[str] = None
    ) -> List[HolidayEntry]:
        """
        TODO: Implement ICS parsing for Google public holiday calendars
        For now, returns empty list
        """
        # Future implementation:
        # 1. Map country_code to Google calendar ID
        # 2. Fetch ICS file
        # 3. Parse ICS events
        # 4. Return normalized HolidayEntry objects
        return []


class CalendarificProvider:
    """
    Calendarific API provider (https://calendarific.com/)
    STUB: Requires API key, not yet implemented
    """
    
    @staticmethod
    def fetch_holidays(
        country_code: str,
        year: int,
        region: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> List[HolidayEntry]:
        """
        TODO: Implement Calendarific API integration
        Requires API key from environment variable
        """
        if not api_key:
            print("Calendarific API key not provided")
            return []
        
        # Future implementation:
        # 1. Call Calendarific API with country_code, year, region
        # 2. Parse response
        # 3. Return normalized HolidayEntry objects
        return []


def get_holiday_provider(provider: str) -> object:
    """Factory function to get the appropriate holiday provider"""
    provider_map = {
        HolidayProvider.NAGER_DATE: NagerDateProvider,
        HolidayProvider.GOOGLE_ICS: GoogleICSProvider,
        HolidayProvider.CALENDARIFIC: CalendarificProvider,
    }
    
    provider_class = provider_map.get(provider, NagerDateProvider)
    return provider_class


def fetch_global_holidays(
    country_code: str,
    year: int,
    provider: str = "NAGER_DATE",
    region: Optional[str] = None,
    api_key: Optional[str] = None
) -> List[HolidayEntry]:
    """
    Main entry point for fetching global holidays
    
    Args:
        country_code: ISO 3166-1 alpha-2 country code
        year: Year to fetch holidays for
        provider: Provider name (default: NAGER_DATE)
        region: Optional region/state code
        api_key: Optional API key (for Calendarific)
    
    Returns:
        List of HolidayEntry objects
    """
    provider_class = get_holiday_provider(provider)
    
    if provider == HolidayProvider.CALENDARIFIC:
        return provider_class.fetch_holidays(country_code, year, region, api_key)
    else:
        return provider_class.fetch_holidays(country_code, year, region)

"""
Datetime utility module for PHRSAT platform providing comprehensive datetime manipulation,
formatting, and validation functions with timezone support and health data standards compliance.

External Dependencies:
datetime (3.11+) - Core datetime functionality
pytz (2023.3+) - Timezone handling
python-dateutil (2.8.2+) - Advanced date parsing
"""

from datetime import datetime, timedelta
from typing import Optional, Tuple, Union
import pytz
from dateutil import parser
from functools import wraps

# Global Constants
DEFAULT_TIMEZONE = "UTC"
DATETIME_FORMAT_ISO = "%Y-%m-%dT%H:%M:%S.%fZ"
DATE_FORMAT = "%Y-%m-%d"
TIME_FORMAT = "%H:%M:%S"
SUPPORTED_TIMEZONES = [
    "UTC", "US/Eastern", "US/Central", "US/Pacific",
    "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"
]

def validate_input(func):
    """Decorator for input validation of datetime functions."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (ValueError, TypeError) as e:
            if any(param.get('raise_error', True) for param in kwargs.values()):
                raise ValueError(f"Invalid input for {func.__name__}: {str(e)}")
            return None
    return wrapper

@validate_input
def parse_datetime(
    datetime_str: str,
    timezone: str = DEFAULT_TIMEZONE,
    raise_error: bool = True
) -> Optional[datetime]:
    """
    Parse datetime string in various formats to datetime object.
    
    Args:
        datetime_str: String representation of datetime
        timezone: Target timezone for the parsed datetime
        raise_error: Whether to raise error on invalid input
    
    Returns:
        Parsed datetime object in specified timezone
    
    Raises:
        ValueError: If datetime string is invalid and raise_error is True
    """
    if not datetime_str:
        if raise_error:
            raise ValueError("Datetime string cannot be empty")
        return None

    try:
        # Try ISO format first
        dt = datetime.strptime(datetime_str, DATETIME_FORMAT_ISO)
    except ValueError:
        try:
            # Fall back to flexible parsing
            dt = parser.parse(datetime_str)
        except (ValueError, TypeError):
            if raise_error:
                raise ValueError(f"Unable to parse datetime string: {datetime_str}")
            return None

    # Validate parsed datetime
    if dt.year < 1900 or dt.year > datetime.now().year + 1:
        if raise_error:
            raise ValueError("Datetime year out of valid range")
        return None

    # Handle timezone conversion
    target_tz = pytz.timezone(timezone)
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)
    return dt.astimezone(target_tz)

@validate_input
def format_datetime(
    dt: datetime,
    format_str: str = DATETIME_FORMAT_ISO,
    output_timezone: str = DEFAULT_TIMEZONE
) -> str:
    """
    Format datetime object to string with timezone support.
    
    Args:
        dt: Datetime object to format
        format_str: Output format string
        output_timezone: Target timezone for output
    
    Returns:
        Formatted datetime string
    """
    if not dt:
        raise ValueError("Datetime object cannot be None")

    # Ensure datetime is timezone-aware
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)

    # Convert to target timezone
    target_tz = pytz.timezone(output_timezone)
    dt = dt.astimezone(target_tz)

    try:
        return dt.strftime(format_str)
    except ValueError:
        return dt.isoformat()

@validate_input
def validate_datetime_range(
    start_date: datetime,
    end_date: datetime,
    max_range_days: int = 365
) -> Tuple[bool, str]:
    """
    Validate datetime range for health records and metrics.
    
    Args:
        start_date: Start datetime
        end_date: End datetime
        max_range_days: Maximum allowed range in days
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not all([start_date, end_date]):
        return False, "Start and end dates are required"

    if start_date > end_date:
        return False, "Start date must be before end date"

    if end_date > datetime.now(pytz.UTC):
        return False, "End date cannot be in the future"

    date_range = end_date - start_date
    if date_range.days > max_range_days:
        return False, f"Date range exceeds maximum allowed ({max_range_days} days)"

    return True, ""

@validate_input
def get_date_range(
    period: str,
    reference_date: Optional[datetime] = None,
    timezone: str = DEFAULT_TIMEZONE
) -> Tuple[datetime, datetime]:
    """
    Calculate date ranges for analysis.
    
    Args:
        period: Time period ('day', 'week', 'month', 'year')
        reference_date: Reference datetime (defaults to now)
        timezone: Timezone for calculations
    
    Returns:
        Tuple of (start_date, end_date)
    """
    valid_periods = {'day', 'week', 'month', 'year'}
    if period not in valid_periods:
        raise ValueError(f"Invalid period. Must be one of: {valid_periods}")

    tz = pytz.timezone(timezone)
    if reference_date is None:
        reference_date = datetime.now(tz)
    elif reference_date.tzinfo is None:
        reference_date = tz.localize(reference_date)

    end_date = reference_date.replace(
        hour=23, minute=59, second=59, microsecond=999999
    )

    if period == 'day':
        start_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'week':
        start_date = (end_date - timedelta(days=end_date.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif period == 'month':
        start_date = end_date.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
    else:  # year
        start_date = end_date.replace(
            month=1, day=1, hour=0, minute=0, second=0, microsecond=0
        )

    return start_date, end_date

@validate_input
def convert_timezone(
    dt: datetime,
    target_timezone: str,
    preserve_naive: bool = False
) -> datetime:
    """
    Convert datetime between timezones.
    
    Args:
        dt: Datetime object to convert
        target_timezone: Target timezone
        preserve_naive: Whether to preserve naive datetime
    
    Returns:
        Datetime in target timezone
    """
    if target_timezone not in SUPPORTED_TIMEZONES:
        raise ValueError(f"Unsupported timezone: {target_timezone}")

    target_tz = pytz.timezone(target_timezone)

    if dt.tzinfo is None:
        if preserve_naive:
            return dt
        dt = pytz.UTC.localize(dt)

    converted_dt = dt.astimezone(target_tz)

    # Handle ambiguous times during DST transitions
    if target_tz.is_ambiguous(converted_dt.replace(tzinfo=None)):
        # Use the earlier of the two possible times
        is_dst = False
        converted_dt = target_tz.localize(converted_dt.replace(tzinfo=None), is_dst=is_dst)

    return converted_dt
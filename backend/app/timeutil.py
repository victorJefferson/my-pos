"""App-local calendar helpers.

Sales/expenses are stored as naive UTC (datetime.utcnow). Cashiers work in
India time, so “today” / target_date filters must use Asia/Kolkata day bounds
converted to UTC — not a naive UTC midnight–midnight window.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

APP_TZ = ZoneInfo("Asia/Kolkata")


def parse_ymd(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def local_today() -> date:
    return datetime.now(APP_TZ).date()


def local_day_utc_bounds(day: date) -> tuple[datetime, datetime]:
    """Return naive-UTC [start, end] covering the full local calendar day."""
    start_local = datetime.combine(day, time.min, tzinfo=APP_TZ)
    end_local = datetime.combine(day, time.max, tzinfo=APP_TZ)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def local_date_range_utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    start_utc, _ = local_day_utc_bounds(start)
    _, end_utc = local_day_utc_bounds(end)
    return start_utc, end_utc

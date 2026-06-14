"""Tests for blocks_calculator date-range logic."""

from datetime import date

from services.blocks_calculator import get_block_occurrence_dates, block_regen_window


def test_block_regen_window_extends_past_plan_end():
    plan_start = date(2026, 1, 1)
    plan_end = date(2026, 5, 1)
    block = {
        "weekdays": [1, 2, 3, 4, 5],
        "schedule_start_date": "2026-06-01",
        "schedule_end_date": "2026-06-30",
    }
    regen_start, regen_end = block_regen_window(plan_start, plan_end, block)
    dates = get_block_occurrence_dates(block, regen_start, regen_end, exclusion_ranges=[])
    assert regen_end == date(2026, 6, 30)
    assert len(dates) == 22


def test_block_schedule_outside_plan_year_still_generates_occurrences():
    """Subject window after plan end (e.g. June) must not clip to an empty range."""
    block = {
        "weekdays": [1, 2, 3, 4, 5],
        "schedule_start_date": "2026-06-01",
        "schedule_end_date": "2026-06-30",
    }
    plan_start = date(2025, 8, 1)
    plan_end = date(2026, 5, 31)

    dates = get_block_occurrence_dates(block, plan_start, plan_end, exclusion_ranges=[])

    assert dates, "expected weekday occurrences in June"
    assert min(dates) >= date(2026, 6, 1)
    assert max(dates) <= date(2026, 6, 30)
    assert len(dates) == 22

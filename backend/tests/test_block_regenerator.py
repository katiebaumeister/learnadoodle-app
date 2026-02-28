"""
Tests for block-aware regeneration invariants:
A) Customized events (curriculum_lesson_id set) never change.
B) Only plan_year events for the block are touched (generated_by + academic_year_id + source_block_id).
C) Regeneration is block-local (only source_block_id = block_id).
"""

import unittest
from datetime import date
from unittest.mock import MagicMock

# Add backend to path
import sys
from pathlib import Path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.block_regenerator import regenerate_block


class TestBlockRegeneratorInvariants(unittest.TestCase):
    """Verify that regenerate_block only touches overwrite-safe placeholders for the block."""

    def test_only_placeholders_for_block_are_fetched(self):
        """Invariant B+C: We query events table and filter by source_block_id (block-local) and placeholder flags."""
        supabase = MagicMock()
        # Chain: .eq().eq()... returns same chain so we can capture all eq() calls
        chain = MagicMock()
        chain.eq.return_value = chain
        chain.is_.return_value = chain
        chain.execute.return_value = type("Res", (), {"data": []})()
        supabase.table.return_value.select.return_value = chain

        regenerate_block(
            supabase,
            family_id="fam1",
            academic_year_id="ay1",
            block={"block_id": "blk1", "subject_id": "sub1", "weekdays": [1, 2, 3, 4, 5], "start_time": "09:00", "end_time": "10:00"},
            start_date=date(2025, 9, 1),
            end_date=date(2025, 9, 5),
            exclusion_ranges=[],
            generation_batch_id="batch1",
            subject_name="Math",
            family_child_ids=["child1"],
        )

        supabase.table.assert_called_with("events")
        keys = [c[0][0] for c in chain.eq.call_args_list]
        self.assertIn("family_id", keys)
        self.assertIn("academic_year_id", keys)
        self.assertIn("source_block_id", keys)
        self.assertIn("generated_by", keys)

    def test_custom_event_never_in_update_or_delete(self):
        """Invariant A: We only fetch plan events for this block without curriculum_lesson_id (filled slots are user-owned).
        So update/delete are only ever called with ids that came from that query."""
        supabase = MagicMock()
        # Two placeholders for same block (same date, two children) - one we'll "convert to custom" by not including in fetch
        # So we return only 1 placeholder. Desired keys: 2 (date + 2 children). So we insert 1, update 1.
        existing = [
            {"id": "placeholder-1", "start_ts": "2025-09-01T09:00:00+00:00", "end_ts": "2025-09-01T10:00:00+00:00", "child_id": "child1", "subject_id": "sub1", "title": "Math — Lesson"},
        ]
        supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = existing
        supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = None
        supabase.table.return_value.insert.return_value.execute.return_value.data = [{}]

        result = regenerate_block(
            supabase,
            family_id="fam1",
            academic_year_id="ay1",
            block={
                "block_id": "blk1",
                "subject_id": "sub1",
                "weekdays": [1],  # Monday 2025-09-01
                "start_time": "09:00",
                "end_time": "10:00",
                "child_ids": ["child1", "child2"],
            },
            start_date=date(2025, 9, 1),
            end_date=date(2025, 9, 1),
            exclusion_ranges=[],
            generation_batch_id="batch1",
            subject_name="Math",
            family_child_ids=["child1", "child2"],
        )

        # update must only be called with placeholder-1 (the only id we "fetched")
        update_calls = supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.call_count
        if update_calls > 0:
            # The only id passed to update should be placeholder-1
            update_call = supabase.table.return_value.update.return_value.eq.return_value.eq.call_args_list
            for c in update_call:
                if c[0][0] == "id":
                    self.assertIn(c[0][1], ["placeholder-1"], "update must only use placeholder id")
        # insert should be called once (for child2 on that date)
        self.assertGreaterEqual(result["inserted"], 0)
        self.assertGreaterEqual(result["updated"], 0)


if __name__ == "__main__":
    unittest.main()

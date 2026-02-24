#!/usr/bin/env python3
"""
Seed state_requirements from backend/data/state_requirements.json.
DB is source of truth; JSON is the import artifact.

Run from repo root:
  python -m backend.scripts.seed_state_requirements

Or from backend dir:
  python scripts/seed_state_requirements.py

Upserts by (state_code, requirement_key). Preserves existing rows that were
hand-edited (we only upsert rows that come from the JSON; requirement_key
identifies them).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Add backend to path when run as __main__
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from supabase_client import get_admin_client

# Two-letter code -> display name (for state_name)
STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida",
    "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky",
    "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "US": "United States",
}

# JSON "id" -> DB requirement_type (must match state_requirements CHECK)
def _requirement_type_from_key(key: str) -> str:
    m = {
        "attendance": "attendance",
        "notice": "notification",
        "portfolio": "portfolio",
        "testing": "testing",
        "hours": "record_keeping",
    }
    return m.get(key, "other")


def load_json(data_path: Path) -> dict:
    with open(data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    data_path = _backend_dir / "data" / "state_requirements.json"
    if not data_path.exists():
        print(f"ERROR: {data_path} not found")
        return 1

    data = load_json(data_path)
    supabase = get_admin_client()

    inserted = 0
    updated = 0
    errors = 0

    for state_code, items in data.items():
        if not isinstance(items, list):
            continue
        state_code = state_code.upper()
        state_name = STATE_NAMES.get(state_code, state_code)

        for item in items:
            if not isinstance(item, dict):
                continue
            key = item.get("id")
            if not key:
                continue
            label = item.get("label") or key
            detail = item.get("detail")
            obligation = (item.get("type") or "required").lower()
            if obligation not in ("required", "optional", "info"):
                obligation = "required"

            req_type = _requirement_type_from_key(key)

            row = {
                "state_code": state_code,
                "state_name": state_name,
                "requirement_key": key,
                "requirement_type": req_type,
                "requirement_title": label,
                "requirement_description": detail,
                "obligation_type": obligation,
                "is_common": True,
            }

            # Upsert: select by (state_code, requirement_key), then insert or update
            existing = (
                supabase.table("state_requirements")
                .select("id")
                .eq("state_code", state_code)
                .eq("requirement_key", key)
                .execute()
            )

            if existing.data and len(existing.data) > 0:
                rec_id = existing.data[0]["id"]
                upd = (
                    supabase.table("state_requirements")
                    .update(
                        {
                            "requirement_title": row["requirement_title"],
                            "requirement_description": row["requirement_description"],
                            "requirement_type": row["requirement_type"],
                            "obligation_type": row["obligation_type"],
                            "state_name": row["state_name"],
                            "is_common": row["is_common"],
                        }
                    )
                    .eq("id", rec_id)
                    .execute()
                )
                if getattr(upd, "error", None):
                    print(f"WARN: update failed {state_code}/{key}: {upd.error}")
                    errors += 1
                else:
                    updated += 1
            else:
                ins = supabase.table("state_requirements").insert(row).execute()
                if getattr(ins, "error", None):
                    print(f"WARN: insert failed {state_code}/{key}: {ins.error}")
                    errors += 1
                else:
                    inserted += 1

    print(f"Done: inserted={inserted} updated={updated} errors={errors}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

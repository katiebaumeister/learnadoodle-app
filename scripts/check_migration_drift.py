#!/usr/bin/env python3
"""Audit supabase/migrations against the live DB for table/column drift.

Parses each migration for CREATE TABLE / ALTER TABLE ADD COLUMN statements and
probes PostgREST to see whether those tables/columns actually exist. Functions,
triggers, and policies are not probeable this way and are skipped.
"""
import os
import re
import sys
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://mtftwebrtazhyzmmvmdl.supabase.co"
KEY = os.environ.get("SRK", "")

MIG_DIR = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations")

stmt_split = re.compile(r";\s*")
create_re = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", re.I)
alter_re = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", re.I)
addcol_re = re.compile(r"add\s+column\s+(?:if\s+not\s+exists\s+)?\"?([a-z0-9_]+)\"?", re.I)

# (table, col) -> first migration file that introduces it; col=None means table itself
introduced = {}

files = sorted(f for f in os.listdir(MIG_DIR) if f.endswith(".sql"))
for fname in files:
    with open(os.path.join(MIG_DIR, fname), "r", errors="ignore") as fh:
        sql = fh.read()
    # strip line comments
    sql_nc = "\n".join(line.split("--")[0] for line in sql.splitlines())
    for stmt in stmt_split.split(sql_nc):
        low = stmt.lower()
        cm = create_re.search(stmt)
        if cm:
            tbl = cm.group(1).lower()
            introduced.setdefault((tbl, None), fname)
        if "alter table" in low and "add column" in low:
            am = alter_re.search(stmt)
            if not am:
                continue
            tbl = am.group(1).lower()
            for col in addcol_re.findall(stmt):
                introduced.setdefault((tbl, col.lower()), fname)

def probe(table, col):
    if col is None:
        url = f"{SUPABASE_URL}/rest/v1/{table}?limit=1"
    else:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={col}&limit=1"
    req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, ""
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:200]
        return e.code, body
    except Exception as e:  # noqa
        return -1, str(e)[:200]

# Probe tables first (cache existence), then columns only for existing tables.
table_status = {}
tables = sorted({t for (t, c) in introduced if c is None} | {t for (t, c) in introduced})
missing_tables = []
for t in tables:
    st, body = probe(t, None)
    table_status[t] = st
    if st == 404 or (st == 400 and "does not exist" in body and "relation" in body):
        missing_tables.append((t, introduced.get((t, None), "?")))

missing_cols = []
errors = []
for (t, c) in sorted(introduced, key=lambda x: (x[0], x[1] or "")):
    if c is None:
        continue
    if table_status.get(t) == 404:
        # table itself missing; column drift implied, skip individual probe
        continue
    st, body = probe(t, c)
    if st == 400 and "does not exist" in body:
        missing_cols.append((t, c, introduced[(t, c)]))
    elif st not in (200, 206):
        errors.append((t, c, st, body[:120]))

print("=== MISSING TABLES (migration not applied) ===")
for t, f in sorted(set(missing_tables), key=lambda x: x[1]):
    print(f"  {t:40s}  <- {f}")
if not missing_tables:
    print("  (none)")

print("\n=== MISSING COLUMNS (migration not applied / partially) ===")
for t, c, f in sorted(missing_cols, key=lambda x: x[2]):
    print(f"  {t}.{c:40s}  <- {f}")
if not missing_cols:
    print("  (none)")

if errors:
    print("\n=== PROBE ERRORS (inconclusive) ===")
    for t, c, st, body in errors[:40]:
        print(f"  {t}.{c} HTTP {st}: {body}")

print(f"\nParsed {len(files)} migrations; probed {len(tables)} tables and "
      f"{sum(1 for (t,c) in introduced if c)} column refs.")

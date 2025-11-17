import os
from contextlib import contextmanager
import psycopg

DATABASE_URL = os.environ.get("SUPABASE_DB_URL")

if not DATABASE_URL:
    raise RuntimeError("SUPABASE_DB_URL environment variable is required")


@contextmanager
def get_conn():
    with psycopg.connect(DATABASE_URL) as conn:
        yield conn

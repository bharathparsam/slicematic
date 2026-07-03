import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/slicematic',
)


def get_connection():
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield conn, cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

#!/usr/bin/env python3
"""Apply 001_ops_ai.sql to local Supabase Postgres (strips cloud-only GRANT lines)."""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'sql/migrations/001_ops_ai.sql'
DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'


def main() -> None:
    lines = []
    skip = False
    for line in MIGRATION.read_text().splitlines():
        if 'GRANT CONNECT ON DATABASE' in line:
            skip = True
            continue
        if skip and not line.strip():
            skip = False
            continue
        if not skip:
            lines.append(line)
    tmp = Path('/tmp/001_ops_ai_local.sql')
    tmp.write_text('\n'.join(lines) + '\n')
    subprocess.run(['psql', DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', str(tmp)], check=True)


if __name__ == '__main__':
    main()

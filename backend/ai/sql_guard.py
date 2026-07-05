"""Read-only SQL validation for COO chat."""

import re
from dataclasses import dataclass

import sqlparse
from sqlparse.sql import Identifier, IdentifierList
from sqlparse.tokens import DML, Keyword

ALLOWED_TABLES = frozenset({
    'mv_daily_sales',
    'mv_product_sales',
    'mv_payment_mix',
    'mv_table_turnover',
    'mv_order_item_facts',
    'mv_item_prep_stats',
    'mv_cancellation_items',
    'mv_cancellation_stages',
    'orders',
    'order_items',
    'order_item_selections',
    'order_item_status_events',
    'table_sessions',
    'store_tables',
    'order_status_events',
    'order_statuses',
    'order_item_statuses',
    'staff',
    'stores',
    'users',
    'payments',
})

DENIED_COLUMNS = frozenset({
    'auth_user_id',
    'reference',
})

WRITE_KEYWORDS = frozenset({
    'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create', 'grant', 'revoke',
})


@dataclass
class GuardResult:
    ok: bool
    sql: str | None = None
    error: str | None = None


FROM_STOP_KEYWORDS = frozenset({
    'WHERE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT',
})


def _extract_tables(parsed) -> set[str]:
    """Collect real table names from a parsed SELECT (ignores ORDER BY columns)."""
    tables: set[str] = set()
    from_seen = False
    for token in parsed.tokens:
        if token.ttype is Keyword and token.normalized == 'FROM':
            from_seen = True
            continue
        if from_seen:
            if token.ttype is Keyword and token.normalized in FROM_STOP_KEYWORDS:
                from_seen = False
            elif token.__class__.__name__ == 'Where':
                from_seen = False
            elif isinstance(token, IdentifierList):
                for ident in token.get_identifiers():
                    name = ident.get_real_name()
                    if name:
                        tables.add(name.lower())
            elif isinstance(token, Identifier):
                name = token.get_real_name()
                if name:
                    tables.add(name.lower())
        if token.is_group and token.__class__.__name__ != 'Where':
            tables |= _extract_tables(token)
    return tables


def _has_write_tokens(parsed) -> bool:
    for token in parsed.flatten():
        if token.ttype is DML and token.normalized and token.normalized.lower() != 'select':
            return True
        if token.ttype is Keyword and token.normalized and token.normalized.lower() in WRITE_KEYWORDS:
            return True
    return False


def validate_and_sanitize_sql(raw_sql: str, store_id: int = 1) -> GuardResult:
    text = (raw_sql or '').strip()
    if not text:
        return GuardResult(ok=False, error='Empty SQL')

    # Strip markdown fences
    fence = re.search(r'```(?:sql)?\s*(.*?)```', text, re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()

    if ';' in text.rstrip(';'):
        return GuardResult(ok=False, error='Multi-statement queries are not allowed')

    text = text.rstrip(';').strip()
    lowered = text.lower()
    if not lowered.startswith('select'):
        return GuardResult(ok=False, error='Only SELECT queries are allowed')

    for kw in WRITE_KEYWORDS:
        if re.search(rf'\b{kw}\b', lowered):
            return GuardResult(ok=False, error=f'Write operation "{kw}" is not allowed')

    parsed = sqlparse.parse(text)
    if len(parsed) != 1:
        return GuardResult(ok=False, error='Could not parse SQL')

    statement = parsed[0]
    if _has_write_tokens(statement):
        return GuardResult(ok=False, error='Only SELECT statements are allowed')

    tables = _extract_tables(statement)
    if not tables:
        return GuardResult(ok=False, error='Could not identify tables in query')

    disallowed = tables - ALLOWED_TABLES
    if disallowed:
        return GuardResult(
            ok=False,
            error=f'Table(s) not allowed: {", ".join(sorted(disallowed))}',
        )

    for col in DENIED_COLUMNS:
        if re.search(rf'\b{col}\b', lowered):
            return GuardResult(ok=False, error=f'Column "{col}" is not accessible')

    if 'store_id' not in lowered:
        if re.search(r'\bwhere\b', lowered):
            text = re.sub(
                r'\bwhere\b',
                f'WHERE store_id = {store_id} AND',
                text,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            text = f'{text} WHERE store_id = {store_id}'

    if not re.search(r'\blimit\b', lowered):
        text = f'{text} LIMIT 500'

    return GuardResult(ok=True, sql=text)

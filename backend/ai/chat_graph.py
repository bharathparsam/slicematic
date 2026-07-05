"""LangGraph COO chat — NL → SQL → answer with retry loop."""

import json
import os
import re
import uuid
from typing import Any, Literal, TypedDict

import psycopg2
from psycopg2.extras import RealDictCursor

from ai.llm import LLMError, chat_complete, load_prompt
from ai.sql_guard import validate_and_sanitize_sql
from analytics_summary import analytics_summary, format_guest_ratings_context
from db import db_cursor
from queries import ensure_reporting_fresh, ensure_store

CHAT_PROMPT = load_prompt('coo_chat.md')
ANSWER_PROMPT = load_prompt('coo_answer.md')
SQL_GEN_INSTRUCTION = (
    '\n\n## SQL generation mode (active now)\n'
    'Respond with ONLY one ```sql ... ``` fenced block containing a single SELECT query. '
    'No explanation, preamble, or natural-language answer — just the fenced SQL.'
)
MAX_RETRIES = 3
MAX_HISTORY_TURNS = 12
SUMMARY_THRESHOLD = 12

DestructivePattern = re.compile(
    r'\b(drop|delete|update|insert|alter|truncate|grant|revoke)\b',
    re.IGNORECASE,
)


class ChatState(TypedDict, total=False):
    message: str
    thread_id: str
    store_id: int
    briefing_context: str | None
    intent: Literal['data', 'reject']
    sql: str | None
    sql_error: str | None
    rows: list[dict]
    row_count: int
    reply: str
    retries: int
    model: str | None
    history: list[dict]


def _coo_db_url() -> str:
    return os.getenv('COO_DATABASE_URL') or os.getenv('DATABASE_URL', '')


def _extract_sql(text: str) -> str | None:
    """Pull a single SELECT out of an LLM reply (fenced, bare, or after preamble)."""
    if not text:
        return None

    def _clean(candidate: str) -> str | None:
        sql = (candidate or '').strip().rstrip(';').strip()
        return sql if sql.lower().startswith('select') else None

    fence = re.search(r'```(?:sql)?\s*(.*?)```', text, re.DOTALL | re.IGNORECASE)
    if fence:
        cleaned = _clean(fence.group(1))
        if cleaned:
            return cleaned

    stripped = _clean(text)
    if stripped:
        return stripped

    # Model often adds a sentence before the query without fences.
    match = re.search(r'\b(SELECT\b[\s\S]+)', text, re.IGNORECASE)
    if match:
        sql = match.group(1).strip()
        # Trim trailing markdown or explanation after the statement ends.
        sql = re.split(r'\n\s*```|\n\n[A-Z]', sql, maxsplit=1)[0]
        return _clean(sql)

    return None


def classify_intent(state: ChatState) -> ChatState:
    msg = (state.get('message') or '').lower()
    if DestructivePattern.search(msg) or any(
        kw in msg for kw in ('password', 'secret', 'hack', 'ignore previous')
    ):
        return {**state, 'intent': 'reject'}
    if any(kw in msg for kw in ('weather', 'joke', 'poem', 'who are you')):
        return {**state, 'intent': 'reject'}
    return {**state, 'intent': 'data', 'retries': state.get('retries', 0)}


def reject_node(state: ChatState) -> ChatState:
    return {
        **state,
        'reply': (
            'I can only answer questions about your restaurant data — '
            'try asking about prep times, cancellations, tables, sales, or guest ratings.'
        ),
    }


def generate_sql(state: ChatState) -> ChatState:
    store_id = state.get('store_id', 1)
    history = state.get('history') or []
    error_ctx = ''
    if state.get('sql_error'):
        error_ctx = (
            f'\nPrevious SQL failed: {state["sql_error"]}\n'
            f'Failed query: {state.get("sql")}\n'
            'Fix and retry. Output ONLY a ```sql ... ``` block — no other text.'
        )

    messages = [
        {'role': 'system', 'content': CHAT_PROMPT + SQL_GEN_INSTRUCTION + error_ctx},
    ]
    if state.get('briefing_context'):
        messages.append({'role': 'system', 'content': state['briefing_context']})
    for turn in history[-6:]:
        if turn['role'] == 'user':
            messages.append(turn)
    messages.append({'role': 'user', 'content': state['message']})

    temp = 0.2 + (state.get('retries', 0) * 0.1)
    model = os.getenv('COO_CHAT_MODEL') or os.getenv('OPENROUTER_MODEL')
    result = chat_complete(messages, model=model, temperature=min(temp, 0.5))
    sql = _extract_sql(result['reply'])
    return {**state, 'sql': sql, 'model': result['model'], 'sql_error': None}


def validate_sql(state: ChatState) -> ChatState:
    if not state.get('sql'):
        retries = state.get('retries', 0) + 1
        return {
            **state,
            'retries': retries,
            'sql_error': 'Could not extract a SELECT query from the model response',
        }
    guard = validate_and_sanitize_sql(state['sql'], store_id=state.get('store_id', 1))
    if not guard.ok:
        retries = state.get('retries', 0) + 1
        return {**state, 'retries': retries, 'sql_error': guard.error}
    return {**state, 'sql': guard.sql, 'sql_error': None}


def execute_sql(state: ChatState) -> ChatState:
    url = _coo_db_url()
    if not url:
        return {**state, 'sql_error': 'Database not configured', 'retries': state.get('retries', 0) + 1}

    try:
        conn = psycopg2.connect(url)
        conn.set_session(readonly=True, autocommit=True)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SET statement_timeout = '5000'")
            cur.execute(state['sql'])
            rows = cur.fetchmany(500)
        conn.close()
        serializable = [dict(r) for r in rows]
        for row in serializable:
            for k, v in row.items():
                if hasattr(v, 'isoformat'):
                    row[k] = v.isoformat()
                elif isinstance(v, (int, float, str, bool)) or v is None:
                    pass
                else:
                    row[k] = str(v)
        return {**state, 'rows': serializable, 'row_count': len(serializable), 'sql_error': None}
    except Exception as exc:
        retries = state.get('retries', 0) + 1
        return {**state, 'retries': retries, 'sql_error': str(exc)}


_RAW_REPLY = re.compile(
    r'\b(item_name|units_sold|items_sold|total_units|menu_unit_id|store_id)\b',
    re.IGNORECASE,
)


def _humanize_key(key: str) -> str:
    return key.replace('_', ' ')


def _fallback_answer(question: str, rows: list[dict]) -> str:
    """Plain-language fallback when the answer LLM returns column-y output."""
    if not rows:
        return 'No data for that period — try a shorter date range or different question.'

    if len(rows) == 1:
        row = rows[0]
        name = row.get('item_name') or row.get('pizza_name') or row.get('name')
        qty = None
        for key in ('units_sold', 'total_units_sold', 'items_sold', 'units', 'count'):
            if key in row and row[key] is not None:
                qty = row[key]
                break
        if name is not None and qty is not None:
            return f'{name} leads with {qty} units sold.'

        parts = [f'{_humanize_key(k)}: {v}' for k, v in row.items() if v is not None]
        if len(parts) == 1:
            return f'The answer is {parts[0]}.'
        if parts:
            return 'Based on your data: ' + '; '.join(parts) + '.'

    if len(rows) <= 5:
        lines = []
        for row in rows:
            label = (
                row.get('item_name')
                or row.get('pizza_name')
                or row.get('name')
                or row.get('label')
            )
            if label is not None:
                lines.append(str(label))
            else:
                lines.append(', '.join(f'{_humanize_key(k)} {v}' for k, v in row.items() if v is not None))
        return f'Here are the top results: {", ".join(lines)}.'

    return f'Found {len(rows)} rows — try a more specific question or use “Show raw data” in the chat.'


def _looks_like_raw_table(text: str) -> bool:
    stripped = (text or '').strip()
    if not stripped:
        return True
    if stripped.lower().startswith('select '):
        return True
    if '|' in stripped and _RAW_REPLY.search(stripped):
        return True
    # Very short reply that mostly echoes column names.
    if len(stripped) < 120 and _RAW_REPLY.search(stripped):
        return True
    return False


def synthesize_answer(state: ChatState) -> ChatState:
    preview = state.get('rows', [])[:10]
    if not preview:
        return {
            **state,
            'reply': 'No data for that period — try a shorter date range or different question.',
        }

    messages = [
        {'role': 'system', 'content': ANSWER_PROMPT},
        {
            'role': 'user',
            'content': (
                f'Question: {state["message"]}\n\n'
                f'Results ({state.get("row_count", 0)} rows, showing up to 10):\n'
                f'{json.dumps(preview, ensure_ascii=False, indent=2)}'
            ),
        },
    ]
    model = os.getenv('COO_CHAT_MODEL') or os.getenv('OPENROUTER_MODEL')
    try:
        result = chat_complete(messages, model=model, temperature=0.2)
        reply = (result['reply'] or '').strip()
        if _looks_like_raw_table(reply):
            reply = _fallback_answer(state['message'], preview)
        return {**state, 'reply': reply, 'model': result['model']}
    except LLMError:
        return {
            **state,
            'reply': _fallback_answer(state['message'], preview),
            'model': None,
        }


def route_after_classify(state: ChatState) -> str:
    return 'reject' if state.get('intent') == 'reject' else 'generate_sql'


def route_after_validate(state: ChatState) -> str:
    if state.get('sql_error'):
        if state.get('retries', 0) >= MAX_RETRIES:
            return 'fail'
        return 'generate_sql'
    return 'execute_sql'


def route_after_execute(state: ChatState) -> str:
    if state.get('sql_error'):
        if state.get('retries', 0) >= MAX_RETRIES:
            return 'fail'
        return 'generate_sql'
    return 'synthesize'


def fail_node(state: ChatState) -> ChatState:
    err = state.get('sql_error') or 'Could not answer that question'
    if 'timeout' in err.lower():
        msg = 'That question was too broad — try a shorter date range.'
    elif 'not allowed' in err.lower() or 'only select' in err.lower():
        msg = 'I can only answer questions about your restaurant data — try rephrasing.'
    else:
        msg = f"Couldn't run that query — {err[:120]}"
    return {**state, 'reply': msg}


def build_chat_graph():
    from langgraph.graph import END, StateGraph

    graph = StateGraph(ChatState)
    graph.add_node('classify', classify_intent)
    graph.add_node('reject', reject_node)
    graph.add_node('generate_sql', generate_sql)
    graph.add_node('validate_sql', validate_sql)
    graph.add_node('execute_sql', execute_sql)
    graph.add_node('synthesize', synthesize_answer)
    graph.add_node('fail', fail_node)

    graph.set_entry_point('classify')
    graph.add_conditional_edges('classify', route_after_classify, {
        'reject': 'reject',
        'generate_sql': 'generate_sql',
    })
    graph.add_edge('generate_sql', 'validate_sql')
    graph.add_conditional_edges('validate_sql', route_after_validate, {
        'generate_sql': 'generate_sql',
        'execute_sql': 'execute_sql',
        'fail': 'fail',
    })
    graph.add_conditional_edges('execute_sql', route_after_execute, {
        'generate_sql': 'generate_sql',
        'synthesize': 'synthesize',
        'fail': 'fail',
    })
    graph.add_edge('reject', END)
    graph.add_edge('synthesize', END)
    graph.add_edge('fail', END)

    return graph.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_chat_graph()
    return _graph


def _load_thread_history(thread_id: str) -> list[dict]:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT role, content FROM ai_chat_messages
            WHERE thread_id = %s AND role IN ('user', 'assistant')
            ORDER BY created_at
            ''',
            (thread_id,),
        )
        return [{'role': r['role'], 'content': r['content']} for r in cur.fetchall()]


def _maybe_summarize_history(thread_id: str) -> None:
    history = _load_thread_history(thread_id)
    if len(history) < SUMMARY_THRESHOLD:
        return
    to_summarize = history[:-4]
    if not to_summarize:
        return
    try:
        messages = [
            {
                'role': 'system',
                'content': 'Summarize this restaurant COO chat in 3 bullet points. Keep key numbers.',
            },
            {
                'role': 'user',
                'content': json.dumps(to_summarize, ensure_ascii=False),
            },
        ]
        result = chat_complete(messages, temperature=0.1, max_tokens=300)
        with db_cursor() as (_, cur):
            cur.execute(
                '''
                DELETE FROM ai_chat_messages
                WHERE thread_id = %s AND role IN ('user', 'assistant')
                  AND id NOT IN (
                    SELECT id FROM ai_chat_messages
                    WHERE thread_id = %s
                    ORDER BY created_at DESC
                    LIMIT 4
                  )
                ''',
                (thread_id, thread_id),
            )
            cur.execute(
                '''
                INSERT INTO ai_chat_messages (thread_id, role, content)
                VALUES (%s, 'system', %s)
                ''',
                (thread_id, f'[Summary of earlier conversation]\n{result["reply"]}'),
            )
    except LLMError:
        pass


def _persist_message(
    thread_id: str,
    role: str,
    content: str,
    sql_executed: str | None = None,
    query_row_count: int | None = None,
) -> None:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            INSERT INTO ai_chat_messages (thread_id, role, content, sql_executed, query_row_count)
            VALUES (%s, %s, %s, %s, %s)
            ''',
            (thread_id, role, content, sql_executed, query_row_count),
        )


def _merge_system_context(*parts: str | None) -> str | None:
    merged = [p.strip() for p in parts if p and p.strip()]
    return '\n\n'.join(merged) if merged else None


def _get_briefing_context(briefing_id: int | None) -> str | None:
    if not briefing_id:
        return None
    with db_cursor() as (_, cur):
        cur.execute(
            'SELECT summary_text, kpi_snapshot FROM ai_briefings WHERE id = %s',
            (briefing_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return (
            f"Today's COO brief:\n{row['summary_text']}\n\n"
            f"KPI snapshot:\n{json.dumps(row['kpi_snapshot'], ensure_ascii=False)}"
        )


def run_chat(
    message: str,
    thread_id: str | None = None,
    briefing_id: int | None = None,
) -> dict[str, Any]:
    text = (message or '').strip()
    if not text:
        raise ValueError('Message is required')
    max_chars = int(os.getenv('CHAT_MAX_MESSAGE_CHARS', '500'))
    if len(text) > max_chars:
        raise ValueError(f'Message must be at most {max_chars} characters')

    # Keep the mv_* reporting views current so the chat's SQL reflects live data
    # (throttled — a no-op if refreshed within the TTL window).
    ensure_reporting_fresh()

    summary = analytics_summary(days=7)
    ratings_context = format_guest_ratings_context(summary.get('guest_ratings'), days=7)

    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)

    tid = thread_id or str(uuid.uuid4())
    is_new = thread_id is None

    if is_new:
        with db_cursor() as (_, cur):
            cur.execute(
                '''
                INSERT INTO ai_chat_threads (id, store_id, briefing_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                ''',
                (tid, store_id, briefing_id),
            )
            if briefing_id:
                ctx = _get_briefing_context(briefing_id)
                if ctx:
                    _persist_message(tid, 'system', ctx)
            if ratings_context:
                _persist_message(tid, 'system', ratings_context)

    history = _load_thread_history(tid)
    briefing_context = _get_briefing_context(briefing_id) if is_new and briefing_id else None
    system_context = _merge_system_context(
        briefing_context if is_new and briefing_id else None,
        ratings_context,
    )

    state: ChatState = {
        'message': text,
        'thread_id': tid,
        'store_id': store_id,
        'briefing_context': system_context,
        'history': history,
        'retries': 0,
    }

    try:
        result = get_graph().invoke(state)
    except LLMError as exc:
        raise

    _persist_message(tid, 'user', text)
    _persist_message(
        tid,
        'assistant',
        result.get('reply', ''),
        sql_executed=result.get('sql'),
        query_row_count=result.get('row_count'),
    )
    _maybe_summarize_history(tid)

    preview = (result.get('rows') or [])[:10]
    return {
        'thread_id': tid,
        'reply': result.get('reply', ''),
        'sql': result.get('sql'),
        'rows_preview': preview,
        'row_count': result.get('row_count', 0),
        'model': result.get('model'),
    }


def get_thread_messages(thread_id: str) -> list[dict]:
    with db_cursor() as (_, cur):
        cur.execute(
            '''
            SELECT role, content, sql_executed, query_row_count, created_at
            FROM ai_chat_messages
            WHERE thread_id = %s AND role IN ('user', 'assistant')
            ORDER BY created_at
            ''',
            (thread_id,),
        )
        return [
            {
                'role': r['role'],
                'content': r['content'],
                'sql': r['sql_executed'],
                'row_count': r['query_row_count'],
                'created_at': r['created_at'].isoformat(),
            }
            for r in cur.fetchall()
        ]

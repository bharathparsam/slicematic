"""COO daily briefing generation."""

import json
import os
from datetime import date, datetime, timezone
from decimal import Decimal

from analytics_summary import analytics_summary
from db import db_cursor
from ai.llm import LLMError, chat_complete, load_prompt
from queries import ensure_store

BRIEF_PROMPT = load_prompt('coo_brief.md')


def aggregate_kpis(store_id: int | None = None, business_date: date | None = None) -> dict:
    summary = analytics_summary(days=7)
    summary['business_date'] = (business_date or datetime.now(timezone.utc).date()).isoformat()
    summary['store_id'] = store_id
    return summary


def _deterministic_brief(snapshot: dict) -> str:
    cats = snapshot.get('categories', {})
    ot = cats.get('order_times', {})
    ca = cats.get('cancellations', {})
    tu = cats.get('table_utilisation', {})
    sa = cats.get('sales', {})
    gr = snapshot.get('guest_ratings', {})

    avg_prep = ot.get('primary', {}).get('value')
    slowest = ot.get('secondary', {}).get('slowest_pizza')
    cancel_rate = ca.get('primary', {}).get('value')
    cancel_count = ca.get('secondary', {}).get('count', 0)
    dwell = tu.get('primary', {}).get('value')
    net_sales = sa.get('primary', {}).get('value')
    orders = sa.get('secondary', {}).get('orders', 0)
    avg_rating = gr.get('primary', {}).get('value')
    ratings_count = gr.get('secondary', {}).get('ratings_count', 0)
    response_rate = gr.get('secondary', {}).get('response_rate_pct', 0)

    lines = [
        '## What went well',
        f'- Avg prep: {avg_prep or "—"} min. Table dwell: {dwell or "—"} min.',
        f'- Net sales ₹{net_sales or 0:,.0f} across {orders} orders.',
        f'- Guest rating: {avg_rating or "—"}/5 from {ratings_count} responses ({response_rate}% of settled orders).',
        '',
        '## What didn\'t go well',
        f'- Cancel rate {cancel_rate or 0}% ({cancel_count} orders).',
        f'- Slowest pizza: {slowest or "—"}.',
        '',
        '## What to do',
        '- Review prep queue during peak hours.',
        '- Follow up on cancelled orders at preparing stage.',
        '- Prompt in-use tables to submit ratings when response rate is low.',
    ]
    return '\n'.join(lines)


def _json_default(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f'Object of type {type(value).__name__} is not JSON serializable')


def generate_briefing_text(snapshot: dict) -> tuple[str, str | None]:
    try:
        messages = [
            {'role': 'system', 'content': BRIEF_PROMPT},
            {
                'role': 'user',
                'content': 'Generate today\'s COO brief from this KPI snapshot:\n'
                + json.dumps(snapshot, ensure_ascii=False, indent=2, default=_json_default),
            },
        ]
        model = os.getenv('COO_BRIEF_MODEL') or os.getenv('OPENROUTER_MODEL')
        result = chat_complete(messages, model=model, temperature=0.3, max_tokens=800)
        return result['reply'], result['model']
    except LLMError:
        return _deterministic_brief(snapshot), None


def get_latest_briefing() -> dict | None:
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        cur.execute(
            '''
            SELECT id, business_date, kpi_snapshot, summary_text, model, created_at
            FROM ai_briefings
            WHERE store_id = %s
            ORDER BY business_date DESC
            LIMIT 1
            ''',
            (store_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            'id': row['id'],
            'business_date': row['business_date'].isoformat(),
            'kpi_snapshot': row['kpi_snapshot'],
            'summary_text': row['summary_text'],
            'model': row['model'],
            'created_at': row['created_at'].isoformat(),
        }


def generate_and_store_briefing() -> dict:
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)
        biz_date = datetime.now(timezone.utc).date()
        snapshot = aggregate_kpis(store_id, biz_date)
        summary_text, model = generate_briefing_text(snapshot)

        cur.execute(
            '''
            INSERT INTO ai_briefings (store_id, business_date, kpi_snapshot, summary_text, model)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (store_id, business_date) DO UPDATE SET
              kpi_snapshot = EXCLUDED.kpi_snapshot,
              summary_text = EXCLUDED.summary_text,
              model = EXCLUDED.model,
              created_at = now()
            RETURNING id, business_date, summary_text, model, created_at
            ''',
            (store_id, biz_date, json.dumps(snapshot, default=_json_default), summary_text, model),
        )
        row = cur.fetchone()

    return {
        'id': row['id'],
        'business_date': row['business_date'].isoformat(),
        'summary_text': row['summary_text'],
        'model': row['model'],
        'kpi_snapshot': snapshot,
        'created_at': row['created_at'].isoformat(),
    }

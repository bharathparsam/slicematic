"""Analytics v2 — single summary payload for Admin dashboard (ops-first)."""

import json
from decimal import Decimal

from db import db_cursor
from queries import ensure_store, payment_mix, ratings_daily, sales_daily, top_products

CATEGORY_ORDER = [
    'order_times',
    'cancellations',
    'table_utilisation',
    'sales',
]


def _float_or_none(value) -> float | None:
    if value is None:
        return None
    return float(value)


def _pct_change(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None or prior == 0:
        return None
    return round((current - prior) / prior * 100, 1)


def analytics_summary(days: int = 7) -> dict:
    with db_cursor() as (_, cur):
        store_id = ensure_store(cur)

        order_times = _order_times(cur, store_id, days)
        cancellations = _cancellations(cur, store_id, days)
        table_util = _table_utilisation(cur, store_id, days)
        sales = _sales_category(cur, store_id, days)
        guest_ratings = _guest_ratings(cur, store_id, days)

    return {
        'category_order': CATEGORY_ORDER,
        'categories': {
            'order_times': order_times,
            'cancellations': cancellations,
            'table_utilisation': table_util,
            'sales': sales,
        },
        'guest_ratings': guest_ratings,
    }


def _order_times(cur, store_id: int, days: int) -> dict:
    cur.execute(
        '''
        SELECT
          round(avg(extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0), 1) AS avg_prep,
          round((percentile_cont(0.9) WITHIN GROUP (
            ORDER BY extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0
          ))::numeric, 1) AS p90_prep
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
          AND s.is_settled
        ''',
        (store_id, days),
    )
    current = cur.fetchone()
    avg_prep = _float_or_none(current['avg_prep']) if current else None
    p90_prep = _float_or_none(current['p90_prep']) if current else None

    cur.execute(
        '''
        SELECT
          round(avg(extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0), 1) AS avg_prep
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s * 2 - 1) * interval '1 day')
          AND o.business_date < (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
          AND s.is_settled
        ''',
        (store_id, days, days),
    )
    prior_row = cur.fetchone()
    prior_avg = _float_or_none(prior_row['avg_prep']) if prior_row else None
    delta = round(avg_prep - prior_avg, 1) if avg_prep is not None and prior_avg is not None else None

    cur.execute(
        '''
        SELECT sel.item_name AS pizza_name,
               round(avg(extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0), 1) AS avg_prep
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN order_item_selections sel ON sel.order_item_id = oi.id AND sel.role = 'pizza'
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
          AND s.is_settled
        GROUP BY sel.item_name
        ORDER BY avg_prep DESC NULLS LAST
        LIMIT 1
        ''',
        (store_id, days),
    )
    slowest = cur.fetchone()
    slowest_name = slowest['pizza_name'] if slowest else None

    cur.execute(
        '''
        SELECT count(*)::int AS backlog
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN order_item_statuses ois ON ois.id = oi.status_id
        JOIN order_statuses os ON os.id = o.status_id
        WHERE o.store_id = %s
          AND os.is_cancelled = false AND os.code <> 'completed'
          AND ois.code NOT IN ('served', 'cancelled')
        ''',
        (store_id,),
    )
    backlog = cur.fetchone()['backlog']

    product_matrix = _product_matrix(cur, store_id, days)

    return {
        'primary': {'value': avg_prep, 'format': 'minutes'},
        'secondary': {'slowest_pizza': slowest_name},
        'trend': {
            'vs_prior_period': delta,
            'unit': 'min',
            'sentiment': 'negative' if delta and delta > 0 else 'positive',
        },
        'details': {
            'p90_prep_minutes': p90_prep,
            'backlog_now': backlog,
            'product_matrix': product_matrix,
        },
    }


def _product_matrix(cur, store_id: int, days: int) -> list[dict]:
    cur.execute(
        '''
        WITH prep AS (
          SELECT sel.item_name AS pizza_name,
                 round(avg(extract(epoch FROM (oi.ready_at - oi.queued_at)) / 60.0), 1) AS avg_prep
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN order_item_selections sel ON sel.order_item_id = oi.id AND sel.role = 'pizza'
          JOIN order_statuses s ON s.id = o.status_id
          WHERE o.store_id = %s
            AND oi.ready_at IS NOT NULL AND oi.queued_at IS NOT NULL
            AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
            AND s.is_settled
          GROUP BY sel.item_name
        ),
        rev AS (
          SELECT sel.item_name AS pizza_name,
                 sum(sel.unit_price * sel.quantity * oi.quantity) AS revenue
          FROM order_item_selections sel
          JOIN order_items oi ON oi.id = sel.order_item_id
          JOIN orders o ON o.id = oi.order_id
          JOIN order_statuses s ON s.id = o.status_id
          WHERE o.store_id = %s AND sel.role = 'pizza' AND s.is_settled
            AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
          GROUP BY sel.item_name
        )
        SELECT
          COALESCE(p.pizza_name, r.pizza_name) AS pizza_name,
          p.avg_prep,
          COALESCE(r.revenue, 0) AS revenue
        FROM prep p
        FULL OUTER JOIN rev r ON r.pizza_name = p.pizza_name
        WHERE COALESCE(p.pizza_name, r.pizza_name) IS NOT NULL
        ''',
        (store_id, days, store_id, days),
    )
    rows = cur.fetchall()
    if not rows:
        return []

    prep_vals = [float(r['avg_prep']) for r in rows if r['avg_prep'] is not None]
    rev_vals = [float(r['revenue']) for r in rows]
    prep_med = sorted(prep_vals)[len(prep_vals) // 2] if prep_vals else 0
    rev_med = sorted(rev_vals)[len(rev_vals) // 2] if rev_vals else 0

    matrix = []
    for row in rows:
        prep = float(row['avg_prep']) if row['avg_prep'] is not None else prep_med
        rev = float(row['revenue'])
        fast = prep <= prep_med
        high_rev = rev >= rev_med
        if fast and high_rev:
            quadrant = 'Promote'
        elif not fast and high_rev:
            quadrant = 'Protect & optimize prep'
        elif fast and not high_rev:
            quadrant = 'Stars'
        else:
            quadrant = 'Fix or drop'
        matrix.append({
            'pizza_name': row['pizza_name'],
            'avg_prep_minutes': _float_or_none(row['avg_prep']),
            'revenue': rev,
            'quadrant': quadrant,
        })
    return matrix


def _cancellations(cur, store_id: int, days: int) -> dict:
    cur.execute(
        '''
        SELECT
          count(*) FILTER (WHERE s.is_cancelled)::int AS cancelled,
          count(*)::int AS total
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days),
    )
    row = cur.fetchone()
    cancelled = row['cancelled'] or 0
    total = row['total'] or 0
    rate = round(cancelled / total * 100, 1) if total else 0.0

    cur.execute(
        '''
        SELECT coalesce(sum(o.grand_total), 0) AS revenue_lost
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s AND s.is_cancelled
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days),
    )
    revenue_lost = float(cur.fetchone()['revenue_lost'])

    cur.execute(
        '''
        SELECT sel.item_name AS pizza_name,
               count(DISTINCT o.id)::int AS cancelled_orders,
               sum(oi.quantity)::int AS cancelled_units
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN order_item_selections sel ON sel.order_item_id = oi.id AND sel.role = 'pizza'
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s AND s.is_cancelled
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        GROUP BY sel.item_name
        ORDER BY cancelled_orders DESC
        LIMIT 5
        ''',
        (store_id, days),
    )
    top_items = [
        {
            'pizza_name': r['pizza_name'],
            'cancelled_orders': r['cancelled_orders'],
            'cancelled_units': r['cancelled_units'],
        }
        for r in cur.fetchall()
    ]

    cur.execute(
        '''
        SELECT fs.code AS stage, count(*)::int AS cnt
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        JOIN order_status_events e ON e.order_id = o.id
        JOIN order_statuses ts ON ts.id = e.to_status_id AND ts.code = 'cancelled'
        LEFT JOIN order_statuses fs ON fs.id = e.from_status_id
        WHERE o.store_id = %s AND s.is_cancelled
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        GROUP BY fs.code
        ORDER BY cnt DESC
        ''',
        (store_id, days),
    )
    stage_rows = cur.fetchall()
    by_stage = []
    for sr in stage_rows:
        pct = round(sr['cnt'] / cancelled * 100) if cancelled else 0
        by_stage.append({'stage': sr['stage'] or 'unknown', 'count': sr['cnt'], 'pct': pct})

    cur.execute(
        '''
        SELECT o.order_code, o.notes AS table_label, o.cancel_reason AS reason,
               o.grand_total, fs.code AS stage
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        LEFT JOIN order_statuses fs ON fs.id = o.cancelled_from_status_id
        WHERE o.store_id = %s AND s.is_cancelled
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ORDER BY o.cancelled_at DESC NULLS LAST
        LIMIT 5
        ''',
        (store_id, days),
    )
    recent = [
        {
            'order_code': r['order_code'],
            'table': r['table_label'],
            'reason': r['reason'],
            'stage': r['stage'],
            'total': float(r['grand_total']),
        }
        for r in cur.fetchall()
    ]

    top_stage = by_stage[0]['stage'] if by_stage else None
    top_stage_pct = by_stage[0]['pct'] if by_stage else None

    return {
        'primary': {'value': rate, 'format': 'percent'},
        'secondary': {
            'count': cancelled,
            'top_stage': top_stage,
            'top_stage_pct': top_stage_pct,
        },
        'trend': {'vs_prior_period': None, 'sentiment': 'negative'},
        'details': {
            'revenue_lost': revenue_lost,
            'top_items': top_items,
            'by_stage': by_stage,
            'recent': recent,
        },
    }


def _table_utilisation(cur, store_id: int, days: int) -> dict:
    cur.execute(
        '''
        SELECT round(avg(extract(epoch FROM (ts.closed_at - ts.seated_at)) / 60.0), 1) AS avg_dwell
        FROM table_sessions ts
        WHERE ts.store_id = %s
          AND ts.status = 'closed' AND ts.closed_at IS NOT NULL
          AND (ts.seated_at AT TIME ZONE 'Asia/Kolkata')::date >=
              (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days),
    )
    avg_dwell = _float_or_none(cur.fetchone()['avg_dwell'])

    cur.execute(
        '''
        SELECT count(*)::int AS sessions,
               count(DISTINCT ts.table_id)::int AS tables_used
        FROM table_sessions ts
        WHERE ts.store_id = %s
          AND ts.status = 'closed' AND ts.closed_at IS NOT NULL
          AND (ts.seated_at AT TIME ZONE 'Asia/Kolkata')::date >=
              (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days),
    )
    sess = cur.fetchone()
    sessions_per_table = (
        round(sess['sessions'] / sess['tables_used'], 1)
        if sess['tables_used'] else 0
    )

    cur.execute(
        '''
        SELECT st.label, count(*)::int AS sessions
        FROM table_sessions ts
        JOIN store_tables st ON st.id = ts.table_id
        WHERE ts.store_id = %s
          AND ts.status = 'closed' AND ts.closed_at IS NOT NULL
          AND (ts.seated_at AT TIME ZONE 'Asia/Kolkata')::date >=
              (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        GROUP BY st.label
        ORDER BY sessions DESC
        LIMIT 1
        ''',
        (store_id, days),
    )
    busiest = cur.fetchone()

    cur.execute(
        '''
        SELECT count(*)::int AS in_use
        FROM store_tables st
        WHERE st.store_id = %s AND st.current_session_id IS NOT NULL
        ''',
        (store_id,),
    )
    in_use = cur.fetchone()['in_use']

    return {
        'primary': {'value': avg_dwell, 'format': 'minutes'},
        'secondary': {'sessions_per_table': sessions_per_table},
        'trend': {'vs_prior_period': None, 'sentiment': 'negative'},
        'details': {
            'busiest_table': busiest['label'] if busiest else None,
            'busiest_sessions': busiest['sessions'] if busiest else 0,
            'tables_in_use_now': in_use,
        },
    }


def _guest_ratings(cur, store_id: int, days: int) -> dict:
    cur.execute(
        '''
        SELECT
          count(f.id)::int AS ratings_count,
          round(avg(f.rating)::numeric, 2) AS avg_rating,
          count(*) FILTER (WHERE f.rating = 1)::int AS r1,
          count(*) FILTER (WHERE f.rating = 2)::int AS r2,
          count(*) FILTER (WHERE f.rating = 3)::int AS r3,
          count(*) FILTER (WHERE f.rating = 4)::int AS r4,
          count(*) FILTER (WHERE f.rating = 5)::int AS r5
        FROM order_feedback f
        JOIN orders o ON o.id = f.order_id
        WHERE o.store_id = %s
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days),
    )
    agg = cur.fetchone()

    cur.execute(
        '''
        SELECT count(*)::int AS settled_orders
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE o.store_id = %s
          AND s.is_settled
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days),
    )
    settled = cur.fetchone()['settled_orders'] or 0
    ratings_count = agg['ratings_count'] or 0
    response_rate = round(ratings_count / settled * 100, 1) if settled else 0.0

    cur.execute(
        '''
        SELECT round(avg(f.rating)::numeric, 2) AS avg_rating
        FROM order_feedback f
        JOIN orders o ON o.id = f.order_id
        WHERE o.store_id = %s
          AND o.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s * 2 - 1) * interval '1 day')
          AND o.business_date < (now() AT TIME ZONE 'Asia/Kolkata')::date - ((%s - 1) * interval '1 day')
        ''',
        (store_id, days, days),
    )
    prior_avg = _float_or_none(cur.fetchone()['avg_rating'])
    current_avg = _float_or_none(agg['avg_rating'])
    delta = round(current_avg - prior_avg, 2) if current_avg is not None and prior_avg is not None else None

    daily = ratings_daily(days)['days']

    return {
        'primary': {'value': current_avg, 'format': 'stars', 'scale': '1-5 (5 best)'},
        'secondary': {
            'ratings_count': ratings_count,
            'response_rate_pct': response_rate,
            'settled_orders': settled,
        },
        'trend': {
            'vs_prior_period': delta,
            'unit': 'stars',
            'sentiment': 'positive' if delta and delta > 0 else 'negative',
        },
        'details': {
            'ratings_daily': daily,
            'distribution': {
                '1': agg['r1'] or 0,
                '2': agg['r2'] or 0,
                '3': agg['r3'] or 0,
                '4': agg['r4'] or 0,
                '5': agg['r5'] or 0,
            },
        },
    }


def format_guest_ratings_context(guest_ratings: dict | None, days: int = 7) -> str | None:
    """Compact JSON context for Ask COO (injected on new chat threads)."""
    if not guest_ratings:
        return None
    payload = {
        'window_days': days,
        'timezone': 'Asia/Kolkata',
        'guest_ratings': guest_ratings,
    }
    return (
        f'Guest order rating stats (last {days} days, Asia/Kolkata business dates):\n'
        + json.dumps(payload, ensure_ascii=False, default=_decimal_default)
    )


def _decimal_default(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f'Object of type {type(value).__name__} is not JSON serializable')


def _sales_category(cur, store_id: int, days: int) -> dict:
    sales = sales_daily(days)
    net_total = sum(float(d['net_sales']) for d in sales['days'])
    order_count = sum(d['orders_count'] for d in sales['days'])
    avg_ticket = round(net_total / order_count, 2) if order_count else 0

    prior = sales_daily(days * 2)
    prior_days = prior['days'][:days]
    prior_net = sum(float(d['net_sales']) for d in prior_days[-days:] if len(prior_days) >= days)
    if len(prior['days']) >= days * 2:
        prior_net = sum(float(d['net_sales']) for d in prior['days'][:days])
    else:
        prior_net = 0
    trend_pct = _pct_change(net_total, prior_net) if prior_net else None

    top = top_products(1)
    top_pizza = top['products'][0] if top['products'] else None
    mix = payment_mix(days)

    return {
        'primary': {'label': 'Net sales', 'value': net_total, 'format': 'currency'},
        'secondary': {'orders': order_count},
        'trend': {
            'vs_prior_period_pct': trend_pct,
            'sentiment': 'positive' if trend_pct and trend_pct > 0 else 'negative',
        },
        'details': {
            'avg_ticket': avg_ticket,
            'payment_mix': mix['methods'],
            'top_pizza': top_pizza,
            'sales_daily': sales['days'],
        },
    }
